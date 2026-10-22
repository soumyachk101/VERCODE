import { z } from "zod";
import { Plan, PlanQuota, planQuota, FREE_QUOTA, DEVELOPER_QUOTA, TEAM_QUOTA, ENTERPRISE_QUOTA } from "./plans.js";

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

// ---------------------------------------------------------------------------
// ReviewFinding
// ---------------------------------------------------------------------------
export const ReviewFindingSchema = z.object({
  id: z.string(),
  file: z.string(),
  line: z.number().int().nonnegative(),
  severity: FindingSeveritySchema,
  category: FindingCategorySchema,
  title: z.string().min(1),
  description: z.string(),
  suggestedFix: z.string().optional(),
  confidence: z.number().min(0).max(1),
  promptVersion: z.string().optional(),
});
export type ReviewFinding = z.infer<typeof ReviewFindingSchema>;

// ---------------------------------------------------------------------------
// ReviewSummary — the headline a PR gets
// ---------------------------------------------------------------------------
export const ReviewSummarySchema = z.object({
  verdict: z.string(),
  highSeverityCount: z.number().int().nonnegative(),
  topRisks: z.array(z.string()),
  overallConfidence: z.number().min(0).max(1),
});
export type ReviewSummary = z.infer<typeof ReviewSummarySchema>;

// ---------------------------------------------------------------------------
// ReviewJob
// ---------------------------------------------------------------------------
export const ReviewJobStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "skipped",
]);
export type ReviewJobStatus = z.infer<typeof ReviewJobStatusSchema>;

export const ReviewJobSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  repoId: z.string(),
  prNumber: z.number().int().positive(),
  commitSha: z.string(),
  status: ReviewJobStatusSchema,
  createdAt: z.string().datetime(),
  finishedAt: z.string().datetime().optional(),
  error: z.string().optional(),
});
export type ReviewJob = z.infer<typeof ReviewJobSchema>;

// ---------------------------------------------------------------------------
// ReviewRequestPayload — what the API accepts to enqueue a review
// ---------------------------------------------------------------------------
export const ReviewRequestPayloadSchema = z.object({
  orgId: z.string().min(1),
  repoId: z.string().min(1),
  prNumber: z.number().int().positive(),
  commitSha: z.string().min(4),
  /** Optional per-org confidence floor override (0..1). Defaults to 0.6. */
  confidenceFloor: z.number().min(0).max(1).optional(),
});
export type ReviewRequestPayload = z.infer<typeof ReviewRequestPayloadSchema>;

// ---------------------------------------------------------------------------
// Re-export plan helpers (single import surface)
// ---------------------------------------------------------------------------
export { Plan, PlanQuota, planQuota, FindingSeveritySchema, FindingCategorySchema, FREE_QUOTA, DEVELOPER_QUOTA, TEAM_QUOTA, ENTERPRISE_QUOTA };
