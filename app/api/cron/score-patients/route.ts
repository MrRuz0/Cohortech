import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Re-score patients that haven't been scored in the last 24h
const RESCORE_AFTER_HOURS = 24;
// A patient is "returning" if they've had at least 1 converted cohort membership before
// OR if their first message was more than 30 days ago and they wrote again
const RETURNING_GAP_DAYS = 30;

export async function GET(request: NextRequest) {
  if (
    request.headers.get("authorization") !==
    `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(
    Date.now() - RESCORE_AFTER_HOURS * 60 * 60 * 1000
  ).toISOString();

  // Fetch patients not scored recently, with their message + membership history
  const { data: patients, error } = await supabaseAdmin
    .from("patients")
    .select(
      `id, clinic_id, status, first_contact_at, last_contact_at, created_at,
       messages(direction, sent_at),
       cohort_memberships(membership_status, conversions_count, followup_stage, churned_at, enrolled_at)`
    )
    .or(`scored_at.is.null,scored_at.lt.${cutoff}`)
    .limit(200);

  if (error) {
    console.error("score-patients fetch error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!patients?.length) {
    return NextResponse.json({ ok: true, scored: 0 });
  }

  const now = new Date();
  let scored = 0;

  for (const patient of patients) {
    const messages = (patient.messages as any[]) ?? [];
    const memberships = (patient.cohort_memberships as any[]) ?? [];

    const inbound = messages.filter((m) => m.direction === "inbound");
    const outbound = messages.filter((m) => m.direction === "outbound");

    const convertedMemberships = memberships.filter(
      (m) => m.membership_status === "converted"
    );
    const conversionsCount = convertedMemberships.length;

    // Determine first contact date
    const firstContactAt =
      patient.first_contact_at ??
      (inbound.length > 0
        ? inbound.sort(
            (a: any, b: any) =>
              new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()
          )[0].sent_at
        : null);

    // Is returning: converted at least once, OR wrote again after RETURNING_GAP_DAYS
    let isReturning = conversionsCount > 0;
    if (!isReturning && firstContactAt && patient.last_contact_at) {
      const gapDays =
        (new Date(patient.last_contact_at).getTime() -
          new Date(firstContactAt).getTime()) /
        (1000 * 60 * 60 * 24);
      isReturning = gapDays >= RETURNING_GAP_DAYS;
    }

    // Days since last contact
    const daysSinceLastContact = patient.last_contact_at
      ? Math.floor(
          (now.getTime() - new Date(patient.last_contact_at).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : null;

    // LTV score: 0–1
    // Factors: conversions (50%), message engagement (30%), recency (20%)
    const conversionScore = Math.min(conversionsCount / 3, 1) * 0.5;
    const engagementScore = Math.min(inbound.length / 10, 1) * 0.3;
    const recencyScore =
      daysSinceLastContact !== null
        ? Math.max(0, 1 - daysSinceLastContact / 180) * 0.2
        : 0;
    const ltvScore = parseFloat(
      (conversionScore + engagementScore + recencyScore).toFixed(3)
    );

    // Churn risk score: 0–1 (higher = more at risk)
    // Factors: days silent (50%), active memberships with no conversion (30%), failed followups (20%)
    const silenceFactor =
      daysSinceLastContact !== null
        ? Math.min(daysSinceLastContact / 90, 1) * 0.5
        : 0.5;
    const stuckMemberships = memberships.filter(
      (m) =>
        m.membership_status === "active" &&
        m.followup_stage >= 2 &&
        !m.churned_at
    );
    const stuckFactor = Math.min(stuckMemberships.length / 2, 1) * 0.3;
    const churnedCount = memberships.filter(
      (m) => m.membership_status === "churned"
    ).length;
    const churnHistoryFactor = Math.min(churnedCount / 2, 1) * 0.2;
    const churnRiskScore = parseFloat(
      (silenceFactor + stuckFactor + churnHistoryFactor).toFixed(3)
    );

    // Derive final status from signals
    let newStatus = patient.status;
    if (conversionsCount > 0) newStatus = "active";
    else if (inbound.length > 0) newStatus = "lead";

    await supabaseAdmin
      .from("patients")
      .update({
        total_messages_sent: outbound.length,
        total_messages_received: inbound.length,
        conversions_count: conversionsCount,
        first_contact_at: firstContactAt,
        is_returning: isReturning,
        days_since_last_contact: daysSinceLastContact,
        ltv_score: ltvScore,
        churn_risk_score: churnRiskScore,
        status: newStatus,
        scored_at: now.toISOString(),
      })
      .eq("id", patient.id);

    scored++;
  }

  return NextResponse.json({ ok: true, scored });
}
