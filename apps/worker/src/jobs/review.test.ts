// UT-review-* (M5 T5.1/T5.2/T5.3) — a the review-job handler's invariants.
//
// A mocked-DB + mocked-provider test: no live Postgres/Redis/GitHub. A the
// DB is a structural mock that records what a the persist-then-publish
// transaction wrote, so a we can assert a the invariants:
//   1. quota-exceeded → skipped, zero provider calls, notice posted
//   2. provider-down → partial status, deterministic findings still publish
//   3. same-SHA redelivery → no-op (a the idempotency gate, ADR-007)
//   4. publish failure → findings still persisted (a the persist-then-publish
//      invariant, ERROR_HANDLING.md §6)
//
// A the pipeline is exercised end-to-end (dequeue → load → diff → static →
// AI → validate → dedup → policy → summary → PERSIST → publish) with a the
// seams injected, so a regression in any stage is caught here.

import { describe, it, expect } from "vitest";
import {
  runReviewJob,
  checkQuotaPlan,
  validateFindings,
  type ReviewJobOutcome,
  type CanonicalFinding,
} from "./review.js";
import {
  dedupFindings,
  applyPolicy,
  resolveWorkerPolicy,
} from "./policy.js";
import { parseUnifiedDiff, type ChangeSet } from "@vercode/diff-engine";
import { MockAdapter } from "@vercode/ai-providers";
import { makeMockGithubClient, MockGithubPublisher } from "../adapters/github-mock.js";
import type { ReviewJobPayload, WorkerDeps } from "../config.js";
import type { DbClient } from "@vercode/database";
import type { PRDiff } from "@vercode/github";
import { FREE_QUOTA, DEVELOPER_QUOTA } from "@vercode/contracts";

// ---------------------------------------------------------------------------
// A the diff fixture (a two-file PR, inlined for determinism — a the mock
// github seam returns this directly).
// ---------------------------------------------------------------------------

const fixtureDiff = `diff --git a/src/alpha.ts b/src/alpha.ts
index 0000000..1111111 100644
--- a/src/alpha.ts
+++ b/src/alpha.ts
@@ -1,3 +1,6 @@
 line one
+secret = "sk-live-abcdef123456";
+const q = "SELECT * FROM users WHERE id = " + userId;
 line two
 line three
diff --git a/src/beta.ts b/src/beta.ts
index 2222222..3333333 100644
--- a/src/beta.ts
+++ b/src/beta.ts
@@ -5,2 +5,4 @@
 keep
+fetch(url).then(parse);
 keep2
`;

const PR_DIFF: PRDiff = {
  diff: fixtureDiff,
  prNumber: 42,
  title: "Test PR",
  headSha: "a".repeat(40),
  baseRef: "main",
};

// ---------------------------------------------------------------------------
// A the mock DB — a records a the transaction writes, so a the tests can
// assert a the persist step without a live Postgres.
// ---------------------------------------------------------------------------

interface RecordedJob {
  status: string;
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
  monthlyUsage: RecordedUsage[]; // a the pre-existing usage (a the quota gate)
  existingTerminalJob: boolean; // a the same-SHA idempotency gate
  existingPublishedReviewId: string | null;
  repoFullName: string;
  suppressCategories: string[];
  confidenceFloorOverride: number | null;
  orgSettings: {
    confidenceFloor: number | null;
    maxFiles: number | null;
    maxLines: number | null;
  } | null;
}

