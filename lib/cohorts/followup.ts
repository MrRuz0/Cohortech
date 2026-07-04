import OpenAI from "openai";

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

export const MAX_FOLLOWUP_STAGES = 4;

export type FollowupDecision = {
  message: string;
  nextFollowupDays: number;
  isFinalOffer: boolean;
  discountOffered: number | null;
};

export async function generateFollowup({
  clinicName,
  patientName,
  cohortName,
  painPoint,
  conversionStrategy,
  stage,
  daysSinceLastContact,
  maxDiscountPercent,
  isReturning = false,
}: {
  clinicName: string;
  patientName: string | null;
  cohortName: string;
  painPoint: string;
  conversionStrategy: string;
  stage: number;
  daysSinceLastContact: number;
  maxDiscountPercent: number;
  isReturning?: boolean;
}): Promise<FollowupDecision> {
  const isLastStage = stage >= MAX_FOLLOWUP_STAGES;

  const returningContext = isReturning
    ? `Este es un paciente RECURRENTE que ya ha visitado la clínica antes. No lo trates como prospecto nuevo — reconoce su historial, usa un tono más cálido y cercano, y en lugar de convencer, recuérdale que ya conoce la calidad del servicio. No ofrezcas descuentos agresivos en etapas tempranas.`
    : `Este es un paciente nuevo que aún no ha convertido.`;

  const prompt = `Eres un experto en ventas y retención para clínicas de medicina estética. Estás armando el mensaje de WhatsApp de seguimiento número ${stage} de un máximo de ${MAX_FOLLOWUP_STAGES} para un paciente.

${returningContext}

Clínica: ${clinicName}
Paciente: ${patientName ?? "sin nombre registrado"}
Es paciente recurrente: ${isReturning ? "SÍ" : "NO"}
Cohorte: ${cohortName}
Punto de dolor detectado: ${painPoint}
Estrategia psicológica de esta cohorte: ${conversionStrategy}
Días desde el último contacto: ${daysSinceLastContact}
Descuento máximo permitido por la clínica: ${maxDiscountPercent}%
${isLastStage ? "Este es el ÚLTIMO intento de la secuencia — es la oferta final antes de dejar de insistir." : ""}

Reglas:
- El mensaje debe atacar directamente el punto de dolor con la estrategia indicada
- Si decides ofrecer un descuento numérico, debe estar entre 0 y ${maxDiscountPercent}%, y debe escalar conforme avanza la etapa (más generoso en etapas avanzadas)
- Máximo 3 oraciones, tono cálido y directo, en español
- Usa {{patient_name}} como variable para el nombre
- No prometas nada que no sea un descuento o una atención prioritaria

Responde ÚNICAMENTE con JSON:
{
  "message": "...",
  "next_followup_days": <entero, días hasta el siguiente intento si este no funciona, sugerido entre 2 y 7>,
  "discount_offered": <entero o null si no ofreciste descuento numérico>
}`;

  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
    temperature: 0.8,
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw);

  return {
    message: parsed.message ?? "",
    nextFollowupDays: parsed.next_followup_days ?? 5,
    isFinalOffer: isLastStage,
    discountOffered:
      typeof parsed.discount_offered === "number" ? parsed.discount_offered : null,
  };
}
