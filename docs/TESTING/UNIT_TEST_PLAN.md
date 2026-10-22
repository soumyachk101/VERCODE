# VERCODE — Unit Test Plan

The unit-test layer, organized by package. A unit test is *fast* (no DB, no network, no queue), uses a plain-object in/out, and mocks at the *outermost* seam only (a provider call, a GitHub transport). The pure packages (`diff-engine`, `policy-engine`, `contracts`) have a **coverage gate** (a new pure function with no test fails CI).

## 1. `packages/diff-engine` (pure)

The diff parser + line map is the *most*-tested pure code in the repo (a wrong line map = a finding anchored to the wrong line = GitHub 422s, the AC-203 failure). Coverage gate: the public surface.

| Function | Tests |
| --- | --- |
| `parseUnifiedDiff(text) → ChangeSet` | `UT-diff-parse-01` a multi-file diff → the file list + per-file hunk ranges; `UT-diff-parse-02` a diff with a binary/no-newline marker → those files are flagged `binary`/`truncated`, excluded from anchoring; `UT-diff-parse-03` an empty diff → an empty change set (not a crash) |
| `resolveAnchor(file, line, side) → Anchor \| miss` | `UT-anchor-01` a valid added-line anchor → resolves to the line; `UT-anchor-02` a line *not* in the diff's added ranges → a *defined* miss value (the `anchor_failed` path, not an exception); `UT-anchor-03` a removed-line anchor (`side: LEFT`) → resolves against the removed-line map; `UT-anchor-04` a file not in the change set → miss |
| `addedLineRanges(file)` / `removedLineRanges(file)` | `UT-diff-ranges-01` a diff with a mixed hunk → the exact added/removed ranges; `UT-diff-ranges-02` the 1-based line numbering (a finding's `line` is 1-based, matches GitHub's) |

## 2. `packages/contracts` (Zod, pure)

| Schema | Tests |
| --- | --- |
| `ReviewFindingSchema` | `UT-schema-finding-*`: a valid finding parses; each violation is rejected (a confidence > 1, a negative line, an out-of-enum severity/category, a missing title) |
| `plans.ts` | `UT-plans-01` **import identity**: the four quota constants + `planQuota` are *the* source of truth (a grep-level assertion that no other package hardcodes the numbers — the AC-401 gate); `UT-plans-02` a plan lookup (each plan resolves to its quota shape) |
| The webhook event schemas | `UT-schema-webhook-*`: a valid `pull_request` event parses; a wrong `action` is rejected (the verified-but-malformed → 422 path) |

## 3. `packages/policy-engine` (pure)

| Function | Tests |
| --- | --- |
| `applyPolicy(findings, policy) → Findings` | `UT-policy-floor` (0.55 < 0.6 → dropped, counted `dropped.belowFloor`); `UT-policy-suppress` (a per-repo suppressed category is gone *for that repo*, present for another); `UT-policy-static-exempt` (a static finding below the floor is *kept* — the deterministic exemption, ADR-005); `UT-policy-merge` (the combined policy: floor + suppression + the per-repo override) |
| `dedup(findings) → Findings` | `UT-dedup-01` the same (file,line,category) × 3 → 1 survivor (highest confidence, the longer description); `UT-dedup-02` distinct categories on the same line → *both* kept (dedup is on the triple, not the line) |
| `checkQuota(org, month) → decision` | `UT-quota-over-reviews` (over the review count → skip); `UT-quota-over-tokens` (over the token cap → skip); `UT-quota-zero-on-skip` (a skip decision is what causes *zero* AI tokens — the invariant, AC-402); `UT-quota-under` (under both → proceed) |
| `budgetGate(diff, policy) → trimmed diff + flag` | `UT-budget-degrade` (a 200-file diff, cap 60 → the top-60 by risk-tier, `over_budget_degraded`; the risk-tier order: security-sensitive > db-touching > logic-heavy > other) |

## 4. `packages/review-engine` (the pure orchestrator stages, `REVIEW_ENGINE_SPEC §7`)

Each stage is a named pure function with a test; the full pipeline is the integration `IT-pipeline-full`.

