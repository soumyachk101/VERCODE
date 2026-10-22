import { z } from "zod";

// ---------------------------------------------------------------------------
// VERCODE plans & quotas — the single source of truth for commercial limits.
//
// This is the module `index.ts` re-exports (`.js` under NodeNext).
// The API quota check, the worker pre-flight check, and the dashboard display
// all import from here. A hardcoded quota number anywhere else is a defect
// (AC-401, USAGE_QUOTAS.md §4 "the single enforcement point", the
// UT-plans-01 import-identity gate).
// ---------------------------------------------------------------------------

export const PlanSchema = z.enum(["free", "developer", "team", "enterprise"]);
export type Plan = z.infer<typeof PlanSchema>;

/**
 * The commercial dimensions a plan sells. `USAGE_QUOTAS.md` §1 is the design
 * rationale; this type is the code. `tokenSpendCapMonthlyUsd` is the per-org
 * cost-abuse backstop (RATE_LIMITING.md §5 "the plan's cap is a commercial
 * cap; the platform's cap is the backstop").
 */
export interface PlanQuota {
  plan: Plan;
  /** reviews / calendar month — a hard cap: the N+1th skips (NFR-18, AC-402). */
  reviewsPerMonth: number;
  /** changed files a single review's AI stage processes — a degrade, not a skip (NFR-19). */
  filesPerReview: number;
  /** changed lines (added+removed) a single review processes — a degrade (NFR-19). */
  linesPerReview: number;
  /** in-flight review jobs an org can have (throughput cap; over → queued, not skipped). */
  concurrentReviews: number;
  /** days a finding is retained before a hard purge (NFR-27). */
  findingRetentionDays: number;
  /** the custom rules an org can define. */
  customRules: number;
  /** the model tier the plan's routing table may select (MODEL_ROUTING.md §4). */
  modelTierAccess: "standard" | "standard+strong" | "any";
  /** the org's monthly provider token-spend ceiling in USD (a per-org cap, the backstop). 0 = use the platform default. */
  tokenSpendCapMonthlyUsd: number;
  /** the audit-log retention floor in days (NFR-27 "audit log 180 d min"). */
  auditRetentionDays: number;
}

/**
 * The four plans. `USAGE_QUOTAS.md` §2 is the shape; these are the numbers.
 * `enterprise` caps are configurable (a config-driven override, not a hardcoded
 * "Infinity") — the defaults here are the floor, a per-account negotiation can
 * raise them (USAGE_QUOTAS.md §3 "a Enterprise 'unlimited-ish' is a config override").
 */
export const FREE_QUOTA: PlanQuota = {
  plan: "free",
  reviewsPerMonth: 50,
  filesPerReview: 20,
  linesPerReview: 500,
  concurrentReviews: 1,
  findingRetentionDays: 30,
  customRules: 3,
  modelTierAccess: "standard",
  tokenSpendCapMonthlyUsd: 5, // a Free tier's cost is bounded (PRICING_STRATEGY.md §6, COST_MODEL.md §2)
  auditRetentionDays: 180,
};

export const DEVELOPER_QUOTA: PlanQuota = {
  plan: "developer",
  reviewsPerMonth: 500,
  filesPerReview: 60,
  linesPerReview: 3000,
  concurrentReviews: 3,
  findingRetentionDays: 90,
  customRules: 10,
  modelTierAccess: "standard",
  tokenSpendCapMonthlyUsd: 50,
  auditRetentionDays: 180,
};

export const TEAM_QUOTA: PlanQuota = {
  plan: "team",
  reviewsPerMonth: 5000,
  filesPerReview: 100,
  linesPerReview: 10000,
  concurrentReviews: 10,
  findingRetentionDays: 365,
  customRules: 50,
  modelTierAccess: "standard+strong",
  tokenSpendCapMonthlyUsd: 500,
  auditRetentionDays: 180,
};

export const ENTERPRISE_QUOTA: PlanQuota = {
  plan: "enterprise",
  // a configurable floor; a per-account negotiation can raise it (USAGE_QUOTAS.md §3).
  reviewsPerMonth: 50000,
  filesPerReview: 500,
  linesPerReview: 50000,
  concurrentReviews: 50,
  findingRetentionDays: 730,
  customRules: 500,
  modelTierAccess: "any",
  tokenSpendCapMonthlyUsd: 5000,
  auditRetentionDays: 365,
};

const PLANS: Record<Plan, PlanQuota> = {
  free: FREE_QUOTA,
  developer: DEVELOPER_QUOTA,
  team: TEAM_QUOTA,
  enterprise: ENTERPRISE_QUOTA,
};

/**
 * Resolve a plan to its quota. The single resolver the whole system uses
 * (USAGE_QUOTAS.md §4 "a checkQuota reads planQuota(org.plan) + usage_events").
 */
export function planQuota(plan: Plan): PlanQuota {
  return PLANS[plan];
}

export const ALL_PLANS: readonly Plan[] = ["free", "developer", "team", "enterprise"];
