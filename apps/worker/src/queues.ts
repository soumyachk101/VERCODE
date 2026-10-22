// The BullMQ queue definitions + worker (M5 T5.1, TRD.md §7, NFR-13/14/15/17).
//
// Queues: review-queue (the per-review work), retention-queue (purge jobs),
// billing-queue (usage rollups), review-dead-letter (the DLQ — terminal
// failures land here with a reason, ERROR_HANDLING.md §3 "observable, not
// lost").
//
// Retry: maxAttempts 3 (queue-level), exponential backoff 2^attempt seconds +
// jitter (TRD.md §7); a job that exhausts its attempts is re-enqueued on
// review-dead-letter with the failure reason (the worker does this in the
// `failed` handler — the DLQ is our record, not BullMQ's failed set).
//
// In-flight lock: a Redis SET NX on lock:{org:repo:pr:sha} with a TTL. A
// redelivered job that finds a *live* lock (another worker is mid-flight on
// the same key) drops to the DLQ with reason `duplicate_in_flight`
// (REVIEW_ENGINE_SPEC §5; ERROR_HANDLING.md §3).

import { Worker, Queue, type Job, type Worker as BullWorker } from "bullmq";
import type { Redis } from "ioredis";
import {
  QUEUES,
  type ReviewJobPayload,
  inFlightLockKey,
  type WorkerOptions,
  type WorkerDeps,
} from "./config.js";
import { runReviewJob } from "./jobs/review.js";
import { enqueueDeadLetter, type DeadLetterEntry } from "./dlq.js";

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

export function makeReviewQueue(redis: Redis): Queue {
  return new Queue(QUEUES.review, {
    connection: redis,
    defaultJobOptions: {
      attempts: 3, // NFR-14: the bounded retry
      backoff: { type: "exponential", delay: 1_000 },
    },
  });
}

export function makeRetentionQueue(redis: Redis): Queue {
  return new Queue(QUEUES.retention, {
    connection: redis,
    defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 1_000 } },
  });
}

export function makeBillingQueue(redis: Redis): Queue {
  return new Queue(QUEUES.billing, {
    connection: redis,
    defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 1_000 } },
  });
}

export function makeDeadLetterQueue(redis: Redis): Queue {
  // A the DLQ never retries — a terminal failure is recorded, observable.
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
  redis: Redis,
  key: string,
  token: string,
  ttlMs: number = IN_FLIGHT_LOCK_TTL_MS
): Promise<true | "duplicate"> {
  // A SET key token PX ttl NX — a atomic. A live lock (another worker holds
  // it) returns "duplicate".
  const res = await redis.set(key, token, "PX", ttlMs, "NX");
  return res === "OK" ? true : "duplicate";
}

export async function releaseInFlightLock(redis: Redis, key: string, token: string): Promise<void> {
  // A only the lock *holder* may release it (a compare-and-del via a Lua
  // eval, so a late worker never unlocks a fresh holder's lock).
  await redis.eval(
    `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`,
    1,
    key,
    token
  );
}

// ---------------------------------------------------------------------------
// The worker factory — a builds the four queues + a BullMQ Worker on the
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

  const dlqEntry = (jobId: string, reason: string, payload: unknown, error: string): DeadLetterEntry => ({
    queue: QUEUES.review,
    jobId,
    reason,
    payload: (payload as Record<string, unknown>) ?? null,
    error,
  });

  const handle = async (job: Job<ReviewJobPayload>): Promise<void> => {
    const payload = job.data;
    const lockKey = inFlightLockKey(payload.orgId, payload.repoId, payload.prNumber, payload.commitSha);
    const token = `${job.id}:${job.attemptsMade}`;

    const lock = await acquireInFlightLock(redis, lockKey, token);
    if (lock === "duplicate") {
      // A live lock: another worker is mid-flight on the same key. This
      // delivery drops to the DLQ (REVIEW_ENGINE_SPEC §5 "waits or drops").
      await enqueueDeadLetter(deadLetterQueue, dlqEntry(payload.jobId, "duplicate_in_flight", payload,
        `in-flight lock ${lockKey} held by another worker`));
      return;
    }

    try {
      await runReviewJob(deps, payload, { attempt: job.attemptsMade });
      await releaseInFlightLock(redis, lockKey, token);
      // A BullMQ resolves the job (completed). The durable state is committed;
      // a redelivery no-ops via the idempotency key (NFR-13).
    } catch (err) {
      // A transient failure: release the lock (the retry acquires a fresh one).
      await releaseInFlightLock(redis, lockKey, token);
      throw err; // A BullMQ retries per the backoff; the last attempt → DLQ.
    }
  };

  const worker = new Worker<Record<string, unknown>, unknown>(
    QUEUES.review,
    ((job: Job<Record<string, unknown>>) => handle(job as unknown as Job<ReviewJobPayload>)) as never,
    {
      connection: redis,
      concurrency: opts.concurrency, // NFR-17
      // A the in-flight re-queue on SIGTERM (ERROR_HANDLING.md §8 "a job that
      // can't finish is re-queued atomically"): a an unfinished job is moved
      // back to waiting (not lost). A the max retained jobs cap memory.
      removeOnComplete: { count: 1_000 },
      removeOnFail: { count: 1_000 },
    }
  );

  // A the terminal-failure → DLQ hop (NFR-13/14 "terminal failures go to the
  // DLQ with the reason"). A *transient* failure (attempts remaining) is
  // retried by BullMQ's backoff; this only fires after the last attempt.
  worker.on("failed", async (job, err) => {
    if (!job) return;
    if (job.attemptsMade >= opts.maxAttempts) {
      const data = job.data as Partial<ReviewJobPayload>;
      await enqueueDeadLetter(
        deadLetterQueue,
        dlqEntry(String(data.jobId ?? job.id), "terminal_failure", job.data, err.message)
      );
    }
  });

  // A the graceful shutdown (NFR-15, ERROR_HANDLING.md §8): stop dequeueing
  // (pause + no new grabs), let in-flight jobs finish within the budget, then
  // close. The drain budget is the 60 s; an overrun logs + exits (the durable
  // queue means no job is lost, only re-run).
  const shutdown = async (timeoutMs?: number): Promise<void> => {
    await worker.pause();
    const budget = timeoutMs ?? opts.drainBudgetMs;
    const start = Date.now();
    while (Date.now() - start < budget) {
      // A wait for in-flight jobs to finish (a the drain, NFR-15).
      const counts = await reviewQueue.getJobCounts("active");
      if ((counts.active ?? 0) === 0) break;
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
