import { NextRequest, NextResponse } from "next/server";
import { sendToChannel } from "@/lib/channels/send";
import { requireClinic } from "@/lib/conversation/auth";
import { admin, getClinic, getSchemaFlags, mapPatient } from "@/lib/conversation/db";
import { cleanFirstName } from "@/lib/conversation/normalize";
import { inSendingWindow, jitter } from "@/lib/conversation/window";
import { logError } from "@/lib/conversation/log";

export const maxDuration = 60;

const MAX_PER_CALL = 30;
const TIME_BUDGET_MS = 50_000;

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireClinic();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: cohortId } = await params;

  const db = admin();
  const flags = await getSchemaFlags();

  // La cohorte tiene que ser de ESTA clínica.
  const { data: cohort } = await db
    .from("cohort_definitions")
    .select("id, name, message_template, clinic_id")
    .eq("id", cohortId)
    .eq("clinic_id", ctx.clinicId)
    .maybeSingle();
  if (!cohort) return NextResponse.json({ error: "Cohorte no encontrada" }, { status: 404 });

  const clinic = await getClinic(ctx.clinicId, true);
  if (!clinic?.waSessionId) return NextResponse.json({ error: "WhatsApp no conectado" }, { status: 400 });
  if (!clinic.modules.recovery) {
    return NextResponse.json({ error: "El módulo de recuperación no está activo en tu plan." }, { status: 403 });
  }
  if (clinic.botPaused) {
    return NextResponse.json({ error: "El asistente está en pausa: reactívalo para enviar." }, { status: 409 });
  }
  if (!inSendingWindow(clinic.timezone)) {
    return NextResponse.json(
      { error: "Los envíos masivos solo salen entre las 9:00 y las 20:00." },
      { status: 409 }
    );
  }

  const { data: memberships } = await db
    .from("cohort_memberships")
    .select("patient_id, patients(*)")
    .eq("cohort_id", cohortId)
    .eq("clinic_id", ctx.clinicId)
    .eq("membership_status", "active");

  if (!memberships?.length) return NextResponse.json({ sent: 0, failed: 0, skipped: 0, message: "Sin miembros activos" });

  const startedAt = Date.now();
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let remaining = 0;

  for (const m of memberships) {
    const row = m.patients as any;
    if (!row?.phone_e164) continue;
    const patient = mapPatient(row, "whatsapp");

    const unreachable =
      !/^\d{7,16}$/.test(patient.phone) ||
      (row.channel_source && row.channel_source !== "whatsapp") ||
      patient.isBlocked ||
      (patient.botPausedUntil && new Date(patient.botPausedUntil).getTime() > Date.now());
    if (unreachable) {
      skipped++;
      continue;
    }

    if (sent + failed >= MAX_PER_CALL || Date.now() - startedAt > TIME_BUDGET_MS) {
      remaining++;
      continue;
    }

    const first = cleanFirstName(patient.fullName);
    const text = cohort.message_template
      .replace(/\{\{\s*patient_name\s*\}\}/gi, first || "")
      .replace(/\s{2,}/g, " ")
      .replace(/\s+([,.!?])/g, "$1")
      .trim();

    try {
      const { data: logged } = await db
        .from("messages")
        .insert({
          clinic_id: clinic.id,
          patient_id: patient.id,
          direction: "outbound",
          content_text: text,
          sent_at: new Date().toISOString(),
          processing_status: "sent",
          ...(flags.messagesExtended ? { channel: "whatsapp", response_source: "template" } : {}),
        })
        .select("id")
        .single();

      try {
        const res = await sendToChannel({ channel: "whatsapp", clinic, patient, text, delayMs: 2000 });
        if (logged?.id && res.id) await db.from("messages").update({ wa_message_id: res.id }).eq("id", logged.id);
      } catch (e) {
        if (logged?.id) await db.from("messages").update({ processing_status: "failed" }).eq("id", logged.id);
        throw e;
      }

      await db
        .from("cohort_memberships")
        .update({ last_messaged_at: new Date().toISOString() })
        .eq("cohort_id", cohortId)
        .eq("patient_id", patient.id);
      sent++;
      await jitter();
    } catch (err) {
      await logError("broadcast", "Falló un envío masivo a la cohorte", err, { clinicId: ctx.clinicId, patientId: patient.id });
      failed++;
    }
  }

  return NextResponse.json({
    sent,
    failed,
    skipped,
    remaining,
    message: remaining > 0 ? `Quedaron ${remaining} pendientes: vuelve a enviar para continuar.` : undefined,
  });
}
