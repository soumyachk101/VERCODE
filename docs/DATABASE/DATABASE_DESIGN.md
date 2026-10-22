# VERCODE — Database Design

PostgreSQL 16, Prisma ORM. This document is the *design*; `SCHEMA_REFERENCE.md` is the field-level catalog and the Prisma source; `DATABASE/DATABASE_DESIGN.md` (this file) is the rationale + constraints.

## 1. Design principles

1. **Tenant isolation is a schema property.** Every tenant-owned table carries `org_id` (or is reachable only through a tenant-owned parent) and its primary indexes are composite with `org_id` leading (`INDEXING_STRATEGY.md`). A "return all rows" query is structurally impossible through the tenant repositories.
2. **Append-only where it matters.** `audit_events` and `usage_events` are insert-only (no update/delete path in the API); retention is a scheduled *hard-delete* by age, not a soft flag (except where audit integrity requires a soft-delete marker — see §6).
3. **JSONB for polymorphic payloads, typed columns for what you query on.** Findings store the full structured payload in `payload JSONB`, but the *queryable* attributes (`severity`, `category`, `org_id`, `job_id`, `created_at`) are real columns, so rollups and filters are indexable.
4. **Durable state over payload.** Job payloads carry a `jobId` pointer; all authoritative state (org, quota, settings) is re-read from the DB by the worker (SERVICE_BOUNDARIES "must never cross" line 5).
5. **Idempotency is a table, not a check.** Unique keys on `(org_id, repo_id, pr_number, commit_sha)` and delivery-id PKs make redelivery a no-op at the DB layer.

## 2. Entity groupings (ERD in `ERD.md`)

| Group | Tables |
| --- | --- |
| Identity | `users`, `sessions`, `organizations`, `memberships`, `invitations` |
| GitHub | `github_installs`, `github_repos`, `webhook_deliveries` |
| Reviews | `review_jobs`, `review_findings`, `finding_actions` |
| Config | `org_settings`, `repo_rules`, `model_routes` (org routing overrides), `byok_keys` |
| Usage/Billing | `usage_events`, `usage_daily` (rollup), `org_billing`, `billing_events` (idempotency) |
| Audit | `audit_events` |
| Retention | `retention_jobs` (scheduled purges) |

## 3. Key entities

### `users`
Global (not tenant-scoped): a user belongs to ≥0 orgs via `memberships`. `email` unique + verified flag; `password_hash` (Argon2id); `created_at`.

### `organizations`
Tenant root. `slug` unique; `plan` (from `plans.ts`); `status` (active/suspended/deleted); `created_at`. **No cross-tenant parent** — an org is the top of its tree.

### `memberships`
`(org_id, user_id)` unique. `role` ∈ {owner, admin, developer, viewer}; the capability matrix (PRD §6) is resolved from `role` + `org_id`. **The Owner role is special: exactly one owner per org** (a constraint enforced in the service layer + a partial-unique index `WHERE role='owner'` per org, enforced via a trigger/partial index in a migration — Prisma expresses it as a service invariant + a conditional unique index).

### `github_installs`
`(org_id, github_installation_id)` unique. `account_type`, `account_login`, `status` (active/removed), `repository_selection` (all/specific). Owns the `github_repos` tree.

### `github_repos`
`(org_id, github_repo_id)` unique. `full_name`, `default_branch`, `connected` (bool), `disabled_at`. Tenant-scoped; a removal marks `connected=false` and schedules a purge (`retention_jobs`).

### `review_jobs`
The review unit of work. `(org_id, repo_id, pr_number, commit_sha)` **unique** (the idempotency key, ADR-007). `status` (queued/running/succeeded/failed/skipped/partial), `skip_reason?`, `error?`, `model`, `prompt_version`, `input_tokens`, `output_tokens`, `est_usd_cost`, `published_github_review_id?`, `created_at`, `finished_at?`. A completed job for a key is a no-op for redelivery (NFR-13).

### `review_findings`
`(job_id, source, file, line, category)` — one finding row. `severity`, `confidence`, `title`, `description`, `suggested_fix?`, `payload JSONB` (full structured shape), `anchor_status` (inline/anchor_failed/pr_body), `source` (eslint/semgrep/ai_deep/ai_security/deterministic_summary), `created_at`. Indexes: `(org_id, severity, created_at)` for the security rollup; `(job_id)` for detail; `(org_id, category, created_at)` for trends.

