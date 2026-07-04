import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
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

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch all active clinics with WhatsApp connected and a receptionist phone
  const { data: clinics } = await supabaseAdmin
    .from("clinics")
    .select("id, name, wa_session_id, receptionist_phone")
    .not("wa_session_id", "is", null)
    .not("receptionist_phone", "is", null);

  if (!clinics?.length) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  let sent = 0;

  for (const clinic of clinics) {
    try {
      const [
        { count: newPatients },
        { count: messagesReceived },
        { count: conversions },
        { count: followupsSent },
      ] = await Promise.all([
        supabaseAdmin
          .from("patients")
          .select("*", { count: "exact", head: true })
          .eq("clinic_id", clinic.id)
          .gte("created_at", weekAgo),
        supabaseAdmin
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("clinic_id", clinic.id)
          .eq("direction", "inbound")
          .gte("sent_at", weekAgo),
        supabaseAdmin
          .from("cohort_memberships")
          .select("*", { count: "exact", head: true })
          .eq("clinic_id", clinic.id)
          .eq("membership_status", "converted")
          .gte("enrolled_at", weekAgo),
        supabaseAdmin
          .from("followup_log")
          .select("*", { count: "exact", head: true })
          .eq("clinic_id", clinic.id)
          .gte("sent_at", weekAgo),
      ]);

      const summary = [
        `📊 *Resumen semanal — ${clinic.name}*`,
        ``,
        `Esta semana Cohortech trabajó por ti:`,
        `👥 *${newPatients ?? 0}* pacientes nuevos registrados`,
        `💬 *${messagesReceived ?? 0}* mensajes recibidos y procesados`,
        `🤖 *${followupsSent ?? 0}* seguimientos automáticos enviados`,
        `✅ *${conversions ?? 0}* citas agendadas`,
        ``,
        `Sigue así — cada seguimiento automático es una cita que antes se perdía.`,
        `Revisa tu dashboard: https://cohortech.vercel.app/dashboard`,
      ].join("\n");

      await sendTextMessage(
        clinic.wa_session_id,
        clinic.receptionist_phone,
        summary
      );

      sent++;
    } catch (err) {
      console.error(`Weekly summary error for clinic ${clinic.id}:`, err);
    }
  }

  return NextResponse.json({ ok: true, sent });
}
