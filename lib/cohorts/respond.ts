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
- Si quieren agendar: muestra entusiasmo, personaliza con su nombre si lo tienes, y menciona cómo pueden agendar usando la información de la clínica
- Usa la estrategia psicológica indicada de forma natural, no forzada
- Si preguntan por precios, menciona los servicios disponibles con sus precios si los tienes
- Si preguntan por horarios o ubicación, responde con la información de la clínica
- Idioma: español

Información de la clínica:
{{clinic_info}}`;

type ClinicSettings = {
  services?: { name: string; price: string }[];
  booking_link?: string;
  booking_phone?: string;
  address?: string;
  hours?: string;
};

function buildClinicInfo(settings: ClinicSettings): string {
  const lines: string[] = [];
  if (settings.services?.length) {
    const list = settings.services.map((s) => `${s.name}${s.price ? ` (${s.price})` : ""}`).join(", ");
    lines.push(`Servicios: ${list}`);
  }
  if (settings.hours) lines.push(`Horario: ${settings.hours}`);
  if (settings.address) lines.push(`Dirección: ${settings.address}`);
  if (settings.booking_phone) lines.push(`Teléfono para citas: ${settings.booking_phone}`);
  if (settings.booking_link) lines.push(`Link para agendar: ${settings.booking_link}`);
  return lines.length ? lines.join("\n") : "Sin información adicional configurada.";
}

export async function generateAutoResponse({
  clinicName,
  patientName,
  messageText,
  nlpResult,
  cohortTemplate,
  strategy,
  clinicSettings,
}: {
  clinicName: string;
  patientName: string | null;
  messageText: string;
  nlpResult: NlpResult;
  cohortTemplate?: string | null;
  strategy?: string | null;
  clinicSettings?: ClinicSettings;
}): Promise<string> {
  const clinicInfo = buildClinicInfo(clinicSettings ?? {});
  const systemPrompt = SYSTEM_PROMPT
    .replace("{{clinic_name}}", clinicName)
    .replace("{{clinic_info}}", clinicInfo);

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
