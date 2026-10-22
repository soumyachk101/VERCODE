// tests/security/security-quota.test.ts
//
// ST-quota-skip (SECURITY_TEST_PLAN.md §1.7 "ST-quota-skip (AC-402)",
// THREAT_MODEL.md T-11 "API / AI cost abuse" — "the plan quota (reviews/mo +
// token-spend/mo, plans.ts) is enforced at pre-flight *before* the AI stage,
// so an over-cap job consumes ZERO tokens, AC-402").
//
// The spec drives the @vercode/worker's review-job handler
// (apps/worker/src/jobs/review.ts `runReviewJob`) with a mocked quota state:
// an org at 100% of its monthly review quota + a new PR webhook → the job is
// `skipped: quota_exceeded`, ZERO AI tokens consumed, a notice is posted on
// the PR.
//
// ---------------------------------------------------------------------------
// WHAT THIS SPEC RUNS TODAY:
//
// The worker's job handler is the right surface (the quota gate is stage [0],
// "a pre-flight *before* the AI stage"). The handler re-reads durable state
// from the (mocked) DB + a mocked provider, so we assert:
//   - the job is skipped with skipReason `quota_exceeded`;
//   - ZERO provider calls (a the AI stage never ran — `providerCalls === 0`);
//   - ZERO AI tokens in the recorded usage (a the "consumes ZERO tokens" rule);
//   - a the skip is persisted (a the "never silent" rule, NFR-18) + a notice
//     is posted on the PR (a the publisher is called with a quota notice).
//
// The mock DB is the same shape as apps/worker/src/jobs/review.test.ts's
// `makeMockDb` — the quota state is driven by the `monthlyUsage` seed (a the
// org's current-month review count vs the plan's cap, via
// `@vercode/contracts`'s `planQuota` + `FREE_QUOTA`).
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import {
  runReviewJob,
  checkQuotaPlan,
  type ReviewJobOutcome,
} from "../../apps/worker/src/jobs/review.js";
import { MockGithubPublisher } from "../../apps/worker/src/adapters/github-mock.js";
import type { WorkerDeps, ReviewJobPayload } from "../../apps/worker/src/config.js";
import type { DbClient } from "@vercode/database";
import type { PRDiff } from "@vercode/github";
import { FREE_QUOTA } from "@vercode/contracts";

// ---------------------------------------------------------------------------
// A the diff fixture (a the mock-github seam returns this; a two-file PR).
// ---------------------------------------------------------------------------

const fixtureDiff = `diff --git a/src/alpha.ts b/src/alpha.ts
index 0000000..1111111 100644
--- a/src/alpha.ts
+++ b/src/alpha.ts
@@ -1,3 +1,6 @@
 line one
+const q = "SELECT * FROM users WHERE id = " + userId;
 line two
 line three
`;

const PR_DIFF: PRDiff = {
  diff: fixtureDiff,
  prNumber: 42,
  title: "a PR over the quota",
  headSha: "a".repeat(40),
  baseRef: "main",
};

// ---------------------------------------------------------------------------
// A the mock DB (a records the transaction writes; a the quota state is the
// `monthlyUsage` seed — a the current-month review count vs the plan's cap).
// Mirrors apps/worker/src/jobs/review.test.ts's makeMockDb.
// ---------------------------------------------------------------------------

interface RecordedJob {
  status: string;
  skipReason?: string;
  publishedGithubReviewId?: string;
}
interface RecordedFinding {
  source: string;
  file: string;
  line: number;
  severity: string;
  category: string;
  title: string;
  confidence: number;
  anchorStatus: string;
}
interface RecordedUsage {
  orgId: string;
  jobId?: string;
  inputTokens?: number;
  outputTokens?: number;
  estUsdCost?: string;
  model?: string;
  reviewCount?: number;
}

interface MockDbConfig {
  orgPlan: "FREE" | "DEVELOPER" | "TEAM" | "ENTERPRISE";
  monthlyUsage: RecordedUsage[];
  existingTerminalJob: boolean;
  repoFullName: string;
}

