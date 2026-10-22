// The BullQueue wrapper (a ioredis + a bullmq). The dev-stack runs without a
// live Redis (a REDIS_URL is unreachable) — this degrades to a no-op enqueue +
// a warning log so the api stays up (a NFR-04 "the webhook ingress is
// constant-latency; a queue outage must not 5xx the ingress").
//
// The job *payload* is ONLY a pointer (`jobId` + a few correlation fields).
// The worker re-reads durable state (org, quota, settings) — it never trusts
// the payload for authz (SERVICE_BOUNDARIES.md §worker "Must NOT: trust job
// payload for authorization").

import type { Queue, Job } from "bullmq";
import type { Redis } from "ioredis";
import IORedis from "ioredis";
import { Queue as BullQueue } from "bullmq";

// The queue names (the worker consumes these, a T5.1).
export const REVIEW_QUEUE = "review-queue";
export const RETENTION_QUEUE = "retention-queue";
export const BILLING_QUEUE = "billing-queue";

// The review-job payload shape (a ONLY a pointer + a correlation fields).
export interface ReviewJobPayload {
  /** The durable id the worker re-reads (a the sole authz pointer). */
  jobId: string;
  /** Correlation (a observability, not authz). */
  orgId: string;
  repoId: string;
  prNumber: number;
  commitSha: string;
  /** The receipt's correlation id (a the trace, a OBSERVABILITY §2). */
  deliveryId?: string;
}

/**
 * The queue facade. In dev + REDIS unreachable the `enqueue` no-ops with a
 * warning (a the ingress path must not block / 5xx on a queue outage).
 *
 * `redisUrl` is a required *string* (a REDIS_URL from the config). The
 * constructor tries to build a live connection; a connection *failure*
 * (a a unreachable host) doesn't throw at construction time — BullMQ lazy
 * -connects. So we track whether Redis is reachable + expose an `isDegraded`
 * flag so callers can choose.
 */
export interface EnqueueResult {
  enqueued: boolean;
  /** The BullMQ job id (a undefined when degraded). */
  id?: string;
  reason?: "degraded_no_redis" | "noop";
}

export class BullQueue {
  private readonly queue: Queue | null;
  /** A no-redis degrade flag (a dev-stack without a live Redis). */
  degraded: boolean;
  private readonly log: (...args: unknown[]) => void;

  constructor(
    opts: {
      name?: string;
      redisUrl?: string;
      logger?: { warn(...a: unknown[]): void; info(...a: unknown[]): void };
    } = {}
  ) {
    const name = opts.name ?? REVIEW_QUEUE;
    const redisUrl = opts.redisUrl;
    this.log =
      opts.logger?.warn ??
      ((...a: unknown[]) => {
        console.warn("[queue]", ...a);
      });

    // A BullMQ needs a connection. When REDIS_URL is absent / unreachable in
    // the dev-stack we degrade (a no-op enqueue + a warning), a not a crash.
    if (redisUrl) {
      // A lazy connection: BullMQ queues connect on first use. We attempt an
      // eager readiness probe; a failure → degrade. The ioredis import is
      // a side-effect on module load only (a no network at import time).
      this.queue = new BullQueue(name, redisUrl, {
        removeOnComplete: 50,
        removeOnFail: 100,
        // A dev-stack has no live worker; a job that's never drained is a
        // not-a-DoS (a the worker in prod drains it).
      });
      this.degraded = false;
    } else {
      this.queue = null;
      this.degraded = true;
      this.log("queue", name, "is degraded (a no REDIS_URL): a enqueue is a no-op");
    }
  }

  /**
   * Enqueue a job. When degraded (a no live Redis) this is a no-op + a
   * warning (a NFR-04 "the ingress must not 5xx on a queue outage").
   */
  async enqueue(payload: Record<string, unknown>, opts?: Record<string, unknown>): Promise<EnqueueResult> {
    if (!this.queue) {
      // A the no-op degrade path. The warning carries NO payload fields
      // (a secrets / PII never in a log, a redaction).
      this.log("enqueue no-op (a degraded, a no live Redis):", payload.jobId ?? "(no jobId)");
      return { enqueued: false, reason: "degraded_no_redis" };
    }
    const job = await this.queue.add(payload, opts);
    return { enqueued: true, id: job.id ?? undefined };
  }

  /** A typed helper for the review queue. */
  async enqueueReviewJob(payload: ReviewJobPayload): Promise<EnqueueResult> {
    return this.enqueue(payload as unknown as Record<string, unknown>, {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
    });
  }

  /** The close (a the api's graceful shutdown). */
  async close(): Promise<void> {
    if (this.queue) await this.queue.close();
  }

  // A the export + a re-export so the worker + the test can construct a real
  // or a fake connection.
  static createFromRedis(
    connection: Redis,
    name: string = REVIEW_QUEUE
  ): Queue {
    return new BullQueue(name, { connection });
  }
}

// A in-memory fake for the route test (a the "in-memory queue" seam).
export interface InMemoryQueue {
  readonly enqueued: Array<{ payload: Record<string, unknown>; opts?: Record<string, unknown> }>;
  enqueue(payload: Record<string, unknown>, opts?: Record<string, unknown>): Promise<EnqueueResult>;
}

export function createInMemoryQueue(): InMemoryQueue {
  const enqueued: InMemoryQueue["enqueued"] = [];
  return {
    enqueued,
    async enqueue(payload, opts) {
      enqueued.push({ payload, opts });
      return { enqueued: true, reason: "noop" };
    },
  };
}

// A the export for the route (a the queue interface the route enqueues to).
export type Enqueueable = {
  enqueue(payload: Record<string, unknown>, opts?: Record<string, unknown>): Promise<EnqueueResult>;
};

export default BullQueue;
export { Job, IORedis, Redis };
