import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { admin, getSchemaFlags } from "@/lib/conversation/db";
import { fetchMessages } from "@/lib/evolution/client";

export const maxDuration = 60;

type EvolutionMessage = {
  key?: { id?: string; remoteJid?: string; fromMe?: boolean };
  message?: { conversation?: string; extendedTextMessage?: { text?: string } };
  messageTimestamp?: number | string;
  pushName?: string;
};

/**
 * Importa el historial de WhatsApp SOLO para conocer pacientes y fechas reales
 * de último contacto. No responde nada: antes esto disparaba respuestas
 * automáticas a conversaciones de hace meses.
 */
export async function POST() {
  const supabase = await createServerSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = admin();
  const flags = await getSchemaFlags();

  const { data: clinic } = await db
    .from("clinics")
    .select("id, wa_session_id")
    .eq("owner_id", userData.user.id)
    .single();

  if (!clinic?.wa_session_id) {
    return NextResponse.json({ error: "WhatsApp no conectado" }, { status: 400 });
  }

  const result = await fetchMessages(clinic.wa_session_id);
  const messages: EvolutionMessage[] = Array.isArray(result)
    ? result
    : result?.messages?.records ?? result?.records ?? [];

  const latestInboundByPhone = new Map<string, { ms: number; name: string | null; jid: string }>();
  const rows: Record<string, unknown>[] = [];
  const phonesSeen = new Set<string>();

  for (const msg of messages) {
    const key = msg.key;
    const jid = key?.remoteJid ?? "";
    // Solo chats directos (no grupos, estados ni canales).
    if (!key?.id || !jid.endsWith("@s.whatsapp.net")) continue;
    const phone = jid.split("@")[0].replace(/\D/g, "");
    if (!/^\d{7,16}$/.test(phone)) continue;

    const text = msg.message?.conversation ?? msg.message?.extendedTextMessage?.text ?? "";
    const tsRaw = Number(msg.messageTimestamp ?? 0);
    const ms = tsRaw ? (tsRaw < 1e12 ? tsRaw * 1000 : tsRaw) : Date.now();
    const inbound = key.fromMe !== true;

    phonesSeen.add(phone);
    if (inbound) {
      const cur = latestInboundByPhone.get(phone);
      if (!cur || ms > cur.ms) {
        latestInboundByPhone.set(phone, { ms, name: msg.pushName ?? null, jid });
      }
    }

    rows.push({
      phone,
      row: {
        clinic_id: clinic.id,
        wa_message_id: key.id,
        direction: inbound ? "inbound" : "outbound",
        content_text: text,
        sent_at: new Date(ms).toISOString(),
        processing_status: "processed",
        ...(flags.messagesExtended ? { channel: "whatsapp", response_source: inbound ? null : "human" } : {}),
      },
    });
  }

  // 1) Pacientes: solo con fecha REAL del último mensaje del paciente.
  const patientIds = new Map<string, string>();
  for (const phone of phonesSeen) {
    const inboundInfo = latestInboundByPhone.get(phone);
    const { data: existing } = await db
      .from("patients")
      .select("id, last_contact_at, full_name")
      .eq("clinic_id", clinic.id)
      .eq("phone_e164", phone)
      .maybeSingle();

    if (existing) {
      patientIds.set(phone, existing.id);
      if (inboundInfo) {
        const cur = existing.last_contact_at ? new Date(existing.last_contact_at).getTime() : 0;
        const upd: Record<string, unknown> = {};
        if (inboundInfo.ms > cur) upd.last_contact_at = new Date(inboundInfo.ms).toISOString();
        if (!existing.full_name && inboundInfo.name) upd.full_name = inboundInfo.name;
        if (Object.keys(upd).length) await db.from("patients").update(upd).eq("id", existing.id);
      }
      continue;
    }

    const { data: created } = await db
      .from("patients")
      .insert({
        clinic_id: clinic.id,
        phone_e164: phone,
        full_name: inboundInfo?.name ?? null,
        wa_contact_id: inboundInfo?.jid ?? null,
        channel_source: "whatsapp",
        status: "lead",
        last_contact_at: inboundInfo ? new Date(inboundInfo.ms).toISOString() : null,
      })
      .select("id")
      .single();
    if (created) patientIds.set(phone, created.id);
  }

  // 2) Mensajes (idempotente por wa_message_id).
  let imported = 0;
  for (const { phone, row } of rows as { phone: string; row: Record<string, unknown> }[]) {
    const patientId = patientIds.get(phone);
    if (!patientId) continue;
    const { error } = await db.from("messages").insert({ ...row, patient_id: patientId });
    if (!error) imported++;
  }

  return NextResponse.json({ imported, patients: patientIds.size });
}
