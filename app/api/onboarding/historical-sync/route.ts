import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { fetchMessages } from "@/lib/evolution/client";
import { getNlpQueue } from "@/lib/bullmq/queues";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type EvolutionMessage = {
  key?: { id?: string; remoteJid?: string; fromMe?: boolean };
  message?: { conversation?: string; extendedTextMessage?: { text?: string } };
  messageTimestamp?: number;
  pushName?: string;
};

export async function POST() {
  const supabase = await createServerSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: clinic } = await supabaseAdmin
    .from("clinics")
    .select("id, wa_session_id")
    .eq("owner_id", userData.user.id)
    .single();

  if (!clinic?.wa_session_id) {
    return NextResponse.json(
      { error: "WhatsApp no conectado" },
      { status: 400 }
    );
  }

  const result = await fetchMessages(clinic.wa_session_id);
  const messages: EvolutionMessage[] = Array.isArray(result)
    ? result
    : result?.messages?.records ?? result?.records ?? [];

  let imported = 0;
  let queued = 0;

  // Rastrea el mensaje más reciente REAL por número, para no sobreescribir
  // last_contact_at con la fecha de "ahora" (bug anterior) — necesitamos la
  // fecha verdadera del último mensaje para que la detección de
  // inactividad funcione con datos reales, no con la hora de la sincronización.
  const latestContactByPhone = new Map<string, number>();

  for (const msg of messages) {
    const key = msg.key;
    const waMessageId = key?.id;
    const phoneE164 = key?.remoteJid?.split("@")[0];
    const text =
      msg.message?.conversation ?? msg.message?.extendedTextMessage?.text ?? "";
    const direction = key?.fromMe ? "outbound" : "inbound";

    if (!waMessageId || !phoneE164) continue;

    const messageEpochMs = msg.messageTimestamp
      ? msg.messageTimestamp * 1000
      : Date.now();
    const currentLatest = latestContactByPhone.get(phoneE164) ?? 0;
    if (messageEpochMs > currentLatest) {
      latestContactByPhone.set(phoneE164, messageEpochMs);
    }

    const { data: patient } = await supabaseAdmin
      .from("patients")
      .upsert(
        {
          clinic_id: clinic.id,
          phone_e164: phoneE164,
          full_name: msg.pushName ?? null,
          wa_contact_id: key?.remoteJid,
          channel_source: "whatsapp",
        },
        { onConflict: "clinic_id,phone_e164", ignoreDuplicates: false }
      )
      .select("id")
      .single();

    const { data: messageRow, error } = await supabaseAdmin
      .from("messages")
      .upsert(
        {
          clinic_id: clinic.id,
          patient_id: patient?.id ?? null,
          wa_message_id: waMessageId,
          direction,
          content_text: text,
          sent_at: msg.messageTimestamp
            ? new Date(msg.messageTimestamp * 1000).toISOString()
            : new Date().toISOString(),
          processing_status: "pending",
        },
        { onConflict: "wa_message_id", ignoreDuplicates: true }
      )
      .select("id")
      .single();

    if (error || !messageRow) continue;
    imported++;

    if (direction === "inbound" && text) {
      await getNlpQueue().add("extract-entities", {
        messageId: messageRow.id,
        clinicId: clinic.id,
        patientId: patient?.id,
        text,
      });
      queued++;
    }
  }

  // Ahora sí: escribimos la fecha REAL del último mensaje de cada número,
  // solo si es más reciente que lo que ya había (evita pisar datos buenos
  // con historial viejo si se corre la sincronización más de una vez).
  for (const [phoneE164, latestMs] of latestContactByPhone) {
    const { data: existing } = await supabaseAdmin
      .from("patients")
      .select("id, last_contact_at")
      .eq("clinic_id", clinic.id)
      .eq("phone_e164", phoneE164)
      .single();

    if (!existing) continue;

    const existingMs = existing.last_contact_at
      ? new Date(existing.last_contact_at).getTime()
      : 0;

    if (latestMs > existingMs) {
      await supabaseAdmin
        .from("patients")
        .update({ last_contact_at: new Date(latestMs).toISOString() })
        .eq("id", existing.id);
    }
  }

  return NextResponse.json({ imported, queued });
}
