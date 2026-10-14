import { NextRequest, NextResponse } from "next/server";
import { sendToChannel } from "@/lib/channels/send";
import { admin, getClinic, getPromotions, getSchemaFlags, mapPatient } from "@/lib/conversation/db";
import { cleanFirstName } from "@/lib/conversation/normalize";
import { activePromotions, promoLine } from "@/lib/conversation/promotions";
import { inSendingWindow, jitter } from "@/lib/conversation/window";

export const maxDuration = 60;

// ── Reglas de negocio ────────────────────────────────────────────────
const DEFAULT_INACTIVITY_DAYS = 90;
const DAYS_BETWEEN_ATTEMPTS = 3;
const MAX_ATTEMPTS = 2;
const COOLDOWN_MONTHS_AFTER_EXHAUSTED = 12;
const MAX_MESSAGES_PER_CLINIC = 20;
const TIME_BUDGET_MS = 48_000;

const BASE_MESSAGES = [
  "Hola{name}, en {clinic} notamos que no te vemos hace un tiempo. ¿Todo bien? Nos encantaría verte de nuevo.",
  "Hola{name}, ha pasado un tiempo desde tu última visita a {clinic}. ¿Agendamos tu próxima cita?",
  "Hola{name}, en {clinic} te tenemos presente. ¿Qué tal si retomamos tu cuidado?",
  "Hola{name}, queremos saber cómo has estado. ¿Te gustaría agendar en {clinic} pronto?",
  "Hola{name}, esperamos que estés muy bien. Cuando quieras retomar tu cuidado en {clinic}, aquí estamos.",
  "Hola{name}, en {clinic} tenemos disponibilidad esta semana. ¿Coordinamos tu visita?",
  "Hola{name}, ¿cómo van las cosas? Nos gustaría verte de nuevo por {clinic}.",
  "Hola{name}, todo el equipo de {clinic} te manda un saludo. ¿Agendamos tu próxima sesión?",
  "Hola{name}, en {clinic} siempre es un gusto atenderte. ¿Coordinamos tu próxima visita?",
  "Hola{name}, ¿te gustaría programar tu próxima cita en {clinic}?",
];

// Solo se usan cuando la clínica tiene una promoción REAL vigente.
const PROMO_MESSAGES = [
  "Hola{name}, en {clinic} tenemos algo para ti:\n{promo}\n¿Te gustaría aprovecharlo?",
  "Hola{name}, te escribimos de {clinic} porque hay una promoción vigente:\n{promo}\nSi te interesa, te ayudo a agendar.",
  "Hola{name}, hace tiempo que no nos visitas y queremos invitarte a volver:\n{promo}\n¿Coordinamos tu cita?",
  "Hola{name}, desde {clinic}: aprovecha esto antes de que termine:\n{promo}\nCuéntame si te ayudo a reservar.",
];

