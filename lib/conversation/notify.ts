import { sendTextMessage } from "@/lib/evolution/client";
import { admin, onlyDigits, toWaNumber } from "./db";
import { cleanFirstName } from "./normalize";
import type { ClinicContext, NotifyReason, PatientState } from "./types";

const TITLES: Record<NotifyReason, string> = {
  booking: "🔔 *Quiere agendar una cita*",
  cancel_reschedule: "🔁 *Pide cancelar o reprogramar*",
  complaint: "⚠️ *RECLAMO — atender con prioridad*",
  urgent_medical: "🚨 *URGENTE — posible emergencia médica*",
  escalation: "🙋 *Necesita a una persona*",
  media: "📎 *Envió un audio, foto o documento*",
  payment: "💳 *Consulta por formas de pago*",
  negotiation_limit: "💬 *Pide más descuento (ya ofrecí el máximo)*",
  missing_info: "ℹ️ *Pregunta algo que no tengo configurado*",
  rate_limit: "⏱️ *Conversación muy larga con el bot*",
  ai_failure: "🛠️ *El asistente no pudo responder*",
};

// Mismo motivo + mismo paciente: no repetir el aviso dentro de esta ventana.
const DEDUPE_MINUTES: Record<NotifyReason, number> = {
  booking: 30,
  cancel_reschedule: 30,
  complaint: 0,
  urgent_medical: 0,
  escalation: 60,
  media: 30,
  payment: 60,
  negotiation_limit: 120,
  missing_info: 120,
  rate_limit: 120,
  ai_failure: 30,
};

export async function notifyReceptionist(params: {
  clinic: ClinicContext;
  patient: PatientState;
  reason: NotifyReason;
  priority: "normal" | "high";
  lastText: string;
}): Promise<boolean> {
  const { clinic, patient, reason } = params;
  if (!clinic.receptionistPhone || !clinic.waSessionId) {
    console.warn(`[notify] Sin recepcionista/WhatsApp configurado (${reason}) para ${clinic.name}`);
    return false;
  }

  const last = patient.profile.last_notified?.[reason];
  const windowMin = DEDUPE_MINUTES[reason];
  if (last && windowMin > 0 && Date.now() - new Date(last).getTime() < windowMin * 60_000) {
    return false;
  }

  const phone = onlyDigits(patient.phone);
  const isWhatsApp = patient.channel === "whatsapp";
  const who = cleanFirstName(patient.fullName) || patient.fullName || "Paciente sin nombre";
  const service = patient.profile.interested_services?.slice(-1)[0];

  const lines = [
    TITLES[reason],
    `Paciente: ${who}`,
    isWhatsApp ? `Tel: +${phone}` : `Canal: ${patient.channel}`,
    service ? `Interés: ${service}` : null,
    `Mensaje: "${params.lastText.replace(/\s+/g, " ").slice(0, 160)}"`,
    isWhatsApp ? `Responder: https://wa.me/${phone}` : null,
    params.priority === "high" ? "El asistente quedó en pausa con este paciente." : null,
  ].filter(Boolean);

  try {
    await sendTextMessage(clinic.waSessionId, toWaNumber(clinic.receptionistPhone), lines.join("\n"));
  } catch (err) {
    console.error("[notify] Falló el aviso a recepción:", err);
    return false;
  }

  const profile = {
    ...patient.profile,
    last_notified: { ...(patient.profile.last_notified ?? {}), [reason]: new Date().toISOString() },
  };
  patient.profile = profile;
  const { error } = await admin().from("patients").update({ extracted_profile: profile }).eq("id", patient.id);
  if (error) console.error("[notify] no se pudo guardar el aviso:", error.message);
  return true;
}
