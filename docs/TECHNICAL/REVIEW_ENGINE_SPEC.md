# VERCODE — Review Engine Specification

The review engine (`packages/review-engine`) is the orchestration core. This spec is the *deterministic contract*: given a `(org, repo, pr, sha)`, it produces a `ReviewResult` with exact stages, gates, and side-effect boundaries.

## 1. Inputs / outputs

```ts
interface ReviewInput {
  orgId: string; repoId: string; prNumber: number; commitSha: string;
  pr: PRMetadata;               // fetched by the worker (head/ref, base/ref, state, author)
  diff: ChangeSet;             // diff-engine output (files, hunks, added/removed line maps)
  context: FileContext[];      // bounded 1-hop context (FR-401)
  staticFindings: Finding[];   // from static-analysis (deterministic)
  policy: ReviewPolicy;        // resolved org+repo policy (floors, suppressions, budgets)
  quota: QuotaState;          // monthly review-count + token-spend vs plan
}

interface ReviewResult {
  jobId: string;
  status: "succeeded" | "partial" | "skipped";
  summary: ReviewSummary;     // contracts
  findings: Finding[];        // post-policy, post-dedup, post-validation
  dropped: { invalidAnchor: number; invalid: number; deduped: number; belowFloor: number };
  cost: { inputTokens: number; outputTokens: number; estUsd: number; model: string; promptVersion: string };
  skipReason?: "quota_exceeded" | "same_sha" | "install_removed" | "pr_closed" | "over_budget_degraded";
}
```

**The engine has no I/O side effects of its own** (ADR-001 boundary). It *returns* `ReviewResult`; the worker persists it (Postgres) and publishes it (GitHub). This makes the engine trivially unit-testable and the worker the only I/O boundary.

## 2. Pipeline stages (ordered, with gates)

```
[0] Pre-flight quota gate
    quota.check(org, month)
      over reviews OR over token cap → status "skipped", skipReason "quota_exceeded", summary = "quota notice"
      (no AI tokens consumed; AC-402)

[1] Same-SHA idempotency gate
    repo.lastReviewed(sha) exists & succeeded → status "skipped", skipReason "same_sha"
    (AC-202; content-hash short-circuit is P1, ADR-007)

[2] Budget gate (NFR-19)
    if diff.files > policy.maxFiles OR diff.lines > policy.maxLines
      → trim to highest-risk files (risk-tier order: security-sensitive > db-touching > logic-heavy > other)
      → degraded flag; note in summary; over_budget_degraded recorded

[3] File classification (cheap, deterministic)
    per file: language, risk-tier {security-sensitive, db-touching, generated, test, dependency-manifest, other}
    generated files (build output, lockfiles with churn-only) → excluded from AI, static-only

[4] Deterministic static analysis (worker already ran it; engine consumes `staticFindings`)
    findings.source = "eslint" | "semgrep"
    These are authoritative for their classes; no confidence floor, no dedup-against-AI suppression.

[5] AI risk triage (cheap model)
    per candidate file (non-generated, within budget): "worth a deep review?" → risk score
    output: Set<highRiskFiles>
    (If provider down → highRiskFiles = risk-tier-based heuristic set; pipeline continues, partial.)

[6] AI deep review (strong model, highRiskFiles only)
    completeStructured(task="deep-review", schema=FindingsSchema, model=routed)
    → raw AIFindings

[7] AI security pass (strong model, security-sensitive files only)
    completeStructured(task="security-review", schema=FindingsSchema)
    → raw SecurityFindings
    (Runs in parallel with [6] where the file sets are disjoint; merges after.)

[8] Merge
    merged = staticFindings + AIDeep + AISecurity

[9] Validate (FR-306)
    for each finding:
      line-valid: finding.line ∈ diff.addedLines[file] (or removedLines for a "removed-line" note)
      else → anchor-fallback (keep for PR-body, mark anchor_failed) OR drop (if it can't resolve at all)
      enum-valid: severity, category ∈ allowed sets; confidence ∈ [0,1]
      schema-valid: full ReviewFindingSchema.parse
    counters: dropped.invalid, dropped.invalidAnchor

[10] Dedup (FR-307)
    key = (file, line, category)
    collapse to highest-confidence survivor; prefer longer/more-specific description
    counter: dropped.deduped

[11] Policy (FR-308)
    suppress categories per-repo/org (policy.suppressions)
    confidence floor: finding.confidence ≥ policy.confidenceFloor (default 0.6)
    static findings are exempt from the confidence floor (they're deterministic)
    counter: dropped.belowFloor

[12] Summary (cheap model, or deterministic if provider down)
    verdict: high_risk (any critical/high security or ≥3 high overall)
             needs_changes (≥1 high, or ≥3 medium)
             likely_mergeable (otherwise)
    topRisks: top-5 by (severity desc, confidence desc)
    overallConfidence: mean confidence of published findings (0 if none)
```

