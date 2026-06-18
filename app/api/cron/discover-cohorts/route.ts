import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DISCOVERY_PROMPT = `Eres un experto en psicología de ventas y comportamiento de pacientes de clínicas de medicina estética.

Analiza los siguientes patrones de comportamiento detectados en conversaciones de WhatsApp:

{{PATTERNS}}

Identifica entre 3 y 6 cohortes comportamentales distintas y accionables. Para cada cohorte:
- name: nombre corto y descriptivo (ej: "Interesados Indecisos", "Ex-pacientes Inactivos")
- behavioral_description: qué comportamiento caracteriza al grupo (2 oraciones)
- pain_point: el bloqueador principal que impide que avancen (1 oración)
- conversion_strategy: una de estas estrategias: urgency, scarcity, social_proof, reciprocity, authority, loss_aversion
- message_template: mensaje de WhatsApp persuasivo en español de máximo 160 caracteres, usando {{patient_name}} como variable, que ataque el pain_point con la estrategia elegida. Tono cálido y directo.

Responde ÚNICAMENTE con JSON: { "cohorts": [...] }`;

export async function GET(request: NextRequest) {
  if (
    request.headers.get("authorization") !==
    `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: clinics } = await supabaseAdmin
    .from("clinics")
    .select("id, name");

  if (!clinics?.length) return NextResponse.json({ ok: true, created: 0 });

  let totalCreated = 0;

  for (const clinic of clinics) {
    const { data: messages } = await supabaseAdmin
      .from("messages")
      .select("content_text, nlp_result")
      .eq("clinic_id", clinic.id)
      .eq("direction", "inbound")
      .eq("processing_status", "processed")
      .not("nlp_result", "is", null)
      .gte(
        "sent_at",
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      )
      .limit(60);

    const meaningful = (messages ?? []).filter(
      (m) => m.nlp_result && (m.nlp_result as any).intent !== "other"
    );

    if (meaningful.length < 5) continue;

    const patterns = meaningful
      .slice(0, 40)
      .map((m) => {
        const nlp = m.nlp_result as any;
        return `intent: ${nlp.intent} | pain: [${(nlp.pain_signals ?? []).join(", ")}] | tratamiento: ${nlp.treatment_mentioned ?? "N/A"} | next: ${nlp.next_action}`;
      })
      .join("\n");

    try {
      const completion = await getOpenAI().chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: DISCOVERY_PROMPT.replace("{{PATTERNS}}", patterns),
          },
        ],
        temperature: 0.7,
      });

      const raw = completion.choices[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(raw);
      const cohorts: any[] = Array.isArray(parsed)
        ? parsed
        : (parsed.cohorts ?? []);

      for (const cohort of cohorts) {
        if (!cohort.name || !cohort.message_template) continue;

        // Skip if a cohort with a similar name already exists
        const { data: existing } = await supabaseAdmin
          .from("cohort_definitions")
          .select("id")
          .eq("clinic_id", clinic.id)
          .ilike("name", `%${cohort.name.split(" ")[0]}%`)
          .limit(1);

        if (existing && existing.length > 0) continue;

        const { error } = await supabaseAdmin.from("cohort_definitions").insert({
          clinic_id: clinic.id,
          name: cohort.name,
          behavioral_description: cohort.behavioral_description ?? "",
          pain_point: cohort.pain_point ?? "",
          conversion_strategy: cohort.conversion_strategy ?? "social_proof",
          message_template: cohort.message_template,
          is_auto_generated: true,
          is_active: true,
        });

        if (!error) totalCreated++;
      }
    } catch (err) {
      console.error(`Cohort discovery error for clinic ${clinic.id}:`, err);
    }
  }

  return NextResponse.json({ ok: true, created: totalCreated });
}