function pickMessage(clinicName: string, patientName: string | null, promoText: string | null): string {
  const pool = promoText ? PROMO_MESSAGES : BASE_MESSAGES;
  const tpl = pool[Math.floor(Math.random() * pool.length)];
  const name = cleanFirstName(patientName);
  return tpl
    .replace("{name}", name ? `, ${name}` : "")
    .replaceAll("{clinic}", clinicName)
    .replace("{promo}", promoText ?? "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const db = admin();
  const flags = await getSchemaFlags();
  const now = new Date();

  // ?clinic=<id> limita la corrida a una clínica; ?preview=1 solo informa, sin enviar ni modificar nada.
  const params = new URL(request.url).searchParams;
  const onlyClinic = params.get("clinic");
  const preview = params.get("preview") === "1";
  const wouldSend: { clinic: string; phone: string; attempt: number }[] = [];

  let clinicQuery = db.from("clinics").select("id").not("wa_session_id", "is", null);
  if (onlyClinic) clinicQuery = clinicQuery.eq("id", onlyClinic);
  const { data: clinicRows } = await clinicQuery;
  if (!clinicRows?.length) {
    return NextResponse.json({ ok: true, firstAttempt: 0, secondAttempt: 0, paused: 0, reactivated: 0 });
  }

  let firstAttempt = 0;
  let secondAttempt = 0;
  let paused = 0;
  let reactivated = 0;
  let skippedWindow = 0;

  for (const { id } of clinicRows) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) break;
    const clinic = await getClinic(id, true);
    if (!clinic?.waSessionId || clinic.botPaused || !clinic.modules.recovery) continue;
    if (clinic.settings.dry_run !== true && !inSendingWindow(clinic.timezone, now)) {
      skippedWindow++;
      continue;
    }

    const inactivityDays =
      typeof clinic.settings.reactivation_after_days === "number"
        ? (clinic.settings.reactivation_after_days as number)
        : DEFAULT_INACTIVITY_DAYS;
    const cutoff = new Date(now.getTime() - inactivityDays * 86_400_000).toISOString();

    let query = db
      .from("patients")
      .select("*")
      .eq("clinic_id", clinic.id)
      .not("last_contact_at", "is", null)
      .lte("last_contact_at", cutoff)
      .or(`reactivation_paused_until.is.null,reactivation_paused_until.lt.${now.toISOString()}`)
      .or("channel_source.is.null,channel_source.eq.whatsapp")
      .order("last_contact_at", { ascending: true })
      .limit(MAX_MESSAGES_PER_CLINIC * 2);
    if (flags.patientsExtended) query = query.or("is_blocked.is.null,is_blocked.eq.false");

    const { data: patients, error } = await query;
    if (error) {
      console.error(`[dispatch] consulta falló (${clinic.name}):`, error.message);
      continue;
    }
    if (!patients?.length) continue;

    const promos = activePromotions(await getPromotions(clinic.id));
    const generalPromo = promos.find((p) => !p.service_name) ?? promos[0] ?? null;
    const promoText = generalPromo ? promoLine(generalPromo, clinic.timezone) : null;

    let sentForClinic = 0;
    for (const row of patients) {
      if (sentForClinic >= MAX_MESSAGES_PER_CLINIC || Date.now() - startedAt > TIME_BUDGET_MS) break;

      const patient = mapPatient(row, "whatsapp");
      if (patient.botPausedUntil && new Date(patient.botPausedUntil).getTime() > Date.now()) continue;
      // Solo números reales de WhatsApp (nunca ids de otros canales).
      if (!/^\d{7,16}$/.test(patient.phone)) continue;

      const count: number = row.reactivation_attempts_count ?? 0;
      const lastSentAt = row.last_reactivation_sent_at ? new Date(row.last_reactivation_sent_at) : null;
      const lastContactAt = row.last_contact_at ? new Date(row.last_contact_at) : null;

      // Respondió después del último intento: sale del flujo y el motor conversacional toma el relevo.
      if (lastSentAt && lastContactAt && lastContactAt > lastSentAt) {
        if (count > 0) {
          if (!preview) {
            await db
              .from("patients")
              .update({ reactivation_attempts_count: 0, last_reactivation_sent_at: null })
              .eq("id", patient.id);
          }
          reactivated++;
        }
        continue;
      }

      if (lastSentAt) {
        const days = (now.getTime() - lastSentAt.getTime()) / 86_400_000;
        if (days < DAYS_BETWEEN_ATTEMPTS) continue;
      }

      // Agotó los 2 intentos sin respuesta → pausa de 12 meses.
      if (count >= MAX_ATTEMPTS) {
        const until = new Date(now);
        until.setMonth(until.getMonth() + COOLDOWN_MONTHS_AFTER_EXHAUSTED);
        if (!preview) {
          await db
            .from("patients")
            .update({ reactivation_attempts_count: 0, reactivation_paused_until: until.toISOString() })
            .eq("id", patient.id);
        }
        paused++;
        continue;
      }

      if (preview) {
        wouldSend.push({ clinic: clinic.name, phone: `…${patient.phone.slice(-4)}`, attempt: count + 1 });
        if (count === 0) firstAttempt++;
        else secondAttempt++;
        sentForClinic++;
        continue;
      }

      const text = pickMessage(clinic.name, patient.fullName, promoText);
      try {
        // Registrar antes de enviar: el eco del webhook se reconoce como nuestro.
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
          const res = await sendToChannel({ channel: "whatsapp", clinic, patient, text, delayMs: 2500 });
          if (logged?.id && res.id) await db.from("messages").update({ wa_message_id: res.id }).eq("id", logged.id);
        } catch (sendErr) {
          if (logged?.id) await db.from("messages").update({ processing_status: "failed" }).eq("id", logged.id);
          throw sendErr;
        }

        await db
          .from("patients")
          .update({ reactivation_attempts_count: count + 1, last_reactivation_sent_at: now.toISOString() })
          .eq("id", patient.id);

        if (count === 0) firstAttempt++;
        else secondAttempt++;
        sentForClinic++;
        await jitter();
      } catch (err) {
        console.error(`[dispatch] error enviando a ${patient.phone}:`, err);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    ...(preview ? { preview: true, wouldSend } : {}),
    firstAttempt,
    secondAttempt,
    paused,
    reactivated,
    skippedWindow,
  });
}
