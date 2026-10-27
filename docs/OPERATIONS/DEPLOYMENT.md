# VERCODE — Deployment

The three independently-deployable units + their managed dependencies + the dev/prod topology. A deploy is *verified*, not assumed (the "do not claim a production deployment succeeded unless it was actually executed and verified" rule).

## 1. The deployables

| Unit | What it is | Stateful? | Scales on |
| --- | --- | --- | --- |
| **`web`** | Next.js standalone build (`output: standalone`) | no | CPU / RPS |
| **`api`** | Fastify (auth, dashboard REST, webhook ingress) | no | CPU / RPS |
| **`worker`** | the BullMQ consumer + the review pipeline | no | **queue depth** (KEDA-style autoscale on `review-queue` lag) |
| **PostgreSQL 16** | the single source of truth (reviews, findings, orgs, usage, audit) | yes (managed, PITR) | the read-replica + the PgBouncer pool |
| **Redis 7** | sessions + queues (BullMQ) + the org-scoped diff cache | yes (managed) | a sharded node if single-node is the bottleneck |

**Independence:** `web`, `api`, `worker` deploy without each other (a new `web` build against the *current* API; a new `worker` against the *current* schema). The **contracts package pins the API shape** (a breaking contract change is a coordinated `web`+`api`+`worker` release, gated by the `OPENAPI.yaml` drift check, `RELEASE_CRITERIA` gate 11). The DB schema is the *one* coupling: `api`/`worker` deploy at the *expanded* (backward-compatible) shape; the *contract* step (dropping old shapes) is a *later* release (`MIGRATION_STRATEGY §5`).

## 2. Dev topology (Docker Compose)

`infra/docker/compose.yaml` brings up the whole system **with no external credentials** (the mock-GitHub + mock-AI services stand in for the real integrations, so a full end-to-end pipeline run is local):

```
postgres (16)   redis (7)   web   api   worker   mock-github   mock-ai
```

- `web`/`api`/`worker` are built from their Dockerfiles (a multi-stage: install → build → the standalone/runtime image).
- `mock-github` is an HTTP stub (serves a canned PR diff + the install-token exchange + a review-publication recorder). `mock-ai` is the `mock` adapter (deterministic fixture outputs).
- A `smoke` target (`compose run smoke`) boots the stack + hits the health endpoints + runs one mock PR through the pipeline → the "setup + deployment instructions are verified" step (DEFINITION OF DONE #15).
- The Compose stack is *the* test-environment matrix row for CI's E2E + the local dev (a developer runs `docker compose up` and the whole pipeline works, no keys needed).

## 3. Prod topology

- **Managed Postgres (PITR) + managed Redis** (the two stateful deps are managed, not self-hosted — the backup/DR story, `BACKUP_RESTORE.md` / `DISASTER_RECOVERY.md`).
- **`web` + `api` + `worker`** on a K8s/ECS-equivalent: `web`/`api` autoscale on CPU/RPS; `worker` autoscales on the `review-queue` lag (a KEDA scaler on the Redis queue length). No shared writable filesystem between `api` and `worker` (the only shared state is Postgres + Redis, `TRD §18`).
- **The Postgres connection pool** (PgBouncer, or the managed equivalent) is sized to the `api` + `worker` connection sum (a connection-exhaustion DoS is bounded, `THREAT_MODEL T-10`).
- **A read replica** serves the dashboard's read-heavy path (the `usage_daily` rollup + the review-detail reads) — the write pool is for `api`/`worker`, the replica for the reads (NFR-03).
- **Secrets** are injected from the platform secret store (a deploy-time env), KMS-wrapped for the App private key + the BYOK master key (no secret in an image layer, `SECRETS_MANAGEMENT §4`).

## 4. The deploy procedure (a release)

1. **CI green** (all the `RELEASE_CRITERIA` gates for this release, including the benchmark + the security + the design + the docs-drift).
2. **Migrate first** (the Prisma migrations applied to the DB; a *zero-downtime* expand-step deploy — the expanded shape is backward-compatible for reads, `MIGRATION_STRATEGY §5`).
3. **Roll out `worker`, then `api`, then `web`** (the worker first, so the pipeline runs the new logic; the api next; the web last, against the new api). Each is a rolling deploy (a new instance up before the old one down, a readiness-gated drain).
4. **Graceful shutdown** is built into the worker (drain in-flight within 60 s; an incomplete job is atomically re-queued, `ERROR_HANDLING §8`, NFR-15) and the api (drain in-flight requests; the webhook route is fast, it drains quickly).
5. **The contract step** (dropping old schema shapes) is a *separate, later* release — never the same release as the expand (the `MIGRATION_STRATEGY §5` rule).
6. **Verify** (a post-deploy check): the health endpoints + a canary + the leading indicators (the DLQ depth, the provider error rate, the GitHub 4xx/5xx, the p95 latency) for the bake window (`RELEASE_CRITERIA §3`). **A verified deploy is one whose post-deploy checks passed** — a deploy that "shipped" but wasn't verified is marked *unverified* (the rule).

## 5. What the deploy *requires* (the managed/credential inventory, the "document which components require managed services / external credentials" rule)

| Component | Requires |
| --- | --- |
| Postgres | a managed Postgres (PITR) + a read replica (the scale path) |
| Redis | a managed Redis (the queue + session + cache) |
| `web`/`api`/`worker` | a container host (K8s/ECS) + a service mesh / load balancer |
| GitHub | a GitHub App (the `GITHUB_APP_ID` + the KMS-wrapped `GITHUB_APP_PRIVATE_KEY` + the `GITHUB_WEBHOOK_SECRET`) + the App registered with the *minimum* scopes (`INTEGRATION_DESIGN §1.2`) |
| AI provider | the provider's API key (the platform default) + the BYOK KMS key (per-org) |
| Observability | the Sentry DSN + the OTel collector endpoint |
| Secrets | the platform secret store + KMS (the App key, the BYOK master, the signing key) |

**A deploy without the external credentials (a GitHub App + a provider key) runs the *dev-stack* (mock) but not the *live* pipeline** — a deploy that's missing the external credentials is marked "live integration blocked", not "deployed" (the unverified-integration rule, `PHASE 10`).

## 6. Rollback

- **App rollback:** the previous image is retained; a rollback is a re-deploy of the previous image (the DB's *expanded* shape is still readable by the old code — the backward-compat guarantee, `MIGRATION_STRATEGY §5`).
- **Schema rollback:** you do *not* roll back DDL by rolling back the app; you run the *explicit inverse* migration if the new shape is genuinely wrong (the `MIGRATION_STRATEGY §5` "the migration stays applied" rule). An additive migration's inverse is a documented `DROP`/inverse; a data-moving migration's inverse restores from the pre-migration snapshot.
- **A worker mid-deploy:** a SIGTERM drains (the in-flight jobs re-queue, no loss); a hard crash → BullMQ's durable queue re-delivers (a lost job is impossible, only re-run).

## 7. The "verify" is a deploy, not a claim

Every deploy record (the release report) states: the image tags, the migration version, the canary bake results, the health checks, the post-deploy verification (a `curl` of the health endpoints + a canary metric check), and the **status: verified / unverified** (an unverified deploy is one whose post-deploy checks didn't run or failed — it's *flagged*, and the leading-indicator alerts are on until it's re-verified or rolled back).
