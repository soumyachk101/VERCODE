# VERCODE — Data Dictionary

Field-level catalog. PK/FK/index constraints are in `SCHEMA_REFERENCE.md` (Prisma is the source of truth); this dictionary documents *meaning, domain rules, and examples* for each column.

## users

| Field | Type | Rule / Example |
| --- | --- | --- |
| `id` | text PK (cuid) | — |
| `email` | text UK | lowercased, verified flag separate |
| `password_hash` | text | Argon2id hash; never plaintext, never returned by the API |
| `email_verified` | bool | false until the verify link is clicked |
| `name` | text? | display name |
| `github_provider_token` | text? | the user's per-user GitHub OAuth token ("Connect GitHub"); null = not connected; stored server-side only, never sent to the browser |
| `github_handle` | text? | the connected GitHub login ("Connected as <handle>"); cleared on disconnect |

## github_oauth_states

| Field | Rule |
| --- | --- |
| `token` | UK — random + unguessable anti-CSRF `state`; 10-min TTL (`expires_at`) |
| `used_at` | set when the state is consumed (single-use); a re-used state is rejected |
| `redirect_to` | optional post-connect destination |

## sessions

| Field | Rule |
| --- | --- |
| `token_hash` | Hashed session token (the cookie carries the *raw* signed token; the DB stores its hash — a DB leak doesn't yield usable session tokens) |
| `expires_at` | idle (12 h) + absolute (30 d) — whichever is earlier |
| `revoked_at` | set on individual or "sign out everywhere" revocation |

## organizations

| Field | Rule |
| --- | --- |
| `slug` | UK, URL-safe, reserved-words rejected (admin, api, etc.) |
| `plan` | enum FREE/DEVELOPER/TEAM/ENTERPRISE — retained in schema (default FREE) but inert under the no-paywall state: no plan gates access or quota |
| `status` | ACTIVE / SUSPENDED / DELETED (soft) |

## memberships

| Field | Rule |
| --- | --- |
| `role` | OWNER (exactly one per org), ADMIN, DEVELOPER, VIEWER. Capability matrix in PRD §6. |

## invitations

| Field | Rule |
| --- | --- |
| `token_hash` | hashed; the email link carries the raw token |
| `expires_at` | 7 days from creation (AC-103) |
| unique | one pending invite per `(org, email)` |

## github_installs / github_repos

| Field | Rule |
| --- | --- |
| `github_installation_id` | GitHub's numeric id, per install |
| `status` | ACTIVE / REMOVED (removed on `installation.deleted`, AC-204) |
| `github_repo_id` | GitHub's numeric repo id (bigint) |
| `connected` | false → content purge scheduled (`retention_jobs`) |

## webhook_deliveries

| Field | Rule |
| --- | --- |
| `delivery_id` | `X-Hub-Delivery` header; UK → replay = no-op (NFR-06) |
| `accepted` | false if signature/timestamp failed (still recorded for the audit trail) |

## review_jobs

| Field | Rule |
| --- | --- |
| `(org_id, repo_id, pr_number, commit_sha)` | **UK = the idempotency key** (ADR-007) |
| `status` | QUEUED/RUNNING/SUCCEEDED/FAILED/SKIPPED/PARTIAL |
| `skip_reason` | set iff SKIPPED: `quota_exceeded` / `same_sha` / `install_removed` / `pr_closed` |
| `published_github_review_id` | set once published; a retry finds it → no-op publish |
| `est_usd_cost` | DECIMAL(10,6), ≥ 0; sum of the review's AI calls |

## review_findings

| Field | Rule |
| --- | --- |
| `source` | ESLINT / SEMGREP / AI_DEEP / AI_SECURITY / DETERMINISTIC_SUMMARY |
| `line` | 1-based line in the NEW file; must be validated against the diff's added-line ranges (FR-306) |
| `severity` | LOW/MEDIUM/HIGH/CRITICAL |
| `category` | the 9 `FindingCategory` values (contracts) |
| `confidence` | DECIMAL(3,2), 0..1 — a *heuristic*, not a calibrated probability |
| `anchor_status` | INLINE / ANCHOR_FAILED / PR_BODY (how it was actually published) |
| `payload` | JSONB: the full structured finding (suggestedFix, promptVersion, evidence) |

## org_settings

| Field | Rule |
| --- | --- |
| `org_id` | UK — one row per org |
| `confidence_floor` | DECIMAL(3,2), default 0.6 — findings below this are dropped |
| `max_files` / `max_lines` | budget caps (defaults 60 / 3000); over-budget degrades rather than crashes |
| `provider` | default provider for the org's AI calls (e.g. "openai"); overridable via `model_routes` |
| `token_spend_cap_monthly` | DECIMAL(12,6), default 0 = no cap (per-org soft cap; the platform backstop is `PLATFORM_TOKEN_SPEND_CAP_USD`) |
| `active_repos_for_review` | JSON? — the set of repos eligible for review (gates the connect-first flow) |

## repo_rules

| Field | Rule |
| --- | --- |
| `version` | monotonically increasing per `(org_id, repo_id)`; the current rule set is the highest version |
| `suppress_categories` | JSON — `FindingCategory[]` suppressed for this repo |
| `confidence_floor_override` | optional per-repo floor override (DECIMAL(3,2)) |
| `per_language_toggles` | JSON? — enable/disable review per language |

## model_routes

| Field | Rule |
| --- | --- |
| `(org_id, task, version)` | UK — one active routing entry per task per version; `task` ∈ risk-triage / deep-review / security-review / summary |
| `provider` / `model` / `max_tokens` | the resolved routing target for the task |

## finding_actions

| Field | Rule |
| --- | --- |
| `action_type` | ACCEPTED / DISMISSED_REASONABLE / DISMISSED_UNREASONABLE / FIXED / IGNORED — appended, never mutated (a dismissal is a record, not an edit) |
| `actor_id` | the acting user (nullable for system-driven actions) |

## usage_events / usage_daily

| Field | Rule |
| --- | --- |
| `month` | "YYYY-MM" — the monthly aggregate key for the quota gate |
| append-only | no update/delete path; hard-deleted by age only |
| `usage_daily` | rollup, `UK (org_id, day)` — the dashboard read path |

## org_billing / billing_events

**DORMANT:** these two models were part of the removed billing feature (Stripe/Razorpay provider state + event log). No live code path reads or writes them; they remain in the Prisma schema pending a separate decision. Usage reporting is the live path (`usage_events`, § below). `tests/fixtures/webhook-events/` still carries `stripe-*.json` fixtures, likewise dormant.

| Field | Rule |
| --- | --- |
| `status` | TRIALING/ACTIVE/PAST_DUE/CANCELED/PAUSED — (was moved by verified provider webhooks, AC-403; the webhooks are gone) |
| `billing_events (provider, provider_event_id)` | UK — (was event idempotency; a re-delivered event no-ops) |

## audit_events

| Field | Rule |
| --- | --- |
| append-only | insert-only; 180 d minimum retention (NFR-27) |
| `source_ip` | the acting request's IP (where resolvable) |
| `meta` | JSONB context (e.g., old→new role, the actioned-finding id) |

## byok_keys

| Field | Rule |
| --- | --- |
| `wrapped_key` | KMS-wrapped ciphertext of the provider key — **never the raw key** (FR-313) |
| `key_prefix` | last-4 for masked display in the dashboard |
| `active` | false → the org's calls use the platform default key |

## retention_jobs

| Field | Rule |
| --- | --- |
| `kind` | `repo_content_purge` / `install_content_purge` / `findings_expire` / `audit_expire` / `usage_expire` (note: `repo_content_purge` and `install_content_purge` are both used for install-removal purges; see DATA_RETENTION §2) |
| `status` | PENDING/DONE/FAILED; the retention queue processes PENDING in order of `run_at` |
