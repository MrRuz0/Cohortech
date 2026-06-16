import "@/lib/bullmq/workers/nlp-worker";
import "@/lib/bullmq/workers/cohort-worker";

console.log("Workers de Cohortech iniciados.");

process.on("uncaughtException", (err) => {
  console.error("uncaughtException:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("unhandledRejection:", reason);
});

// Keep process alive
setInterval(() => {}, 30_000);
