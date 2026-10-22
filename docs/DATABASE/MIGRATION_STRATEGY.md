# VERCODE — Migration Strategy

Prisma migrations, versioned and forward-only, with documented rollback notes.

## 1. Conventions

- One migration per logical schema change; **never** a squashed "everything" migration.
- Migration files live in `packages/database/prisma/migrations/` (Prisma-managed); each has a `migration.sql` + a rollback note in a sibling `.rollback.md` (where a plain `DROP`/inverse isn't safe).
- Migrations are **run in CI before deploy** against a disposable Postgres; a deploy that has not migrated is blocked.
- **Zero-downtime rule (NFR-16):** any change to a *hot* table (`review_jobs`, `usage_events`, `review_findings`, `org_billing`) uses the **expand → backfill → contract** pattern:
  - *expand*: add the new column/index in a non-locks DDL,
  - *backfill*: a one-shot job or `UPDATE` backfills,
  - *contract*: drop the old shape in a *later* migration (never the same one).
  - A single migration that renames a column on a hot table is rejected in review.

## 2. Rollback strategy

- **Additive migrations** (new table, new nullable column, new index): roll back = drop the object; safe, documented.
- **Data-moving migrations** (backfills, plan re-maps): rollback restores from a *pre-migration snapshot* (taken by the migration job, retained 7 days); the note records the snapshot ref.
- **Constraint-adding migrations** (a new UK): if the data already violates it, the migration *fails fast* on the apply step — the rollback is a no-op (nothing was applied). Violations are fixed by a *pre-migration* cleanup step, not by dropping the constraint.
- **The `owner`-uniqueness partial index** is added *after* a backfill that guarantees ≤1 owner per org (a pre-migration audit query); if the audit finds multiple owners, the migration refuses to proceed and flags the orgs for manual resolution.

## 3. Ordering guarantees

- A FK-creating migration always lands *after* the table it references.
- An index that a hot query depends on lands in the *same* migration as the query's first release (no shipping a slow-query version first).
- `usage_daily` materialization: the table + the backfill from `usage_events` land together; the hourly rollup job starts only after both are in place (a deploy-check gate).

## 4. Safety rails

| Rail | Enforcement |
| --- | --- |
| No destructive DDL on a hot table without a rollback note | Review gate + a `--check` lint on migration files |
| Multi-owner / data-violation states block the apply | Pre-migration audit queries in the migration job |
| A failed apply leaves the DB consistent | Prisma wraps each migration in a transaction (where the DDL allows it); the backfill job is idempotent and re-runnable |
| Migrations are never edited after merge | A new migration fixes a bad one; CI checks that committed migration files are immutable (hash check) |

## 5. Rollout procedure (prod)

1. CI applies the migration to a staging Postgres clone; runs the full integration suite (which re-runs the tenant + idempotency suites against the new schema).
2. Deploy `api` + `worker` at the *new* contract (the expanded shape is backward-compatible for reads).
3. The backfill job runs to completion.
4. A later release runs the *contract* step (dropping old shapes) — never the same release as the expand.
5. **Rollback path:** revert the app to the previous version (the expanded shape is still in place and readable); the migration stays applied — you don't roll back DDL by rolling back the app, you run the explicit inverse migration if the new shape is genuinely wrong.
