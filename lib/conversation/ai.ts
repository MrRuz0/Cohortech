import OpenAI from "openai";
import type { NlpResult } from "@/lib/openai/extract-entities";
import { formatPrice } from "./services";
import { promoLines } from "./promotions";
import { cleanFirstName } from "./normalize";
import type { ClinicContext, HistoryMessage, PatientState, Promotion } from "./types";

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (!_client) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 20_000, maxRetries: 1 });
  }
  return _client;
}

export type AiResult =
  | { ok: true; reply: string; nlp: NlpResult; needsHuman: boolean; confidence: number }
  | { ok: false; reason: string };

function buildSystemPrompt(
  clinic: ClinicContext,
  patient: PatientState,
  promos: Promotion[]
): string {
  const services = clinic.services.length
    ? clinic.services.map((s) => `- ${s.name}${s.price ? `: ${formatPrice(s.price)}` : ""}`).join("\n")
    : "(sin servicios configurados)";
  const facts: string[] = [];
  if (clinic.hours) facts.push(`Horario: ${clinic.hours}`);
  if (clinic.address) facts.push(`Dirección: ${clinic.address}`);
  if (clinic.bookingPhone) facts.push(`Teléfono de reservas: ${clinic.bookingPhone}`);
  if (clinic.bookingLink) facts.push(`Enlace de reservas: ${clinic.bookingLink}`);
  if (clinic.paymentMethods) facts.push(`Formas de pago: ${clinic.paymentMethods}`);

  const memory: string[] = [];
  const first = cleanFirstName(patient.fullName);
  if (first) memory.push(`Nombre del paciente: ${first}`);
  if (patient.profile.interested_services?.length)
    memory.push(`Tratamientos que le interesaron: ${patient.profile.interested_services.join(", ")}`);
  if (patient.profile.objections?.length)
    memory.push(`Objeciones previas: ${patient.profile.objections.join(", ")}`);
  if (patient.lastDiscountOffered)
    memory.push(`Ya se le ofreció ${patient.lastDiscountOffered}% de descuento (no ofrezcas más que el máximo permitido).`);

  return `Eres el asistente virtual de recepción de ${clinic.name}, una clínica estética en Perú. Atiendes por WhatsApp. Tu objetivo es resolver la duda del paciente y llevarlo con naturalidad a agendar una valoración o cita.

REGLAS ESTRICTAS
1. Usa SOLO la información de abajo. Si el dato no está, di que lo confirma el equipo y marca needs_human=true. NUNCA inventes precios, descuentos, promociones, horarios, direcciones, teléfonos ni enlaces.
2. Descuentos: solo si el paciente objeta el precio. Máximo ${clinic.maxDiscountPercent}%. Promociones: solo las listadas.
3. No des diagnósticos, consejos médicos ni prometas resultados. Ante dudas médicas, explica que la doctora lo evalúa en la valoración.
4. Español peruano neutro, trato de tú. Máximo 3 oraciones cortas (unas 60 palabras), como máximo 1 emoji, y termina con una sola pregunta o un siguiente paso claro.
5. Si te preguntan si eres una persona o un robot, responde con honestidad que eres el asistente virtual de la clínica y que una persona del equipo puede continuar.
6. Si el paciente está molesto, tiene una queja, una urgencia médica o pide hablar con una persona: needs_human=true y responde con empatía breve.

SERVICIOS Y PRECIOS
${services}

DATOS DE LA CLÍNICA
${facts.length ? facts.join("\n") : "(sin datos adicionales)"}

PROMOCIONES VIGENTES
${promos.length ? promoLines(promos, clinic.timezone, 5) : "(ninguna)"}

MEMORIA DEL PACIENTE
${memory.length ? memory.join("\n") : "(conversación nueva)"}

Responde ÚNICAMENTE con un JSON:
{"reply": string, "intent": "booking"|"inquiry"|"post_treatment"|"complaint"|"payment"|"other", "treatment_mentioned": string|null, "patient_name": string|null, "pain_signals": string[], "needs_human": boolean, "confidence": number entre 0 y 1}`;
}

const VALID_INTENTS = ["booking", "inquiry", "post_treatment", "complaint", "payment", "other"] as const;

export async function generateAiReply(params: {
  clinic: ClinicContext;
  patient: PatientState;
  text: string;
  history: HistoryMessage[];
  promos: Promotion[];
}): Promise<AiResult> {
  if (!process.env.OPENAI_API_KEY) return { ok: false, reason: "no_api_key" };

  const turns = params.history
    .slice(-10)
    .filter((h) => h.text.trim())
    .map((h) => ({
      role: h.direction === "outbound" ? ("assistant" as const) : ("user" as const),
      content: h.text.slice(0, 600),
    }));

  try {
    const completion = await client().chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.5,
      max_tokens: 380,
      messages: [
        { role: "system", content: buildSystemPrompt(params.clinic, params.patient, params.promos) },
        ...turns,
        { role: "user", content: params.text.slice(0, 1200) },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, reason: "invalid_json" };
    }

    const reply = typeof parsed.reply === "string" ? parsed.reply.trim() : "";
    if (!reply) return { ok: false, reason: "empty_reply" };

    const intentRaw = String(parsed.intent ?? "other");
    const intent = (VALID_INTENTS as readonly string[]).includes(intentRaw)
      ? (intentRaw as NlpResult["intent"])
      : "other";
    const confidence =
      typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5;
    const needsHuman = parsed.needs_human === true || confidence < 0.4;

    const nlp: NlpResult = {
      patient_name: typeof parsed.patient_name === "string" ? parsed.patient_name : null,
      intent,
      treatment_mentioned:
        typeof parsed.treatment_mentioned === "string" ? parsed.treatment_mentioned : null,
      treatment_date: null,
      is_existing_patient: null,
      pain_signals: Array.isArray(parsed.pain_signals)
        ? parsed.pain_signals.filter((x): x is string => typeof x === "string").slice(0, 5)
        : [],
      next_action: needsHuman ? "escalate" : intent === "booking" ? "update_cohort" : "update_cohort",
      confidence,
    };

    return { ok: true, reply, nlp, needsHuman, confidence };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "ai_error" };
  }
}