## 3. Gates that produce `skipped` (with a posted notice, never silent)

| skipReason | Trigger | Posted notice |
| --- | --- | --- |
| `quota_exceeded` | Pre-flight over cap | "Review skipped — org quota reached for this period. Upgrade or reduce review volume." |
| `same_sha` | Idempotency hit | "No new review — this commit was already reviewed." |
| `install_removed` | Install inactive at run | "GitHub connection removed; review not published." |
| `pr_closed` | PR closed before run | "PR closed before review completed." |
| `over_budget_degraded` | (not a skip — a degrade) | "Large diff: reviewed the top-N highest-risk files (N of M); the rest are listed in the appendix." |

## 4. Parallelism and wall-clock budget

- Stages [6] and [7] run in parallel when their file sets are disjoint (security-sensitive ∩ deep-review files = ∅ by construction: security pass *is* the deep review for security files).
- The pipeline has a **wall-clock budget** (default 240 s). On breach: whatever findings are validated + published so far are stored; the job is `partial` with a note. The webhook *already* returned (NFR-04); the user sees the partial result, not a hang.

## 5. Idempotency and retry semantics (worker)

- The **idempotency key** is `(org, repo, pr, commitSha)` (ADR-007).
- A redelivered job for a completed key → no-op (returns the stored result).
- A redelivered job for a *running* key → the running worker holds a lock (Redis `SET NX` on `lock:{key}` with a TTL); the duplicate waits or drops to the DLQ with a `duplicate_in_flight` reason.
- **Publication retry is independent of the AI retry** (INTEGRATION_DESIGN §1.6): a GitHub 429 re-publishes the *already-computed* review; it never re-runs the pipeline.

## 6. Cost accounting

Every AI call in [5]/[6]/[7]/[12] returns token counts; the engine sums them into `ReviewResult.cost`. The worker writes one `usage_events` row per job (the sum), attributed to `orgId`. The dashboard and the quota gate both read this single source (AC-306, AC-401).

## 7. Unit-test surface (the engine is pure)

The engine takes a plain object and returns a plain object. Each stage is a pure function with a named unit test:

| Stage | Test (name) |
| --- | --- |
| Quota gate | `UT-quota-skip` — over-cap input → `skipped`, zero AI calls |
| Same-SHA gate | `UT-samesha` — existing completed key → `skipped: same_sha` |
| Budget gate | `UT-budget-degrade` — 200-file diff, cap 60 → top-60 by risk-tier, `over_budget_degraded` |
| Classify | `UT-classify` — generated/lockfile → static-only exclusion |
| Validate | `UT-validate-01/02` — bad line / bad enum → counters, not crash |
| Dedup | `UT-dedup` — same (file,line,category) × 3 → 1 survivor, highest confidence |
| Policy | `UT-policy-floor` — 0.55 < 0.6 → dropped.belowFloor; suppressed category → gone; static exempt |
| Summary | `UT-summary` — no findings → `likely_mergeable`, topRisks empty; high security → `high_risk` |

The full-pipeline integration test (`IT-pipeline-full`) runs the engine against a real diff fixture + the mock AI provider and asserts the *entire* `ReviewResult` shape, including all counters.
