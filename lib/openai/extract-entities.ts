import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

let _openai: OpenAI | null = null;
let _anthropic: Anthropic | null = null;

function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

export const SYSTEM_PROMPT = `Eres un extractor de datos clínicos para una clínica de medicina estética.
Analiza el mensaje de WhatsApp y devuelve ÚNICAMENTE un objeto JSON con estos campos.
No añadas explicaciones ni texto adicional fuera del JSON.
Si no puedes inferir un campo con certeza razonable, devuelve null.
Nunca inventes datos.
Campos requeridos:
{
  "patient_name": string | null,
  "intent": "booking" | "inquiry" | "post_treatment" | "complaint" | "payment" | "other",
  "treatment_mentioned": string | null,
  "treatment_date": "YYYY-MM-DD" | null,
  "is_existing_patient": boolean | null,
  "pain_signals": string[],
  "next_action": "create_patient" | "update_cohort" | "escalate" | "ignore",
  "confidence": float (0.0 a 1.0)
}`;

export type NlpResult = {
  patient_name: string | null;
  intent: "booking" | "inquiry" | "post_treatment" | "complaint" | "payment" | "other";
  treatment_mentioned: string | null;
  treatment_date: string | null;
  is_existing_patient: boolean | null;
  pain_signals: string[];
  next_action: "create_patient" | "update_cohort" | "escalate" | "ignore";
  confidence: number;
};

export async function extractEntities(message: string): Promise<NlpResult> {
  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: message },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const result = JSON.parse(raw) as NlpResult;

  if (result.confidence < 0.65 && process.env.ANTHROPIC_API_KEY) {
    return extractEntitiesWithClaude(message);
  }

  return result;
}

export async function extractEntitiesWithClaude(message: string): Promise<NlpResult> {
  const response = await getAnthropic().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: message }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  const raw = textBlock?.type === "text" ? textBlock.text : "{}";

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  return JSON.parse(jsonMatch ? jsonMatch[0] : "{}") as NlpResult;
}
