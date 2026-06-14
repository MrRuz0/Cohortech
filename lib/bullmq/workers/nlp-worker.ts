import { Worker, type ConnectionOptions } from "bullmq";
import { createClient } from "@supabase/supabase-js";
import { extractEntities } from "@/lib/openai/extract-entities";
import { getCohortQueue } from "@/lib/bullmq/queues";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
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

type NlpJobData = {
  messageId: string;
  clinicId: string;
  patientId: string | null;
  text: string;
};

export const nlpWorker = new Worker<NlpJobData>(
  "nlp-extraction",
  async (job) => {
    const { messageId, clinicId, patientId, text } = job.data;

    const result = await extractEntities(text);

    await supabaseAdmin
      .from("messages")
      .update({
        nlp_result: result,
        processing_status: "processed",
      })
      .eq("id", messageId);

    if (patientId) {
      await getCohortQueue().add("classify-patient", {
        clinicId,
        patientId,
        nlpResult: result,
      });
    }

    return result;
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

nlpWorker.on("failed", async (job, err) => {
  if (!job) return;

  if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
    await supabaseAdmin
      .from("messages")
      .update({
        processing_status: "failed",
        nlp_result: { error: err.message },
      })
      .eq("id", job.data.messageId);
  }
});

console.log("NLP worker iniciado, esperando jobs en 'nlp-extraction'...");
