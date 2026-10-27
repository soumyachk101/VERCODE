# VERCODE — API Specification

The dashboard REST API (`/api/v1`), JSON, cookie-session authenticated. Schemas are the shared Zod types in `packages/contracts` (the source of truth — the `OPENAPI.yaml` must match it).

## Conventions

- **Base:** `https://<host>/api/v1`.
- **Auth:** signed HTTP-only cookie (`vercode_session`), Secure + SameSite=Lax; a bearer-less cookie flow (the API is same-origin with the web app). Webhook routes are the exception (no cookie; they're public + HMAC-verified).
- **Authorization:** every non-webhook route is tenant-scoped; the request context carries `org_id` (from the URL or a header) + the session's role + capabilities. Cross-org → 404; wrong capability → 403.
- **Errors:** structured `{ "error": { "code", "message", "details?" } }` (see `ERROR_CODES.md`). No stack traces.
- **Idempotency:** mutating routes that can be retried accept `Idempotency-Key` (client-generated) and dedup on it; webhooks use the provider delivery/event ids instead.
- **Pagination:** `?cursor=` + `?limit=` (cursor-based, stable), `next_cursor` in the response.
- **Rate limiting:** the sign-in route enforces a per-email lockout (`429` `ACCOUNT_LOCKED` after 5 failures in 15 min; `RATE_LIMITING.md` documents what is actually in place — there is no per-org/per-user RPS middleware).

## Endpoint index (grouped; full per-endpoint detail below)

### Auth & account
| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| POST | `/auth/signup` | Create account | public |
| POST | `/auth/signin` | Sign in (set session) | public |
| POST | `/auth/signout` | Revoke session | session |
| POST | `/auth/signout-all` | Revoke all sessions | session |
| GET | `/auth/me` | Current user + orgs | session |
| POST | `/auth/verify-email` | Confirm email | public |
| GET | `/me` | Profile | session |
| PATCH | `/me` | Update profile/password | session |
| GET | `/me/sessions` | List sessions | session |
| GET | `/auth/github/start` | Personal GitHub OAuth: build the authorize URL (10-min `state` token, anti-CSRF) | session |
| GET | `/auth/github/callback` | OAuth callback: exchange `code`, store the user token + handle, redirect to `/settings/account?github=connected` | session |
| POST | `/auth/github/disconnect` | Clear the user's personal GitHub token + handle | session |

### Health
| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| GET | `/health/healthz` | Liveness (`{ ok, ts }`) | public |
| GET | `/health/readyz` | Readiness (DB reachable; `503` when down) | public |

### Organizations
| Method | Path | Purpose | Auth | Capability |
| --- | --- | --- | --- | --- |
| POST | `/orgs` | Create org (creator=owner) | session | — |
| GET | `/orgs/:id` | Org detail | session (member) | read |
| DELETE | `/orgs/:id` | Soft-delete org | session | org.delete (owner) |
| GET | `/orgs/:id/members` | List members | member | read |
| POST | `/orgs/:id/invitations` | Invite | admin+ | org.manage |
| POST | `/orgs/:id/invitations/:token/accept` | Accept invite | session (invited) | — |
| PATCH | `/orgs/:id/members/:userId` | Change role | admin+ | org.manage |
| DELETE | `/orgs/:id/members/:userId` | Remove member | admin+ | org.manage |

### GitHub
| Method | Path | Purpose | Capability |
| --- | --- | --- | --- |
| GET | `/orgs/:id/github` | Install state (installs + connected repos) | read |
| GET | `/orgs/:id/github/candidates` | Repos the ACTIVE install can still connect (repo rows known but `connected: false`) | read |
| POST | `/orgs/:id/github/connect` | Connect: bare click → install URL + audit; `{ fullName }` → re-enable a known repo row | integrations.manage |
| GET | `/orgs/:id/github/repos` | Connected repos (`connected: true` only) | read |
| GET | `/orgs/:id/github/repositories` | All known repos, incl. disabled (the settings page's accessible-repos list) | read |
| PUT | `/orgs/:id/github-repos` | Store the org's active-for-review repo set (`org_settings.activeReposForReview`); foreign/stale ids are dropped | org.manage |
| POST | `/orgs/:id/github/review` | Request a re-review of an open PR (US-105) | reviews.run |
| POST | `/orgs/:id/github/install-url` | Generate the App install URL (server-side) | integrations.manage |
| POST | `/orgs/:id/github/disconnect` | Disconnect: mark installs REMOVED, disable repos, schedule a content purge | integrations.manage |
| POST | `/webhooks/github` | **Public** GitHub webhook ingress (HMAC-verified) | none (HMAC) |

### Reviews & findings
| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| GET | `/orgs/:id/reviews` | Review job list (filter by status/repo/PR) | member |
| GET | `/orgs/:id/reviews/:jobId` | Job detail (summary, cost, status) | member |
| GET | `/orgs/:id/reviews/:jobId/findings` | Findings for a job (filter severity/category) | member |
| POST | `/orgs/:id/findings/:id/actions` | Record a finding action (accept/dismiss/fix) | developer+ |
| GET | `/orgs/:id/security` | Security rollup (severity ≥ high, time-filtered) | member |
| GET | `/orgs/:id/trends` | Finding-trend series (category/repo) | member |

### Configuration
| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| GET | `/orgs/:id/settings` | Org settings (floors, budgets, provider) | member |
| PATCH | `/orgs/:id/settings` | Update | admin+ |
| GET | `/orgs/:id/rules` | Custom rules (org + repo) | member |
| POST | `/orgs/:id/rules` | Create/update rule (versioned) | developer+ |
| GET | `/orgs/:id/providers` | Provider + routing config | admin+ |
| POST | `/orgs/:id/providers/byok` | Set/rotate BYOK key (masked display) | admin+ |
| DELETE | `/orgs/:id/providers/byok` | Revoke BYOK key | admin+ |

### Usage
| Method | Path | Purpose | Capability |
| --- | --- | --- | --- |
| GET | `/orgs/:id/usage` | Monthly usage aggregates: the daily series + the month's totals (reviews, tokens, est. cost) | read |

### Audit
| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| GET | `/orgs/:id/audit` | Audit log (filter action/target/actor) | admin+ |

## Per-endpoint detail (major routes; the pattern is uniform)

### POST `/orgs/:id/invitations`
- **Auth:** session, member of `:id`; **capability:** admin+.
- **Request:** `{ "email": string, "role": "admin"|"developer"|"viewer" }`
- **Response 201:** `{ invitationId, email, role, expiresAt }`
- **Errors:** 403 (not admin), 409 (duplicate pending invite → returns the existing one), 422 (bad role/email).
- **Idempotency:** natural — a second pending invite for the same email returns 409 with the existing invite.
- **Audit:** `org.invitation_sent` (actor, email, role).

### POST `/orgs/:id/github/review` (re-review, US-105)
- **Auth:** session, member; **capability:** `reviews.run`.
- **Request:** `{ "prNumber": int, "commitSha": string }`
- **Response 202:** `{ jobId, status: "queued" }`
- **Errors:** 404 (no connected repository found for this org), 422 (missing `prNumber`/`commitSha`), 409 (an identical job is already in-flight for that SHA — returns the existing job id, no new work).
- **Idempotency:** commit-SHA keyed; a same-SHA request while a job is in-flight is a no-op.
- **Note:** this enqueues the same pipeline as the webhook.

### GET `/orgs/:id/usage`
- **Auth:** session, member; **capability:** `read`.
- **Query:** `?range=30d|90d|12mo` (default `30d`; `12mo` = the last 365 days).
- **Response:**
  ```json
  {
    "series": [{ "day": "2026-07-01", "reviews": 12, "inputTokens": 0, "outputTokens": 0, "estUsdCost": 0, "findingCounts": {} }],
    "totals": {
      "reviews": 40, "inputTokens": 0, "outputTokens": 0, "estUsd": 0,
      "bySeverity": { "critical": 0, "high": 0, "medium": 0, "low": 0 }
    }
  }
  ```
- **Note:** `series` is the `usage_daily` rollup for the range; `totals` is the current month's `usage_events` aggregate. The response carries no cap or limit — usage is plain reporting.

### The GitHub OAuth trio (per-user)
- **GET `/auth/github/start`:** session required. Builds the GitHub authorize URL (scope `user:read`, `state` token with a 10-min TTL, anti-CSRF). 503 `GITHUB_OAUTH_NOT_CONFIGURED` when `GITHUB_CLIENT_ID` is unset. Response: `{ url, state }`.
- **GET `/auth/github/callback`:** session required; GitHub's callback (the `code` rides the user's session cookie). Exchanges the code for a token, fetches the user's handle, stores both on the user row, then redirects to `/settings/account?github=connected` (a `?github=error&reason=...` redirect on denial / state mismatch / exchange failure).
- **POST `/auth/github/disconnect`:** session required. Clears the user's `githubProviderToken` + `githubHandle`. Response: `{ ok: true }`.

### The org GitHub connect endpoints
- **GET `/orgs/:id/github/candidates`:** the ACTIVE install's repo rows that are known but `connected: false` (`{ fullName, url, defaultBranch }` each) + the install's account metadata. No ACTIVE install → `{ connected: false, candidates: [] }`.
- **POST `/orgs/:id/github/connect`:** bare body → intent-only: writes an audit line and returns `{ ok, installUrl }` (the install itself is recorded by GitHub's `installation` webhook). `{ fullName }` → re-enables that known, disconnected repo row: 200 `{ ok, fullName, installUrl }`; 404 `NOT_FOUND` if the row is unknown to the install; 422 if already connected.
- **GET `/orgs/:id/github/repositories`:** all of the org's `github_repos` rows, including disabled ones — the settings page's "known repos" list.
- **PUT `/orgs/:id/github-repos`:** `{ repoIds: string[] }` → stores the active-for-review set on `org_settings.activeReposForReview`. Only ids that exist in this org's repo table are kept (stale/foreign ids are dropped, not written). Response: `{ ok, activeRepoIds }`.

### Health
- **GET `/health/healthz`:** public liveness → `{ ok: true, ts }`.
- **GET `/health/readyz`:** public readiness → `{ ok: true, db: "up" }`, or `503` `{ ok: false, db: "down" }` when the DB is unreachable.

### POST `/orgs/:id/findings/:id/actions`
- **Auth:** session, member; **capability:** developer+.
- **Request:** `{ "action": "accepted"|"dismissed_reasonable"|"dismissed_unreasonable"|"fixed"|"ignored" }`
- **Response 200:** `{ findingId, action, actedAt }`
- **Audit:** `finding.actioned` (actor, findingId, action) — feeds the north-star metric.

### POST `/webhooks/github` (public, HMAC)
- **Auth:** HMAC-SHA256 over the raw body with `GITHUB_WEBHOOK_SECRET`, in `X-Hub-Signature-256`; `X-Hub-Delivery` dedup; 5-min timestamp window.
- **Response:** `202` (verified + enqueued), `401` (bad signature — audited), `422` (verified but malformed body — not enqueued).
- **Idempotency:** `delivery_id` UK (NFR-06) — a replay is a 200 no-op.
- **Detail:** `WEBHOOK_SPECIFICATION.md`.

## Error & rate-limit behavior

See `ERROR_CODES.md` (stable codes) and `RATE_LIMITING.md` (what is actually enforced). Every error body is `{ "error": { "code", "message", "details?" } }`; `code` is stable and machine-readable (the web client switches on `code`, not `message`).
