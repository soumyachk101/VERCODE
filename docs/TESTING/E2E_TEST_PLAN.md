# VERCODE — E2E Test Plan

The Playwright suite drives the *actual* dev stack (the `docker-compose` with mock GitHub + mock AI) through the real journeys. These are the few, journey-level tests that prove the *whole* system works — they're the bridge between "the components are correct" (unit/integration) and "a human can do the thing" (a `DEFINITION OF DONE` walk).

## 1. The environment

- **The dev stack:** the Compose stack (`infra/docker/compose.yaml`) — Postgres, Redis, `web`, `api`, `worker`, a **mock-github** HTTP stub, a **mock-ai** provider. The `billing` package, webhooks, and **mock-billing** service are removed (the no-paywall decision, commit `78b51d9`) — there is no payment stack in the dev compose file. *No external credentials needed* — a full end-to-end run is local.
- **The "live" lane:** a separate, credentialed run (`E2E_LIVE=true`, real GitHub App + real AI) that runs on a *release* CI lane. In this build environment it's **explicitly marked "requires external credential — blocked"** (`MVP_SCOPE`, `PHASE 10`) — we do not claim a live integration that wasn't actually executed.
- **The test data:** each E2E test creates its own org + user (a fixture), uses the mock GitHub to drive a webhook, and asserts against the *real* API + DB (a Playwright test that asserts on the DOM *and* a DB row — the "data that tells the truth" check, the UI number matches the stored number).

## 2. The specs (the journeys)

| Spec | Journey | Covers (the ACs) |
| --- | --- | --- |
| `auth.spec.ts` | US-001/002/003/005/008 + the lifecycle | sign-up → sign-in → create org (the user is the owner) → invite + accept → a role change → "sign out everywhere"; a wrong password → the no-enumeration 401 + lockout after 5; a revoked session → 401 |
| `onboarding.spec.ts` | J1 | sign-in → create org → the Overview's first-run empty state ("Connect GitHub to start reviewing PRs") → the mock-GitHub connect → the Repositories populates → a mock PR webhook → the first review detail appears (the J1 exit criterion: connected → first review visible) |
| `daily-loop.spec.ts` | J2 | open a PR (the mock dispatches the webhook) → the review detail shows the verdict + the findings (a real finding from the mock pipeline) → apply-a-fix (the mock force-push) → a new commit's job appears in the history → the latest is expanded |
| `security-triage.spec.ts` | J3 | the Security rollup → filter high/critical → open a finding (the PR + diff context) → mark it "actioned" (a `finding_action`) → the actioned-rate updates → set a per-repo category suppression → the next review for that repo omits the suppressed category (the suppression is *effective*, not just saved) |
| `cost.spec.ts` | J4 | the usage + the quota strip (a `Charts.plan` track) → the 80% banner appears when the quota crosses 80% → a mock job that would exceed the cap → the job is `skipped: quota_exceeded` + a "Quota reached" notice is posted on the (mock) PR + **zero** AI tokens consumed (a DB assertion: the skip wrote no `usage_events` tokens, AC-402) |
| `audit.spec.ts` | J5 | a role change + a BYOK rotation + a review skip → each appears in the audit log with the actor + the source IP + the timestamp (the append-only record, AC-503) |
| `settings.spec.ts` | FR-505/508/511 | set the confidence floor (a live-preview reflects it) → set a per-repo rule → set the provider routing (a tier-gated row shows the "Upgrade to use" state, not a working control) → the BYOK masked display (the raw key is never shown, FR-313) → account settings (a theme toggle, a session list) |
| `usage-limits.spec.ts` | NFR-18/AC-402 | a quota-exceeded org: a new review request → a 409 `QUOTA_EXCEEDED` (a direct API request) / a webhook → a `skipped` job + a posted notice (the "never silent" rule) |
| `cross-tenant-ui.spec.ts` | the "hide never enforce" check | a UI that shows an action the API denies is a *drift* (a route the capability matrix says "deny" must not be actionable from the UI regardless of what it shows, `AUTHORIZATION §7`, `ST-isolation-oracle` UI half) |
| `a11y-keyboard.spec.ts` | NFR-24 (the keyboard-only journey) | the top 5 journeys (J1–J5) navigable + actionable **keyboard-only**; a `prefers-reduced-motion` run still shows all content (a reduced-motion Playwright context); the key `aria-live` announcements fire (a findings-loaded region, an actioned-finding, a quota-change) |

## 3. What an E2E test asserts (the "real data" rule)

Every E2E assertion is against *real* state, not a fixture the test invented:

