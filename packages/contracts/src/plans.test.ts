// UT-plans-01 / UT-plans-02 (UNIT_TEST_PLAN.md §2, ACCEPTANCE_CRITERIA AC-401)
//
// The import-identity gate: `plans.ts` is the single source of truth for the
// quota numbers. A hardcoded quota number anywhere else is a defect — the
// API quota check, the worker pre-flight, and the dashboard display all
// import from here (USAGE_QUOTAS.md §4 "the single enforcement point").

import { describe, it, expect } from "vitest";
import {
  PlanSchema,
  planQuota,
  FREE_QUOTA,
  DEVELOPER_QUOTA,
  TEAM_QUOTA,
  ENTERPRISE_QUOTA,
  ALL_PLANS,
} from "./plans.js";

describe("plans (UT-plans-01 import identity)", () => {
  it("resolves every plan to its quota constant", () => {
    expect(planQuota("free")).toBe(FREE_QUOTA);
    expect(planQuota("developer")).toBe(DEVELOPER_QUOTA);
    expect(planQuota("team")).toBe(TEAM_QUOTA);
    expect(planQuota("enterprise")).toBe(ENTERPRISE_QUOTA);
  });

  it("ALL_PLANS is the four plans, in ladder order", () => {
    expect(ALL_PLANS).toEqual(["free", "developer", "team", "enterprise"]);
  });

  it("PlanSchema accepts the four and rejects a typo", () => {
    for (const p of ["free", "developer", "team", "enterprise"]) {
      expect(PlanSchema.safeParse(p).success).toBe(true);
    }
    expect(PlanSchema.safeParse("pro").success).toBe(false);
  });
});

describe("plans (UT-plans-02 ladder shape, USAGE_QUOTAS.md §2)", () => {
  it("is a volume/capability ladder: each step raises the caps", () => {
    // volume step (free → developer): same standard tier, higher volume.
    expect(DEVELOPER_QUOTA.reviewsPerMonth).toBeGreaterThan(FREE_QUOTA.reviewsPerMonth);
    expect(DEVELOPER_QUOTA.modelTierAccess).toBe(FREE_QUOTA.modelTierAccess);

    // capability step (developer → team): a higher volume + a stronger tier.
    expect(TEAM_QUOTA.reviewsPerMonth).toBeGreaterThan(DEVELOPER_QUOTA.reviewsPerMonth);
    expect(TEAM_QUOTA.modelTierAccess).toBe("standard+strong");

    // cost-shifting + compliance step (team → enterprise): a configurable cap + any tier.
    expect(ENTERPRISE_QUOTA.reviewsPerMonth).toBeGreaterThan(TEAM_QUOTA.reviewsPerMonth);
    expect(ENTERPRISE_QUOTA.modelTierAccess).toBe("any");
  });

  it("the audit retention floor is ≥ 180 days on every plan (NFR-27)", () => {
    for (const p of ALL_PLANS) {
      expect(planQuota(p).auditRetentionDays).toBeGreaterThanOrEqual(180);
    }
  });

  it("a Free tier is bounded (the cost-abuse control, PRICING_STRATEGY.md §6)", () => {
    // A Free tier must not be a cost-abuse vector: a small review cap + a low token cap + a cheap model.
    expect(FREE_QUOTA.reviewsPerMonth).toBeLessThanOrEqual(50);
    expect(FREE_QUOTA.tokenSpendCapMonthlyUsd).toBeLessThanOrEqual(5);
    expect(FREE_QUOTA.modelTierAccess).toBe("standard");
  });

  it("a skipped review costs zero (AC-402 precondition: the cap is a pre-flight gate)", () => {
    // The quota dimensions are what the worker pre-flight reads before the AI stage
    // (REVIEW_ENGINE_SPEC.md §2 stage [0], "the skip is before the AI stage, zero tokens").
    // A cap of 0 reviews would skip everything — assert the plans don't do that.
    for (const p of ALL_PLANS) {
      expect(planQuota(p).reviewsPerMonth).toBeGreaterThan(0);
    }
  });
});
