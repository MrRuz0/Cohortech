import http from "http";
import "@/lib/bullmq/workers/nlp-worker";
import "@/lib/bullmq/workers/cohort-worker";

console.log("Workers de Cohortech iniciados.");

process.on("uncaughtException", (err) => {
  console.error("uncaughtException:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("unhandledRejection:", reason);
});

// Railway requires an HTTP server bound to $PORT
const port = process.env.PORT ?? 3001;
http.createServer((_, res) => {
  res.writeHead(200);
  res.end("ok");
}).listen(port, () => {
  console.log(`Worker healthcheck server listening on port ${port}`);
});
