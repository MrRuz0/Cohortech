import OpenAI from "openai";
import type { NlpResult } from "@/lib/openai/extract-entities";

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

const SYSTEM_PROMPT = `Eres el asistente virtual de {{clinic_name}}, una clínica de medicina estética.
Respondes mensajes de WhatsApp a pacientes y prospectos de forma cálida, profesional y persuasiva.
Reglas:
- Nunca menciones que eres un bot o IA
- Máximo 3 oraciones cortas
- Si quieren agendar: muestra entusiasmo, personaliza con su nombre si lo tienes, y menciona que un asesor les confirmará pronto
- Usa la estrategia psicológica indicada de forma natural, no forzada
- Idioma: español`;

export async function generateAutoResponse({
  clinicName,
  patientName,
  messageText,
  nlpResult,
  cohortTemplate,
  strategy,
}: {
  clinicName: string;
  patientName: string | null;
  messageText: string;
  nlpResult: NlpResult;
  cohortTemplate?: string | null;
  strategy?: string | null;
}): Promise<string> {
  const systemPrompt = SYSTEM_PROMPT.replace("{{clinic_name}}", clinicName);

  const lines = [
    `Mensaje del paciente: "${messageText}"`,
    patientName ? `Nombre del paciente: ${patientName}` : null,
    `Intent detectado: ${nlpResult.intent}`,
    nlpResult.treatment_mentioned
      ? `Tratamiento mencionado: ${nlpResult.treatment_mentioned}`
      : null,
    nlpResult.pain_signals?.length > 0
      ? `Señales de preocupación: ${nlpResult.pain_signals.join(", ")}`
      : null,
    strategy ? `Estrategia a usar: ${strategy}` : null,
    cohortTemplate ? `Inspiración de mensaje: ${cohortTemplate}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: lines },
    ],
    max_tokens: 220,
    temperature: 0.85,
  });

  return completion.choices[0]?.message?.content?.trim() ?? "";
}

export function canAutoRespond(lastAutoResponseAt: string | null): boolean {
  if (!lastAutoResponseAt) return true;
  const hoursSince =
    (Date.now() - new Date(lastAutoResponseAt).getTime()) / (1000 * 60 * 60);
  return hoursSince >= 4;
}
