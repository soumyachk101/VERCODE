# VERCODE security gate — KNOWN ISSUES

Security-critical defects found while building the `tests/security` gate.
These are flagged, **not fixed** (the security-critical product path is
owned by the M7/M8 agents — fixing it here would conflict with their in-
flight work). Each entry records *how the spec pins the correct behavior so
the defect stays visible* + the repro, so the owner has a ready-made test
to drive the fix.

---

## P1 — The tenant/capability gate never runs on the real routes (T-02, P0)

**What:** The tenant plugin's `preHandler` hook (the 404-vs-403 tenancy +
capability gate, TENANT_ISOLATION.md §2) does not fire on `/orgs/*`
requests in the running app. Two independent defects combine:

1. **Encapsulation (primary):** `buildTenantPlugin`'s hook + the `auth`/
   `tenant` decorations are registered at the *root* app scope
   (`apps/api/src/server.ts` → `app.register(buildAuthPlugin())`,
   `app.register(buildTenantPlugin())`), but the routes are registered in
   *sibling* child plugins (`registerRoutes` → `app.register(orgRoutes,
   { prefix: "/orgs" })`). Fastify plugin encapsulation means a hook made
   in one plugin is **not** visible to routes in a *sibling* plugin or on
   the root — so the gate's preHandler does not apply to `/orgs/*`.
   **Probed:** a route registered in the *same* scope as the plugin does
   run the hook (200 + `req.tenant` set + membership/organization DB
   queries); a sibling/root route does not (200, `req.tenant` null, no DB
   query).
2. **Capability read:** the plugin reads
   `req.routeOptions.config?.capability`, but the app's routes declare the
   capability in the *schema* (`{ schema: { config: { capability } } }`),
   which lands on `routeOptions.schema.config` — so even where the hook
   runs, the capability gate sees `undefined` and is dormant.

**Impact (T-02 Critical):** this is the #1 SaaS security threat — a
cross-tenant data leak. With the gate dormant, the only thing standing
between a user and another org's data is each route handler's *own*
org-scoped query. Any route that forgets its `org_id` filter leaks
cross-tenant data with no middleware backstop.

**Where it's pinned:** `security-tenant.test.ts` asserts the *correct*
404-vs-403 split + capability-matrix completeness as a decision unit, so
the moment the gate is wired in, the suite catches a regression. The
endpoint-sweep (ST-isolation-oracle) + the uniform-404-body check are
pending the gate running end-to-end.

**Fix direction (for the owner):** register the tenant/auth gate hooks in
the scope where the routes live (wrap the route registration + the gate in
one plugin, or add the hooks at the root where the routes are registered),
AND declare the capability where the plugin reads it (the route `config`
option, or update the plugin to read `routeOptions.schema.config`).
Regression test: inject `GET /orgs/{otherOrg}` → expect 404 + an
`access.denied_cross_tenant` audit row.

---

## P2 — `buildServer()` throws at boot: `Cannot read properties of undefined (reading 'db')` (P0 availability)

**What:** `apps/api/src/routes/index.ts` (the `githubWebhooksPlugin`
closure) + `billing-webhook.ts` read `a.auth.db` — but the `auth`
decoration is encapsulated to the auth plugin (same root-cause as P1), so
at the scope where those plugins run, `a.auth` is `undefined`.
`buildServer().ready()` throws
`TypeError: Cannot read properties of undefined (reading 'db')` before
the app serves a single request.

**Repro (probe, no product change):**
```ts
import { buildServer } from "…/apps/api/src/server.js";
buildServer({ config }).ready();
// → "Cannot read properties of undefined (reading 'db')"
```

**Impact:** the API app does not boot. Also blocks the `ST-webhook-*` /
`ST-billing-*` ingress tests from running against the *real* app (the
in-repo `webhooks.test.ts` works around it by hand-decorating `app.auth`
with a mock — a test harness, not a fix).

**Fix direction (for the owner):** the same encapsulation root cause as P1
— `auth.db` must be visible at the scope where the webhook plugins run.
Either decorate `auth` at the root scope, or pass `db` into
`registerRoutes` explicitly. Re-run `buildServer().ready()` to confirm a
clean boot.

---

## P3 — M7 in-flight: `apps/worker/src/jobs/review.ts` had a type error (`Property 'cap' does not exist on type 'JobObservability'`)

**Status: RESOLVED by the M7 agent** (landed before this gate was
finalized). While building the quota spec, `runReviewJob` referenced a
`cap` field on `JobObservability` that the interface didn't declare,
breaking both typecheck and the "under-quota runs the pipeline" path. The
M7 agent completed the `cap`/`capture` wiring; the worker project now
typechecks and its tests pass. **No action needed** — recorded because the
security-quota spec's "under-quota runs" test was blocked on it while open.

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