function makeMockDb(config: Partial<MockDbConfig> = {}) {
  const self: Required<MockDbConfig> = {
    orgPlan: "DEVELOPER",
    monthlyUsage: [],
    existingTerminalJob: false,
    existingPublishedReviewId: null,
    repoFullName: "acme/web",
    suppressCategories: [],
    confidenceFloorOverride: null,
    orgSettings: null,
    ...config,
  };
  const state = {
    reviewJobs: [] as Array<RecordedJob & { publishedGithubReviewId?: string }>,
    findings: [] as RecordedFinding[],
    usageEvents: [] as RecordedUsage[],
  };

  const dbClient = {
    organization: {
      findFirst: async () => ({
        id: "org-1",
        plan: self.orgPlan,
        status: "ACTIVE",
        settings: self.orgSettings
          ? {
              id: "settings-1",
              orgId: "org-1",
              confidenceFloor: self.orgSettings.confidenceFloor,
              maxFiles: self.orgSettings.maxFiles,
              maxLines: self.orgSettings.maxLines,
            }
          : null,
      }),
    },
    repoRule: {
      findMany: async () =>
        self.suppressCategories.length > 0
          ? [
              {
                suppressCategories: self.suppressCategories,
                confidenceFloorOverride: self.confidenceFloorOverride,
              },
            ]
          : [],
    },
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
            publishedGithubReviewId: self.existingPublishedReviewId,
          };
        }
        if (state.reviewJobs.length > 0) {
          const last = state.reviewJobs[state.reviewJobs.length - 1];
          return {
            id: "job-1",
            status: last.status,
            publishedGithubReviewId: last.publishedGithubReviewId,
          };
        }
        return null;
      },
      create: async (args: { data: Record<string, unknown> }) => {
        const rec: RecordedJob = {
          status: args.data.status as string,
          publishedGithubReviewId: args.data.publishedGithubReviewId as
            | string
            | undefined,
        };
        state.reviewJobs.push(rec);
        return { id: "job-1", ...args.data };
      },
      update: async (args: { data: Record<string, unknown> }) => {
        const last = state.reviewJobs[state.reviewJobs.length - 1];
        if (last) {
          if (args.data.publishedGithubReviewId)
            last.publishedGithubReviewId = args.data.publishedGithubReviewId as string;
          if (args.data.status) last.status = args.data.status as string;
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
    githubRepo: {
      findFirst: async () => ({ fullName: self.repoFullName, githubRepoId: 1234n }),
    },
    // A the $transaction (a the persist-then-publish boundary). A the mock
    // runs a the callback synchronously against a the same db.
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(dbClient),
  } as unknown as DbClient;

  return { dbClient, state, self };
}

// ---------------------------------------------------------------------------
// A the deps builder — a the seams injected.
// ---------------------------------------------------------------------------

interface ProviderSpies {
  deep: MockAdapter;
  security?: MockAdapter;
}