### `finding_actions`
The actioned-finding metric (SUCCESS_METRICS north-star). `(finding_id, action_type, acted_at)`; `action_type` ∈ {accepted, dismissed_reasonable, dismissed_unreasonable, fixed, ignored}. Drives the 7-day actioned-finding rate and the false-positive gate.

### `usage_events` (append-only)
`(org_id, month, created_at)` + `review_count +1`, `input_tokens`, `output_tokens`, `est_usd_cost`, `model`. The pre-flight quota gate (REVIEW_ENGINE_SPEC [0]) aggregates the current month from here. **No updates, no deletes** — only the retention hard-delete by age.

### `org_billing`
`(org_id)` unique. `provider` (stripe/razorpay), `provider_customer_id`, `provider_subscription_id?`, `plan` (mirrors `organizations.plan` authoritative side — the *billing* side is authoritative; `organizations.plan` is the *effective* plan), `status` (trialing/active/past_due/canceled/paused), `current_period_end`, `cancelled_at?`. Only verified provider webhooks move `status` (AC-403).

### `billing_events` (idempotency)
`(provider, provider_event_id)` PK. A re-delivered event no-ops. `processed_at`.

### `audit_events` (append-only)
`actor_id`, `org_id`, `action`, `target_type`, `target_id`, `source_ip`, `meta JSONB`, `created_at`. 180 d minimum retention; no update/delete path.

## 4. Constraints summary

- Unique: `users.email`, `organizations.slug`, `memberships (org_id,user_id)`, `github_installs (org_id,github_installation_id)`, `github_repos (org_id,github_repo_id)`, `review_jobs (org_id,repo_id,pr_number,commit_sha)`, `org_billing (org_id)`, `billing_events (provider,provider_event_id)`, `usage_daily (org_id, day)`.
- Partial-unique: `memberships` role='owner' per org (exactly one owner).
- FK: `memberships.org_id→organizations`, `memberships.user_id→users`, `github_repos.install_id→github_installs`, `review_jobs.repo_id→github_repos`, `review_findings.job_id→review_jobs`, `finding_actions.finding_id→review_findings`, `usage_events.org_id→organizations`, `audit_events.org_id→organizations`.
- Check: `review_jobs.est_usd_cost ≥ 0`, `review_findings.confidence BETWEEN 0 AND 1`, `usage_events.input_tokens ≥ 0`, `org_billing.status IN (...)`.

## 5. Migration strategy

See `MIGRATION_STRATEGY.md`. Forward-only Prisma migrations; each migration ships with a rollback note; hot-path schema changes use expand/contract (add column → backfill → add index → drop old) to keep zero-downtime deploys true (NFR-16).

## 6. Soft-delete vs hard-delete

| Table | Policy | Why |
| --- | --- | --- |
| `organizations` | **Soft** (`status='deleted'`) + scheduled hard-purge | An org deletion is reversible-ish and must survive audit; the hard purge runs after a retention window |
| `memberships` | Soft (row kept, `role` invalidated) | Audit continuity |
| `github_repos` | Soft (`connected=false`) + scheduled content purge | FR-404 — data deletion on access revocation |
| `review_jobs` / `review_findings` | **Hard** after plan retention (NFR-27) | The retention queue hard-deletes; the product value is in the live window |
| `usage_events` / `audit_events` | **Hard** after fixed retention (24 mo / 180 d) | Append-only by design; age-based hard delete |
| `billing_events` | Hard after 24 mo | Idempotency only needs a bounded window |

The distinction matters: **findings are hard-deleted on schedule (data minimization, NFR-28)** while **audit + usage are the retention-bounded records that survive** (compliance, SUCCESS_METRICS history). The retention queue enforces both with different `retention_jobs` rows.

## 7. Auditability

Every tenant state change (role, rule, key, plan, install, review outcome) writes an `audit_events` row at the point of the change (not a diff-after-the-fact). The row captures *who, what, when, where (IP), why (meta)*. Because it's append-only and 180 d+, a security investigator can reconstruct any tenant's state history in that window.

## 8. Tenancy invariant (the one the whole schema exists to enforce)

> **No tenant-owned row is reachable without an `org_id` binding, and every tenant-owned table's leading composite index begins with `org_id`.**

A code-review gate (lint + review) checks that no repository method omits the `org_id` scoping, and the tenant-isolation test suite (`IT-tenant-*`) proves it by attempting cross-org access on every endpoint and asserting 404.
