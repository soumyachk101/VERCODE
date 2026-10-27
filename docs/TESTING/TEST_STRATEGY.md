# VERCODE — Test Strategy

The full testing strategy: what's tested at each layer, the tools, the fixtures, and the gates. Tests are *written alongside implementation* (not postponed to the end, per the brief's Phase 6).

## 1. The test pyramid + the suite layout

```
                       / E2E (Playwright) \      few, journey-level
                     / Security (ST-*)  \      the release gates
                    / Integration (IT-*) \     medium, the seams
                  / Unit (UT-*)          \     many, the pure logic
```

| Layer | Tool | Location | Runs |
| --- | --- | --- | --- |
| **Unit** | Vitest | `packages/**/*.test.ts`, `apps/*/src/**/*.test.ts` | every PR, fast |
| **Integration** | Vitest + testcontainers (Postgres + Redis) | `tests/integration/` | every PR (a subset) + on merge (full) |
| **Security** | Vitest (the ST-* suite) + the fixture library | `tests/security/` | every PR + **release gate** |
| **E2E** | Playwright | `tests/e2e/` | on merge (a CI lane) |
| **AI benchmark** | a scoring script + the fixture set | `tests/fixtures/benchmark/` | on merge + **release gate** |
| **Design** | the design-taste `lint.mjs --app` + `inspect.mjs --app` | `apps/web` CI job | on merge |

The **fixture library** (`tests/fixtures/`, `SECURITY_TEST_PLAN §2`) is the shared input: diff fixtures, injection fixtures, secret samples, webhook event bodies, malformed-AI outputs, and the benchmark set. A fixture is versioned; a test asserts against a fixture, not against inline data (a fixture change is a *reviewed* change).

## 2. Unit tests (the pure logic)

The pure packages are *trivially* unit-testable because they take a plain object and return a plain object (the engine is I/O-free, `REVIEW_ENGINE_SPEC §7`):

| Area | Tests (the named suite from REVIEW_ENGINE_SPEC §7) |
| --- | --- |
| **Diff parsing + line mapping** (`diff-engine`) | `UT-diff-*`: unified-diff → the change set + the added/removed line map; `resolveAnchor(file, line, side)` returns the real line for a valid anchor and a *clean miss* for an out-of-range line (a miss is a defined value, not an exception) |
| **Schema validation** (`contracts`) | `UT-schemas-*`: every Zod schema accepts a valid sample + rejects each documented violation (a bad enum, a confidence > 1, a negative line) |
| **Finding dedup** | `UT-dedup`: 3 findings on the same (file,line,category) → 1 survivor (highest confidence, the longer description) |
| **Severity / confidence policy** (`policy-engine`) | `UT-policy-*`: the floor (0.55 < 0.6 → dropped), a suppressed category (gone for that repo, present for another), static findings exempt from the floor |
| **Quota calculations** | `UT-quota-*`: over reviews OR over token cap → the skip decision; the "zero tokens on a skip" invariant |
| **Authorization** | `UT-authz-*`: the role × capability matrix cells (every *deny* is a test, not just the allows) |
| **The pipeline stages** | `UT-validate-01/02`, `UT-budget-degrade`, `UT-summary` (a job with no findings → `likely_mergeable`; a high security finding → `high_risk`), the full-pipeline `IT-pipeline-full` (the whole `ReviewResult` shape + all counters) |
| **Cost accounting** | `UT-cost-*`: `estUsdCost` from the rate table; the per-plan ceiling; Ollama → 0 |

**The rule:** a pure package's *public* function is covered by a named unit test (a coverage gate on the pure packages: `diff-engine`, `policy-engine`, `contracts`, and the engine's stage functions — a new pure function with no test fails the gate).

## 3. Integration tests (the seams, real Postgres + Redis)

Testcontainers spins a real Postgres + Redis per suite (a migration-applied DB, not an in-memory mock). The integration suite is where the *behaviors that cross a boundary* are proven:

| Seam | Tests |
| --- | --- |
| **GitHub webhook** | `IT-webhook-*` (verified event enqueues + dedups; a forged event 401s + no queue write + audit; a replay 200 no-op; a malformed verified event 422 + not enqueued). The event bodies come from the fixture library (pre-computed signatures against a *test* webhook secret — the secret is a fixture, not a real one). |
| **Queue + retry** | `IT-queue-*` (a transient provider 5xx → the job retries with backoff up to 3, then the DLQ; a terminal error (install removed) is *not* retried; a redelivered job for a completed key no-ops, NFR-13) |
| **AI provider failures** | `IT-ai-fail*` (provider down → deterministic findings still publish, job `partial`; a malformed structured output → one "be strict" retry then a drop; a provider 429 → bounded retry + one fallback switch) |
| **Database transactions** | `IT-tx-*` (the persist-then-publish: a failed publish does *not* roll back the stored findings; a partial write can't leave a `succeeded` job without a `usage_events` row — the integrity reconciliation query finds zero) |
| **Inline comment publication** | `IT-publish-*` (a valid anchor → an inline comment; an invalid anchor → a PR-body section marked `anchor_failed`; the published review id is stored, a retry no-ops) |
| **Payment events** | `IT-payment-01..03` (a verified webhook flips plan state; a forged/unsigned one is inert; a replay is a no-op; a client claim of "I'm on Team" changes nothing, AC-403) |
| **Tenant isolation** | `IT-tenant-01..05` + `EXPLAIN` plan check (cross-org → 404 not 403; the leading index is used; the cache key namespaces) — re-run on *every* schema change |
| **Idempotency** | `IT-idempotency-01` (a same-SHA re-review is a no-op; a new SHA is a new job) |

**The rule:** an integration test uses the *real* DB + queue + a *mock* external provider (GitHub Octokit is mocked at the transport, the AI provider is the mock adapter — the mocks are at the *outer* edge, the seams are real). A test that mocks the DB or the queue is not an integration test (it's a unit test with extra steps) and is rejected in review.

## 4. E2E tests (Playwright, the journeys)

The E2E suite drives the *actual* deployed (a `docker-compose` dev stack + a **mock GitHub** + a **mock AI provider** — so a real end-to-end run needs no external credentials, the "blocked/unverified external integration" rule from `MVP_SCOPE`):

| Journey (`USER_JOURNEYS`) | Spec |
| --- | --- |
| **J1 onboarding** | `e2e/onboarding.spec.ts` — sign-in → create org → (mock) GitHub connect → the Overview empty-state → the first review detail appears |
| **J2 daily loop** | `e2e/daily-loop.spec.ts` — open a PR (the mock dispatches the webhook) → the review detail shows the verdict + findings → a "Re-review" enqueues a new job |
| **J3 security triage** | `e2e/security-triage.spec.ts` — the Security rollup → open a finding → mark it actioned → the actioned-rate updates → a category suppression is set for a repo |
| **J4 cost management** | `e2e/cost.spec.ts` — the usage + quota strip → the 80% banner → a skip-with-notice on an over-cap job |
 | **J5 security audit** | `e2e/audit.spec.ts` — the audit log (a role change, a key rotation appear with the actor + IP) |
| **Auth + org lifecycle** | `e2e/auth.spec.ts` — sign-in/out, an invitation accept, a role change, "sign out everywhere" |
| **The security suite's UI half** | `e2e/security-ui.spec.ts` — a UI that shows an action the API denies is a drift (the "hide never enforce" check, `AUTHORIZATION §7`) |

**The external-integration gate:** a real-GitHub + real-AI end-to-end (a *live* webhook → a *live* review → a *real* inline comment on a test repo) is a **separate, credentialed** suite (`e2e/live.spec.ts`, gated on `E2E_LIVE=true` + real secrets) that runs in a *release* CI lane, **not** on every PR. In this environment it's **explicitly marked "requires external credential — blocked"** (the `MVP_SCOPE` / `PHASE 10` rule) — we do *not* claim a live integration that wasn't actually run.

## 5. AI evaluation (the quality gate, `AI_EVALUATION.md`)

The AI's *quality* is a measured property, not a vibes check. The benchmark dataset + the scoring (precision, false-positive rate, per-floor calibration, latency, cost) are a **release gate** (`TESTING/BENCHMARK_DATASET.md`): a model/prompt change that regresses the gate is blocked. This is the "never claim performance without measured evidence" rule.

## 6. Security tests (the release gates, `SECURITY/SECURITY_TEST_PLAN.md`)

The `ST-*` suite is the security release gate: a P0 security regression (a forged webhook accepted, a cross-tenant row served, a prompt leak, a secret in a finding, a silenced deterministic finding) **blocks the release** (a security defect is not "known and accepted" without a risk-register entry + sign-off). The security suite runs on *every* PR (a reduced set) + the *full* set on the release candidate.

## 7. Property of the suite (what "done" means)

- **A fix has a test.** A bug fix ships with a *regression* test that fails on the old behavior (a fix with no test is a review-blocker — the bug can silently return).
- **A new feature's acceptance criteria (`ACCEPTANCE_CRITERIA.md`) are test-oracles** — each AC names its test(s); the traceability matrix (`TRACEABILITY_MATRIX.md`) links AC → test → FR. An AC with no test is an *incomplete* feature, not a documented one.
- **The mock-vs-real boundary is explicit** (the seams are real, the outer edge is mocked; the live external suite is credentialed + separate). A "tested" claim names *which* layer was tested.
- **Coverage is a floor, not the goal.** The pure packages have a coverage gate (the rule above); the *rest* is covered by the behavior suites (a 100% line coverage that's all unit tests on I/O functions is a *worse* signal than a 70% with real integration seams). Coverage reports are *reviewed* (are the seams tested?), not just green.

## 8. The test-environment matrix

| Env | What it runs | Credentials |
| --- | --- | --- |
| **Local dev** | Compose (Postgres, Redis, web, api, worker, mock-github, mock-ai) + `pnpm test` (unit + integration against the containers) | none (the mocks) |
| **CI (PR)** | unit + a reduced integration + a reduced security + `typecheck` + `lint` | none (mocks); the E2E against a compose stack, no external |
| **CI (merge)** | the full integration + full security + the full E2E + the **benchmark gate** + the **design gate** | none (mocks) |
| **CI (release lane)** | + the **live external suite** (`E2E_LIVE`) + a load/DoS soak + a secret-scanner + a dependency audit | real GitHub App + AI provider (the *billing* lane is *gone*: no Stripe test-mode, no payment provider — usage is plain visibility, the no-paywall decision) |

## 9. What we do NOT test (stated, `SECURITY_TEST_PLAN §6` + the mock boundary)

- The *hosting provider's* infrastructure (we assume the documented platform guarantees; a Postgres/Redis/K8s outage is a *host* incident, simulated by the `IT-*` failure-mode tests, not pen-tested).
- The *AI provider's* model safety (we test *our* boundary — that a steered/leaked output can't cross our invariants — not the model's alignment).
- Phase-2 sandbox escapes as a *full* pen-test (the `ST-sandbox-*` negative tests prove the *contract*; a real escape test is a dedicated red-team activity, documented separately).
