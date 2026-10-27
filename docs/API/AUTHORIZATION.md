# VERCODE — Authorization

The capability model and enforcement. RBAC with 4 roles; every mutating route declares a required capability; the split between *tenancy denial* (404) and *capability denial* (403) is load-bearing (see `DATABASE/TENANT_ISOLATION.md` §2).

## 1. Roles and capabilities (PRD §6, the enforced matrix)

| Capability | Owner | Admin | Developer | Viewer |
| --- | :-: | :-: | :-: | :-: |
| `org.manage` (members, roles, invitations, org settings, the active-for-review repo set) | ✓ | ✓ | — | — |
| `integrations.manage` (GitHub App, providers, BYOK) | ✓ | ✓ | — | — |
| `rules.manage` (custom rules) | ✓ | ✓ | ✓ | — |
| `reviews.run` (run/re-run reviews) | ✓ | ✓ | ✓ | — |
| `read` (dashboard + findings + usage) | ✓ | ✓ | ✓ | ✓ |
| `audit.read` | ✓ | ✓ | — | — |
| `org.delete` | ✓ | — | — | — |

**Resolution:** `membership.role` → capability set, per the matrix. A Viewer hitting `reviews.run` → 403 `FORBIDDEN` (in-tenant capability denial). A non-member hitting any `/orgs/:otherId/*` route → 404 `NOT_FOUND` (tenancy denial, no existence oracle, AC-902).

## 2. The "owner is special" rules

- **Exactly one owner per org** (the `memberships` partial-unique index, `SCHEMA_REFERENCE.md`). Transferring ownership is: promote another member to owner *and* demote the current owner in one atomic transaction (two owner rows can never coexist, even transiently).
- **An org cannot exist without an owner.** Deleting the sole owner is refused (409 `LAST_OWNER`) unless the org is being deleted.
- **`org.delete` is owner-only** and soft, with a grace window (retention §5).

## 3. Enforcement points (defense in depth)

1. **Route-level capability declaration:** each Fastify route registers its required capability. The capability middleware (after authn + tenancy) resolves the role's set and 403s on a miss. *A route with no declared capability is a bug — a lint rule flags it.*
2. **Repository-level tenancy:** even a route that's "read" enforces the `org_id` scoping in the repository layer — the capability check says *what* you may do; the tenancy check says *whose data*.
3. **The service layer re-checks** for the highest-risk mutations (org deletion, role transfer, BYOK rotation) — a middleware bypass (a routing bug) is caught by the service re-check.

## 4. Tenant capability isolation

A user's capabilities are **per-org**: the same human is resolved independently in each org they belong to. A request to org B's route uses the user's role *in B*, never their role in A. The capability set is computed from the `memberships` row for the *requested* org only (a join bug that leaks capabilities across orgs is a tenancy-class defect the `IT-tenant-*` suite catches).

## 5. The GitHub webhook has its own "authorization"

- **GitHub webhook:** authorized by *HMAC + delivery dedup*, not a session (a machine path). The events it can trigger are limited by the App's *install scope* (the installer chose all-repos or specific-repos) — VERCODE only reviews repos in scope. An unknown-but-verified install → 404 `WEBHOOK_UNKNOWN_INSTALL` + audit; a verified event in no known schema (`pull_request_review`, `pull_request_target`, …) → a receipt-only 202 ack.
- **A webhook is never "user-authorized."** It's *event-authorized*: the signature proves the event's origin; the event's payload scopes *which org* it affects; the tenancy layer then enforces *which rows* that org may touch.

## 6. BYOK and secret handling (authorization for secrets)

- Setting/rotating a BYOK key is `integrations.manage` (admin+). The key is KMS-wrapped on write; the API returns only `keyPrefix` (last-4) + `active` — **the raw key is never returned** (FR-313). Revoke is a soft-deactivate (calls fall back to the platform default), with a hard-delete on rotation.
- The BYOK key, when active, is injected into the *worker's* provider calls for that org — the key is decrypted in the worker's process only, in KMS scope, never persisted in plaintext to a log or a queue payload.

## 7. The "hide, never enforce" rule for the UI

The frontend *hides* actions the current role can't take (a Viewer doesn't see the "invite" button; a non-admin doesn't see "delete org"). **Hiding is UX, not security.** The API is the enforcement point — a Viewer who hand-crafts the `invite` request gets a 403 regardless of what the UI shows. The UI's hiding is verified against the *server's* capability resolution (the UI fetches `auth/me` + the org's role and derives the same matrix), so the two can't drift: a route the UI shows that the API denies is a bug, caught by the E2E security suite (`tests/e2e/security.spec.ts`).

## 8. Audit of authorization decisions

Every **denial** (403 capability, 404 tenancy) is written to `audit_events` (`action=access.denied`, `meta={ reason: "capability"|"tenancy", requested: <route>, role }`). An authorization misconfiguration (a role that can't do something it should, or a cross-tenant leak) is *investigable* from the audit log, not just inferable from a user complaint.
