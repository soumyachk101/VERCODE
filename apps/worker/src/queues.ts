// The BullMQ queue definitions + worker (M5 T5.1, TRD.md §7, NFR-13/14/15/17).
//
// Queues: review-queue (the per-review work), retention-queue (purge jobs),
// billing-queue (usage rollups), review-dead-letter (the DLQ — terminal
// failures land here with a reason, ERROR_HANDLING.md §3 "observable, not
// lost").
//
// Retry: maxAttempts 3 (queue-level), exponential backoff 2^attempt seconds +
// jitter; a job that exhausts its attempts is re-enqueued on
// review-dead-letter with the failure reason (the worker does this itself in
// a `failed` handler — the DLQ is our record, not BullMQ's failed set).
//
// In-flight lock: a Redis SET NX on lock:{org:repo:pr:sha} with a TTL. A
// redelivered job that finds a *live* lock (another worker is mid-flight on
// the same key) drops to the DLQ with reason `duplicate_in_flight`
// (REVIEW_ENGINE_SPEC §5; ERROR_HANDLING.md §3 "a duplicate that finds a
// live lock drops to the DLQ").

import { Worker, Queue, type Job, type Worker as BullWorker } from "bullmq";
import type IORedis from "ioredis";
import {
  QUEUES,
  type ReviewJobPayload,
  inFlightLockKey,
  type WorkerOptions,
  type WorkerDeps,
} from "./config.js";
import { runReviewJob } from "./jobs/review.js";
import { enqueueDeadLetter } from "./dlq.js";

/**
 * The per-attempt backoff delay (TRD.md §7 "exponential backoff 2^attempt * 1s
 * + jitter"): 2^attempt seconds + a random 0–50 % jitter.
 */
export function backoffDelayMs(attemptsMade: number, maxAttempts = 3): number {
  const attempt = Math.max(1, Math.min(attemptsMade, maxAttempts));
  const base = 2 ** attempt * 1_000; // 2^attempt seconds
  return base + Math.floor(Math.random() * (base / 2)); // the jitter
}

/**
 * The per-attempt backoff delay (TRD.md §7 "exponential backoff 2^attempt * 1s
 * + jitter"): 2^attempt seconds + a random 0–50 % jitter.
 */
export function backoffDelayMs(attemptsMade: number, maxAttempts = 3): number {
  const attempt = Math.max(1, Math.min(attemptsMade, maxAttempts));
  const base = 2 ** attempt * 1_000; // 2^attempt seconds
  return base + Math.floor(Math.random() * (base / 2)); // the jitter
}

// ---------------------------------------------------------------------------
// The queue constructors
// ---------------------------------------------------------------------------

export function makeReviewQueue(redis: IORedis): Queue {
  return new Queue(QUEUES.review, {
    connection: redis,
    defaultJobOptions: {
      attempts: 3, // NFR-14: the bounded retry
      backoff: { type: "exponential", delay: 1_000 }, // + jitter per-attempt
    },
  });
}

export function makeRetentionQueue(redis: IORedis): Queue {
  return new Queue(QUEUES.retention, {
    connection: redis,
    defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 1_000 } },
  });
}

export function makeBillingQueue(redis: IORedis): Queue {
  return new Queue(QUEUES.billing, {
    connection: redis,
    defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 1_000 } },
  });
}

export function makeDeadLetterQueue(redis: IORedis): Queue {
  // The DLQ never retries — a terminal failure is recorded, observable.
  return new Queue(QUEUES.deadLetter, {
    connection: redis,
    defaultJobOptions: { attempts: 1 },
  });
}

// ---------------------------------------------------------------------------
// The in-flight lock (REVIEW_ENGINE_SPEC §5)
// ---------------------------------------------------------------------------

export const IN_FLIGHT_LOCK_TTL_MS = 5 * 60_000; // a review wall-clock is 240 s; the lock outlives it

export async function acquireInFlightLock(
  redis: IORedis,
  key: string,
  token: string,
  ttlMs: number = IN_FLIGHT_LOCK_TTL_MS
): Promise<true | "duplicate"> {
  // SET key token PX ttl NX — atomic. A live lock (another worker holds it)
  // returns "duplicate".
  const res = await redis.set(key, token, "PX", ttlMs, "NX");
  return res === "OK" ? true : "duplicate";
}

export async function releaseInFlightLock(redis: IORedis, key: string, token: string): Promise<void> {
  // Only the lock *holder* may release it (a compare-and-del via a Lua eval,
  // so a late worker never unlocks a fresh holder's lock).
  await redis.eval(
    `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`,
    1,
    key,
    token
  );
}

