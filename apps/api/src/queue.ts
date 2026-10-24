// The BullQueue wrapper (ioredis + bullmq) — M3's enqueue seam.
//
// The api only *enqueues* (SERVICE_BOUNDARIES "the api does not run the
// pipeline; it only enqueues"). The job *payload* carries ONLY a `jobId`
// pointer + correlation fields — the worker re-reads durable state and never
// trusts the payload for authz (SERVICE_BOUNDARIES "a job payload is a
// pointer, not an authority").
//
// Dev-stack: REDIS_URL may be unreachable (the Compose stack is up without a
// live Redis). A connect failure → the queue degrades to a no-op enqueue + a
// warning log (a NFR-04 "the ingress is constant-latency; a queue outage
// must not 5xx the ingress" + a "a queue loss is a re-drain from the DB",
// BACKUP_RESTORE §1 — the durable `review_jobs` row is the source of truth).
//
// No secret ever reaches a log line (SECRETS_MANAGEMENT §5 / a the redaction
// gate): a log carries the `jobId` + a correlation ids only.

import { Redis } from "ioredis";
import type { RedisOptions } from "ioredis";
import { Queue } from "bullmq";

// The queue names (the worker consumes these, T5.1: `review-queue` +
// `retention-queue`).
export const REVIEW_QUEUE = "review-queue";
export const RETENTION_QUEUE = "retention-queue";

// The review-job payload (a ONLY the pointer + a correlation — no diff, no
// findings, no authz material, a NFR-04 "no LLM on the webhook path").
export interface ReviewJobPayload {
  /** The durable review_jobs id the worker re-reads (a the authz pointer). */
  jobId: string;
  /** Correlation (a observability, OBSERVABILITY §2 "the trace id = the job_id"). */
  orgId: string;
  repoId: string;
  prNumber: number;
  commitSha: string;
  /** The receipt's delivery id (a the replay-dedup key, a log correlation). */
  deliveryId?: string;
}

export interface EnqueueResult {
  /** Whether the job reached the queue. A degraded enqueue is a not-enqueued
   *   no-op (a the durable row is already written; a the re-drain is the
   *   worker's job, BACKUP_RESTORE §1). */
  enqueued: boolean;
  /** The BullMQ job id (a only when actually enqueued). */
  id?: string;
  /** Why it wasn't enqueued (a the degrade reason, a log + a audit). */
  reason?: "degraded_no_redis";
}

// The generic enqueue surface the route + the test seam share (a the
// in-memory queue implements this exact shape, so the route type-checks
// against either).
export interface Enqueueable {
  enqueue(payload: Record<string, unknown>, opts?: Record<string, unknown>): Promise<EnqueueResult>;
}

export class BullQueue implements Enqueueable {
  private queue: Queue | null = null;
  /** A connect failure → degraded (a no-op enqueue + a warning). */
  private degraded = false;
  private readonly logWarn: (msg: string) => void;
  private readonly ready: Promise<void>;
  readonly name: string;

  constructor(opts: {
    name?: string;
    redisUrl: string;
    /** A optional logger (defaults to a console.warn — a the route injects
     *   the Fastify logger so a enqueue warning is in the structured log). */
    logger?: { warn(msg: string): void };
  }) {
    this.name = opts.name ?? REVIEW_QUEUE;
    this.logWarn = opts.logger?.warn.bind(opts.logger) ?? ((m) => console.warn(m));

    // A the connect probe: a try to ping with a bounded timeout. A failure
    // (a ECONNREFUSED / a unreachable host) → degraded (a no crash, a the
    // ingress stays up). A ping succeeds → build the real Queue.
    this.ready = this.probeAndBuild(opts.redisUrl).catch((err: unknown) => {
      this.degraded = true;
      this.logWarn(`[queue ${this.name}] redis unreachable (${(err as Error).message}); enqueues are no-ops`);
      return;
    });
  }

  private async probeAndBuild(redisUrl: string): Promise<void> {
    const conn = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    } as Partial<RedisOptions>);
    conn.on("error", () => {});
    try {
      await conn.connect();
      const pong = await Promise.race([
        conn.ping(),
        new Promise((_, rej) => setTimeout(() => rej(new Error("ping timeout")), 2000)),
      ]);
      if (pong !== "PONG") throw new Error("unexpected ping response");
      this.queue = new Queue(this.name, { connection: conn, defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 5000 } });
    } catch (err) {
      await conn.quit().catch(() => {});
      conn.disconnect(false);
      throw err;
    }
  }

  /**
   * Enqueue a job. Awaited once so the probe's result is known before we
   * decide (a the first enqueue blocks until the probe settles — a subsequent
   * enqueues are O(1)). A degraded queue no-ops + a warns.
   */
  async enqueue(payload: Record<string, unknown>, _opts?: Record<string, unknown>): Promise<EnqueueResult> {
    await this.ready;
    if (this.degraded || !this.queue) {
      // A the log carries ONLY the jobId (a a correlation id, a not a
      // secret). The payload diff/contents are NOT logged.
      this.logWarn(`[queue ${this.name}] no-op enqueue: jobId=${payload.jobId ?? "(none)"}`);
      return { enqueued: false, reason: "degraded_no_redis" };
    }
    const job = await this.queue.add(payload as never, _opts as never);
    return { enqueued: true, id: job.id ?? undefined };
  }

  /** A typed review-job enqueue (a the route's convenience). */
  async enqueueReviewJob(payload: ReviewJobPayload): Promise<EnqueueResult> {
    return this.enqueue(
      {
        jobId: payload.jobId,
        orgId: payload.orgId,
        repoId: payload.repoId,
        prNumber: payload.prNumber,
        commitSha: payload.commitSha,
        ...(payload.deliveryId ? { deliveryId: payload.deliveryId } : {}),
      },
      { attempts: 3, backoff: { type: "exponential", delay: 1000 } }
    );
  }

  /** A whether the queue is in the degraded no-op state. */
  isDegraded(): boolean {
    return this.degraded;
  }

  /** A the graceful shutdown (a close the queue + a the underlying conn). */
  async close(): Promise<void> {
    if (this.queue) {
      const client = this.queue.client;
      if (client instanceof Redis) await client.quit().catch(() => {});
      await this.queue.close();
    }
  }
}

// ---------------------------------------------------------------------------
// The in-memory fake (a the "in-memory queue" test seam). The route type-
// checks against `Enqueueable`; the fake records every enqueue so a test can
// assert "a opened event → 202 + a queued job" and "a forged → no queue
// write".
// ---------------------------------------------------------------------------

export interface InMemoryQueue extends Enqueueable {
  readonly enqueued: Array<{ payload: Record<string, unknown>; opts?: Record<string, unknown> }>;
  /** A convenience: the enqueued review payloads (a typed view). */
  reviewJobs(): ReviewJobPayload[];
}

export function createInMemoryQueue(): InMemoryQueue {
  const enqueued: InMemoryQueue["enqueued"] = [];
  return {
    enqueued,
    async enqueue(payload, opts) {
      enqueued.push({ payload, opts });
      return { enqueued: true, id: `mem-${enqueued.length}` };
    },
    reviewJobs() {
      return enqueued.map((e) => e.payload as unknown as ReviewJobPayload);
    },
  };
}

export default BullQueue;
export { Redis, type RedisOptions };
export { Queue as BullMQQueue } from "bullmq";
