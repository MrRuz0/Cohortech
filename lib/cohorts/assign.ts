import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NlpResult } from "@/lib/openai/extract-entities";

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 20_000, maxRetries: 1 });
  return _openai;
}

type CohortRow = {
  id: string;
  name: string;
  behavioral_description: string;
  pain_point: string;
  conversion_strategy: string;
  message_template: string;
};

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export async function assignPatientToCohort(
  supabase: SupabaseClient,
  clinicId: string,
  patientId: string,
  nlpResult: NlpResult,
  messageText: string
): Promise<CohortRow | null> {
  if (nlpResult.intent === "other" || nlpResult.next_action === "ignore") {
    return null;
  }

  const { data: cohorts } = await supabase
    .from("cohort_definitions")
    .select("id, name, behavioral_description, pain_point, conversion_strategy, message_template")
    .eq("clinic_id", clinicId)
    .eq("is_active", true);

  if (!cohorts || cohorts.length === 0) return null;

  const cohortList = cohorts
    .map(
      (c: CohortRow) =>
        `ID: ${c.id}\nNombre: ${c.name}\nComportamiento: ${c.behavioral_description}\nDolor: ${c.pain_point}`
    )
    .join("\n---\n");

  const prompt = `Clasifica este paciente en la cohorte más apropiada según su comportamiento.

COHORTES DISPONIBLES:
${cohortList}

SEÑALES DEL PACIENTE:
- Mensaje: "${messageText.slice(0, 500)}"
- Intent: ${nlpResult.intent}
- Señales de dolor: ${(nlpResult.pain_signals ?? []).join(", ") || "ninguna"}
- Tratamiento: ${nlpResult.treatment_mentioned ?? "no mencionado"}
- Siguiente acción: ${nlpResult.next_action}

Responde ÚNICAMENTE con el UUID de la cohorte más apropiada, o con la palabra null si ninguna aplica.`;

  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 60,
    temperature: 0,
  });

  const answer = completion.choices[0]?.message?.content ?? "";
  // Tolera comillas, backticks o texto alrededor del UUID.
  const uuid = answer.match(UUID_RE)?.[0]?.toLowerCase();
  if (!uuid) return null;

  const matched = cohorts.find((c: CohortRow) => c.id.toLowerCase() === uuid) ?? null;
  if (!matched) return null;

  const isBooking = nlpResult.intent === "booking";
  const now = new Date();

  // Si ya existe la membresía, no la "degradamos": un paciente convertido sigue convertido.
  const { data: existing } = await supabase
    .from("cohort_memberships")
    .select("membership_status")
    .eq("patient_id", patientId)
    .eq("cohort_id", matched.id)
    .maybeSingle();

  const alreadyConverted = existing?.membership_status === "converted";
  const status = isBooking || alreadyConverted ? "converted" : "active";

  // El primer seguimiento se programa a 2 días: nunca justo después de que el
  // paciente escribió (antes quedaba "vencido" de inmediato).
  const nextFollowup = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();

  await supabase.from("cohort_memberships").upsert(
    {
      clinic_id: clinicId,
      patient_id: patientId,
      cohort_id: matched.id,
      membership_status: status,
      assigned_at: now.toISOString(),
      ...(status === "converted"
        ? {
            converted_at: now.toISOString(),
            conversion_type: "booking",
            next_followup_at: null,
          }
        : { next_followup_at: nextFollowup }),
    },
    { onConflict: "patient_id,cohort_id", ignoreDuplicates: false }
  );

  return matched;
}
