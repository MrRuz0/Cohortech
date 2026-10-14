import { NextRequest, NextResponse } from "next/server";
import { generateFollowup, MAX_FOLLOWUP_STAGES } from "@/lib/cohorts/followup";
import { sendToChannel } from "@/lib/channels/send";
import { admin, getClinic, getPromotions, mapPatient } from "@/lib/conversation/db";
import { activePromotions } from "@/lib/conversation/promotions";
import { inSendingWindow, jitter } from "@/lib/conversation/window";

export const maxDuration = 60;

const TIME_BUDGET_MS = 48_000;
const MAX_PER_RUN = 25;
const RECENT_CONTACT_HOURS = 24;

export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const db = admin();
  const nowIso = new Date().toISOString();

  const { data: memberships, error } = await db
    .from("cohort_memberships")
    .select(
      `id, patient_id, cohort_id, clinic_id, followup_stage, last_messaged_at, message_count,
       patients(*),
       cohort_definitions(name, pain_point, conversion_strategy)`
    )
    .eq("membership_status", "active")
    .not("next_followup_at", "is", null)
    .lte("next_followup_at", nowIso)
    .order("next_followup_at", { ascending: true })
    .limit(MAX_PER_RUN * 3);

  if (error) {
    console.error("[followups] consulta falló:", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!memberships?.length) return NextResponse.json({ ok: true, sent: 0, churned: 0, skipped: 0 });

  let sent = 0;
  let churned = 0;
  let skipped = 0;
  const reasons: Record<string, number> = {};
  const skip = (why: string) => {
    skipped++;
    reasons[why] = (reasons[why] ?? 0) + 1;
  };

  for (const m of memberships) {
    if (sent >= MAX_PER_RUN || Date.now() - startedAt > TIME_BUDGET_MS) break;

    const patientRow = m.patients as any;
    const cohort = m.cohort_definitions as any;
    if (!patientRow || !cohort) {
      skip("incomplete");
      continue;
    }

    const clinic = await getClinic(m.clinic_id);
    if (!clinic?.waSessionId) {
      skip("no_whatsapp");
      continue;
    }

    // Reglas de respeto: nada fuera de horario, a bloqueados, en pausa o por otros canales.
    if (!inSendingWindow(clinic.timezone)) {
      skip("outside_window");
      continue;
    }
    if (clinic.botPaused) {
      skip("clinic_paused");
      continue;
    }
    if (!clinic.modules.recovery) {
      skip("recovery_module_off");
      continue;
    }
    const patient = mapPatient(patientRow, "whatsapp");
    if (patientRow.channel_source && patientRow.channel_source !== "whatsapp") {
      skip("other_channel");
      continue;
    }
    if (patient.isBlocked) {
      skip("blocked");
      continue;
    }
    if (patient.botPausedUntil && new Date(patient.botPausedUntil).getTime() > Date.now()) {
      skip("human_takeover");
      continue;
    }
    if (
      patientRow.last_contact_at &&
      Date.now() - new Date(patientRow.last_contact_at).getTime() < RECENT_CONTACT_HOURS * 3_600_000
    ) {
      // Escribió hace poco: está en conversación, no es momento de un seguimiento.
      await db
        .from("cohort_memberships")
        .update({ next_followup_at: new Date(Date.now() + 2 * 86_400_000).toISOString() })
        .eq("id", m.id);
      skip("recent_contact");
      continue;
    }

    const nextStage = (m.followup_stage ?? 0) + 1;
    if (nextStage > MAX_FOLLOWUP_STAGES) {
      await db
        .from("cohort_memberships")
        .update({ membership_status: "churned", churned_at: nowIso, next_followup_at: null })
        .eq("id", m.id);
      churned++;
      continue;
    }

    const daysSinceLastContact = patientRow.last_contact_at
      ? Math.floor((Date.now() - new Date(patientRow.last_contact_at).getTime()) / 86_400_000)
      : 0;

    try {
      const promos = activePromotions(await getPromotions(clinic.id));
      const decision = await generateFollowup({
        clinic,
        promos,
        patientName: patient.fullName,
        cohortName: cohort.name,
        painPoint: cohort.pain_point,
        conversionStrategy: cohort.conversion_strategy,
        stage: nextStage,
        daysSinceLastContact,
        isReturning: patientRow.is_returning ?? false,
        interestedServices: patient.profile.interested_services,
        objections: patient.profile.objections,
        lastDiscountOffered: patient.lastDiscountOffered,
      });

      // Registrar ANTES de enviar para reconocer el eco del webhook como nuestro.
      const { data: logged } = await db
        .from("messages")
        .insert({
          clinic_id: clinic.id,
          patient_id: patient.id,
          direction: "outbound",
          content_text: decision.message,
          sent_at: new Date().toISOString(),
          processing_status: "sent",
        })
        .select("id")
        .single();

      let waId: string | null = null;
      try {
        const res = await sendToChannel({ channel: "whatsapp", clinic, patient, text: decision.message, delayMs: 2500 });
        waId = res.id;
      } catch (sendErr) {
        if (logged?.id) await db.from("messages").update({ processing_status: "failed" }).eq("id", logged.id);
        throw sendErr;
      }
      if (logged?.id && waId) await db.from("messages").update({ wa_message_id: waId }).eq("id", logged.id);

      const nextFollowupAt = new Date(Date.now() + decision.nextFollowupDays * 86_400_000);
      await db
        .from("cohort_memberships")
        .update({
          followup_stage: nextStage,
          last_messaged_at: nowIso,
          next_followup_at: decision.isFinalOffer ? null : nextFollowupAt.toISOString(),
          message_count: (m.message_count ?? 0) + 1,
        })
        .eq("id", m.id);

      await db.from("followup_log").insert({
        clinic_id: m.clinic_id,
        patient_id: m.patient_id,
        cohort_id: m.cohort_id,
        stage: nextStage,
        message_text: decision.message,
        discount_offered: decision.discountOffered,
      });

      sent++;
      await jitter();
    } catch (err) {
      console.error(`[followups] error en membresía ${m.id}:`, err);
      skip("error");
    }
  }

  return NextResponse.json({ ok: true, sent, churned, skipped, reasons });
}
