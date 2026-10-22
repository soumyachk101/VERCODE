# VERCODE — Definition of Done

The "done" definitions, at three levels: a *task*, a *milestone*, a *feature/FR*, and the *MVP* itself. The rule that governs all of them: **a thing is done when its state is *measured + verified + committed*, not when it's *coded* or *documented*** (`RELEASE_CRITERIA §2 "the pass is a measurement, not a checkbox"`, `PHASE 10 "the MVP is not complete simply because the UI looks good or the project compiles"`).

## 1. The *task* DoD (a *a `TASK_BREAKDOWN` task*, a *a commit's worth*)

A *task* is done when **all** of:
- [ ] The *code* is *committed* (a *a small, coherent unit, a *`IMPLEMENTATION_PLAN §4 "commit in small, coherent units"`*).
- [ ] The *task's tests pass* (a *the named test from `TASK_BREAKDOWN §2 "the verified state"`* — a *the task that's "coded but untested" is not done*).
- [ ] `pnpm typecheck` is green (a *the `verbatimModuleSyntax` gate — a relative import without `.js` is an error, a `PROJECT_DISCOVERY §4.3`*).
- [ ] `pnpm lint` is green (a *`--max-warnings 0` — a warning is a failure, a `RELEASE_CRITERIA gate 2`*).
- [ ] The *docs match* (a *a FR whose behavior changed has updated docs in the same PR, a `RELEASE_CRITERIA gate-11 "docs-drift"`*).
- [ ] The *task's next-task pointer* is *named* (a *`PHASE 9 "identify the next concrete task"`* — a *a task that's "done" but doesn't say what's next is a handoff gap*).
- [ ] The *WIP is not on main* (a *the auto-sync daemon, a `R-D1 "in-flight work that sits in the tree may be auto-merged"`* — a *a WIP is on a branch, a never a long-lived dirty tree on main*).

**The task DoD is a checklist, not a vibes-check:** a task that's "the code's there" without the tests + the typecheck + the docs-match + the next-pointer is *not done* (a *a "coded" state is a "WIP" state, a not a "done" state*).

## 2. The *milestone* DoD (a *a `IMPLEMENTATION_PLAN` milestone*)

