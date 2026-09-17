import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendTextMessage } from "@/lib/evolution/client";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── Reglas de negocio ────────────────────────────────────────────
const DEFAULT_INACTIVITY_DAYS = 90; // umbral por defecto si la clínica no lo configuró
const DAYS_BETWEEN_ATTEMPTS = 3; // 48-72h según la especificación original
const MAX_ATTEMPTS = 2;
const COOLDOWN_MONTHS_AFTER_EXHAUSTED = 12;
const MAX_MESSAGES_PER_CLINIC = 30; // protección básica de volumen por corrida

// 10 variantes reales para no sonar repetitivo entre pacientes distintos.
const REACTIVATION_MESSAGES = [
  "Hola {{name}}, en {{clinic}} notamos que no te vemos hace un tiempo. ¿Todo bien? Nos encantaría verte de nuevo.",
  "Hola {{name}}, ha pasado un tiempo desde tu última visita a {{clinic}}. ¿Agendamos tu próxima cita?",
  "Hola {{name}}, en {{clinic}} te tenemos presente. ¿Qué tal si retomamos tu cuidado?",
  "Hola {{name}}, queremos saber cómo has estado. ¿Te gustaría agendar en {{clinic}} pronto?",
  "Hola {{name}}, esperamos que estés muy bien. Cuando quieras retomar tu cuidado en {{clinic}}, aquí estamos.",
  "Hola {{name}}, en {{clinic}} tenemos disponibilidad esta semana. ¿Coordinamos tu visita?",
  "Hola {{name}}, ¿cómo van las cosas? Nos gustaría verte de nuevo por {{clinic}}.",
  "Hola {{name}}, todo el equipo de {{clinic}} te manda un saludo. ¿Agendamos tu próxima sesión?",
  "Hola {{name}}, en {{clinic}} siempre es un gusto atenderte. ¿Coordinamos tu próxima visita?",
  "Hola {{name}}, ¿te gustaría programar tu próxima cita en {{clinic}}?",
];

function pickMessage(clinicName: string, patientName: string | null): string {
  const text = REACTIVATION_MESSAGES[Math.floor(Math.random() * REACTIVATION_MESSAGES.length)];
  return text
    .replaceAll("{{clinic}}", clinicName)
    .replaceAll("{{name}}", patientName ?? "");
}

export async function GET(request: NextRequest) {
  if (
    request.headers.get("authorization") !==
    `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const { data: clinics } = await supabaseAdmin
    .from("clinics")
    .select("id, name, wa_session_id, settings")
    .not("wa_session_id", "is", null);

  if (!clinics?.length) {
    return NextResponse.json({ ok: true, firstAttempt: 0, secondAttempt: 0, paused: 0, reactivated: 0 });
  }

  let firstAttempt = 0;
  let secondAttempt = 0;
  let paused = 0;
  let reactivated = 0;

  for (const clinic of clinics) {
    const inactivityDays =
      (clinic.settings as any)?.reactivation_after_days ?? DEFAULT_INACTIVITY_DAYS;
    const cutoff = new Date(now.getTime() - inactivityDays * 24 * 60 * 60 * 1000).toISOString();

    const { data: patients } = await supabaseAdmin
      .from("patients")
      .select(
        "id, full_name, phone_e164, last_contact_at, reactivation_attempts_count, last_reactivation_sent_at, reactivation_paused_until"
      )
      .eq("clinic_id", clinic.id)
      .lte("last_contact_at", cutoff)
      .or(`reactivation_paused_until.is.null,reactivation_paused_until.lt.${now.toISOString()}`)
      .limit(MAX_MESSAGES_PER_CLINIC);

    if (!patients?.length) continue;

    for (const patient of patients) {
      const count = patient.reactivation_attempts_count ?? 0;
      const lastSentAt = patient.last_reactivation_sent_at
        ? new Date(patient.last_reactivation_sent_at)
        : null;
      const lastContactAt = patient.last_contact_at ? new Date(patient.last_contact_at) : null;

      // Si respondió después del último intento, sale del flujo de
      // reactivación — el sistema de cohortes por comportamiento ya
      // toma el relevo desde ahí.
      if (lastSentAt && lastContactAt && lastContactAt > lastSentAt) {
        if (count > 0) {
          await supabaseAdmin
            .from("patients")
            .update({ reactivation_attempts_count: 0, last_reactivation_sent_at: null })
            .eq("id", patient.id);
          reactivated++;
        }
        continue;
      }

      // Ya se mandó un intento — esperar el intervalo antes del siguiente.
      if (lastSentAt) {
        const daysSinceLastAttempt =
          (now.getTime() - lastSentAt.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceLastAttempt < DAYS_BETWEEN_ATTEMPTS) continue;
      }

      // Agotó los intentos sin respuesta → cooldown extendido, no seguir
      // insistiendo cada ciclo.
      if (count >= MAX_ATTEMPTS) {
        const pauseUntil = new Date(now);
        pauseUntil.setMonth(pauseUntil.getMonth() + COOLDOWN_MONTHS_AFTER_EXHAUSTED);
        await supabaseAdmin
          .from("patients")
          .update({
            reactivation_attempts_count: 0,
            reactivation_paused_until: pauseUntil.toISOString(),
          })
          .eq("id", patient.id);
        paused++;
        continue;
      }

      try {
        const text = pickMessage(clinic.name, patient.full_name);
        await sendTextMessage(clinic.wa_session_id!, patient.phone_e164, text);

        await supabaseAdmin
          .from("patients")
          .update({
            reactivation_attempts_count: count + 1,
            last_reactivation_sent_at: now.toISOString(),
          })
          .eq("id", patient.id);

        if (count === 0) firstAttempt++;
        else secondAttempt++;
      } catch (err) {
        console.error(`Error enviando reactivación a ${patient.phone_e164}:`, err);
      }
    }
  }

  return NextResponse.json({ ok: true, firstAttempt, secondAttempt, paused, reactivated });
}
