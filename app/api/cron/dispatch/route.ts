import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendTextMessage } from "@/lib/evolution/client";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MAX_MESSAGES_PER_CLINIC = 20;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const created = await createPendingEvents();
  const dispatched = await dispatchPendingEvents();

  return NextResponse.json({ created, dispatched });
}

async function createPendingEvents() {
  const today = new Date().toISOString().split("T")[0];

  const { data: memberships } = await supabaseAdmin
    .from("cohort_memberships")
    .select(
      "id, clinic_id, patient_id, next_event_date, cohort_definitions(reminder_offset_days, treatment_name, message_templates)"
    )
    .eq("membership_status", "active")
    .lte("next_event_date", today);

  if (!memberships) return 0;

  let created = 0;

  for (const membership of memberships) {
    const { data: existing } = await supabaseAdmin
      .from("scheduled_events")
      .select("id")
      .eq("membership_id", membership.id)
      .eq("event_type", "reactivation_reminder")
      .maybeSingle();

    if (existing) continue;

    await supabaseAdmin.from("scheduled_events").insert({
      clinic_id: membership.clinic_id,
      patient_id: membership.patient_id,
      membership_id: membership.id,
      event_type: "reactivation_reminder",
      status: "pending",
      scheduled_at: new Date().toISOString(),
      payload: {
        treatment_name: (membership as unknown as { cohort_definitions?: { treatment_name?: string } }).cohort_definitions?.treatment_name ?? null,
      },
    });

    created++;
  }

  return created;
}

async function dispatchPendingEvents() {
  const now = new Date().toISOString();

  const { data: events } = await supabaseAdmin
    .from("scheduled_events")
    .select("id, clinic_id, patient_id, payload, attempt_count")
    .eq("status", "pending")
    .lte("scheduled_at", now)
    .order("scheduled_at", { ascending: true });

  if (!events) return 0;

  const countByClinic = new Map<string, number>();
  let dispatched = 0;

  for (const event of events) {
    const count = countByClinic.get(event.clinic_id) ?? 0;
    if (count >= MAX_MESSAGES_PER_CLINIC) continue;

    const { data: clinic } = await supabaseAdmin
      .from("clinics")
      .select("wa_session_id")
      .eq("id", event.clinic_id)
      .single();

    const { data: patient } = await supabaseAdmin
      .from("patients")
      .select("phone_e164, full_name")
      .eq("id", event.patient_id)
      .single();

    if (!clinic?.wa_session_id || !patient?.phone_e164) {
      await supabaseAdmin
        .from("scheduled_events")
        .update({
          status: "failed",
          failure_reason: "missing_clinic_session_or_patient_phone",
          attempt_count: event.attempt_count + 1,
        })
        .eq("id", event.id);
      continue;
    }

    const treatmentName = (event.payload as { treatment_name?: string } | null)?.treatment_name ?? "tu tratamiento";
    const name = patient.full_name ?? "";
    const text = `Hola ${name}! Han pasado varios meses desde tu última sesión de ${treatmentName}. ¿Quieres agendar una cita de seguimiento?`;

    try {
      await sendTextMessage(clinic.wa_session_id, patient.phone_e164, text);

      await supabaseAdmin
        .from("scheduled_events")
        .update({
          status: "sent",
          executed_at: new Date().toISOString(),
          attempt_count: event.attempt_count + 1,
        })
        .eq("id", event.id);

      dispatched++;
      countByClinic.set(event.clinic_id, count + 1);
    } catch (err) {
      await supabaseAdmin
        .from("scheduled_events")
        .update({
          status: "failed",
          failure_reason: err instanceof Error ? err.message : "unknown_error",
          attempt_count: event.attempt_count + 1,
        })
        .eq("id", event.id);
    }
  }

  return dispatched;
}
