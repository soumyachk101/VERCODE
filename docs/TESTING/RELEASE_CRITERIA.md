# VERCODE — Release Criteria

A release candidate (a `main` commit that's promoted to a deploy) passes *only* when every gate below is green. A gate that's red is a *blocker* (the release is held, not "shipped with a known issue"), unless the issue is explicitly signed off in the risk register (`IMPLEMENTATION/RISK_REGISTER.md`) with a named owner + a due date.

## 1. The gate list (all must pass)

| # | Gate | Tool / suite | The "pass" means |
| --- | --- | --- | --- |
| 1 | **TypeScript** | `pnpm typecheck` (all packages + apps) | 0 errors (strict mode, `verbatimModuleSyntax` — a relative import without a `.js` is an error, the #1 typecheck failure, `PROJECT_DISCOVERY §4.3`) |
| 2 | **Lint** | `pnpm lint` (the root `eslint`, `--max-warnings 0`) | 0 errors *and* 0 warnings (the `--max-warnings 0` in the root `package.json` — a warning is a failure) |
| 3 | **Unit** | `pnpm test` (Vitest, the pure packages + the apps' unit tests) | 0 failures; the pure-package coverage gate holds (a new exported pure function with no test fails, `UNIT_TEST_PLAN §8`) |
| 4 | **Integration** | `tests/integration/` (real Postgres + Redis via testcontainers) | 0 failures; the seam tests (`IT-webhook-*`, `IT-queue-*`, `IT-ai-fail*`, `IT-tx-*`, `IT-publish-*`, `IT-payment-*`, `IT-idempotency-*`) pass |
| 5 | **Security (release gate)** | `tests/security/` (the `ST-*` suite) | **0 P0 security test failures.** A forged-webhook-accepted, a cross-tenant row served, a prompt leak, a secret in a finding, a silenced deterministic finding, or a client-claim-changes-plan is a *hard block* (`SECURITY_TEST_PLAN §4`) |
| 6 | **Tenant isolation (re-run on every schema change)** | `IT-tenant-01..05` + the `EXPLAIN` plan check | 0 failures; a new tenant table that forgot its `org_id` column / leading index fails 04 (`TENANT_ISOLATION §5`) |
| 7 | **AI benchmark (the quality gate)** | the `benchmark/vN` harness (the current frozen version) | precision ≥ baseline − 5%, security-class recall ≥ baseline − 3%, injection outcomes clean, cost/review within the plan ceiling, anchor-success ≥ 92% (`AI_EVALUATION §3`, `BENCHMARK_DATASET §4`) |
| 8 | **E2E (the dev-stack run)** | `tests/e2e/` (a Compose stack, mock GitHub + mock AI, no external creds) | the journey specs (`auth`, `onboarding`, `daily-loop`, `security-triage`, `cost`, `audit`, `settings`, `usage-limits`, `cross-tenant-ui`, `a11y-keyboard`) pass; a UI number matches its DB row (the "real data" rule, `E2E_TEST_PLAN §3`) |
| 9 | **Accessibility** | the axe + keyboard + reduced-motion Playwright specs | 0 critical/serious axe violations; the top-5 journeys keyboard-reachable; a reduced-motion run shows all content (`ACCESSIBILITY §6`) |
| 10 | **Design (the anti-slop gate)** | the design-taste `lint.mjs --app` + `inspect.mjs --app` on the built dashboard | **0 FAIL** at 1440/768/390; every WARN is defended in one sentence or fixed (`DESIGN_SYSTEM §11`); the app-screens §2.7 seven questions answered |
| 11 | **Docs drift** | a docs-drift CI check (the traceability matrix, `TRACEABILITY_MATRIX.md`) | every FR whose behavior changed has updated docs *in the same PR*; the traceability matrix links FR → component → test with no orphans |
| 12 | **Dependency / supply chain** | `pnpm audit` + a lockfile-vs-manifest check + the `allowBuilds` allowlist | 0 new high/critical CVEs; the lockfile matches the manifest; the effective `allowBuilds` set matches the reviewed allowlist (`THREAT_MODEL T-09/T-16`) |
| 13 | **The live external suite (release lane only)** | `e2e/live.spec.ts` (gated on `E2E_LIVE` + real secrets) | *Where credentials exist:* a real webhook → a real review → a real inline comment on a test repo passes. *Where credentials are absent (this build env):* the suite is **marked blocked**, not claimed (`E2E_TEST_PLAN §5`, the "don't claim what you can't verify" rule) |

## 2. The "pass" is a measurement, not a checkbox

- **The benchmark gate (7) is a *number*, not a "the tests ran."** A release report states the exact `(model, promptVersion, routingTable, benchmarkVersion)` tuple + the measured precision/security-recall/cost/anchor numbers (a reviewer re-runs the harness and gets the same number, `BENCHMARK_DATASET §6`). "The review is good" without the number is the banned claim.
- **The E2E "real data" assertions are *DB-backed*.** A "12 reviews" on the Overview is asserted against `count(review_jobs)` (a UI that shows a number the DB doesn't back is a fabrication failure — the brief: "Do not fabricate… statistics", FR-5xx). A test that asserts only the DOM (not the DB) for a number is a *weaker* test and is upgraded to assert both (the UI *and* the stored value, `E2E_TEST_PLAN §3`).
- **The security gates are *release gates*, not regular tests.** A P0 security regression (5) or the tenant regression (6) is an *automatic* block (a security defect is not "known and accepted" without a risk-register entry + sign-off, `SECURITY_TEST_PLAN §4`).

## 3. The incident/rollback tie-in

- **A green release** has a *rollback plan* ready (the previous deploy is retained; the DB migration's inverse is documented, `MIGRATION_STRATEGY §5`). A green release that can't be rolled back is not actually green.
- **A canary + the monitor:** a release is promoted to a canary (a subset of orgs / a low-traffic instance), and the *leading indicators* are watched for the bake window: the DLQ depth, the provider error rate, the GitHub 4xx/5xx rate, the review-latency p95, the `ST-cost-abuse` provider-spend metric (the "a failure is observable" invariant, `ERROR_HANDLING §9`, `DEFINITION OF DONE #12`). A canary that spikes any leading indicator is *rolled back before* it's promoted (a canary that "passed the tests but spiked in prod" is a failed release, not a passed one).
- **The post-release check:** the release report notes the *live* external-suite status (passed / blocked-with-credentials / blocked-without), the benchmark numbers, the canary bake results, and the open risk-register items carried into the next release (the "record remaining risks and blockers" rule, `PHASE 9`).

## 4. What is NOT a release criterion (stated)

- **A 100%-coverage number** (coverage is a *floor* on the pure packages + a *reviewed* seam coverage, not a 100% line-coverage target, `TEST_STRATEGY §7` — a 100% line coverage that's all unit tests on I/O functions is a *worse* signal).
- **"All tests ran"** without the *numbers* (the benchmark precision, the E2E DB-backed assertions, the canary bake — the *measurements* are the criterion, the "green checkmark" is not).
- **A marketing performance claim** ("99% accurate") — a claim without the benchmark tuple + the run date is not written *anywhere* (the docs, the marketing site, a PR description), `AI_EVALUATION §5`.
- **The Phase-2 sandbox red-team** (a *contract* test is a release gate in Phase 2, the `ST-sandbox-*` negative tests; a full escape red-team is a separate engagement, `SANDBOX_SECURITY §8`, not a release criterion for MVP, which has *no* execution path).

## 5. The "definition of done" checklist, as the release's exit

The `PHASE 10` 15-step end-to-end checklist (a user signs in → creates an org → installs the App on a test repo → a real PR webhook is received + verified → a review job is processed with correct idempotency → the diff + context are fetched → static analysis + AI review execute → findings are validated against the actual diff → a summary + valid inline comments are published → results appear in the dashboard → usage is attributed to the org → failures + retries are observable → tenant isolation + security tests pass → the docs match the implementation → setup + deployment instructions are verified) is the release's *exit criteria*. Each step is backed by a named test/spec (the mapping, `E2E_TEST_PLAN §7`); a step that's *blocked on external credentials* (the live webhook + the live publish) is **explicitly marked blocked in the release report**, not counted as done (the "unverified external integration must be explicitly marked as blocked or unverified" rule, `PHASE 10`).
