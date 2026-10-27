# VERCODE — Indexing Strategy

Indexes are designed per query pattern, with `org_id` leading on the tenant-scoped indexes that carry a tenancy filter (the tenancy invariant, `DATABASE_DESIGN.md` §8). A few job- or content-scoped indexes (e.g. `review_findings`'s `(job_id)` and `(file, line, category)`) are deliberately non-tenancy-prefixed because the query is already job-scoped. Over-indexing is a write-cost and vacuum-cost liability; under-indexing is a p95-latency liability. This doc is the balance sheet.

## 1. The tenancy rule

Every tenant-owned index **begins with `org_id`** (where one exists). Consequences:

- A tenant-scoped query is always an index prefix match → no cross-tenant row is ever scanned.
- The leading `org_id` makes the tenancy property *physical*, not just logical: a query that omits `org_id` (a bug) either fails the tenancy middleware or, worst case, scans an org-sized slice, not the whole table.
- The tenant-isolation test suite asserts this by checking the query plans of the integration fixtures (`EXPLAIN` — no seq-scan on a tenant table for a tenant query).

## 2. Index catalog

| Table | Index | Serves | Rationale |
| --- | --- | --- | --- |
| `review_jobs` | `UK (org_id, repo_id, pr_number, commit_sha)` | Idempotency lookup; "was this commit reviewed?" | The dedup check (REVIEW_ENGINE_SPEC [1]) is a point lookup; the UK enforces it |
| `review_jobs` | `(org_id, status, created_at)` | Dashboard "recent jobs", queue-drain, "failed reviews" filter | The overview + retries-observable views (DEFINITION OF DONE #12) |
| `review_findings` | `(job_id)` | PR review detail (all findings for a job) | The detail page is job-scoped (the live schema index) |
| `review_findings` | `(file, line, category)` | Dedup key lookup (in-memory primarily, but useful for the benchmark/audit joins) | REVIEW_ENGINE_SPEC [10] (the live schema index) |
| `usage_events` | `(org_id, month, created_at)` | Monthly usage aggregation + usage export | The usage-reporting path and AC-405 |
| `usage_daily` | `UK (org_id, day)` | Dashboard trend charts (read path) | NFR-03 — never scan raw events for the chart |
| `webhook_deliveries` | `(org_id, received_at)` + `UK (delivery_id)` | Replay dedup (point lookup on `delivery_id`) + org delivery history | NFR-06 |
| `memberships` | `UK (org_id, user_id)` + `(org_id, role)` | Auth lookups; "who are this org's admins?" | RBAC resolution |
| `memberships` | **partial UK** `WHERE role='owner'` on `(org_id)` | Exactly-one-owner invariant | The backstop to the service check (SCHEMA_NOTE) |
| `github_repos` | `UK (org_id, github_repo_id)` | "is this repo connected for this org?" | The repo-discovery upsert |
| `audit_events` | `(org_id, created_at)` | Audit log page (org, time-ordered) | FR-510 |
| `retention_jobs` | `(status, run_at)` | The retention queue pull (PENDING, due) | The scheduled-purge consumer |
| `org_billing` | `PK (org_id)` | Plan state lookup | **Dormant** — the billing feature was removed; no live queries read this table |
| `byok_keys` | `UK (org_id, provider)` | "which key does this org use for provider X?" | Provider resolution |

## 3. What we deliberately do NOT index

- **Full-text on `finding.description`** — MVP uses `category`/`severity` filters, not free-text search; a tsvector index is a P1 only if full-text finding search becomes a feature.
- **Redundant single-column `created_at` indexes** on tenant tables — they're covered by the composite `(org_id, …, created_at)` indexes above; a standalone `created_at` index would just add write cost.
- **An index on `usage_events.job_id`** — it's `SetNull` on job purge and rarely queried; the FK's implicit index is enough.

## 4. The owner-invariant index (the one Prisma can't express)

```sql
-- partial unique index: exactly one OWNER per org
CREATE UNIQUE INDEX memberships_owner_unique
  ON memberships (org_id)
  WHERE role = 'OWNER';
```

The service layer enforces the invariant on every create/role-change (it's the primary check); this index is the *database backstop* — a race that slips past the service check still fails at the DB. This is a raw-SQL step in a Prisma migration (Prisma supports this via `prisma db execute` / a migration edit), documented so a future schema change doesn't silently drop it.

## 5. Maintenance

- **Reindex on schema churn:** after the multi-owner backfill and the partial-index creation, `REINDEX` the affected indexes in a low-traffic window.
- **`pg_stat_user_indexes`** is part of the observability dashboard — an index that's created but never used (a "design" mistake) is flagged and removed in a later migration.
- **Bloat:** the append-only tables (`usage_events`, `audit_events`) are the vacuum hot spots; the retention hard-delete + `autovacuum` tuning (per-table bloat thresholds) are in `OPERATIONS/` — the design here just ensures the *leading org_id* keeps per-org purges fast (a purge is an org-scoped delete, not a full-table scan).

## 6. Verification

Every query in `API/API_SPECIFICATION.md` and `PERFORMANCE_SCALABILITY.md` has a recorded `EXPLAIN` in the integration suite's fixture; a query that regress to a seq-scan on a tenant table is a CI failure (the tenant + performance gate).
