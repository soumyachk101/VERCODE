// The worker's process config (M5 T5.1, TRD.md §7; NFR-13/14/15/17).
//
// The *env* comes from @vercode/config (loadConfig is the only reader of env —
// ENVIRONMENT_VARIABLES.md §9 "a variable not in the doc doesn't exist"). This
// module derives the worker-specific values + carries the runtime seams (the
// injected diff client, publisher, AI providers, policy state) so the
// pipeline is testable without a live Redis/Postgres/GitHub.
//
// Job payload shape (TRD.md §7): `{ jobId, orgId, repoId, prNumber,
// commitSha }` — a POINTER ONLY (SERVICE_BOUNDARIES.md "the job payload never
// carries authorization; it's a pointer"). The worker re-reads the
// org/repo/quota state from Postgres; a payload field authorizes nothing.

import type { AppConfig } from "@vercode/config";
import type {
  AIProvider,
  OrgContext,
  ReviewTask,
} from "@vercode/ai-providers";
import type { DbClient } from "@vercode/database";
import type { GithubDiffClient } from "@vercode/github";

export type { OrgContext };

// ---------------------------------------------------------------------------
// The queue names (TRD.md §7; the api's enqueue side uses the same strings).
// ---------------------------------------------------------------------------

export const QUEUES = {
  review: "review-queue",
  retention: "retention-queue",
  billing: "billing-queue",
  deadLetter: "review-dead-letter",
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

// ---------------------------------------------------------------------------
// The job payloads — pointers ONLY (SERVICE_BOUNDARIES.md "never trust the
// payload for authz"; NFR-13 the idempotency key).
// ---------------------------------------------------------------------------

export interface ReviewJobPayload {
  /** The durable review_jobs.id (correlation + the enqueue receipt). */
  jobId: string;
  orgId: string;
  repoId: string;
  prNumber: number;
  commitSha: string;
}

export interface RetentionJobPayload {
  orgId: string;
  kind: string;
  target: string;
}

export interface BillingJobPayload {
  orgId: string;
  rollupDay: string;
}

// ---------------------------------------------------------------------------
// The GitHub publisher (the INTEGRATION_DESIGN.md §1.6 seam).
//
// A mock records publishes in-memory (dev); the Octokit publisher (the
// `publishReview` in @vercode/github, TRD.md §10 "create a review + add the
// inline review comments") is a later leaf behind this interface.
//
// A failed publish does NOT roll back the persisted findings (the
// persist-then-publish invariant, ERROR_HANDLING.md §6). The returned id is
// stored on the job; a retried publish that finds the stored id no-ops
// (NFR-13, TRD.md §12 "a published review id stored per job").
// ---------------------------------------------------------------------------

export interface GithubPublisher {
  publish(params: {
    repoId: string;
    repoFullName: string;
    prNumber: number;
    commitSha: string;
    summary: string;
    inlineComments: Array<{
      path: string;
      side: "RIGHT" | "LEFT";
      line: number;
      body: string;
    }>;
  }): Promise<{ publishedGithubReviewId: string }>;
}

// ---------------------------------------------------------------------------
// The policy-engine state (TASK_BREAKDOWN T4.5; REVIEW_ENGINE_SPEC §2
// stages [10]/[11]).
//
// `@vercode/policy-engine` is not merged yet, so the floor + suppression
// values are re-read from durable state at run time (org_settings +
// repo_rules, orgId-scoped — the same rows the future package would read).
// The application functions live in `src/jobs/policy.ts` (pure + unit
// tested), and a policy-engine adapter is a later leaf.
// ---------------------------------------------------------------------------

export interface PolicyState {
  /** The AI-finding confidence floor (default 0.6; static findings exempt). */
  confidenceFloor: number;
  /** Categories suppressed for this repo (per-repo + per-org merge). */
  suppressCategories: string[];
}

// ---------------------------------------------------------------------------
// The composition root — everything the pipeline needs, injected.
// ---------------------------------------------------------------------------

export interface WorkerDeps {
  db: DbClient;
  redis: import("ioredis").Redis;
  /** The diff fetch (the GithubDiffClient seam — the mock in dev). */
  github: GithubDiffClient;
  /**
   * The task → provider map (the @vercode/ai-providers seam, TRD.md §9).
   *   "risk-triage"     → cheap
   *   "deep-review"     → strong
   *   "security-review" → strong
   *   "summary"         → cheap (or deterministic when absent)
   *
   * A provider failure is bounded-retried by @vercode/ai-providers'
   * `runWithRetry` (the primary + one fallback switch); a stage that still
   * fails → the job is `partial`, the deterministic findings still publish
   * (ADR-005, ERROR_HANDLING.md §5).
   */
  aiProviders: Partial<Record<ReviewTask, AIProvider>>;
  /** The GitHub publisher (a mock records publishes in dev). */
  publisher: GithubPublisher;
  /**
   * The confidence floor (config.limits.DEFAULT_CONFIDENCE_FLOOR, the
   * platform default; an org-level override comes from org_settings,
   * re-read per run — the worker never trusts the payload for it).
   */
  confidenceFloor: number;
  /** The per-review file budget (a degrade, not a skip; NFR-19). */
  maxFiles: number;
  /** The per-review changed-line budget (a degrade, not a skip; NFR-19). */
  maxLines: number;
  /** A prompt-version label recorded on findings + the usage event. */
  promptVersion: string;
}

export interface WorkerOptions {
  /** NFR-17: the per-instance concurrency (default 4, WORKER_CONCURRENCY). */
  concurrency: number;
  /** NFR-14: the retry cap (default 3, QUEUE_MAX_ATTEMPTS). */
  maxAttempts: number;
  /** NFR-15: the SIGTERM drain budget (60 s). */
  drainBudgetMs: number;
  /** The default confidence floor (DEFAULT_CONFIDENCE_FLOOR, the platform default). */
  confidenceFloor: number;
  /** The per-review file budget (REVIEW_MAX_FILES, NFR-19). */
  maxFiles: number;
  /** The per-review changed-line budget (REVIEW_MAX_LINES, NFR-19). */
  maxLines: number;
}

/** The in-flight lock key (REVIEW_ENGINE_SPEC §5 "Redis SET NX on lock:{key}"). */
export function inFlightLockKey(
  orgId: string,
  repoId: string,
  prNumber: number,
  commitSha: string
): string {
  return `lock:${orgId}:${repoId}:${prNumber}:${commitSha}`;
}

/** Derive the worker options from the typed config (the only env reader). */
export function workerOptsFromConfig(config: AppConfig): WorkerOptions {
  return {
    // NFR-17: the per-instance concurrency (default 4, env-overridable).
    concurrency: Math.max(1, Math.round(config.limits.WORKER_CONCURRENCY)),
    // NFR-14: the bounded retry cap (default 3).
    maxAttempts: Math.max(1, Math.round(config.limits.QUEUE_MAX_ATTEMPTS)),
    // NFR-15: the 60 s drain budget.
    drainBudgetMs: 60_000,
    // The platform defaults (ENVIRONMENT_VARIABLES §6 "these are defaults").
    confidenceFloor: config.limits.DEFAULT_CONFIDENCE_FLOOR,
    maxFiles: Math.round(config.limits.REVIEW_MAX_FILES),
    maxLines: Math.round(config.limits.REVIEW_MAX_LINES),
  };
}