A *milestone* is done when **all** of its tasks are done (a *the task DoD, §1*) **and**:
- [ ] The *milestone's verified state* (a *`IMPLEMENTATION_PLAN §2 "the measured state"`* — a *the named suite, a the specific assertions*) is *measured green*.
- [ ] The *milestone's integration tests* pass (a *the `IT-*` tests that cross the boundary the milestone builds* — a *a M3's `IT-webhook-*` + `IT-idempotency-*`; a *a M5's `IT-queue-*` + `IT-publish-*` + `IT-tx-*`*).
- [ ] The *milestone's external-blocker* is *marked* (a *a live-integration that's blocked on credentials is explicitly marked blocked, a `PHASE 10 "any unverified external integration must be explicitly marked as blocked or unverified"`* — a *a M3's "live GitHub App" is marked blocked in a no-credentials env*).
- [ ] The *traceability matrix* is *updated* (a *the milestone's FR ↔ component ↔ test links have no orphans, a `RELEASE_CRITERIA gate-11`*).

**The milestone DoD is a *measurement + a mark*:** a milestone that's "the code's built + the tests pass" but *doesn't mark* the external blocker (a *a M3 that "works" against a mock but isn't marked "live-blocked"*) is *not done* (a *a "mock-verified" is a "dev-stack-verified", a not a "live-verified" — a `SAAS_LAUNCH_PLAN §3 "a launch claim is a live launch, not a dev-stack launch"`*).

## 3. The *feature/FR* DoD (a *a `FUNCTIONAL_REQUIREMENTS` FR*)

A *feature* is done when **all** of its *acceptance criteria* (a *`ACCEPTANCE_CRITERIA.md`*) are *measured green* by a *named test*:
- [ ] The *AC* is *test-oracle'd* (a *each AC names its test — a `UT-*` / a `IT-*` / a `ST-*` / a `E2E-*`, a `ACCEPTANCE_CRITERIA §1 "each should be checkable by a named test"`*).
- [ ] The *test passes* (a *the test is the proof; a an AC without a passing test is an incomplete feature, a `TEST_STRATEGY §7 "a new feature's acceptance criteria are test-oracles; an AC with no test is an incomplete feature"`*).
- [ ] The *security* invariants (a *if the FR touches tenancy / the webhook / the prompt / a secret / the plan state*, a *the `ST-*` test passes*, a `SECURITY_TEST_PLAN §4 "a P0 security test failure blocks the release"`*).
- [ ] The *docs* match (a *a FR whose behavior changed has updated docs*, a `RELEASE_CRITERIA gate-11`).

**The feature DoD is a *FR ↔ AC ↔ test* closure:** a feature that's "the UI's there + the API's there" but *doesn't have a passing AC test* is *not done* (a *a "the UI works" is a "the UI renders", a not a "the FR is satisfied" — a `MVP_SCOPE "a user must be able to [the 15-step checklist]"* is the acceptance).

## 4. The *MVP* DoD (a *the 15-step `PHASE 10` checklist, a *the end-to-end workflow*)

The *MVP* is done when **all 15 steps** of the `PHASE 10` checklist are *demonstrable* (a *measured, not claimed*), a *mapped to a named test/spec* (a *`E2E_TEST_PLAN §7 "the definition-of-done mapping"`*):

| # | The *step* (a `PHASE 10` the exact wording) | The *named test/spec* (a `E2E_TEST_PLAN §7` the mapping) | The *measurement* |
| --- | --- | --- | --- |
| 1 | a *user signs in* | `auth.spec.ts` | a *a sign-in sets a session cookie; a `/auth/me` returns the user* (a *DB-backed: a the session row exists*) |
| 2 | a *user creates an org* | `auth.spec.ts` / `onboarding.spec.ts` | a *the org row + the membership (a owner) exist; a audit event `org.created`* |
| 3 | a *user installs the GitHub App on an authorized test repo* | `onboarding.spec.ts` (a mock) / `live.spec.ts` (a real, a **blocked** in a no-credentials env) | a *the install row + the repo row exist (a mock); a the real App install is marked blocked* |
| 4 | a *real PR webhook is received + verified* | `daily-loop.spec.ts` (a mock-dispatched, a signature verified) / `live.spec.ts` (a real, a **blocked**) | a *the `webhook_deliveries` row; a the signature verified (a mock HMAC); a a live webhook is marked blocked* |
| 5 | a *review job is processed with correct idempotency* | `daily-loop.spec.ts` + `IT-idempotency-01` | a *a same-SHA no-op; a a new SHA a new job; a the `(org,repo,pr,sha)` unique key enforced* |
| 6 | a *diff + context are retrieved* | `daily-loop.spec.ts` (a the mock pipeline's recorded diff fetch) | a *the diff + the 1-hop context fetched (a the mock-GitHub's recorded fetches); a within the token budget* |
| 7 | a *static analysis + AI review execute* | `daily-loop.spec.ts` (a the mock pipeline) + `IT-pipeline-full` | a *the static findings + the AI findings are produced; a the deterministic stage is provider-independent (a the provider-down still publishes, AC-301)* |
| 8 | a *findings are validated against the actual diff* | `IT-publish-*` + `UT-engine-validate` | a *a finding's line resolves in the diff's added ranges (a a valid anchor); a a bad line → a `anchor_failed` demote; a a bad enum → a drop* |
| 9 | a *summary + valid inline comments are published* | `daily-loop.spec.ts` (a the mock-GitHub's recorded publish) + `IT-publish-*` | a *the review + the inline comments are recorded by the mock-GitHub; a the published review id is stored; a a retry no-ops* |
| 10 | a *results appear in the dashboard* | `daily-loop.spec.ts` (a the UI assertion + a DB-match) | a *the review detail shows the verdict + the findings + the cost; a the UI number = a DB row (a `E2E_TEST_PLAN §3 "a UI number matches the DB row"`)* |
| 11 | a *usage is attributed to the correct org* | `cost.spec.ts` | a *a `usage_events` row on the requesting org; a the org-scoped attribution (a `DATA_FLOW §4 "attributed to the org"`)* |
| 12 | a *failures + retries are observable* | `cost.spec.ts` (a the skip) + `audit.spec.ts` (a the audit rows) + `IT-queue-*` | a *a skipped/failed job has a `skip_reason` / an error; a a retry has an attempt counter; a a DLQ entry is recorded; a the "Failed / skipped reviews" dashboard view reads the same rows (a `OBSERVABILITY §5 "a failure is observable"*)* |
| 13 | a *tenant isolation + security tests pass* | `cross-tenant-ui.spec.ts` + `IT-tenant-01..05` + the `ST-*` suite | a *a cross-tenant access → 404; a the tenant suite + the security suite pass 100% (a `RELEASE_CRITERIA gate 5 + gate 6`)* |
| 14 | a *docs match the implementation* | the docs-drift CI check + the traceability matrix | a *a FR whose behavior changed has updated docs; a the traceability matrix has no orphans (a `RELEASE_CRITERIA gate-11`)* |
| 15 | a *setup + deployment instructions are verified* | `OPERATIONS/DEPLOYMENT.md` + a Compose bring-up test (a `infra/docker` a `smoke` target) | a *the Compose stack boots; a the health endpoints pass; a a mock PR runs through the pipeline (a `DEPLOYMENT §2 "a smoke target: a boot + a health + a mock PR through the pipeline"`)* |

**The MVP DoD is a *15/15*, a *measured*:** a MVP that's "the UI looks good + the project compiles" is *not the MVP DoD* (a *`PHASE 10 "the MVP is not complete simply because the UI looks good or the project compiles. The critical end-to-end workflow must be demonstrable"`*). A MVP is done when *all 15 steps are demonstrable* (a *measured, a not a vibes*) + a *any unverified external integration is explicitly marked blocked* (a *steps 3 + 4 + 9's "live" variant are marked blocked in a no-credentials env, a `PHASE 10 "any unverified external integration must be explicitly marked as blocked or unverified"`*).

