// The worker's process config (M5 T5.1). The *env* comes from @vercode/config
// (loadConfig is the only reader of env — ENVIRONMENT_VARIABLES.md §9); this
// module derives the worker-specific values + carries the runtime seams (the
// injected diff client, publisher, providers, redis) so the pipeline is testable
// without a live Redis/Postgres/GitHub.

import type { AppConfig } from "@vercode/config";
import type { GithubDiffClient, PRDiff } from "@vercode/github";
import type { DbClient } from "@vercode/database";

// ---------------------------------------------------------------------------
// The job payloads — pointers ONLY (SERVICE_BOUNDARIES.md "the job payload
// never carries authorization; it's a pointer"). The worker re-reads the
// org/repo/quota state from Postgres; a payload field is trusted for
// *nothing* it authorizes.
// ---------------------------------------------------------------------------

export interface ReviewJobPayload {
  /** The BullMQ id of this delivery (correlation only — never an authz input). */
  jobId: string;
  orgId: string;
  repoId: string;
  prNumber: number;
  commitSha: string;
  /** The delivery attempt (BullMQ fills it; the backoff is a function of it). */
  attempt?: number;
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
// The AI provider interface (the @vercode/ai-providers seam, TRD.md §9).
// The M4 package lands the OpenAI/Anthropic/Ollama/mock adapters; this is the
// shape they implement. A local adapter implementing it lives in
// src/adapters/local.ts until the package is merged.
// ---------------------------------------------------------------------------

export interface AiFinding {
  file: string;
  line: number;
  severity: "low" | "medium" | "high" | "critical";
  category: string;
  title: string;
  description: string;
  suggestedFix?: string;
  confidence: number;
}

export interface AiCompleteInput {
  task: string;
  files: Array<{ path: string; language: string; content: string }>;
  changedLines: number;
  schemaNote?: string;
}

export interface AiCompleteResult {
  findings: AiFinding[];
  inputTokens: number;
  outputTokens: number;
  estUsdCost: number;
  model: string;
  promptVersion: string;
}

export interface AiProvider {
  readonly name: string;
  /** Bounded: the caller retries up to 2× + falls back once (TRD.md §9). */
  completeStructured(input: AiCompleteInput): Promise<AiCompleteResult>;
}

export interface StaticAnalyzer {
  /** Deterministic findings — authoritative, exempt from the confidence floor (ADR-005). */
  runStatic(diff: PRDiff): Promise<
    Array<{
      source: "eslint" | "semgrep";
      file: string;
      line: number;
      severity: "low" | "medium" | "high" | "critical";
      category: string;
      title: string;
      description: string;
      suggestedFix?: string;
      confidence: number;
    }>
  >;
}

export interface DiffContext {
  addedLineRanges: Record<string, Set<number>>;
  files: string[];
  totalLines: number;
}

export interface DiffEngine {
  analyze(diff: PRDiff): DiffContext;
}

// ---------------------------------------------------------------------------
// The GitHub publisher (the INTEGRATION_DESIGN.md §1.6 seam). A mock records
// publishes in-memory / to a JSON file (dev); the Octokit publisher is a
// later leaf behind this interface.
// ---------------------------------------------------------------------------

export interface GithubPublisher {
  /**
   * Publish the review: one summary comment (event COMMENT, MVP — no
   * blocking) + the validated inline comments. Returns the created
   * review id (stored on the job; a retried publish that finds the stored
   * id no-ops, NFR-13). A failure here does NOT roll back the persisted
   * findings (ERROR_HANDLING.md §6 "persist-then-publish").
   */
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
// The composition root — everything the pipeline needs, injected.
// ---------------------------------------------------------------------------

export interface WorkerDeps {
  db: DbClient;
  redis: import("ioredis").Redis;
  github: GithubDiffClient;
  staticAnalyzer: StaticAnalyzer;
  aiProviders: AiProvider[]; // [primary, secondary] — the fallback order
  diffEngine: DiffEngine;
  publisher: GithubPublisher;
  /** The provider to use first (config.ai.AI_DEFAULT_PROVIDER / org_settings.provider). */
  providerPreference?: string;
}

export interface WorkerOptions {
  concurrency: number;
  maxAttempts: number;
  /** The SIGTERM drain budget (NFR-15, 60 s). */
  drainBudgetMs: number;
}

// The queue names (TRD.md §7; the api's enqueue side uses the same strings).
export const QUEUES = {
  review: "review-queue",
  retention: "retention-queue",
  billing: "billing-queue",
  deadLetter: "review-dead-letter",
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/** The in-flight lock key (REVIEW_ENGINE_SPEC §5 "Redis SET NX on lock:{key}"). */
export function inFlightLockKey(orgId: string, repoId: string, prNumber: number, commitSha: string): string {
  return `lock:${orgId}:${repoId}:${prNumber}:${commitSha}`;
}

export function workerOptsFromConfig(config: AppConfig): WorkerOptions {
  return {
    // NFR-17: the per-instance concurrency is a platform default, env-overridable.
    concurrency: Math.max(1, Math.round(config.limits.WORKER_CONCURRENCY)),
    maxAttempts: Math.max(1, Math.round(config.limits.QUEUE_MAX_ATTEMPTS)),
    // NFR-15: the 60 s drain budget.
    drainBudgetMs: 60_000,
  };
}
