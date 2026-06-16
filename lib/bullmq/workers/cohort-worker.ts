import { Worker, type ConnectionOptions } from "bullmq";
import { createClient } from "@supabase/supabase-js";
import type { NlpResult } from "@/lib/openai/extract-entities";
import ws from "ws";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { realtime: { transport: ws } }
);

function getConnection(): ConnectionOptions {
  const url = process.env.UPSTASH_REDIS_URL ?? "";
  const parsed = new URL(url || "redis://localhost:6379");

  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    password: parsed.password || undefined,
    tls: parsed.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

type CohortJobData = {
  clinicId: string;
  patientId: string;
  nlpResult: NlpResult;
};

type CohortDefinition = {
  id: string;
  treatment_slug: string;
  bio_cycle_days: number;
  trigger_keywords: string[] | null;
};

function matchCohort(
  treatmentMentioned: string | null,
  cohorts: CohortDefinition[]
): CohortDefinition | null {
  if (!treatmentMentioned) return null;

  const normalized = treatmentMentioned.toLowerCase();

  for (const cohort of cohorts) {
    const keywords = cohort.trigger_keywords ?? [];
    if (keywords.some((kw) => normalized.includes(kw.toLowerCase()))) {
      return cohort;
    }
  }

  return null;
}

export const cohortWorker = new Worker<CohortJobData>(
  "cohort-classification",
  async (job) => {
    const { clinicId, patientId, nlpResult } = job.data;

    if (nlpResult.next_action === "ignore" || nlpResult.next_action === "escalate") {
      return null;
    }

    if (nlpResult.patient_name) {
      await supabaseAdmin
        .from("patients")
        .update({
          full_name: nlpResult.patient_name,
          status: nlpResult.is_existing_patient ? "active" : "lead",
        })
        .eq("id", patientId);
    }

    const { data: cohorts } = await supabaseAdmin
      .from("cohort_definitions")
      .select("id, treatment_slug, bio_cycle_days, trigger_keywords")
      .eq("clinic_id", clinicId)
      .eq("is_active", true);

    const matched = matchCohort(nlpResult.treatment_mentioned, cohorts ?? []);

    if (!matched || !nlpResult.treatment_date) {
      return null;
    }

    const treatmentDate = new Date(nlpResult.treatment_date);
    const nextEventDate = new Date(treatmentDate);
    nextEventDate.setDate(nextEventDate.getDate() + matched.bio_cycle_days);

    await supabaseAdmin.from("cohort_memberships").upsert(
      {
        patient_id: patientId,
        cohort_id: matched.id,
        clinic_id: clinicId,
        treatment_date: nlpResult.treatment_date,
        next_event_date: nextEventDate.toISOString().split("T")[0],
        confidence_score: nlpResult.confidence,
        membership_status: "active",
      },
      { onConflict: "patient_id,cohort_id" }
    );

    return { cohortId: matched.id, nextEventDate: nextEventDate.toISOString() };
  },
  {
    connection: getConnection(),
    settings: {
      backoffStrategy: (attemptsMade) => {
        const delays = [5000, 25000, 125000];
        return delays[attemptsMade - 1] ?? 125000;
      },
    },
  }
);

console.log("Cohort worker iniciado, esperando jobs en 'cohort-classification'...");
