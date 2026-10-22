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
| `plan` | enum FREE/DEVELOPER/TEAM/ENTERPRISE — the *effective* plan; authoritative plan state lives in `org_billing` (reconciled) |
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
| `est_usd_cost` | DECIMAL(12,6), ≥ 0; sum of the review's AI calls |

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

## usage_events / usage_daily

| Field | Rule |
| --- | --- |
| `month` | "YYYY-MM" — the monthly aggregate key for the quota gate |
| append-only | no update/delete path; hard-deleted by age only |
| `usage_daily` | rollup, `UK (org_id, day)` — the dashboard read path |

## org_billing / billing_events

| Field | Rule |
| --- | --- |
| `status` | TRIALING/ACTIVE/PAST_DUE/CANCELED/PAUSED — moved only by verified provider webhooks (AC-403) |
| `billing_events (provider, provider_event_id)` | UK — event idempotency; a re-delivered event no-ops |

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
| `kind` | `repo_content_purge` / `findings_expire` / `audit_expire` / `usage_expire` |
| `status` | PENDING/DONE/FAILED; the retention queue processes PENDING in order of `run_at` |