function makeDeps(cfg: {
  db: DbClient;
  scenario: "good" | "down";
  publisher?: MockGithubPublisher;
  spies?: ProviderSpies;
}): WorkerDeps & { deepCalls: number; securityCalls: number } {
  const deep =
    cfg.spies?.deep ??
    new MockAdapter(cfg.scenario);
  const security =
    cfg.spies?.security ??
    new MockAdapter(cfg.scenario);
  return {
    db: cfg.db,
    redis: {} as never, // a the handler doesn't touch redis (a the lock is in queues.ts)
    github: { fetchPRDiff: async () => PR_DIFF },
    aiProviders: {
      "deep-review": deep,
      "security-review": security,
    },
    publisher: cfg.publisher ?? new MockGithubPublisher(),
    confidenceFloor: 0.6,
    maxFiles: 60,
    maxLines: 3000,
    promptVersion: "test-v1",
    get deepCalls() {
      return deep.callCount;
    },
    get securityCalls() {
      return security.callCount;
    },
  };
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

describe("a the review-job handler (M5 T5.1/T5.2/T5.3)", () => {
  it("[1] a quota-exceeded job → skipped, zero provider calls, notice posted", async () => {
    // A the org is over its plan's reviews-per-month cap.
    const { dbClient, state } = makeMockDb({
      orgPlan: "FREE",
      monthlyUsage: [{ orgId: "org-1", reviewCount: FREE_QUOTA.reviewsPerMonth, estUsdCost: "0" }],
    });
    const publisher = new MockGithubPublisher();
    const deps = makeDeps({ db: dbClient, scenario: "good", publisher });

    const result = await runReviewJob(deps, PAYLOAD);

    expect(result.status).toBe("SKIPPED");
    expect(result.skipReason).toBe("quota_exceeded");
    // A zero AI provider calls (NFR-18 / AC-402).
    expect(deps.deepCalls).toBe(0);
    expect(deps.securityCalls).toBe(0);
    expect(result.usage.inputTokens).toBe(0);
    expect(result.usage.outputTokens).toBe(0);
    expect(result.findings.length).toBe(0);
    // A the skip is persisted (a the "never silent" rule) + a notice posted.
    expect(state.reviewJobs.some((j) => j.status === "SKIPPED")).toBe(true);
    expect(publisher.records.some((r) => r.summary.toLowerCase().includes("quota"))).toBe(true);
  });

  it("[2] a provider-down job → partial status, deterministic findings still publish", async () => {
    const { dbClient, state } = makeMockDb({ orgPlan: "DEVELOPER" });
    const publisher = new MockGithubPublisher();
    const deps = makeDeps({ db: dbClient, scenario: "down", publisher });
    deps.testSleep = async () => {}; // a the provider-down path is fast (no real backoff wait)

    const result = await runReviewJob(deps, PAYLOAD);

    expect(result.status).toBe("PARTIAL");
    // A the deterministic (static) findings still publish (a ADR-005 "a a
    // provider outage still yields a useful, if partial, review").
    const staticFindings = state.findings.filter(
      (f) => f.source === "ESLINT" || f.source === "SEMGREP"
    );
    expect(staticFindings.length).toBeGreaterThan(0);
    // A the AI findings are absent (a the provider was down).
    expect(state.findings.filter((f) => f.source === "AI_DEEP").length).toBe(0);
    expect(state.findings.filter((f) => f.source === "AI_SECURITY").length).toBe(0);
    // A a the usage event records the (zero) AI cost.
    expect(state.usageEvents.length).toBe(1);
    expect(Number(state.usageEvents[0].estUsdCost)).toBe(0);
    // A a the publish happened (a the partial review is posted).
    expect(publisher.records.length).toBe(1);
    expect(publisher.records[0].summary.toLowerCase()).toContain("unavailable");
  });

  it("[3] a same-SHA redelivery → no-op (a the idempotency gate, ADR-007)", async () => {
    const { dbClient, state } = makeMockDb({
      orgPlan: "DEVELOPER",
      existingTerminalJob: true,
      existingPublishedReviewId: "gh-review-123",
      monthlyUsage: [{ orgId: "org-1", reviewCount: 1, estUsdCost: "0.01" }],
    });
    const publisher = new MockGithubPublisher();
    const deps = makeDeps({ db: dbClient, scenario: "good", publisher });

    const result = await runReviewJob(deps, PAYLOAD);

    expect(result.status).toBe("SKIPPED");
    expect(result.skipReason).toBe("same_sha");
    // A a no-op: no findings, no usage, no provider call, no publish.
    expect(state.findings.length).toBe(0);
    expect(state.usageEvents.length).toBe(0);
    expect(deps.deepCalls).toBe(0);
    expect(deps.securityCalls).toBe(0);
    expect(publisher.records.length).toBe(0);
  });

  it("[4] a publish failure → findings still persisted (a persist-then-publish)", async () => {
    const { dbClient, state } = makeMockDb({ orgPlan: "DEVELOPER" });
    const publisher = new MockGithubPublisher();
    publisher.failNext = () => new Error("GitHub 429 rate-limited");
    const deps = makeDeps({ db: dbClient, scenario: "good", publisher });

    const result = await runReviewJob(deps, PAYLOAD);

    expect(result.status).toBe("SUCCEEDED");
    // A a the findings + a the usage event are persisted (a the commit
    // happened BEFORE a the publish; a a failed publish does not roll back
    // a the stored review, ERROR_HANDLING.md §6).
    expect(state.findings.length).toBeGreaterThan(0);
    expect(state.usageEvents.length).toBe(1);
    // A a the publish failed, so no published review id is stored.
    expect(state.reviewJobs[0]?.publishedGithubReviewId).toBeUndefined();
    expect(publisher.records.length).toBe(0);
  });
});

describe("checkQuota (a the single enforcement point, plans.ts + usage_events)", () => {
  it("is over when a the monthly reviews hit a the plan cap", async () => {
    const { dbClient } = makeMockDb({
      orgPlan: "FREE",
      monthlyUsage: [{ orgId: "org-1", reviewCount: FREE_QUOTA.reviewsPerMonth, estUsdCost: "0" }],
    });
    const res = await checkQuotaPlan(dbClient, "org-1", "free", "2026-01");
    expect(res.over).toBe(true);
  });

  it("is not over when under a the cap", async () => {
    const { dbClient } = makeMockDb({
      orgPlan: "FREE",
      monthlyUsage: [{ orgId: "org-1", reviewCount: FREE_QUOTA.reviewsPerMonth - 1, estUsdCost: "0" }],
    });
    const res = await checkQuotaPlan(dbClient, "org-1", "free", "2026-01");
    expect(res.over).toBe(false);
  });

  it("is over when a the token-spend cap is reached", async () => {
    const { dbClient } = makeMockDb({
      orgPlan: "FREE",
      monthlyUsage: [{ orgId: "org-1", reviewCount: 1, estUsdCost: String(FREE_QUOTA.tokenSpendCapMonthlyUsd) }],
    });
    const res = await checkQuotaPlan(dbClient, "org-1", "free", "2026-01");
    expect(res.over).toBe(true);
  });

  it("developer plan has a separate cap (DEVELOPER_QUOTA)", async () => {
    const { dbClient } = makeMockDb({
      orgPlan: "DEVELOPER",
      monthlyUsage: [
        {
          orgId: "org-1",
          reviewCount: DEVELOPER_QUOTA.reviewsPerMonth,
          estUsdCost: "0",
        },
      ],
    });
    const res = await checkQuotaPlan(dbClient, "org-1", "developer", "2026-01");
    expect(res.over).toBe(true);
  });
});

describe("a the pure pipeline stages (a the policy-engine-backed functions)", () => {
  it("a dedup collapses (file,line,category) to a the highest-confidence", () => {
    const out = dedupFindings([
      mkFinding({ confidence: 0.7 }),
      mkFinding({ confidence: 0.9 }),
      mkFinding({ confidence: 0.5 }),
    ]);
    expect(out.deduped.length).toBe(1);
    expect(out.deduped[0].confidence).toBe(0.9);
    expect(out.droppedDeduped).toBe(2);
  });

  it("a policy exempts static findings from a the confidence floor", () => {
    const policy = resolveWorkerPolicy({
      defaults: { confidenceFloor: 0.6, maxFiles: 60, maxLines: 3000, suppressCategories: [] },
    });
    const out = applyPolicy(
      [
        mkFinding({ source: "eslint", confidence: 0.1 }), // a static, exempt
        mkFinding({ source: "ai-deep", confidence: 0.5 }), // a below a the 0.6 floor
      ],
      policy,
      []
    );
    expect(out.published.length).toBe(1);
    expect(out.published[0].source).toBe("eslint");
    expect(out.belowFloor).toBe(1);
  });

  it("a policy applies per-repo suppression + a confidence floor override", () => {
    const policy = resolveWorkerPolicy({
      defaults: { confidenceFloor: 0.6, maxFiles: 60, maxLines: 3000, suppressCategories: [] },
    });
    const out = applyPolicy(
      [
        mkFinding({ source: "eslint", confidence: 1, category: "security" }),
        mkFinding({ source: "ai-deep", confidence: 0.9, category: "performance" }),
      ],
      policy,
      [{ suppressCategories: ["security"], confidenceFloorOverride: 0.8 }]
    );
    // A the security finding is suppressed; a the performance (0.9 ≥ 0.8) survives.
    expect(out.published.length).toBe(1);
    expect(out.published[0].category).toBe("performance");
    expect(out.suppressedByRule).toBe(1);
  });

  it("a validate demotes a finding whose line isn't in a the diff's added ranges", () => {
    const changeSet = parseUnifiedDiff(fixtureDiff);
    const out = validateFindings(
      [
        // a line 2 is a the first added line in src/alpha.ts (a the
        // `+secret = ...`).
        mkFinding({ file: "src/alpha.ts", line: 2, source: "eslint", confidence: 1 }),
        // a line 99 is not in the diff → a anchor_failed.
        mkFinding({ file: "src/alpha.ts", line: 99, source: "ai-deep", confidence: 0.9 }),
      ],
      changeSet
    );
    expect(out.dropped.invalidAnchor).toBe(1);
    expect(out.dropped.invalid).toBe(0);
    expect(out.valid.find((f) => f.line === 99)?.anchorStatus).toBe("anchor_failed");
    expect(out.valid.find((f) => f.line === 2)?.anchorStatus).toBe("inline");
  });

  it("a validate drops a schema-invalid finding (a bad enum)", () => {
    const changeSet = parseUnifiedDiff(fixtureDiff);
    const out = validateFindings(
      [
        mkFinding({ file: "src/alpha.ts", line: 2, source: "eslint", confidence: 1 }),
        { ...mkFinding({ file: "src/alpha.ts", line: 2, source: "eslint", confidence: 1.5 }) },
      ],
      changeSet
    );
    expect(out.dropped.invalid).toBe(1); // a confidence 1.5 is out of [0,1]
  });

  it("a validate drops a finding with a bad severity enum", () => {
    const changeSet = parseUnifiedDiff(fixtureDiff);
    const out = validateFindings(
      [
        {
          ...mkFinding({ file: "src/alpha.ts", line: 2, source: "eslint", confidence: 1 }),
          severity: "invalid" as never,
        },
      ],
      changeSet
    );
    expect(out.dropped.invalid).toBe(1);
    expect(out.valid.length).toBe(0);
  });
});

describe("a the in-memory diff-client seam (USE_MOCK_GITHUB=true path)", () => {
  it("a reads a the fixture diff + a the mock publisher records publishes", async () => {
    const { dbClient } = makeMockDb({ orgPlan: "DEVELOPER" });
    const publisher = new MockGithubPublisher();
    const deps = makeDeps({ db: dbClient, scenario: "good", publisher });
    const result = await runReviewJob(deps, PAYLOAD);
    expect(result.status).toBe("SUCCEEDED");
    expect(publisher.records.length).toBe(1);
    expect(publisher.records[0].publishedGithubReviewId).toMatch(/^mock-review-/);
  });
});

function mkFinding(partial: {
  id?: string;
  source?: string;
  file?: string;
  line?: number;
  severity?: string;
  category?: string;
  title?: string;
  description?: string;
  suggestedFix?: string;
  confidence?: number;
}): CanonicalFinding {
  return {
    id: partial.id ?? "f-test",
    source: (partial.source ?? "ai-deep") as never,
    file: partial.file ?? "src/alpha.ts",
    line: partial.line ?? 2,
    severity: (partial.severity ?? "high") as never,
    category: (partial.category ?? "security") as never,
    title: partial.title ?? "t",
    description: partial.description ?? "d",
    suggestedFix: partial.suggestedFix,
    confidence: partial.confidence ?? 0.8,
    anchorStatus: "inline",
  };
}

export type { ReviewJobOutcome };