- **A UI number matches the DB row** (a "12 reviews" on the Overview = a `count(review_jobs)` for that org; a "78% of quota" = the `usage_events` monthly aggregate / the plan quota — the "totals come from the parts as shown" rule, `COMPONENT_CATALOG §4`). A UI that shows a number the DB doesn't back is a *fabrication* (the brief: "Every page must use real backend data… Do not fabricate… statistics", FR-5xx).
- **A mock side-effect is recorded** (the mock GitHub's recorded review publish, the mock AI's recorded calls — the test asserts the *integration* happened, not just that a UI rendered).
- **The skip/quota notices are real** (a `skipped` job has its `skip_reason` in the DB *and* a posted notice the mock GitHub recorded + the UI shows it — the "never silent" invariant, NFR-18).

## 4. The Playwright config

- **The test runner:** Playwright (Chromium + a WebKit + a Firefox matrix, the a11y/keyboard spec on all three; the journey specs on Chromium).
- **The base URL:** the Compose `web` (a `WEB_URL`).
- **The auth:** each test signs in *fresh* (a real sign-in, not a seeded cookie) — the session path is exercised (a cookie-assertion, the `HttpOnly`/`Secure` flags on the set-cookie).
- **The mock providers' state:** reset between test files (a `beforeAll` that clears the mock GitHub's recorded publishes + the mock AI's call log + a DB truncate of the test org's rows, re-seeded per test). No cross-test contamination.
- **Traces + a screenshot on failure** (the Playwright trace viewer — a failed E2E is debuggable without re-running).

## 5. The release lane (the credentialed run)

`e2e/live.spec.ts` (gated on `E2E_LIVE=true` + real secrets in the release CI lane):
1. A *real* GitHub App is installed on a test repo (the `github` App's test org).
2. A *real* PR is opened (a test-branch with a known-bug fixture diff — the benchmark's "known bug" set, so the live review has a *real* finding to find).
3. The *real* webhook is received + verified.
4. The *real* pipeline runs (a real provider call, the real model routing).
5. The *real* review is published (a real inline comment on the PR).
6. The dashboard shows the real job + the real finding + the real cost.

**The status of this suite in this build:** *blocked — requires external credentials* (a real GitHub App + a real AI provider key + a test repo). It's a **release-gate** suite that runs where the credentials exist (a release CI lane with a secrets store); in the docs' "exact status" rule it's marked **unverified/blocked here**, not claimed complete. A live run that *was* executed is recorded in the release report with the run id; a live run that *wasn't* is marked blocked.

## 6. What E2E does NOT cover (stated, `TEST_STRATEGY §9`)

- **A full container-escape / sandbox red-team** (the Phase-2 `ST-sandbox-*` negative tests prove the *contract*; a real escape is a dedicated red-team, not an E2E).
- **The hosting provider's infra** (a Postgres/Redis/K8s outage is a *host* incident, simulated by the integration failure-mode tests, not an E2E).
- **Provider-model alignment** (we test *our* boundary — the injection/leak/secret gates — not the model's own safety, `SECURITY_TEST_PLAN §6`).

## 7. The "definition-of-done" mapping

The 15-step `DEFINITION OF DONE` checklist maps to these specs (a step is "demonstrable" when its spec passes in the *dev-stack* run, or is marked *blocked* in the live lane):

| Step | Spec / assertion |
| --- | --- |
| 1–2 (sign in, create org) | `auth.spec.ts` + `onboarding.spec.ts` |
| 3 (install the App on a test repo) | `onboarding.spec.ts` (mock) / `live.spec.ts` (real, blocked here) |
| 4 (a real PR webhook received + verified) | `daily-loop.spec.ts` (a mock-dispatched webhook, the signature verified) / `live.spec.ts` (a real webhook, blocked here) |
| 5 (a review job processed, idempotent) | `daily-loop.spec.ts` + `IT-idempotency-01` (the integration half) |
| 6–8 (diff + context fetched; static + AI run) | `daily-loop.spec.ts` (a mock pipeline, the recorded side-effects) / `live.spec.ts` |
| 9 (a summary + valid inline comments published) | `daily-loop.spec.ts` (the mock GitHub's recorded publish, a valid anchor) |
| 10 (results appear in the dashboard) | `daily-loop.spec.ts` (a UI assertion + a DB-match) |
| 11 (usage attributed to the org) | `cost.spec.ts` (a `usage_events` row on the org) |
| 12 (failures + retries observable) | `cost.spec.ts` (the skip) + `audit.spec.ts` (the audit rows) + the queue tests |
| 13 (tenant isolation + security pass) | `cross-tenant-ui.spec.ts` + the `ST-*` / `IT-tenant-*` release gates |
| 14 (docs match implementation) | a docs-drift CI check + the traceability matrix |
| 15 (setup + deployment verified) | `OPERATIONS/DEPLOYMENT.md` + a Compose bring-up test (`infra/docker` a `smoke` target that boots the stack + hits the health endpoints) |
