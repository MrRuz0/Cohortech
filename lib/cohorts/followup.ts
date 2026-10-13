import OpenAI from "openai";
import { cleanFirstName } from "@/lib/conversation/normalize";
import { promoLines } from "@/lib/conversation/promotions";
import { formatPrice } from "@/lib/conversation/services";
import type { ClinicContext, Promotion } from "@/lib/conversation/types";
import { clampDiscount, validateReply } from "@/lib/conversation/validate";

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 20_000, maxRetries: 1 });
  return _openai;
}

export const MAX_FOLLOWUP_STAGES = 4;

export type FollowupDecision = {
  message: string;
  nextFollowupDays: number;
  isFinalOffer: boolean;
  discountOffered: number | null;
  usedFallback: boolean;
};

// Mensajes seguros (sin cifras ni promesas) si la IA falla o inventa algo.
const FALLBACKS = [
  "Hola{name}, ¿pudiste pensar lo que conversamos? Con gusto te ayudo a agendar tu valoración en {clinic}.",
  "Hola{name}, quería saber si te quedó alguna duda. Estoy para ayudarte cuando quieras en {clinic}.",
  "Hola{name}, te escribo para ver si seguimos con lo que veíamos. ¿Te ayudo a reservar un espacio?",
  "Hola{name}, ¿cómo vas? Si todavía te interesa, puedo dejarte una cita lista en {clinic}.",
];

function fallbackMessage(clinicName: string, patientName: string | null, stage: number): string {
  const name = cleanFirstName(patientName);
  const text = FALLBACKS[(stage - 1 + FALLBACKS.length) % FALLBACKS.length];
  return text.replace("{name}", name ? `, ${name}` : "").replace("{clinic}", clinicName);
}

export async function generateFollowup(params: {
  clinic: ClinicContext;
  promos: Promotion[];
  patientName: string | null;
  cohortName: string;
  painPoint: string;
  conversionStrategy: string;
  stage: number;
  daysSinceLastContact: number;
  isReturning?: boolean;
  interestedServices?: string[];
  objections?: string[];
  lastDiscountOffered?: number | null;
}): Promise<FollowupDecision> {
  const { clinic, promos, stage } = params;
  const isLastStage = stage >= MAX_FOLLOWUP_STAGES;
  const maxDiscount = clinic.maxDiscountPercent;
  const firstName = cleanFirstName(params.patientName);

  const services = clinic.services.length
    ? clinic.services.map((s) => `- ${s.name}${s.price ? `: ${formatPrice(s.price)}` : ""}`).join("\n")
    : "(sin servicios configurados)";

  const prompt = `Eres el asistente de ${clinic.name}, una clínica estética en Perú. Escribe el mensaje de WhatsApp de seguimiento número ${stage} de un máximo de ${MAX_FOLLOWUP_STAGES} para un paciente que no ha agendado.

${params.isReturning ? "Es un paciente RECURRENTE: reconoce su historial, tono cálido, sin descuentos agresivos al inicio." : "Es un paciente nuevo que aún no ha convertido."}

Paciente: ${firstName || "sin nombre"}
Cohorte: ${params.cohortName}
Punto de dolor: ${params.painPoint}
Estrategia: ${params.conversionStrategy}
Días desde el último contacto: ${params.daysSinceLastContact}
Tratamientos que le interesaron: ${params.interestedServices?.join(", ") || "no registrados"}
Objeciones previas: ${params.objections?.join(", ") || "ninguna"}
${params.lastDiscountOffered ? `Ya se le ofreció ${params.lastDiscountOffered}%: no repitas ni superes lo ofrecido sin necesidad.` : ""}
${isLastStage ? "Es el ÚLTIMO intento: cierra con una invitación amable, sin presionar." : ""}

SERVICIOS Y PRECIOS (usa solo estos datos)
${services}

PROMOCIONES VIGENTES
${promos.length ? promoLines(promos, clinic.timezone, 3) : "(ninguna)"}

Reglas:
- Máximo 2 oraciones, tono cálido y directo, español peruano, tuteo, como mucho 1 emoji.
- NO inventes precios, promociones, horarios ni enlaces. Solo los datos de arriba.
- Descuento: entre 0 y ${maxDiscount}% y SOLO si ayuda a convertir; ${maxDiscount <= 0 ? "no ofrezcas ningún descuento" : "escala conforme avanza la etapa"}.
- No menciones que eres un bot ni uses variables entre llaves.

Responde ÚNICAMENTE con JSON:
{"message": "...", "next_followup_days": <entero entre 2 y 7>, "discount_offered": <entero o null>}`;

  try {
    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 250,
    });

    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    let message = typeof parsed.message === "string" ? parsed.message.trim() : "";
    message = message.replace(/\{\{\s*patient_name\s*\}\}/gi, firstName || "");
    if (!message) throw new Error("empty_message");

    const check = validateReply(message, clinic, promos);
    if (!check.ok) throw new Error(`rejected:${check.reason}`);

    const days = Number.isFinite(parsed.next_followup_days)
      ? Math.max(2, Math.min(7, Math.round(parsed.next_followup_days)))
      : 5;

    return {
      message,
      nextFollowupDays: days,
      isFinalOffer: isLastStage,
      discountOffered: clampDiscount(
        typeof parsed.discount_offered === "number" ? parsed.discount_offered : null,
        maxDiscount
      ),
      usedFallback: false,
    };
  } catch (err) {
    console.warn("[followup] usando mensaje seguro:", err instanceof Error ? err.message : err);
    return {
      message: fallbackMessage(clinic.name, params.patientName, stage),
      nextFollowupDays: 5,
      isFinalOffer: isLastStage,
      discountOffered: null,
      usedFallback: true,
    };
  }
}