// ---------------------------------------------------------------------------
// The worker factory — builds the four queues + a BullMQ Worker on the
// review-queue (retention/billing are consumed by the same process later; for
// M5 the review pipeline is the only handler wired).
// ---------------------------------------------------------------------------

export interface StartedWorker {
  reviewQueue: Queue;
  retentionQueue: Queue;
  billingQueue: Queue;
  deadLetterQueue: Queue;
  worker: BullWorker;
  /** A SIGTERM-safe shutdown: stop dequeueing, drain in-flight, close. */
  shutdown(timeoutMs?: number): Promise<void>;
}

export function startWorker(deps: WorkerDeps, opts: WorkerOptions): StartedWorker {
  const redis = deps.redis;

  const reviewQueue = makeReviewQueue(redis);
  const retentionQueue = makeRetentionQueue(redis);
  const billingQueue = makeBillingQueue(redis);
  const deadLetterQueue = makeDeadLetterQueue(redis);

  const handle = async (job: Job<ReviewJobPayload>): Promise<void> => {
    const payload = job.data;
    const lockKey = inFlightLockKey(payload.orgId, payload.repoId, payload.prNumber, payload.commitSha);
    const token = `${job.id}:${job.attemptsMade}`;

    const lock = await acquireInFlightLock(redis, lockKey, token);
    if (lock === "duplicate") {
      // A live lock: another worker is mid-flight on the same key. This
      // delivery drops to the DLQ (REVIEW_ENGINE_SPEC §5 "waits or drops").
      await enqueueDeadLetter(deadLetterQueue, {
        queue: QUEUES.review,
        jobId: payload.jobId,
        reason: "duplicate_in_flight",
        payload,
        error: `in-flight lock ${lockKey} held by another worker`,
      });
      return;
    }

    try {
      await runReviewJob(deps, payload, { attempt: job.attemptsMade });
      await releaseInFlightLock(redis, lockKey, token);
      // BullMQ resolves the job (completed). The durable state is committed; a
      // redelivery no-ops via the idempotency key (NFR-13).
    } catch (err) {
      // A transient failure: release the lock (the retry acquires a fresh one).
      await releaseInFlightLock(redis, lockKey, token);
      throw err; // BullMQ retries per the backoff; the last attempt → DLQ.
    }
  };

  const worker = new Worker<ReviewJobPayload, unknown>(QUEUES.review, handle, {
    connection: redis,
    concurrency: opts.concurrency, // NFR-17
    // NFR-14: the per-attempt retry cap.
    settings: {
      retryLimitStrategy: () => opts.maxAttempts,
    },
    // A the in-flight re-queue on SIGTERM (ERROR_HANDLING.md §8 "a job that
    // can't finish is re-queued atomically"): an unfinished job is moved back
    // to waiting (not lost).
    removeOnComplete: 1_000,
    removeOnFail: 1_000,
  });

  // The terminal-failure → DLQ hop (NFR-13/14 "terminal failures go to the
  // DLQ with the reason"). A *transient* failure (attempts remaining) is
  // retried by BullMQ's backoff; this only fires after the last attempt.
  worker.on("failed", async (job, err) => {
    if (!job) return;
    const isLastAttempt = job.attemptsMade >= opts.maxAttempts;
    if (isLastAttempt) {
      await enqueueDeadLetter(deadLetterQueue, {
        queue: QUEUES.review,
        jobId: String(job.data?.jobId ?? job.id),
        reason: "terminal_failure",
        payload: job.data,
        error: err.message,
      });
    }
  });

  // The graceful shutdown (NFR-15, ERROR_HANDLING.md §8): stop dequeueing
  // (pause + no new grabs), let in-flight jobs finish within the budget, then
  // close. The drain budget is the 60 s; an overrun logs + exits (the durable
  // queue means no job is lost, only re-run).
  const shutdown = async (timeoutMs?: number): Promise<void> => {
    await worker.pause();
    const budget = timeoutMs ?? opts.drainBudgetMs;
    const start = Date.now();
    while (Date.now() - start < budget) {
      if (worker.getActiveCount() === 0) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    await worker.close();
    await reviewQueue.close();
    await retentionQueue.close();
    await billingQueue.close();
    await deadLetterQueue.close();
  };

  return {
    reviewQueue,
    retentionQueue,
    billingQueue,
    deadLetterQueue,
    worker,
    shutdown,
  };
}
