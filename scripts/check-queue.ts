import { getNlpQueue, getCohortQueue } from "@/lib/bullmq/queues";

async function main() {
  const nlp = getNlpQueue();
  const cohort = getCohortQueue();

  console.log("NLP queue:", await nlp.getJobCounts());
  console.log("Cohort queue:", await cohort.getJobCounts());

  const failed = await nlp.getFailed(0, 5);
  for (const job of failed) {
    console.log("Failed job:", job.id, job.failedReason);
  }

  const waiting = await nlp.getWaiting(0, 5);
  for (const job of waiting) {
    console.log("Waiting job:", job.id, job.data);
  }

  process.exit(0);
}

main();
