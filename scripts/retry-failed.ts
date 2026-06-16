import { getNlpQueue } from "@/lib/bullmq/queues";

async function main() {
  const nlp = getNlpQueue();
  const result = await nlp.retryJobs({ count: 100, state: "failed" });
  console.log("Retried:", result);
  process.exit(0);
}

main();
