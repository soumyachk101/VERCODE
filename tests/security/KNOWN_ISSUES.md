# VERCODE security gate — KNOWN ISSUES

Security-critical defects found while building the `tests/security` gate.
Each entry records *how the spec pins the correct behavior so the defect
stays visible* + the repro, so the owner has a ready-made test to drive
the fix. Statuses reflect the repo as of this commit; the M7/M8 agents
own the security-critical product path these entries point at, so they are
flagged, **not fixed** here.

---

## P1 — The tenant/capability gate is dormant on the real `/orgs/*` routes (T-02, P0) — RESOLVED by M7

**Status: RESOLVED.** The M7 agent fixed `apps/api/src/plugins/tenant.ts`
to read the capability from *both* `routeOptions.config` and
`routeOptions.schema.config` (the `schema.config` shape the route builders
use), closing the "capability gate is dormant" half of this finding. The
remaining half — that the plugin's `preHandler` must actually be *in the
scope where the `/orgs/*` routes are registered* (Fastify plugin
encapsulation + `buildServer`'s registration order) — is the M7/M8
owner's to verify end-to-end. This spec is that verification gate.

**What was found (probed against the real source):** the tenant plugin's
`preHandler` hook (the 404-vs-403 tenancy + capability gate,
TENANT_ISOLATION.md §2) did not fire on `/orgs/*` requests in the running
app, for two independent reasons:

1. **Encapsulation / registration order:** the plugin's hook was being
   added in a registration order that meant the route's handler was
   captured *before* the hook applied — a sibling- or deferred-plugin
   structure, so the gate's preHandler did not apply to the route
   (probed: a route in the same child scope as the plugin → 200,
   `req.tenant` null, no membership/organization DB query ever issued).
2. **Capability read:** the plugin read
   `req.routeOptions.config?.capability`, but the app's routes declare the
   capability in the *schema* (`{ schema: { config: { capability } } }`),
   which lands on `routeOptions.schema.config` — so even where the hook
   ran, the capability gate saw `undefined` and was dormant (this half is
   what M7 fixed in the plugin source).

**Impact (T-02 Critical):** this is the #1 SaaS security threat — a
cross-tenant data leak. With the gate dormant, the only thing standing
between a user and another org's data is each route handler's *own*
org-scoped query. Any route that forgets its `org_id` filter leaks
cross-tenant data with no middleware backstop.

**Where it's pinned:** `security-tenant.test.ts` asserts the *correct*
404-vs-403 split + capability-matrix completeness as a decision unit (the
oracle the gate must implement), so the moment the gate is wired in, the
suite catches a regression. The endpoint-sweep (ST-isolation-oracle
across every tenant route) + the uniform-404-body check are pending the
gate running end-to-end in the fixed app.

**Fix direction (for the owner):** register the tenant/auth gate hooks in
the scope where the routes live (wrap the route registration + the gate in
one plugin, or add the hooks at the root where the routes are registered),
so the preHandler actually applies to `/orgs/*`. Regression test: inject
`GET /orgs/{otherOrg}` → expect 404 + an `access.denied_cross_tenant`
audit row.

---

## P2 — `buildServer()` threw at boot: `Cannot read properties of undefined (reading 'db')` (P0 availability) — RESOLVED by M7

**Status: RESOLVED.** The M7 agent refactored `apps/api/src/routes/index.ts`
to pass `db` + `queue` into `registerRoutes(app, config, { db, queue })`
explicitly, instead of the webhook plugins reading a root-invisible
`a.auth.db` decoration. `buildServer().ready()` now completes cleanly;
the api project's full test suite (incl. the 13 webhook tests) passes.

**What was found (probed against the real source, pre-fix):**
`apps/api/src/routes/index.ts` (the `githubWebhooksPlugin` closure) read
`a.auth.db` — but the `auth` decoration was encapsulated to the auth
plugin (same root cause as P1), so at the scope where the webhook plugin
ran, `a.auth` was `undefined`. `buildServer().ready()` threw
`TypeError: Cannot read properties of undefined (reading 'db')` before
the app served a single request.

**Repro (probe, no product change, pre-fix):**
```ts
import { buildServer } from "…/apps/api/src/server.js";
buildServer({ config }).ready();
// → "Cannot read properties of undefined (reading 'db')"
```

**Impact:** the API app did not boot. This also blocked the `ST-webhook-*`
/ `ST-billing-*` ingress tests from running against the *real* app (the
in-repo `webhooks.test.ts` worked around it by hand-decorating `app.auth`
with a mock — a test harness, not a fix).

---

## P3 — M7 in-flight: `apps/worker/src/jobs/review.ts` had a type error (`Property 'cap' does not exist on type 'JobObservability'`) — RESOLVED by M7

**Status: RESOLVED.** While building the quota spec, `runReviewJob`
referenced a `cap` field on `JobObservability` that the interface didn't
declare, breaking both typecheck and the "under-quota runs the pipeline"
path. The M7 agent completed the `cap`/`capture` wiring; the worker
project now typechecks and its tests pass. **No action needed** — recorded
because the security-quota spec's "under-quota runs" test was blocked on
it while open.

---

## Notes on what the security specs deliberately do NOT do

- **No skipped / stubbed specs.** All four specs
  (`security-webhook`, `security-tenant`, `security-injection`,
  `security-quota`) run against real source and pass (18 tests total).
- **Tenant spec** drives the *decision logic* (the 404-vs-403 split + the
  capability matrix) directly — it does not assert the dormant
  middleware, because asserting it would encode the P1 defect as
  "correct." The spec documents P1/P2 inline and is the gate for the fix.
- **Injection spec** exercises the review-engine pipeline end-to-end
  (`runReview`) with the `MockAdapter` in its `"steered"` scenario — the
  engine's real merge/policy/validate stages — and asserts the
  prompt-injection invariants (no system-prompt leak in a published
  finding, no tool path, deterministic findings survive).
- **Webhook spec** exercises the real `POST /webhooks/github` route +
  `verifyGitHubWebhook` + the in-memory queue seam (the `webhooks.test.ts`
  pattern), asserting forged → 401 + no enqueue + audit, replay → 200
  no-op.
- **Quota spec** exercises the real `runReviewJob` + `checkQuotaPlan`
  + `policy-engine` `checkQuota` with a mocked DB + a counting provider,
  asserting over-quota → `skipped:quota_exceeded`, zero provider calls,
  zero tokens, a posted notice.

**Pending M8 fixtures (marked, not fabricated):**
`tests/fixtures/{injection,ai-malformed,webhook-events}/` exist but are
empty — the specs generate their payloads inline so they run today. When
M8 lands the fixture library, the four specs fold in by their ST-* ids
(`README.md` "ST-* test id" column) without duplication.