function makeMockDb(config: Partial<MockDbConfig> = {}) {
  const self: Required<MockDbConfig> = {
    orgPlan: "FREE",
    monthlyUsage: [],
    existingTerminalJob: false,
    repoFullName: "acme/web",
    ...config,
  };
  const state = {
    reviewJobs: [] as RecordedJob[],
    findings: [] as RecordedFinding[],
    usageEvents: [] as RecordedUsage[],
  };

  const dbClient = {
    organization: {
      findFirst: async () => ({
        id: "org-1",
        plan: self.orgPlan,
        status: "ACTIVE",
        settings: null,
      }),
    },
    repoRule: { findMany: async () => [] },
    reviewJob: {
      findUnique: async () => {
        if (self.existingTerminalJob) {
          return {
            id: "job-existing",
            orgId: "org-1",
            repoId: "repo-1",
            prNumber: 42,
            commitSha: "a".repeat(40),
            status: "SUCCEEDED",
          };
        }
        return null;
      },
      create: async (args: { data: Record<string, unknown> }) => {
        const rec: RecordedJob = { status: args.data.status as string, skipReason: args.data.skipReason as string | undefined };
        state.reviewJobs.push(rec);
        return { id: "job-1", ...args.data };
      },
      update: async (args: { data: Record<string, unknown> }) => {
        const last = state.reviewJobs[state.reviewJobs.length - 1];
        if (last) {
          if (args.data.status) last.status = args.data.status as string;
          if (args.data.skipReason) last.skipReason = args.data.skipReason as string;
          if (args.data.publishedGithubReviewId) last.publishedGithubReviewId = args.data.publishedGithubReviewId as string;
        }
        return { id: "job-1", ...args.data };
      },
    },
    reviewFinding: {
      create: async (args: { data: Record<string, unknown> }) => {
        const d = args.data;
        state.findings.push({
          source: d.source as string,
          file: d.file as string,
          line: d.line as number,
          severity: d.severity as string,
          category: d.category as string,
          title: d.title as string,
          confidence: Number(d.confidence),
          anchorStatus: d.anchorStatus as string,
        });
        return d;
      },
    },
    usageEvent: {
      aggregate: async () => {
        const sum = self.monthlyUsage.reduce(
          (acc, u) => {
            acc.reviewCount += u.reviewCount ?? 0;
            acc.estUsdCost += Number(u.estUsdCost ?? 0);
            return acc;
          },
          { reviewCount: 0, estUsdCost: 0 }
        );
        return { _sum: { reviewCount: sum.reviewCount, estUsdCost: String(sum.estUsdCost) } };
      },
      create: async (args: { data: Record<string, unknown> }) => {
        const d = args.data;
        state.usageEvents.push({
          orgId: d.orgId as string,
          jobId: d.jobId as string | undefined,
          inputTokens: d.inputTokens as number | undefined,
          outputTokens: d.outputTokens as number | undefined,
          estUsdCost: String(d.estUsdCost),
          model: d.model as string | undefined,
          reviewCount: d.reviewCount as number | undefined,
        });
        return d;
      },
    },
    githubRepo: { findFirst: async () => ({ fullName: self.repoFullName, githubRepoId: 1234n }) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(dbClient),
  } as unknown as DbClient;

  return { dbClient, state, self };
}

// ---------------------------------------------------------------------------
// A the deps builder (a the seams injected; a the provider counts calls).
// ---------------------------------------------------------------------------

// A the "zero AI tokens" assertion is strongest with a provider that WOULD
// have produced findings if it ran. A the mock provider (from the worker's
// local adapter) is a good stand-in; we wrap a counter around it so the test
// can assert `providerCalls === 0` on the skip path.
import { mockAiProviderFactory } from "../../apps/worker/src/adapters/local.js";

function makeDeps(db: DbClient, providerCalls: { n: number }): WorkerDeps {
  const factory = (changeSet: import("@vercode/diff-engine").ChangeSet) => {
    providerCalls.n += 1;
    return mockAiProviderFactory(changeSet);
  };
  return {
    db,
    redis: {} as never, // A the handler doesn't touch redis (a the lock is in queues.ts).
    github: { fetchPRDiff: async () => PR_DIFF },
    aiProviderFactories: [factory, factory],
    publisher: new MockGithubPublisher(),
    providerPreference: "mock",
  } as unknown as WorkerDeps;
}

const PAYLOAD: ReviewJobPayload = {
  jobId: "job-1",
  orgId: "org-1",
  repoId: "repo-1",
  prNumber: 42,
  commitSha: "a".repeat(40),
};

// ---------------------------------------------------------------------------
// A the tests
// ---------------------------------------------------------------------------

describe("ST-quota-skip (AC-402): an over-quota job is skipped, zero tokens, notice posted", () => {
  it("a org at 100% of its monthly review quota → skipped:quota_exceeded, zero provider calls, zero AI tokens, a notice posted", async () => {
    // A the org is over its plan's reviews-per-month cap (a the FREE quota's
    // `reviewsPerMonth` + a 100% usage). A the quota gate is stage [0],
    // before the AI stage — so the AI provider must NEVER be called.
    const { dbClient, state } = makeMockDb({
      orgPlan: "FREE",
      monthlyUsage: [{ orgId: "org-1", reviewCount: FREE_QUOTA.reviewsPerMonth, estUsdCost: "0" }],
    });
    const providerCalls = { n: 0 };
    const deps = makeDeps(dbClient, providerCalls);
    const publisher = deps.publisher;

    const result: ReviewJobOutcome = await runReviewJob(deps, PAYLOAD);

    // A the job is skipped with the quota reason (a the "skipped:
    // quota_exceeded" terminal state).
    expect(result.status).toBe("SKIPPED");
    expect(result.skipReason).toBe("quota_exceeded");

    // A ZERO AI tokens consumed (a the "consumes ZERO tokens" rule, AC-402 —
    // a the gate is pre-flight, the AI stage never ran).
    expect(providerCalls.n).toBe(0);
    expect(result.usage.inputTokens).toBe(0);
    expect(result.usage.outputTokens).toBe(0);
    expect(result.usage.estUsdCost).toBe(0);

    // A the skip is persisted (a the "never silent" rule, NFR-18): a the
    // review_jobs row is SKIPPED with the quota reason.
    expect(state.reviewJobs.some((j) => j.status === "SKIPPED" && j.skipReason === "quota_exceeded")).toBe(true);

    // A notice is posted on the PR (a the skip is visible, not a silent stop —
    // a the "skip-with-notice, never a silent stop, which is how abuse hides"
    // rule, T-11).
    expect(publisher.records.some((r) => r.summary.toLowerCase().includes("quota"))).toBe(true);

    // A the skipped job records a zero-usage event (a no token spend is
    // attributed to the org — a the abuse path is closed).
    const usage = state.usageEvents.find((u) => u.orgId === "org-1");
    expect(usage).toBeDefined();
    expect(Number(usage!.estUsdCost)).toBe(0);
    expect(usage!.inputTokens).toBe(0);
    expect(usage!.outputTokens).toBe(0);
  });

  it("a under-quota org runs the pipeline (a the gate is NOT over-blocking)", async () => {
    // A the complement: an org *at or under* the cap is not skipped — the
    // pipeline runs, the provider is called, the job is succeeded/partial.
    // (A guard against the gate being a blanket block, which would DoS the
    // product — T-10's "availability" concern.)
    const { dbClient, state } = makeMockDb({
      orgPlan: "FREE",
      monthlyUsage: [{ orgId: "org-1", reviewCount: 1, estUsdCost: "0.01" }],
    });
    const providerCalls = { n: 0 };
    const deps = makeDeps(dbClient, providerCalls);

    const result = await runReviewJob(deps, PAYLOAD);

    // A not skipped (a under the cap).
    expect(result.status).toBe("SUCCEEDED");
    expect(result.skipReason).toBeUndefined();
    // A the AI provider WAS called (a the gate let it through).
    expect(providerCalls.n).toBeGreaterThan(0);
  });

  it("checkQuotaPlan: the single enforcement point (a plans.ts + usage_events)", async () => {
    // A the quota check itself: at the cap → over; under the cap → not over.
    // (A the "the N+1th skips" boundary, NFR-18/AC-402.)
    const { dbClient: atCapDb } = makeMockDb({
      orgPlan: "FREE",
      monthlyUsage: [{ orgId: "org-1", reviewCount: FREE_QUOTA.reviewsPerMonth, estUsdCost: "0" }],
    });
    expect((await checkQuotaPlan(atCapDb, "org-1", "free", "2026-01")).over).toBe(true);

    const { dbClient: underDb } = makeMockDb({
      orgPlan: "FREE",
      monthlyUsage: [{ orgId: "org-1", reviewCount: FREE_QUOTA.reviewsPerMonth - 1, estUsdCost: "0" }],
    });
    expect((await checkQuotaPlan(underDb, "org-1", "free", "2026-01")).over).toBe(false);

    // A the token-spend cap is also a trigger (a the per-org backstop).
    const { dbClient: spendDb } = makeMockDb({
      orgPlan: "FREE",
      monthlyUsage: [{ orgId: "org-1", reviewCount: 1, estUsdCost: String(FREE_QUOTA.tokenSpendCapMonthlyUsd) }],
    });
    expect((await checkQuotaPlan(spendDb, "org-1", "free", "2026-01")).over).toBe(true);
  });
});
