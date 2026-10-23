# Supabase Setup (Postgres only)

VERCODE's data layer is Prisma → Postgres. Supabase is a managed Postgres
host — it speaks the standard Postgres wire protocol, so no code changes are
required. This guide sets up Supabase as the development database, replacing
the local Docker Postgres.

> **Scope: Postgres only.** Custom email/password auth (Argon2id + cookie
> sessions) and the BullMQ/Redis queue are unchanged. If you later want
> Supabase Auth instead of the custom auth, that is a separate, larger
> migration — see the note at the bottom.

## What changes

| Component | Before | After |
|---|---|---|
| `DATABASE_URL` in `.env` | `postgresql://postgres:postgres@localhost:5432/vercode` (Docker) | Supabase pooler connection string |
| Redis | Local Docker Redis | **Unchanged** — still a separate managed Redis (Upstash/Glitcher/Atlas), or Supabase's managed Redis (Beta) |
| Code | — | **No code changes** |
| Schema sync | `prisma db push` against Docker | `prisma db push` against Supabase (`make supabase-db`) |

## 1. Create the Supabase project

1. Go to https://supabase.com/dashboard → **New project**.
2. Set a **database password** (store it — this goes into `.env`).
3. In the project, note the **Project ref** (an 11-char slug like `abcdefghijk`).

## 2. Get the connection string

Supabase exposes two connection URLs under **Settings → Database**:

- **Session pooler** (port `5432`) — use this one for Prisma. Prisma opens
  and holds long-lived connections; session pooling is the correct mode.
- Transaction pooler (port `6543`) — for short-lived, high-concurrency
  apps. Not what Prisma needs.

The session pooler URL looks like:

```
postgresql://postgres.<project_ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

> Supabase's pooler requires the `postgres` username to be written
> `postgres.<project_ref>` — not just `postgres`. This is a common first-run
> gotcha. If you get `password authentication failed`, this is usually why.

If the pooler URL is not visible yet, create the database via the Supabase
dashboard first (it's created with the project) — the URL appears under
**Settings → Database → Connection pooler**.

## 3. Enable required privileges

By default the Supabase `postgres` role has full privileges on its own
project's database. No extra grants are needed. (If you use a custom
Supabase user/role instead of `postgres`, grant it on the DB:
`GRANT ALL PRIVILEGES ON DATABASE vercode_db TO <role>;` — but using the
default `postgres` role avoids this step entirely.)

## 4. Update `.env`

At the repo root (`.env`), replace the local Postgres line:

```env
# Before (Docker)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vercode

# After (Supabase session pooler)
DATABASE_URL=postgresql://postgres.<project_ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

Leave `REDIS_URL` pointing at your Redis of choice (it does not change).

## 5. Push the schema

From the repo root:

```bash
make supabase-db
```

This runs:
1. `pnpm --filter @vercode/database db:generate` — regenerates the Prisma client.
2. `npx prisma db push --skip-generate` — applies the schema to Supabase.
   There is no migration folder for VERCODE yet (greenfield), so `db push`
   is correct. If you later adopt `prisma migrate`, use `prisma migrate dev`
   against the Supabase URL instead.

## 6. Verify

```bash
cd apps/api
set -a; source ../../.env; set +a
pnpm start
```

Then hit the health/readiness endpoints:

```bash
curl http://localhost:4000/healthz   # liveness (process up)
curl http://localhost:4000/readyz    # readiness (DB reachable — proves Supabase connection)
```

`readyz` returning `{"ok":true,"db":"up"}` confirms the Prisma client is
reading from Supabase.

## 7. (Optional) Connect from the dashboard in Supabase

Supabase's SQL editor (dashboard → SQL editor) and Table Editor let you
inspect the VERCODE tables (`user`, `organization`, `review_job`,
`finding`, `github_install`, etc.) directly — useful for local debugging
and test data inspection without installing Postgres locally.

## Cost

Supabase free tier: 500 MB Postgres storage, 5 GB bandwidth, 2 projects.
Sufficient for development and a small demo. Paid plans start at $25/mo for
production-grade capacity.

---

## If you later want Supabase Auth (bigger job)

Currently VERCODE ships custom email/password auth: Argon2id hashing,
cookie sessions, per-email lockout, session revocation, and an audit trail
(`apps/api/src/routes/auth.ts`). The `user` table's `passwordHash` column
is what a Supabase Auth migration would drop.

If you decide to switch to Supabase Auth:
1. Replace `POST /auth/signup` + `POST /auth/signin` with Supabase JWT
   verification (a `supabase-js` client or a hand-rolled JWT check on the
   API).
2. The API's `requireAuth` middleware would read the Supabase JWT instead
   of the `vercode_session` cookie.
3. `githubProviderToken` / `githubHandle` on the user row stay — the GitHub
   OAuth is independent of the primary auth mechanism.
4. `user.passwordHash` can be dropped (or kept read-only during a transition
   window for sessions already issued).
5. The web app's API client (`apps/web/src/lib/api.ts`) would send the
   Supabase access token in an `Authorization: Bearer` header instead of
   relying on the session cookie — or keep the cookie if you front Supabase
   Auth with your own session.

This is a meaningful change to the auth model and to every auth-gated route.
It is not required for the Postgres swap above.
