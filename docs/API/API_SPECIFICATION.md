# VERCODE — API Specification

The dashboard REST API (`/api/v1`), JSON, cookie-session authenticated. Schemas are the shared Zod types in `packages/contracts` (the source of truth — the `OPENAPI.yaml` must match it; a drift is a CI failure).

## Conventions

- **Base:** `https://<host>/api/v1`.
- **Auth:** signed HTTP-only cookie (`vercode_session`), Secure + SameSite=Lax; a bearer-less cookie flow (the API is same-origin with the web app). Webhook routes are the exception (no cookie; they're public + HMAC-verified).
- **Authorization:** every non-webhook route is tenant-scoped; the request context carries `org_id` (from the URL or a header) + the session's role + capabilities. Cross-org → 404; wrong capability → 403.
- **Errors:** structured `{ "error": { "code", "message", "details?" } }` (see `ERROR_CODES.md`). No stack traces.
- **Idempotency:** mutating routes that can be retried accept `Idempotency-Key` (client-generated) and dedup on it; webhook + payment routes use provider event ids instead.
- **Pagination:** `?cursor=` + `?limit=` (cursor-based, stable), `next_cursor` in the response.
- **Rate limiting:** per-org + per-user tiers (`RATE_LIMITING.md`); `429` with `Retry-After`.

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

### Organizations
| Method | Path | Purpose | Auth | Capability |
| --- | --- | --- | --- | --- |
| POST | `/orgs` | Create org (creator=owner) | session | — |
| GET | `/orgs/:id` | Org detail | session (member) | read |
| PATCH | `/orgs/:id` | Rename / settings | session | admin+ |
| DELETE | `/orgs/:id` | Soft-delete org | session | owner |
| GET | `/orgs/:id/members` | List members | member | read |
| POST | `/orgs/:id/invitations` | Invite | admin+ | manage |
| POST | `/orgs/:id/invitations/:token/accept` | Accept invite | session (invited) | — |
| PATCH | `/orgs/:id/members/:userId` | Change role | admin+ | manage |
| DELETE | `/orgs/:id/members/:userId` | Remove member | admin+ | manage |

### GitHub
| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| GET | `/orgs/:id/github` | Install state | member |
| POST | `/orgs/:id/github/install-url` | Generate the App install URL (server-side) | admin+ |
| POST | `/orgs/:id/github/disconnect` | Disconnect (schedule purge) | admin+ |
| GET | `/orgs/:id/github/repos` | Connected repos | member |
| POST | `/orgs/:id/github/review` | Request a re-review of an open PR (US-105) | developer+ |
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

### Usage & billing
| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| GET | `/orgs/:id/usage` | Usage (range, provider breakdown, cost) | member |
| GET | `/orgs/:id/billing` | Plan + invoices + quota | owner/admin |
| POST | `/orgs/:id/billing/subscribe` | Start/upgrade/downgrade (initiates provider flow) | owner |
| POST | `/orgs/:id/billing/cancel` | Cancel (at-period-end) | owner |
| POST | `/webhooks/billing` | **Public** verified payment webhook | none (provider sig) |

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
- **Auth:** session, member; **capability:** developer+.
- **Request:** `{ "prNumber": int, "commitSha": string }`
- **Response 202:** `{ jobId, status: "queued" }`
- **Errors:** 404 (PR not in a connected repo), 429 (rate limited), 409 (an identical job is already in-flight for that SHA — returns the existing job id, no new work).
- **Idempotency:** commit-SHA keyed; a same-SHA request is a no-op (NFR-13).
- **Note:** this enqueues the same pipeline as the webhook — the quota pre-flight runs identically, so a quota-exceeded org gets a *skipped* job + posted notice, not a 500.

### POST `/orgs/:id/findings/:id/actions`
- **Auth:** session, member; **capability:** developer+.
- **Request:** `{ "action": "accepted"|"dismissed_reasonable"|"dismissed_unreasonable"|"fixed"|"ignored" }`
- **Response 200:** `{ findingId, action, actedAt }`
- **Audit:** `finding.actioned` (actor, findingId, action) — feeds the north-star metric.

### GET `/orgs/:id/usage`
- **Auth:** session, member; read.
- **Query:** `?range=30d|90d|12mo&by=provider|severity|repo`
- **Response:** `{ series: UsageDaily[], totals: { reviews, inputTokens, outputTokens, estUsd, bySeverity }, quota: { used, limit, percentUsed } }`
- **Note:** `series` is the `usage_daily` rollup (never a raw scan); `quota` drives the "80% warning" banner (USER_JOURNEYS J4).

### POST `/webhooks/github` (public, HMAC)
- **Auth:** HMAC-SHA256 over the raw body with `GITHUB_WEBHOOK_SECRET`, in `X-Hub-Signature-256`; `X-Hub-Delivery` dedup; 5-min timestamp window.
- **Response:** `202` (verified + enqueued), `401` (bad signature — audited), `422` (verified but malformed body — not enqueued).
- **Idempotency:** `delivery_id` UK (NFR-06) — a replay is a 200 no-op.
- **Detail:** `WEBHOOK_SPECIFICATION.md`.

## Error & rate-limit behavior

See `ERROR_CODES.md` (stable codes) and `RATE_LIMITING.md` (tiers). Every error body is `{ "error": { "code", "message", "details?" } }`; `code` is stable and machine-readable (the web client switches on `code`, not `message`).