| Stage | Test |
| --- | --- |
| Pre-flight quota gate | `UT-engine-quota` — an over-cap input → `skipped: quota_exceeded`, **zero** AI calls (a spy on the provider: call count 0) |
| Same-SHA gate | `UT-engine-samesha` — an existing completed key → `skipped: same_sha` |
| Budget gate | `UT-engine-budget` — over-budget → the trimmed set + `over_budget_degraded` |
| Classify | `UT-engine-classify` — a generated/lockfile → static-only exclusion (not in the AI scope) |
| Validate | `UT-engine-validate` — a bad line → `dropped.invalidAnchor` (kept for the PR-body, marked `anchor_failed`); a bad enum → `dropped.invalid` (not a crash, a counter) |
| Summary | `UT-engine-summary` — no findings → `likely_mergeable` + empty topRisks; a high security finding → `high_risk`; the topRisks are ordered (severity desc, confidence desc, max 5) |
| **The full shape** | `IT-pipeline-full` — the *entire* `ReviewResult` (all fields + all counters) against a real diff fixture + the mock AI provider |

## 5. `packages/ai-providers` (the adapter boundary, mock-backed)

| Area | Tests |
| --- | --- |
| **Structured-output re-validation** (the "the provider's claim is not trusted" invariant) | `UT-ai-revalidate-01` the mock returns a *schema-valid* object → it passes; `UT-ai-revalidate-02` the mock returns a *near-miss* (a confidence of 1.5, an out-of-enum category) → Zod re-validation drops it (the adapter's "I conformed" is overridden); `UT-ai-revalidate-03` the mock returns a *string that looks like JSON but isn't* → the "be strict" retry path (one retry, then the stage drops) |
| **Routing** | `UT-ai-route-01` a task + an org context resolves to *exactly one* route (the config table, a deterministic resolution — no ambiguity); `UT-ai-route-02` a security-review override that would downgrade below the tier floor → the routing gate rejects it (the "never downgrade security-review for cost" invariant, MODEL_ROUTING §7) |
| **Cost** | `UT-ai-cost-01` `estUsdCost` from the rate table (input + output at the published rates); `UT-ai-cost-02` Ollama → 0 (self-hosted); `UT-ai-cost-03` a fallback switch → the cost reflects the *actual* fallback model used, not the primary's |
| **Bounded retry** | `UT-ai-retry-01` a provider 5xx/timeout → 2 retries with backoff, then the fallback (one switch), then the stage fails (the deterministic findings survive); a terminal (400 overflow) → a truncate + one retry, else `partial` |

## 6. `packages/static-analysis` (deterministic, the fixtures are the spec)

| Area | Tests |
| --- | --- |
| **SQL-concatenation** | `UT-static-sql-01` a fixture with a known SQL-concatenation pattern → a Semgrep-derived finding (`source: semgrep`, severity `high`, category `security`) — **with the AI provider mocked to throw** (the deterministic stage is provider-independent, AC-301); `UT-static-sql-02` a clean parameterized query → no finding (the false-positive check) |
| **The runner** | `UT-static-runner-01` a resource cap (a pathological file is bounded, not a crash); `UT-static-runner-02` a generated file → excluded (the classify stage's output feeds the runner's scope) |

## 7. `packages/billing` (the state machine + the idempotency)

| Area | Tests |
| --- | --- |
| **The plan state machine** | `UT-billing-state-*`: `trialing → active` (an `invoice.paid`/`subscription` event); `active → past_due` (an `invoice.payment_failed`); `past_due → canceled` (grace exceeded); a downgrade takes effect at period end. Each transition is driven *only* by a verified event (the "only a verified webhook moves state" invariant, AC-403) |
| **Event idempotency** | `UT-billing-idem-01` a re-delivered event (same event id) → a no-op (the state is not double-moved); `UT-billing-idem-02` a *client* claim of "plan=enterprise" → the state is *unchanged* (a client claim is inert) |
| **Grace** | `UT-billing-grace-01` a `past_due` org keeps running reviews through the grace window; after grace → `canceled` → quota frozen + new reviews `skipped` with a notice (NFR-18, never a silent stop) |

## 8. The pure-package coverage gate

`diff-engine`, `policy-engine`, `contracts`, and the `review-engine`'s stage functions have a **coverage floor** (a new exported pure function with no test fails CI — an ESLint/vitest-coverage rule on those packages). The *I/O* packages (`github`, `database`, the worker) are covered by the *integration* seams (a unit test there would mock the whole point). The gate enforces: *the logic is unit-tested, the seams are integration-tested* — a clean split, no overlap, no gap.
