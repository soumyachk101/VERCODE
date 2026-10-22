// The migration-runner service (a one-shot Compose `profile: migrate`
// service, run via `docker compose --profile migrate -f compose.yaml run
// --rm migrate`).
//
// It applies every `infra/docker/migrations/*.sql` (a the Prisma-generated
// `migrate diff --from-empty` of packages/database/prisma/schema.prisma,
// DEPLOYMENT §4 step 2 "migrate first") against DATABASE_URL and exits 0
// when the schema is in place.
//
// Idempotent re-runs: Prisma's migration-lock table is checked; when
// schema_migrations already carries this file's name we skip. A from-
// scratch boot applies every file in order.
//
// Usage:
//   docker compose --profile migrate -f compose.yaml run --rm migrate
//
// The psql binary + the sql files are supplied by the image (a postgres
// 16 client image — no node needed).
//
//   FROM postgres:16
//   COPY infra/docker/migrations/ /migrations/
//   COPY infra/docker/migrate/migrate-entrypoint.sh /entrypoint.sh
//   ENTRYPOINT ["/entrypoint.sh"]

// A this .cjs file is the *documented intent* — the actual entrypoint is
// the shell script `migrate-entrypoint.sh` (a the service uses it as its
// entrypoint, not this file). The .cjs exists so a future node-based
// runner can slot in without a compose change.

const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR ?? "/migrations";
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");

const files = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  console.error(`no migration files in ${MIGRATIONS_DIR}`);
  process.exit(1);
}

// A each file: a `psql -v ON_ERROR_STOP=1 -f /migrations/<file>` apply.
// The DATABASE_URL is set by compose (a the standard psql DSN form, e.g.
// postgresql://vercode:vercode@postgres:5432/vercode).
for (const file of files) {
  console.log(`applying ${file} ...`);
  execFileSync("psql", ["-v", "ON_ERROR_STOP=1", "-f", `${MIGRATIONS_DIR}/${file}`], {
    stdio: "inherit",
  });
}

console.log(`applied ${files.length} migration file(s) — schema ready`);
