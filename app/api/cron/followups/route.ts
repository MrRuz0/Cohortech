import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateFollowup, MAX_FOLLOWUP_STAGES } from "@/lib/cohorts/followup";
import { sendTextMessage } from "@/lib/evolution/client";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  if (
    request.headers.get("authorization") !==
    `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString();

  const { data: memberships } = await supabaseAdmin
    .from("cohort_memberships")
    .select(
      `id, patient_id, cohort_id, clinic_id, followup_stage, last_messaged_at,
       patients(full_name, phone_e164, is_returning),
       cohort_definitions(name, pain_point, conversion_strategy),
       clinics(name, wa_session_id, max_discount_percent)`
    )
    .eq("membership_status", "active")
    .lte("next_followup_at", now);

  if (!memberships?.length) {
    return NextResponse.json({ ok: true, sent: 0, churned: 0 });
  }

  let sent = 0;
  let churned = 0;

  for (const m of memberships) {
    const patient = m.patients as any;
    const cohort = m.cohort_definitions as any;
    const clinic = m.clinics as any;

    if (!patient?.phone_e164 || !clinic?.wa_session_id) continue;

    const nextStage = (m.followup_stage ?? 0) + 1;

    // Already exhausted the sequence with no conversion -> churn
    if (nextStage > MAX_FOLLOWUP_STAGES) {
      await supabaseAdmin
        .from("cohort_memberships")
        .update({ membership_status: "churned", churned_at: now })
        .eq("id", m.id);
      churned++;
      continue;
    }

    const daysSinceLastContact = m.last_messaged_at
      ? Math.floor(
          (Date.now() - new Date(m.last_messaged_at).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : 0;

    try {
      const decision = await generateFollowup({
        clinicName: clinic.name ?? "la clínica",
        patientName: patient.full_name,
        cohortName: cohort.name,
        painPoint: cohort.pain_point,
        conversionStrategy: cohort.conversion_strategy,
        stage: nextStage,
        daysSinceLastContact,
        maxDiscountPercent: clinic.max_discount_percent ?? 10,
        isReturning: patient.is_returning ?? false,
      });

      const personalizedMsg = decision.message.replace(
        /\{\{patient_name\}\}/gi,
        patient.full_name ?? "estimado paciente"
      );

      await sendTextMessage(clinic.wa_session_id, patient.phone_e164, personalizedMsg);

      const nextFollowupAt = new Date();
      nextFollowupAt.setDate(nextFollowupAt.getDate() + decision.nextFollowupDays);

      await supabaseAdmin
        .from("cohort_memberships")
        .update({
          followup_stage: nextStage,
          last_messaged_at: now,
          next_followup_at: decision.isFinalOffer ? null : nextFollowupAt.toISOString(),
          message_count: (m as any).message_count ? (m as any).message_count + 1 : 1,
        })
        .eq("id", m.id);

      await supabaseAdmin.from("followup_log").insert({
        clinic_id: m.clinic_id,
        patient_id: m.patient_id,
        cohort_id: m.cohort_id,
        stage: nextStage,
        message_text: personalizedMsg,
        discount_offered: decision.discountOffered,
      });

      sent++;
    } catch (err) {
      console.error(`Followup error for membership ${m.id}:`, err);
    }
  }

  return NextResponse.json({ ok: true, sent, churned });
}
