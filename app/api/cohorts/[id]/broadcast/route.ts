import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { sendTextMessage } from "@/lib/evolution/client";

const supabaseAdmin = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id: cohortId } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get cohort + clinic
  const { data: cohort } = await supabaseAdmin
    .from("cohort_definitions")
    .select("id, name, message_template, clinic_id")
    .eq("id", cohortId)
    .single();

  if (!cohort) return NextResponse.json({ error: "Cohort not found" }, { status: 404 });

  const { data: clinic } = await supabaseAdmin
    .from("clinics")
    .select("wa_session_id")
    .eq("id", cohort.clinic_id)
    .single();

  if (!clinic?.wa_session_id) {
    return NextResponse.json({ error: "WhatsApp not connected" }, { status: 400 });
  }

  // Get active members with phone
  const { data: memberships } = await supabaseAdmin
    .from("cohort_memberships")
    .select("patient_id, patients(full_name, phone_e164)")
    .eq("cohort_id", cohortId)
    .eq("membership_status", "active");

  if (!memberships?.length) {
    return NextResponse.json({ sent: 0, message: "No active members" });
  }

  let sent = 0;
  let failed = 0;

  for (const membership of memberships) {
    const patient = membership.patients as any;
    if (!patient?.phone_e164) continue;

    const personalizedMsg = cohort.message_template.replace(
      /\{\{patient_name\}\}/gi,
      patient.full_name ?? "estimado paciente"
    );

    try {
      await sendTextMessage(clinic.wa_session_id, patient.phone_e164, personalizedMsg);

      await supabaseAdmin
        .from("cohort_memberships")
        .update({ last_messaged_at: new Date().toISOString() })
        .eq("cohort_id", cohortId)
        .eq("patient_id", membership.patient_id);

      sent++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ sent, failed });
}
