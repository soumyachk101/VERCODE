import { z } from "zod";
import {
  ReviewFindingSchema,
  ReviewSummarySchema,
  ReviewJobSchema,
  ReviewRequestPayloadSchema,
} from "./findings.js";
import { PlanSchema, PlanQuota, planQuota, FREE_QUOTA, DEVELOPER_QUOTA, TEAM_QUOTA, ENTERPRISE_QUOTA } from "./plans.js";

// The shared request/response payload schemas for the dashboard REST API
// (API_SPECIFICATION.md "schemas are the shared Zod types in packages/contracts
// — the source of truth"). A request schema is validated at the API route
// before touching a service; a response schema is what the route returns.

// ---------------------------------------------------------------------------
// Auth (API_SPECIFICATION.md "Auth & account")
// ---------------------------------------------------------------------------
export const SignupRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).optional(),
});
export type SignupRequest = z.infer<typeof SignupRequestSchema>;

export const SigninRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type SigninRequest = z.infer<typeof SigninRequestSchema>;

// ---------------------------------------------------------------------------
// Organizations (API_SPECIFICATION.md "Organizations")
// ---------------------------------------------------------------------------
export const CreateOrgRequestSchema = z.object({
  name: z.string().min(2),
});
export type CreateOrgRequest = z.infer<typeof CreateOrgRequestSchema>;

export const RoleSchema = z.enum(["owner", "admin", "developer", "viewer"]);
export type Role = z.infer<typeof RoleSchema>;

export const CreateInvitationRequestSchema = z.object({
  email: z.string().email(),
  role: RoleSchema.exclude("owner"), // an invite can't create a second owner (AUTHORIZATION §2)
});
export type CreateInvitationRequest = z.infer<typeof CreateInvitationRequestSchema>;

export const ChangeRoleRequestSchema = z.object({
  role: RoleSchema,
});
export type ChangeRoleRequest = z.infer<typeof ChangeRoleRequestSchema>;

// ---------------------------------------------------------------------------
// Reviews (API_SPECIFICATION.md "Reviews & findings")
// ---------------------------------------------------------------------------
export const ListReviewsQuerySchema = z.object({
  status: ReviewJobSchema.shape.status.optional(),
  repoId: z.string().optional(),
  prNumber: z.number().int().positive().optional(),
  since: z.string().datetime().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().positive().max(100).default(50),
});
export type ListReviewsQuery = z.infer<typeof ListReviewsQuerySchema>;

export const ListFindingsQuerySchema = z.object({
  severity: ReviewFindingSchema.shape.severity.optional(),
  category: ReviewFindingSchema.shape.category.optional(),
  source: ReviewFindingSchema.shape.file.optional(), // a source filter
  cursor: z.string().optional(),
  limit: z.number().int().positive().max(200).default(50),
});
export type ListFindingsQuery = z.infer<typeof ListFindingsQuerySchema>;

export const FindingActionSchema = z.enum([
  "accepted",
  "dismissed_reasonable",
  "dismissed_unreasonable",
  "fixed",
  "ignored",
]);
export type FindingAction = z.infer<typeof FindingActionSchema>;

export const RecordFindingActionRequestSchema = z.object({
  action: FindingActionSchema,
});
export type RecordFindingActionRequest = z.infer<typeof RecordFindingActionRequestSchema>;

// The re-review request (US-105, API_SPECIFICATION.md "POST /orgs/:id/github/review").
// A commit-SHA key: a same-SHA re-review is an idempotent no-op (NFR-13).
export const RequestReviewSchema = ReviewRequestPayloadSchema;
export type RequestReview = z.infer<typeof RequestReviewSchema>;

// ---------------------------------------------------------------------------
// Configuration (API_SPECIFICATION.md "Configuration")
// ---------------------------------------------------------------------------
export const UpdateOrgSettingsRequestSchema = z.object({
  confidenceFloor: z.number().min(0).max(1).optional(),
  maxFiles: z.number().int().positive().optional(),
  maxLines: z.number().int().positive().optional(),
  provider: z.enum(["openai", "anthropic", "ollama"]).optional(),
  tokenSpendCapMonthlyUsd: z.number().nonnegative().optional(),
});
export type UpdateOrgSettingsRequest = z.infer<typeof UpdateOrgSettingsRequestSchema>;

export const SetBYOKKeyRequestSchema = z.object({
  provider: z.enum(["openai", "anthropic"]),
  /** The raw key is KMS-wrapped on the server; only the last-4 is ever returned (FR-313). */
  apiKey: z.string().min(1),
});
export type SetBYOKKeyRequest = z.infer<typeof SetBYOKKeyRequestSchema>;

// ---------------------------------------------------------------------------
// Usage & billing (API_SPECIFICATION.md "Usage & billing")
// ---------------------------------------------------------------------------
export const UsageRangeSchema = z.enum(["30d", "90d", "12mo"]);
export type UsageRange = z.infer<typeof UsageRangeSchema>;

export const ListInvoicesQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().positive().max(50).default(20),
});
export type ListInvoicesQuery = z.infer<typeof ListInvoicesQuerySchema>;

export const SubscribeRequestSchema = z.object({
  plan: PlanSchema,
  /** `true` = cancel at the end of the current period (a default, a not an immediate cancel). */
  atPeriodEnd: z.boolean().default(true),
});
export type SubscribeRequest = z.infer<typeof SubscribeRequestSchema>;

export const CancelSubscriptionRequestSchema = z.object({
  atPeriodEnd: z.boolean().default(true),
});
export type CancelSubscriptionRequest = z.infer<typeof CancelSubscriptionRequestSchema>;

// ---------------------------------------------------------------------------
// Audit (API_SPECIFICATION.md "Audit")
// ---------------------------------------------------------------------------
export const ListAuditQuerySchema = z.object({
  action: z.string().optional(),
  actorId: z.string().optional(),
  targetType: z.string().optional(),
  since: z.string().datetime().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().positive().max(200).default(50),
});
export type ListAuditQuery = z.infer<typeof ListAuditQuerySchema>;

// Re-export the finding/job/plan schemas for a single import surface
// (contracts/src/index.ts "re-export plan helpers (single import surface)").
export {
  PlanSchema,
  PlanQuota,
  planQuota,
  FREE_QUOTA,
  DEVELOPER_QUOTA,
  TEAM_QUOTA,
  ENTERPRISE_QUOTA,
  ReviewFindingSchema,
  ReviewSummarySchema,
  ReviewJobSchema,
  ReviewRequestPayloadSchema,
};
