import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getNlpQueue } from "@/lib/bullmq/queues";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clinicId: string }> }
) {
  const { clinicId } = await params;
  const body = await request.json();

  // Ack inmediato para no bloquear a Evolution API
  queueMicrotask(() => processWebhook(clinicId, body));

  return NextResponse.json({ ok: true });
}

async function processWebhook(clinicId: string, body: unknown) {
  const payload = body as {
    event?: string;
    data?: {
      key?: { id?: string; remoteJid?: string; fromMe?: boolean };
      message?: { conversation?: string; extendedTextMessage?: { text?: string } };
      messageTimestamp?: number;
      pushName?: string;
    };
  };

  if (payload.event !== "messages.upsert" || !payload.data?.key) return;

  const { key, message, messageTimestamp, pushName } = payload.data;
  const waMessageId = key.id;
  const phoneE164 = key.remoteJid?.split("@")[0] ?? "";
  const text =
    message?.conversation ?? message?.extendedTextMessage?.text ?? "";
  const direction = key.fromMe ? "outbound" : "inbound";

  if (!waMessageId || !phoneE164) return;

  // Upsert paciente
  const { data: patient } = await supabaseAdmin
    .from("patients")
    .upsert(
      {
        clinic_id: clinicId,
        phone_e164: phoneE164,
        full_name: pushName ?? null,
        wa_contact_id: key.remoteJid,
        channel_source: "whatsapp",
        last_contact_at: new Date().toISOString(),
      },
      { onConflict: "clinic_id,phone_e164", ignoreDuplicates: false }
    )
    .select("id")
    .single();

  // Idempotencia por wa_message_id
  const { data: messageRow, error } = await supabaseAdmin
    .from("messages")
    .upsert(
      {
        clinic_id: clinicId,
        patient_id: patient?.id ?? null,
        wa_message_id: waMessageId,
        direction,
        content_text: text,
        sent_at: messageTimestamp
          ? new Date(messageTimestamp * 1000).toISOString()
          : new Date().toISOString(),
        processing_status: "pending",
      },
      { onConflict: "wa_message_id", ignoreDuplicates: true }
    )
    .select("id")
    .single();

  if (error || !messageRow || direction !== "inbound" || !text) return;

  await getNlpQueue().add("extract-entities", {
    messageId: messageRow.id,
    clinicId,
    patientId: patient?.id,
    text,
  });
}
