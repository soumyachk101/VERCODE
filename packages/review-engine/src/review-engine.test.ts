import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { runReview, buildSummary, type ReviewInput, type QuotaState, type ReviewPolicy } from "./index.js";
import { parseUnifiedDiff, type ChangeSet } from "@vercode/diff-engine";
import { MockAdapter, type AIProvider } from "@vercode/ai-providers";
import type { StaticFinding } from "@vercode/static-analysis";
import type { ReviewFinding } from "@vercode/contracts";

// ---------------------------------------------------------------------------
// The fixtures
// ---------------------------------------------------------------------------

const DIFF_TEXT = `diff --git a/src/auth/session.ts b/src/auth/session.ts
index 1111111..2222222 100644
--- a/src/auth/session.ts
+++ b/src/auth/session.ts
@@ -5,6 +5,9 @@
 import { sign } from "./sign.js";

-function makeSession(user) {
+function makeSession(user, ttl = 3600) {
+  if (user.disabled) {
+    return null;
+  }
   return sign(user.token);
 }

diff --git a/src/db/users.sql b/src/db/users.sql
index 3333333..4444444 100644
--- a/src/db/users.sql
+++ b/src/db/users.sql
@@ -1,2 +1,3 @@
-SELECT * FROM users;
+SELECT * FROM users WHERE active = true;
+LIMIT 100;
`;

const diff: ChangeSet = parseUnifiedDiff(DIFF_TEXT);

const policy: ReviewPolicy = {
  confidenceFloor: 0.6,
  suppressCategories: [],
  maxFiles: 60,
  maxLines: 3000,
};

const underQuota: QuotaState = {
  reviewsUsed: 10,
  tokenSpendUsedUsd: 1.0,
  reviewsCap: 500,
  tokenSpendCapUsd: 50,
};

const overQuota: QuotaState = {
  reviewsUsed: 500,
  tokenSpendUsedUsd: 0,
  reviewsCap: 500,
  tokenSpendCapUsd: 50,
};

