// UT-review-* (M5 T5.1/T5.2/T5.3) — the review-job handler's invariants.
//
// A mocked-DB + mocked-provider test: no live Postgres/Redis/GitHub. The DB
// is a structural mock that records what the persist-then-publish transaction
// wrote, so we can assert the invariants:
//   1. quota-exceeded → skipped, zero provider calls, notice posted
//   2. provider-down → partial status, deterministic findings still publish
//   3. same-SHA redelivery → no-op
//   4. publish failure → findings still persisted (a the persist-then-publish
//      invariant, ERROR_HANDLING.md §6)
//
// The pipeline is exercised end-to-end (dequeue → load → diff → static → AI →
// validate → dedup → policy → summary → PERSIST → publish) with the seams
// injected, so a regression in any stage is caught here.

import { describe, it, expect, beforeEach } from "vitest";
import {
  runReviewJob,
  checkQuota,
  type ReviewJobOutcome,
} from "./jobs/review.js";
import { localDiffEngine, localStaticAnalyzer, MockAiProvider, FailingAiProvider } from "./adapters/local.js";
import { makeMockGithubClient, MockGithubPublisher } from "./adapters/github-mock.js";
import type { WorkerDeps, ReviewJobPayload } from "./config.js";
import type { DbClient } from "@vercode/database";
import type { PRDiff } from "@vercode/github";
import { FREE_QUOTA, DEVELOPER_QUOTA } from "@vercode/contracts";

// ---------------------------------------------------------------------------
// The mock DB — records the transaction writes, so the tests can assert the
// persist step without a live Postgres.
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
  inputTokens: number;
  outputTokens: number;
  estUsdCost: string;
  model?: string;
  reviewCount?: number;
}

interface MockDb {
  reviewJobs: RecordedJob[];
  findings: RecordedFinding[];
  usageEvents: RecordedUsage[];
  skipNoticePosted: boolean;
  // The config the handler reads.
  orgPlan: "free" | "developer" | "team" | "enterprise";
  monthlyUsage: RecordedUsage[]; // pre-existing usage (for the quota gate)
  existingTerminalJob: boolean; // a the same-SHA idempotency gate
  repoFullName: string;
  suppressCategories: string[];
  confidenceFloorOverride: number | null;
}

const PR_DIFF: PRDiff = {
  diff: fixtureDiff,
  prNumber: 42,
  title: "Test PR",
  headSha: "a".repeat(40),
  baseRef: "main",
};

// A the diff fixture (a two-file PR) — a the mock github client returns this
// (a the real test would read tests/fixtures, but the handler's github seam is
// injected directly here, so the fixture is inlined for determinism).
const fixtureDiff = `diff --git a/src/alpha.ts b/src/alpha.ts
index 0000000..1111111 100644
--- a/src/alpha.ts
+++ b/src/alpha.ts
@@ -1,3 +1,6 @@
 line one
+const leaked = getSecret();
+console.log(leaked);
 line two
 line three
diff --git a/src/beta.ts b/src/beta.ts
index 2222222..3333333 100644
--- a/src/beta.ts
+++ b/src/beta.ts
@@ -5,2 +5,4 @@
 keep
+const maybe = parse(x);
 keep2
`;

function makeMockDb(config: Partial<MockDb> = {}): MockDb {
  return {
    reviewJobs: [],
    findings: [],
    usageEvents: [],
    skipNoticePosted: false,
    orgPlan: "developer",
    monthlyUsage: [],
    existingTerminalJob: false,
    repoFullName: "acme/web",
    suppressCategories: [],
    confidenceFloorOverride: null,
    ...config,
  };
}

/** Build the DbClient-shaped mock the handler consumes. */
function asDbClient(db: MockDb): DbClient {
  const month = new Date().toISOString().slice(0, 7);
  const self = db;
  const dbClient = {
    organization: {
      findFirst: async () => ({
        id: "org-1",
        plan: self.orgPlan,
        status: "ACTIVE",
        settings: null,
      }),
    },
    repoRule: {
      findMany: async () =>
        self.suppressCategories.length > 0
          ? [{ suppressCategories: self.suppressCategories, confidenceFloorOverride: self.confidenceFloorOverride }]
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
          };
        }
        return null;
      },
      create: async (args: { data: Record<string, unknown> }) => {
        const rec: RecordedJob = { status: args.data.status as string };
        self.reviewJobs.push(rec);
        return { id: "job-1", ...args.data };
      },
      update: async (args: { data: Record<string, unknown> }) => {
        if (args.data.publishedGithubReviewId) {
          const last = self.reviewJobs[self.reviewJobs.length - 1];
          if (last) last.publishedGithubReviewId = args.data.publishedGithubReviewId as string;
        }
        return { id: "job-1", ...args.data };
      },
    },
    reviewFinding: {
      create: async (args: { data: Record<string, unknown> }) => {
        self.findings.push({
          source: args.data.source,
          file: args.data.file,
          line: args.data.line,
          severity: args.data.severity,
          category: args.data.category,
          title: args.data.title,
          confidence: Number(args.data.confidence),
          anchorStatus: args.data.anchorStatus,
        });
        return args.data;
      },
    },
    usageEvent: {
      aggregate: async () => {
        // A the pre-existing monthly usage (a the quota gate reads this).
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
        self.usageEvents.push({
          orgId: args.data.orgId,
          jobId: args.data.jobId,
          inputTokens: args.data.inputTokens,
          outputTokens: args.data.outputTokens,
          estUsdCost: String(args.data.estUsdCost),
          model: args.data.model,
          reviewCount: args.data.reviewCount,
        });
        return args.data;
      },
    },
    githubRepo: {
      findFirst: async () => ({
        fullName: self.repoFullName,
        githubRepoId: 1234n,
      }),
    },
    // The $transaction (a the persist-then-publish boundary). The mock runs
    // the callback synchronously against the same db, so a commit = the
    // recorded writes.
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn(dbClient);
    },
  } as unknown as DbClient;
}

