import { sendTextMessage, sentMessageId } from "@/lib/evolution/client";
import { toWaNumber } from "@/lib/conversation/db";
import type { Channel, ClinicContext, PatientState } from "@/lib/conversation/types";

export const CHANNEL_PREFIX: Record<Exclude<Channel, "whatsapp">, string> = {
  webchat: "web:",
  instagram: "ig:",
  messenger: "fb:",
};

export function externalIdOf(patient: Pick<PatientState, "phone">): string {
  return patient.phone.replace(/^(web|ig|fb):/, "");
}

/** Retardo "humano" proporcional al largo del mensaje (entre 1.2 y 6 segundos). */
export function humanDelayMs(text: string): number {
  return Math.max(1200, Math.min(6000, 700 + text.length * 22));
}

/**
 * Envía un texto por el canal del paciente.
 *  - whatsapp  → Evolution API
 *  - webchat   → no hay envío externo: el widget lee la respuesta guardada
 *  - instagram / messenger → Graph API de Meta (requiere token de página)
 */
export async function sendToChannel(params: {
  channel: Channel;
  clinic: ClinicContext;
  patient: PatientState;
  text: string;
  delayMs?: number;
}): Promise<{ id: string | null }> {
  const { channel, clinic, patient, text } = params;

  if (channel === "webchat") return { id: null };

  if (channel === "whatsapp") {
    if (!clinic.waSessionId) throw new Error("La clínica no tiene WhatsApp conectado");
    const target = patient.waContactId?.endsWith("@lid") ? patient.waContactId : toWaNumber(patient.phone);
    const res = await sendTextMessage(clinic.waSessionId, target, text, { delayMs: params.delayMs });
    return { id: sentMessageId(res) };
  }

  const token = typeof clinic.settings.meta_page_token === "string" ? clinic.settings.meta_page_token : "";
  if (!token) throw new Error(`Canal ${channel} sin token de página configurado`);
  const res = await fetch(
    `https://graph.facebook.com/v21.0/me/messages?access_token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: externalIdOf(patient) },
        messaging_type: "RESPONSE",
        message: { text },
      }),
      signal: AbortSignal.timeout(20_000),
    }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Graph API ${res.status}: ${detail.slice(0, 200)}`);
  }
  const json = (await res.json().catch(() => ({}))) as { message_id?: string };
  return { id: json.message_id ?? null };
}
