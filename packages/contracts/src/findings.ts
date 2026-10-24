import { z } from "zod";

// The findings + jobs + summary schemas, split out of index.ts so each contract
// module has one responsibility (REPOSITORY_STRUCTURE.md "the contracts package
// is the single source of truth"). index.ts re-exports these for the
// single-import-surface.

// ---------------------------------------------------------------------------
// Severity & categories
// ---------------------------------------------------------------------------
export const FindingSeveritySchema = z.enum(["low", "medium", "high", "critical"]);
export type FindingSeverity = z.infer<typeof FindingSeveritySchema>;

export const FindingCategorySchema = z.enum([
  "logic-bug",
  "security",
  "performance",
  "race-condition",
  "resource-leak",
  "api-contract",
  "db-consistency",
  "edge-case",
  "assumption",
]);
export type FindingCategory = z.infer<typeof FindingCategorySchema>;

/** The source a finding came from (REVIEW_ENGINE_SPEC.md §2 stage [4]/[8]). */
export const FindingSourceSchema = z.enum([
  "eslint",
  "semgrep",
  "ai-deep",
  "ai-security",
  "deterministic-summary",
]);
export type FindingSource = z.infer<typeof FindingSourceSchema>;

// ---------------------------------------------------------------------------
// ReviewFinding — a single validated finding (the structured AI/static output)
// ---------------------------------------------------------------------------
export const ReviewFindingSchema = z.object({
  id: z.string(),
  file: z.string(),
  /** 1-based line in the NEW file; validated against the diff's added ranges (FR-306). */
  line: z.number().int().nonnegative(),
  severity: FindingSeveritySchema,
  category: FindingCategorySchema,
  title: z.string().min(1),
  description: z.string(),
  suggestedFix: z.string().optional(),
  /** A model-reported heuristic in [0,1], NOT a calibrated probability (AI_SYSTEM_DESIGN.md §6). */
  confidence: z.number().min(0).max(1),
  promptVersion: z.string().optional(),
});
export type ReviewFinding = z.infer<typeof ReviewFindingSchema>;

// ---------------------------------------------------------------------------
// ReviewSummary — the headline a PR gets (FR-309)
// ---------------------------------------------------------------------------
export const ReviewSummarySchema = z.object({
  verdict: z.string(),
  highSeverityCount: z.number().int().nonnegative(),
  topRisks: z.array(z.string()),
  overallConfidence: z.number().min(0).max(1),
});
export type ReviewSummary = z.infer<typeof ReviewSummarySchema>;

// ---------------------------------------------------------------------------
// ReviewJob (the durable review unit of work; the idempotency key is
// (org, repo, pr, commitSha), ADR-007, DATABASE_DESIGN.md §3)
// ---------------------------------------------------------------------------
export const ReviewJobStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "skipped",
  "partial",
]);
export type ReviewJobStatus = z.infer<typeof ReviewJobStatusSchema>;

export const ReviewJobSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  repoId: z.string(),
  prNumber: z.number().int().positive(),
  commitSha: z.string(),
  status: ReviewJobStatusSchema,
  skipReason: z
    .enum(["quota_exceeded", "same_sha", "install_removed", "pr_closed", "over_budget_degraded"])
    .optional(),
  error: z.string().optional(),
  createdAt: z.string().datetime(),
  finishedAt: z.string().datetime().optional(),
});
export type ReviewJob = z.infer<typeof ReviewJobSchema>;

// ---------------------------------------------------------------------------
// ReviewRequestPayload — what the API accepts to enqueue a review (FR-205/207)
// ---------------------------------------------------------------------------
export const ReviewRequestPayloadSchema = z.object({
  orgId: z.string().min(1),
  repoId: z.string().min(1),
  prNumber: z.number().int().positive(),
  commitSha: z.string().min(4),
  /** Optional per-org confidence floor override (0..1). Defaults to the org setting (0.6). */
  confidenceFloor: z.number().min(0).max(1).optional(),
});
export type ReviewRequestPayload = z.infer<typeof ReviewRequestPayloadSchema>;

// ---------------------------------------------------------------------------
// The review result the engine returns (REVIEW_ENGINE_SPEC.md §1 "the engine
// has no I/O side effects of its own; it returns ReviewResult").
// ---------------------------------------------------------------------------
export const ReviewResultSchema = z.object({
  jobId: z.string(),
  status: z.enum(["succeeded", "partial", "skipped"]),
  summary: ReviewSummarySchema,
  findings: z.array(ReviewFindingSchema),
  dropped: z.object({
    invalidAnchor: z.number().int().nonnegative(),
    invalid: z.number().int().nonnegative(),
    deduped: z.number().int().nonnegative(),
    belowFloor: z.number().int().nonnegative(),
  }),
  cost: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    estUsd: z.number().nonnegative(),
    model: z.string(),
    promptVersion: z.string(),
  }),
  skipReason: z
    .enum(["quota_exceeded", "same_sha", "install_removed", "pr_closed", "over_budget_degraded"])
    .optional(),
});
export type ReviewResult = z.infer<typeof ReviewResultSchema>;