## 5. The *release* DoD (a *the `RELEASE_CRITERIA` gates*)

A *release* is done when **all the `RELEASE_CRITERIA` gates pass** (a *the 13 gates, a gate 1–13*): a typecheck, a lint, a unit, a integration, a security, a tenant, a benchmark, a E2E (a dev-stack), a a11y, a design, a docs-drift, a supply-chain, a the live external suite (a or a marked blocked). **A release DoD is a *measured pass + a rollback plan + a canary bake*** (a *`RELEASE_CRITERIA §3 "a green release has a rollback plan ready"`* — a *a release that can't be rolled back is not actually green*).

## 6. The *honest status* rule (a *the cross-cutting invariant, a `PHASE 9 "do not fabricate successful tests, integrations, credentials, or deployments"`*)

- **A *test* is "done" when it *passes* (a *a red test is not a green test*, a *a "we'll fix it later" is a open issue, not a done test**).
- **A *integration* is "done" when it's *verified* (a *a mock-verified integration is a "dev-stack-verified", a not a "live-verified"*; a *a live integration that wasn't actually run is marked blocked*).
- **A *credential* is "done" when it's *present + a working* (a *a credential that's a placeholder is a "blocked" state, a not a "configured" state*).
- **A *deployment* is "done" when it's *executed + verified* (a *a "we deployed it" without a post-deploy health check is a "unverified", a `DEPLOYMENT §7 "a verified deploy is one whose post-deploy checks passed"`*).

**The one sentence that governs all the DoDs:** *a thing is done when its state is measured, verified, committed, and marked (a *including the explicit "blocked" mark for what's not yet verified*) — a *a done that's a "coded", a "documented", a "looks good", or a "should work" is not a done, a it's a WIP.*