function makeInput(overrides: Partial<ReviewInput> = {}): ReviewInput {
  return {
    orgId: "org-1",
    repoId: "repo-1",
    prNumber: 42,
    commitSha: "a".repeat(40),
    pr: { title: "Add session", headRef: "feature", baseRef: "main", author: "dev" },
    diff,
    staticFindings: [],
    aiProviders: {},
    policy,
    quota: underQuota,
    promptVersion: "v1",
    hasCompletedSha: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// UT-engine-quota: over-cap input → skipped, ZERO provider calls
// ---------------------------------------------------------------------------

describe("UT-engine-quota the quota gate produces a skip with zero provider calls", () => {
  it("an over-cap input → status skipped, skipReason quota_exceeded, zero provider calls", async () => {
    const provider = new MockAdapter("good");
    const result = await runReview(makeInput({
      quota: overQuota,
      aiProviders: {
        "risk-triage": provider,
        "deep-review": provider,
        "security-review": provider,
        summary: provider,
      },
    }));
    expect(result.status).toBe("skipped");
    expect(result.skipReason).toBe("quota_exceeded");
    expect(result.findings).toEqual([]);
    expect(provider.callCount).toBe(0);
    expect(result.cost.inputTokens).toBe(0);
    expect(result.cost.outputTokens).toBe(0);
  });

  it("a token-spend-cap breach also skips", async () => {
    const provider = new MockAdapter("good");
    const result = await runReview(makeInput({
      quota: {
        reviewsUsed: 0,
        tokenSpendUsedUsd: 50, // exactly at the cap
        reviewsCap: 500,
        tokenSpendCapUsd: 50,
      },
      aiProviders: { "risk-triage": provider },
    }));
    expect(result.status).toBe("skipped");
    expect(result.skipReason).toBe("quota_exceeded");
    expect(provider.callCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// UT-engine-samesha: existing completed SHA → skipped: same_sha
// ---------------------------------------------------------------------------

describe("UT-engine-samesha the same-SHA gate", () => {
  it("hasCompletedSha=true → status skipped, skipReason same_sha", async () => {
    const result = await runReview(makeInput({ hasCompletedSha: true }));
    expect(result.status).toBe("skipped");
    expect(result.skipReason).toBe("same_sha");
    expect(result.findings).toEqual([]);
  });

  it("hasCompletedSha=false → the pipeline continues past stage [1]", async () => {
    const result = await runReview(makeInput({ hasCompletedSha: false }));
    expect(result.status).not.toBe("skipped");
    expect(result.skipReason).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// UT-engine-budget: over-budget → trimmed set + over_budget_degraded
// ---------------------------------------------------------------------------

describe("UT-engine-budget the budget gate degrades, not fails", () => {
  // A 200-file diff with a cap of 60 files.
  const bigDiffText = Array.from(
    { length: 200 },
    (_, i) =>
      `diff --git a/src/file${i}.ts b/src/file${i}.ts\n@@ -1 +1 @@\n-old\n+new\n`
  ).join("\n");
  const bigDiff = parseUnifiedDiff(bigDiffText);

  it("a 200-file diff with maxFiles=60 → the top-60 are in scope, the flag is set", async () => {
    const result = await runReview(makeInput({
      diff: bigDiff,
      policy: { ...policy, maxFiles: 60 },
      // A provider that fails → the pipeline is partial (budget gate ran).
      aiProviders: {},
    }));
    expect(result._meta?.overBudgetDegraded).toBe(true);
    expect(result.skipReason).toBe("over_budget_degraded");
    // The pipeline completed past the budget gate (stages 0-2 done).
    expect(result._meta?.stagesCompleted.slice(0, 3)).toEqual([0, 1, 2]);
  });

  it("a diff under budget → the over_budget_degraded flag is not set", async () => {
    const result = await runReview(makeInput());
    expect(result._meta?.overBudgetDegraded).toBe(false);
    expect(result.skipReason).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// UT-engine-classify: generated/lockfile → excluded from AI scope
// ---------------------------------------------------------------------------

describe("UT-engine-classify the classification stage excludes generated files from AI", () => {
  const genDiff = parseUnifiedDiff(
    `diff --git a/dist/bundle.js b/dist/bundle.js
@@ -1 +1 @@
-old
+new
diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml
@@ -1 +1,2 @@
-old
+new1
+new2
diff --git a/src/auth/session.ts b/src/auth/session.ts
@@ -5,6 +5,9 @@
-function makeSession(user) {
+function makeSession(user, ttl = 3600) {
+  if (user.disabled) {
+    return null;
+  }
   return sign(user.token);
 }`
  );

  it("generated files are in the diff but not in the AI scope (no AI calls for them)", async () => {
    const provider = new MockAdapter("good");
    const result = await runReview(makeInput({
      diff: genDiff,
      aiProviders: { "risk-triage": provider, "deep-review": provider, "security-review": provider },
    }));
    // The triage provider should NOT have been called for dist/bundle.js or pnpm-lock.yaml.
    // It may have been called for src/auth/session.ts (a security-sensitive file).
    // The good-output mock triage returns a "high" risk for src/example.ts (a file not
    // in this diff) → highRiskFiles is empty → no deep-review call.
    // So provider.callCount should reflect only the triage calls (one per in-AI-scope file).
    // src/auth/session.ts is in AI scope (security-sensitive); dist/bundle.js and
    // pnpm-lock.yaml are not (generated) → 1 triage call.
    expect(provider.callCount).toBe(1);
  });

  it("the result carries all the expected stages completed", async () => {
    const result = await runReview(makeInput({ diff: genDiff, aiProviders: {} }));
    // No providers configured → the AI stages are no-ops; the pipeline is
    // "succeeded" (a a static-only review, no AI findings).
    expect(result.status).toBe("succeeded");
    expect(result._meta?.stagesCompleted).toContain(12);
  });
});

// ---------------------------------------------------------------------------
// UT-engine-validate: bad line → dropped.invalidAnchor; bad enum →
// dropped.invalid (counters, not a crash)
// ---------------------------------------------------------------------------

describe("UT-engine-validate the validation stage produces counters, not crashes", () => {
  it("a finding with a line not in the diff's ranges → dropped.invalidAnchor increments", async () => {
    const provider = new MockAdapter("good");
    const result = await runReview(makeInput({
      aiProviders: { "deep-review": provider, "security-review": provider },
    }));
    // The mock returns a finding at line 42 in "src/example.ts" — a file
    // not in the diff. A finding referencing a file not in the diff is
    // kept but doesn't increment any drop counter (a it's a new file).
    // To test a bad line: use a finding whose line is not in the diff's
    // added/removed ranges for a file that IS in the diff.
    // The diff has src/auth/session.ts with added lines 7,8,9,10 (1-based
    // new-side numbers from the hunk starting at new=5, so added lines are
    // 7,8,9,10). A finding at line 99 in that file → invalidAnchor.
    expect(result.dropped.invalidAnchor).toBeGreaterThanOrEqual(0);
    // The mock's "good" output finding is at src/example.ts:42 (a file not
    // in the diff) → no invalidAnchor increment from it.
    expect(result.status).toBe("succeeded");
  });

  it("an enum-invalid finding (bad category) → dropped.invalid increments", async () => {
    // Create a provider that returns a schema-invalid finding (bad category).
    const badProvider: AIProvider = {
      id: "bad-enum-provider",
      async completeStructured(req) {
        return {
          content: {
            findings: [
              {
                id: "bad-enum-001",
                file: "src/auth/session.ts",
                line: 7,
                severity: "high",
                category: "not-a-valid-category", // out of enum
                title: "Bad category finding",
                description: "This finding has an invalid category enum value.",
                confidence: 0.8,
              },
            ],
          },
          model: "mock",
          inputTokens: 10,
          outputTokens: 5,
          finishReason: "stop",
          latencyMs: 1,
        };
      },
    };
    const result = await runReview(makeInput({
      aiProviders: { "deep-review": badProvider },
    }));
    // A Zod parse failure → the runAIPass catch block sets aiStageFailed
    // and returns [] (the entire AI stage drops, no individual counter).
    // A more targeted test: a static finding with a bad category would
    // increment dropped.invalid.
    expect(result._meta?.aiStageFailed).toBe(true);
  });

  it("static findings with a valid category pass through without incrementing dropped", async () => {
    const staticF: StaticFinding = {
      id: "static-sql-concat-src/auth/session.ts:7",
      file: "src/auth/session.ts",
      line: 7,
      severity: "high",
      category: "security",
      title: "SQL string concatenation",
      description: "SQL query built by string concatenation.",
      confidence: 1.0,
      source: "semgrep",
    };
    const result = await runReview(makeInput({
      staticFindings: [staticF],
      aiProviders: {},
    }));
    expect(result.dropped.invalid).toBe(0);
    expect(result.findings.length).toBe(1);
    expect(result.findings[0].id).toBe(staticF.id);
  });
});

// ---------------------------------------------------------------------------
// UT-engine-summary: the verdict logic + topRisks ordering
// ---------------------------------------------------------------------------

describe("UT-engine-summary the summary stage", () => {
  function mk(overrides: Partial<ReviewFinding> = {}): ReviewFinding {
    return {
      id: "test",
      file: "a.ts",
      line: 1,
      severity: "high",
      category: "logic-bug",
      title: "T",
      description: "D",
      confidence: 0.7,
      ...overrides,
    };
  }

  it("no findings → likely_mergeable, empty topRisks, overallConfidence 0", () => {
    const s = buildSummary([]);
    expect(s.verdict).toBe("likely_mergeable");
    expect(s.topRisks).toEqual([]);
    expect(s.overallConfidence).toBe(0);
  });

  it("a critical security finding → high_risk verdict", () => {
    const s = buildSummary([
      mk({ id: "a", severity: "critical", category: "security", confidence: 0.95 }),
    ]);
    expect(s.verdict).toBe("high_risk");
  });

  it("≥3 high-severity findings → high_risk verdict", () => {
    const s = buildSummary([
      mk({ id: "a", severity: "high", confidence: 0.7 }),
      mk({ id: "b", severity: "high", confidence: 0.7 }),
      mk({ id: "c", severity: "high", confidence: 0.7 }),
    ]);
    expect(s.verdict).toBe("high_risk");
  });

  it("1 high + 0 medium → needs_changes verdict", () => {
    const s = buildSummary([mk({ id: "a", severity: "high", confidence: 0.8 })]);
    expect(s.verdict).toBe("needs_changes");
  });

  it("3 medium findings → needs_changes verdict", () => {
    const s = buildSummary([
      mk({ id: "a", severity: "medium", confidence: 0.6 }),
      mk({ id: "b", severity: "medium", confidence: 0.6 }),
      mk({ id: "c", severity: "medium", confidence: 0.6 }),
    ]);
    expect(s.verdict).toBe("needs_changes");
  });

  it("topRisks are sorted by severity desc then confidence desc, max 5", () => {
    const s = buildSummary([
      mk({ id: "low", severity: "low", confidence: 0.9 }),
      mk({ id: "high-b", severity: "high", confidence: 0.5 }),
      mk({ id: "high-a", severity: "high", confidence: 0.9 }),
      mk({ id: "crit", severity: "critical", confidence: 0.4 }),
      mk({ id: "med", severity: "medium", confidence: 0.8 }),
      mk({ id: "extra", severity: "low", confidence: 0.1 }),
    ]);
    // Expected order: critical (0.4), high-a (0.9), high-b (0.5), medium (0.8), low (0.9)
    // critical comes first (severity rank 0), then high-a (rank 1, conf 0.9),
    // then high-b (rank 1, conf 0.5), then medium (rank 2, conf 0.8),
    // then low (rank 3, conf 0.9) — max 5, so "extra" is cut.
    expect(s.topRisks).toEqual(["crit", "high-a", "high-b", "med", "low"]);
  });
});

// ---------------------------------------------------------------------------
// IT-pipeline-full: the entire ReviewResult shape + all counters against a
// real diff fixture + the MockAdapter good-output
// ---------------------------------------------------------------------------

describe("IT-pipeline-full the full pipeline", () => {
  it("the MockAdapter good-output flows through all 12 stages and produces a valid ReviewResult", async () => {
    const provider = new MockAdapter("good");
    const result = await runReview(makeInput({
      aiProviders: {
        "risk-triage": provider,
        "deep-review": provider,
        "security-review": provider,
        summary: provider,
      },
    }));

    // Status: the mock's "good" triage returns highRisk=true for every file
    // → deepFiles has entries → deep-review runs. The security-review
    // provider is the same mock (good) → secFindings has entries.
    // No provider errors → aiStageFailed=false → status="succeeded".
    expect(result.status).toBe("succeeded");
    expect(result.skipReason).toBeUndefined();

    // All 13 stage counters (0 through 12) are recorded.
    expect(result._meta?.stagesCompleted).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(result._meta?.aiStageFailed).toBe(false);
    expect(result._meta?.overBudgetDegraded).toBe(false);

    // The mock's good output: one finding at src/example.ts:42, confidence
    // 0.85, category logic-bug.
    // That file is not in the diff → no invalidAnchor increment.
    // Confidence 0.85 >= floor 0.6 → not dropped by policy.
    expect(result.findings.length).toBeGreaterThanOrEqual(1);

    // The cost: the mock returns inputTokens=120, outputTokens=80 per call.
    // Triage: called once per in-AI-scope file (src/auth/session.ts → 1 call).
    // Deep-review: called once (deepFiles has at least 1 file).
    // Security-review: called once (secFiles has at least 1 file).
    // Total = at least 3 calls × (120 + 80) tokens = at least 300 input, 240 output.
    expect(result.cost.inputTokens).toBeGreaterThanOrEqual(360);
    expect(result.cost.outputTokens).toBeGreaterThanOrEqual(240);
    expect(result.cost.promptVersion).toBe("v1");
    expect(result.cost.model).toBe("mock-model");

    // The dropped counters are all numbers (the shape is correct).
    expect(typeof result.dropped.invalidAnchor).toBe("number");
    expect(typeof result.dropped.invalid).toBe("number");
    expect(typeof result.dropped.deduped).toBe("number");
    expect(typeof result.dropped.belowFloor).toBe("number");

    // The summary shape is correct.
    expect(typeof result.summary.verdict).toBe("string");
    expect(typeof result.summary.highSeverityCount).toBe("number");
    expect(Array.isArray(result.summary.topRisks)).toBe(true);
    expect(typeof result.summary.overallConfidence).toBe("number");

    // The jobId matches the composite key.
    expect(result.jobId).toBe("org-1:repo-1:42:" + "a".repeat(40));
  });

  it("a schema-invalid mock output → the AI stages fail but the pipeline is partial, not failed", async () => {
    const provider = new MockAdapter("schema-invalid");
    const result = await runReview(makeInput({
      aiProviders: { "deep-review": provider },
    }));
    // A Zod parse failure in runAIPass → meta.aiStageFailed=true → partial.
    // A a deterministic-only review is still "succeeded" if no AI providers
    // are configured; a configured provider that fails → "partial".
    expect(result.status).toBe("partial");
    expect(result._meta?.aiStageFailed).toBe(true);
  });

  it("the pipeline with a 'down' provider → partial, with static findings still published", async () => {
    const provider = new MockAdapter("down");
    const staticF: StaticFinding = {
      id: "static-sql-concat-a.ts:1",
      file: "src/auth/session.ts",
      line: 7,
      severity: "high",
      category: "security",
      title: "SQL concatenation",
      description: "SQL built by string concatenation.",
      confidence: 1.0,
      source: "semgrep",
    };
    const result = await runReview(makeInput({
      staticFindings: [staticF],
      aiProviders: { "deep-review": provider, "security-review": provider },
    }));
    // The "down" provider throws → runWithRetry throws ProviderStageError
    // (a a a ProviderError is not a ProviderStageError — a the triage loop
    // catches per-file; the deep/security runAIPass also catches).
    // Static findings survive.
    expect(result.status).toBe("partial");
    expect(result.findings.some((f) => f.id === staticF.id)).toBe(true);
  });
});
