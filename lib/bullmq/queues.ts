import { Queue, type ConnectionOptions } from "bullmq";

function getConnection(): ConnectionOptions {
  const url = process.env.UPSTASH_REDIS_URL ?? "";
  const parsed = new URL(url || "redis://localhost:6379");

  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    password: parsed.password || undefined,
    tls: parsed.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
    lazyConnect: true,
  };
}

let _nlpQueue: Queue | null = null;
let _sendQueue: Queue | null = null;
let _cohortQueue: Queue | null = null;

export function getNlpQueue(): Queue {
  if (!_nlpQueue) {
    _nlpQueue = new Queue("nlp-extraction", {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "custom" },
        removeOnComplete: true,
        removeOnFail: false,
      },
    });
  }
  return _nlpQueue;
}

export function getSendQueue(): Queue {
  if (!_sendQueue) {
    _sendQueue = new Queue("whatsapp-send", { connection: getConnection() });
  }
  return _sendQueue;
}

export function getCohortQueue(): Queue {
  if (!_cohortQueue) {
    _cohortQueue = new Queue("cohort-classification", {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    });
  }
  return _cohortQueue;
}
