#!/bin/sh
# The migration-runner entrypoint (a `profile: migrate` one-shot service,
# DEPLOYMENT §4 step 2 "migrate first").
#
# It applies every /migrations/*.sql in order against $DATABASE_URL and
# exits 0 when the schema is in place. Idempotent: a Prisma-generated
# migration file re-runs as a no-op on an already-migrated DB (a the
# `CREATE TABLE` statements fail with ON_ERROR_STOP=1 on a re-run, so
# we check the prisma_migrations ledger first — if the file's name is
# already in the ledger we skip).
#
# The compose `postgres` service runs `migrate` automatically when
# POSTGRES_INITDB_ARGS includes the migration; for a from-scratch boot
# the `migrate` profile service runs it explicitly before the web/api/
# worker services start (compose `depends_on.condition: service_completed_successfully`).

set -eu

MIGRATIONS_DIR="${MIGRATIONS_DIR:-/migrations}"

# A guard: skip a file that's already in the prisma_migrations ledger.
already_applied() {
  # The ledger table (a Prisma's migration ledger). Absent → 0.
  psql "$DATABASE_URL" -Atc \
    "SELECT count(*) FROM prisma_migrations WHERE migration_name = '$1'" \
    2>/dev/null | grep -q '^1$'
}

for f in "$MIGRATIONS_DIR"/*.sql; do
  name="$(basename "$f")"
  if already_applied "$name"; then
    echo "skipping $name (already in the ledger)"
    continue
  fi
  echo "applying $name ..."
  # A ON_ERROR_STOP=1 so a partial apply fails the service (a the compose
  # service_completed_successfully gate depends on a clean exit).
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
  # A record it in the Prisma ledger (a manual mirror of what `prisma
  # migrate` would write — a dev-stack shortcut, not the prod path).
  psql "$DATABASE_URL" -c \
    "CREATE TABLE IF NOT EXISTS prisma_migrations (
       migration_name TEXT PRIMARY KEY,
       finished_at TIMESTAMPTZ NOT NULL,
       rolled_back_at TIMESTAMPTZ,
       logs TEXT
     )"
  psql "$DATABASE_URL" -c \
    "INSERT INTO prisma_migrations (migration_name, finished_at) VALUES ('$name', now())
     ON CONFLICT (migration_name) DO UPDATE SET finished_at = now(), rolled_back_at = NULL"
done

# A the dev-stack seed (a the smoke target's tenant bootstrap — the org +
# install + repo rows the mock PR's webhook resolves against, seed.sql).
# A `psql -f` without ON_ERROR_STOP=1: a the seed's `ON CONFLICT DO NOTHING`
# makes re-runs no-ops; a partial failure here should not block the boot.
if [ -f "$MIGRATIONS_DIR/seed.sql" ]; then
  echo "seeding the dev-stack tenant (seed.sql)..."
  psql "$DATABASE_URL" -f "$MIGRATIONS_DIR/seed.sql" || echo "seed step reported an error (a re-run against a seeded DB is expected)"
fi

echo "all migrations applied — schema ready"
