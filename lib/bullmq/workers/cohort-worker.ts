import { Worker, type ConnectionOptions } from "bullmq";
import { createClient } from "@supabase/supabase-js";
import type { NlpResult } from "@/lib/openai/extract-entities";
import { assignPatientToCohort } from "@/lib/cohorts/assign";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
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
  messageText: string;
};

export const cohortWorker = new Worker<CohortJobData>(
  "cohort-classification",
  async (job) => {
    const { clinicId, patientId, nlpResult, messageText } = job.data;

    const cohort = await assignPatientToCohort(
      supabaseAdmin,
      clinicId,
      patientId,
      nlpResult,
      messageText
    );

    if (cohort) {
      // Increment message_count for this membership
      await supabaseAdmin.rpc("increment_cohort_message_count", {
        p_patient_id: patientId,
        p_cohort_id: cohort.id,
      });
    }

    return cohort ? { cohortId: cohort.id, cohortName: cohort.name } : null;
  },
  {
    connection: getConnection(),
    settings: {
      backoffStrategy: (attemptsMade) => {
        const delays = [10000, 60000];
        return delays[attemptsMade - 1] ?? 60000;
      },
    },
  }
);

console.log("Cohort worker iniciado, esperando jobs en 'cohort-classification'...");