// ---------------------------------------------------------------------------
// The deps builder — the seams injected.
// ---------------------------------------------------------------------------

interface DepsConfig {
  db: MockDb;
  /** "mock" = a working provider; "fail" = a provider that always throws. */
  provider: "mock" | "fail";
  publisher?: MockGithubPublisher;
}

function makeDeps(cfg: DepsConfig): WorkerDeps {
  const dbClient = asDbClient(cfg.db);
  const publisher = cfg.publisher ?? new MockGithubPublisher();
  const providerFactory = (diff: PRDiff) =>
    cfg.provider === "fail" ? new FailingAiProvider() : new MockAiProvider(diff);
  return {
    db: dbClient,
    redis: {} as never, // a the handler doesn't touch redis (a the lock is in queues.ts)
    github: { fetchPRDiff: async () => PR_DIFF },
    staticAnalyzer: localStaticAnalyzer,
    aiProviderFactories: [providerFactory, providerFactory],
    diffEngine: localDiffEngine,
    publisher,
    providerPreference: "mock",
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
// The tests
// ---------------------------------------------------------------------------

describe("the review-job handler (M5 T5.1/T5.2/T5.3)", () => {
  it("[1] a quota-exceeded job → skipped, zero provider calls, notice posted", async () => {
    // A the org is over its plan's reviews-per-month cap (a the pre-existing
    // usage equals the cap).
    const db = makeMockDb({
      orgPlan: "free",
      monthlyUsage: [{ orgId: "org-1", reviewCount: FREE_QUOTA.reviewsPerMonth, estUsdCost: "0" }],
    });
    const publisher = new MockGithubPublisher();
    const deps = makeDeps({ db, provider: "mock", publisher });

    // A guard: the provider must NOT be called (a zero AI tokens, AC-402).
    let providerCalls = 0;
    const origFactory = deps.aiProviderFactories[0];
    deps.aiProviderFactories = [
      (diff) => {
        providerCalls += 1;
        return origFactory(diff);
      },
      deps.aiProviderFactories[1],
    ];

    const result = await runReviewJob(deps, PAYLOAD);

    expect(result.status).toBe("SKIPPED");
    expect(result.skipReason).toBe("quota_exceeded");
    expect(providerCalls).toBe(0); // a zero AI tokens consumed
    expect(result.usage.inputTokens).toBe(0);
    expect(result.usage.outputTokens).toBe(0);
    // A the skip is persisted (a the "never silent" rule) + a notice posted.
    expect(db.reviewJobs.some((j) => j.status === "SKIPPED")).toBe(true);
    expect(publisher.records.some((r) => r.summary.includes("quota"))).toBe(true);
  });

  it("[2] a provider-down job → partial status, deterministic findings published", async () => {
    const db = makeMockDb({ orgPlan: "developer" });
    const publisher = new MockGithubPublisher();
    const deps = makeDeps({ db, provider: "fail", publisher });

    const result = await runReviewJob(deps, PAYLOAD);

    expect(result.status).toBe("PARTIAL");
    // A the deterministic (static) findings still publish (a ADR-005 "a a
    // provider outage still yields a useful, if partial, review").
    const staticFindings = db.findings.filter((f) => f.source === "ESLINT");
    expect(staticFindings.length).toBeGreaterThan(0);
    // A the AI findings are absent (a the provider was down).
    expect(db.findings.filter((f) => f.source === "AI_DEEP").length).toBe(0);
    // A a the publish happened (a the partial review is posted).
    expect(publisher.records.length).toBeGreaterThan(0);
    expect(publisher.records[0].summary.toLowerCase()).toContain("degraded");
  });

  it("[3] a same-SHA redelivery → no-op (a the idempotency gate, ADR-007)", async () => {
    // A a completed job already exists for this key.
    const db = makeMockDb({
      orgPlan: "developer",
      existingTerminalJob: true,
      // A a the quota is fine, so the gate that fires is the idempotency one.
      monthlyUsage: [{ orgId: "org-1", reviewCount: 1, estUsdCost: "0.01" }],
    });
    const publisher = new MockGithubPublisher();
    const deps = makeDeps({ db, provider: "mock", publisher });

    const result = await runReviewJob(deps, PAYLOAD);

    expect(result.status).toBe("SKIPPED");
    expect(result.skipReason).toBe("same_sha");
    // A a no-op: no findings, no usage, no publish.
    expect(db.findings.length).toBe(0);
    expect(db.usageEvents.length).toBe(0);
    expect(publisher.records.length).toBe(0);
  });

  it("[4] a publish failure → findings still persisted (a persist-then-publish)", async () => {
    const db = makeMockDb({ orgPlan: "developer" });
    // A a publisher that throws (a a GitHub 429/422/404).
    const publisher = new MockGithubPublisher();
    publisher.failNext = () => new Error("GitHub 429 rate-limited");
    const deps = makeDeps({ db, provider: "mock", publisher });

    const result = await runReviewJob(deps, PAYLOAD);

    expect(result.status).toBe("SUCCEEDED");
    // A a the findings + the usage event are persisted (a the commit happened
    // BEFORE the publish; a a failed publish does not roll back the stored
    // review, ERROR_HANDLING.md §6).
    expect(db.findings.length).toBeGreaterThan(0);
    expect(db.usageEvents.length).toBe(1);
    // A a the publish failed, so no published review id is stored.
    expect(db.reviewJobs[0]?.publishedGithubReviewId).toBeUndefined();
    expect(publisher.records.length).toBe(0); // a the publish didn't succeed
  });
});

describe("checkQuota (a the single enforcement point, plans.ts + usage_events)", () => {
  it("is over when the monthly reviews hit the plan cap", async () => {
    const db = makeMockDb({
      orgPlan: "free",
      monthlyUsage: [{ orgId: "org-1", reviewCount: FREE_QUOTA.reviewsPerMonth, estUsdCost: "0" }],
    });
    const res = await checkQuota(asDbClient(db), { id: "org-1", plan: "free" }, "2026-01");
    expect(res.over).toBe(true);
  });

  it("is not over when under the cap", async () => {
    const db = makeMockDb({
      orgPlan: "free",
      monthlyUsage: [{ orgId: "org-1", reviewCount: FREE_QUOTA.reviewsPerMonth - 1, estUsdCost: "0" }],
    });
    const res = await checkQuota(asDbClient(db), { id: "org-1", plan: "free" }, "2026-01");
    expect(res.over).toBe(false);
  });
});

describe("the pure pipeline stages", () => {
  // A re-import for the pure-stage assertions (a the dedup / policy / validate).
  it("a the dedup collapses (file,line,category) to the highest-confidence", async () => {
    const { dedupFindings } = await import("./jobs/review.js");
    const out = dedupFindings([
      mkFinding({ confidence: 0.7 }),
      mkFinding({ confidence: 0.9 }),
      mkFinding({ confidence: 0.5 }),
    ]);
    expect(out.length).toBe(1);
    expect(out[0].confidence).toBe(0.9);
  });

  it("a the policy exempts static findings from the confidence floor", async () => {
    const { applyPolicy } = await import("./jobs/review.js");
    const out = applyPolicy(
      [
        mkFinding({ source: "eslint", confidence: 0.1 }), // a static, exempt
        mkFinding({ source: "ai-deep", confidence: 0.5 }), // a below the 0.6 floor
      ],
      0.6,
      []
    );
    expect(out.published.length).toBe(1);
    expect(out.published[0].source).toBe("eslint");
    expect(out.suppressedBelowFloor).toBe(1);
  });

  it("a the validate drops a finding whose line isn't in the diff's added ranges", async () => {
    const { validateFindings } = await import("./jobs/review.js");
    const ctx = localDiffEngine.analyze(PR_DIFF);
    const out = validateFindings([
      mkFinding({ file: "src/alpha.ts", line: 2, source: "eslint", confidence: 1 }), // a in the added ranges (a line 2 is added)
      mkFinding({ file: "src/alpha.ts", line: 99, source: "ai-deep", confidence: 0.9 }), // a not in the diff → anchor_failed
    ], ctx);
    expect(out.dropped.invalidAnchor).toBe(1);
    expect(out.valid.find((f) => f.line === 99)?.anchorStatus).toBe("anchor_failed");
  });
});

function mkFinding(partial: {
  source?: string;
  file?: string;
  line?: number;
  severity?: string;
  category?: string;
  title?: string;
  description?: string;
  confidence?: number;
  suggestedFix?: string;
}): import("./jobs/review.js").CanonicalFinding {
  return {
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
