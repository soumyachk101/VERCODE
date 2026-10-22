# VERCODE — Technical Requirements Document (TRD)

The TRD specifies *how* the system is built. Product behavior is in the PRD; this document is the engineering contract. Cross-references: `TECHNICAL/SYSTEM_ARCHITECTURE.md` (shapes + diagrams), `TECHNICAL/REVIEW_ENGINE_SPEC.md` (pipeline), `DATABASE/DATABASE_DESIGN.md` (schema), `API/API_SPECIFICATION.md` (contracts).

## 1. System Architecture & Module Boundaries

A **modular monolith** in one repo, split into deployable units and libraries:

```
                    ┌──────────────┐   ┌──────────────┐
   browser  ───────▶│  apps/web    │◀──┤  apps/api    │
                    │ (Next.js)    │   │  (Fastify)   │
                    └──────────────┘   └──────┬───────┘
                                               │  (validated contracts)
                 ┌────────────────────────────┼───────────────────────┐
                 │                            │                       │
          ┌──────▼───────┐            ┌───────▼────────┐      ┌──────▼───────┐
          │  PostgreSQL   │◀──────────▶│ Redis (BullMQ) │◀────▶│ apps/worker │
          └───────────────┘            └────────────────┘      └──────┬───────┘
                                                                       │
                                          ┌─────────────────────────────┼──────────────┐
                                          │                             │              │
                                    ┌─────▼─────┐  ┌──────────────┐  ┌──▼───────────┐
                                    │  GitHub   │  │ AI provider  │  │  static      │
                                    │  (App +    │  │ (OpenAI +    │  │  analysis    │
                                    │   Octokit) │  │  adapters)   │  │  (ESLint/SG) │
                                    └───────────┘  └──────────────┘  └──────────────┘
```

**Modules (monolith boundaries, enforced by package-private APIs):**

| Module | Location | Responsibility |
| --- | --- | --- |
| AuthN/AuthZ | `packages/config` + `apps/api` middleware | Sessions, RBAC, tenant context |
| GitHub adapter | `packages/github` | App auth, webhook verify, diff fetch, review publish, rate-limit |
| Diff engine | `packages/diff-engine` | Unified-diff → structured change set + line map |
| Review engine | `packages/review-engine` | Orchestration: classify → analyze → AI → validate → dedup → policy → summary |
| AI providers | `packages/ai-providers` | Provider interface + OpenAI/Anthropic/Ollama adapters, routing, cost |
| Static analysis | `packages/static-analysis` | ESLint + Semgrep wrappers, deterministic findings |
| Policy engine | `packages/policy-engine` | Confidence floors, suppression, severity gating, quota checks |
| Billing | `packages/billing` | Plan state machine, provider webhook handling, usage accounting |
| Contracts | `packages/contracts` | Zod schemas (shared source of truth for findings/jobs/plans) |
| Database | `packages/database` | Prisma schema + client + migration tooling |
| Observability | `packages/observability` | Structured logging, OTel, Sentry, redaction |

**Boundaries rule:** modules communicate *only* through `packages/contracts` types or their exported function signatures. No module imports another module's internals. The `worker` process composes `review-engine` + `github` + `ai-providers` + `static-analysis`; the `api` process does *not* run the pipeline (it only enqueues).

## 2. Technology Choices & Rationale

See `TECH_STACK.md` for the full table + deviations. Summary:

- **Next.js App Router + TS strict + Tailwind + shadcn/ui + Lucide + RHF + Zod + Recharts** — dashboard; matches the owner's design-skill tooling and the brief.
- **Fastify + TS** for the dedicated API service — JSON performance, schema-based validation (pairs with Zod contracts), first-class hooks for auth/tenant middleware.
- **Prisma + PostgreSQL** — relational fit (multi-tenant, audit, usage), mature migration tooling.
- **Redis + BullMQ** — durable job queue with retry/DLQ semantics that map directly onto NFR-13/14.
- **Octokit** — official GitHub App auth + REST/GraphQL; `packages/github` wraps it so the rest of the system never touches GitHub directly.
- **Provider-abstracted AI** — an `AIProvider` interface (`packages/ai-providers`) with `completeStructured()` (JSON-schema-constrained) as the primary call path; OpenAI is the default, Anthropic + Ollama as adapters. No module hardcodes a model name.
- **Sentry + OpenTelemetry** — error capture + distributed traces; correlation id threaded webhook→job→provider→GitHub.
- **Docker + Compose (dev) + GitHub Actions (CI)** — reproducible dev + lint/type/test/build/migrate gates.

## 3. Runtime & Deployment

- Node ≥ 22 (ESM, `NodeNext` resolution).
- Three deployables: `web` (Next.js standalone), `api` (Fastify), `worker` (BullMQ consumer + publisher). Each has its own Dockerfile; `worker` scales independently.
- Postgres 16 + Redis 7 as managed services in prod; Compose in dev.
- Zero-downtime deploys: `web` and `api` are stateless (session in Redis-backed store; queue decoupled); `worker` drains in-flight jobs on SIGTERM within 60 s (NFR-15).

## 4. Frontend Architecture

- Next.js App Router, RSC for data-heavy pages; client components only where interactivity is required.
- Data fetching via typed API clients generated from `packages/contracts` (Zod → TS types); no ad-hoc fetch types.
- Server-side authorization check happens in the API; the UI *hides* (never enforces) actions the current role can't take.
- Design system: token-driven (color/spacing/typography tokens in `DESIGN/DESIGN_SYSTEM.md`), sourced from the installed `design-taste-frontend` reference library, motion per `emil-design-eng` rules (≤300 ms UI motion, custom ease-out curves, `transform`/`opacity` only, `prefers-reduced-motion` fallback).
- State: TanStack Query for server state; no global store for app state in MVP.

## 5. Backend Architecture

- Fastify with plugin-based routes; global hooks: `requestContext` (correlation id), `authSession`, `tenantContext`, `rateLimit`, `audit`.
- All route handlers validate input with the shared Zod schemas (from `contracts`) before touching services; a validation failure is a 422 with the exact error shape (no stack traces).
- Services are plain functions/classes; repositories are Prisma wrappers that *always* take an `orgId` first argument (tenant-scoped access).
- No business logic in route handlers; handlers map HTTP ↔ service.

## 6. API Communication Patterns

- REST for the dashboard API (`/api/v1/...`), JSON, bearer-session cookie auth.
- Webhook ingress: a single dedicated route (`POST /webhooks/github`) that *only* verifies + enqueues — no LLM, no DB writes beyond idempotency bookkeeping (NFR-04).
- Queue: BullMQ `review-queue` (per-review work), `retention-queue` (purge jobs), `billing-queue` (usage rollups). Payload = `job_id` only; the worker re-reads durable state (never trusts the payload for authz).
- All inter-service payloads are the `contracts` Zod types; a contract change is a *breaking* change requiring a version bump.

## 7. Background Processing

- BullMQ with Redis; `concurrency` per worker instance (default 4, NFR-17), queue-level `maxAttempts: 3`, exponential backoff `2^attempt * 1s + jitter`, DLQ queue `review-dead-letter`.
- Job shape: `{ jobId, orgId, repoId, prNumber, commitSha, attempt, queuedAt }`. Idempotency enforced by a `(org, repo, pr, commitSha)` unique key — a redelivered job finds the existing completed row and no-ops (NFR-13).
- The worker runs the full pipeline and *then* publishes to GitHub; publication is retried independently with its own backoff (a GitHub 429 should not re-run the AI).

## 8. Database & Caching

- Postgres: single source of truth for reviews, findings, orgs, usage, audit. See `DATABASE/DATABASE_DESIGN.md` for the full ERD + schema.
- Redis: session store, BullMQ, and a *namespaced-by-org* LRU cache for fetched diffs (`org:{orgId}:repo:{repoId}:diff:{sha}`) with a 24 h TTL and org-scoped eviction.
- Dashboard read-heavy pages (usage trends) use a materialized rollup (`usage_daily` aggregated hourly) to keep p95 < 400 ms (NFR-03).

## 9. AI Provider Integration

See `AI_SYSTEM_DESIGN.md` + `MODEL_ROUTING.md`. Key contract:

- `AIProvider.completeStructured({ task, messages, schema, model, maxTokens, timeoutMs }) → { content, model, inputTokens, outputTokens, finishReason, latencyMs }`.
- Structured output: the provider is asked to return an object matching the `contracts` finding schema; the review engine *re-validates* with Zod regardless of the provider's claim (providers lie about compliance).
- Bounded retry: provider 5xx/timeout → retry up to 2× with backoff, then fall back to the configured secondary provider (one switch), then fail the AI stage (static-analysis findings still publish; the job is marked `partial`).
- Token + cost accounting captured per call; `est_usd_cost` computed from the `config` package rate table.

## 10. GitHub Integration

See `INTEGRATION_DESIGN.md` + `API/WEBHOOK_SPECIFICATION.md`.

- GitHub App (not PATs). App JWT → installation access token (cached, refreshed at 50% lifetime).
- Webhook events handled: `installation`, `installation_repositories`, `pull_request` (opened/reopened/synchronize/closed), `pull_request_review` (submitted → re-review trigger), `pull_request_target` (forks).
- Diff fetch: `GET /repos/{o}/{r}/pulls/{n}` + `?diff` (with Accept: `application/vnd.github.diff`); context fetch bounded (FR-401).
- Review publish: create a review (summary) then add review comments (inline), anchoring via `commit_id` + `side` + `line`. Line validation precedes publication; invalid anchors fall back to PR body sections.
- Rate limiting: Octokit automatic retry on 403/429 with `x-poll-interval` respected; a per-repo throttler prevents one org from hammering the shared App.

## 11. AuthN & AuthZ

- Email + password (Argon2id), session in a signed HTTP-only cookie backed by a Redis session store; server-side revocation list for "sign out everywhere".
- RBAC capabilities resolved per-request; `tenantContext` binds `orgId` + `userId` + `role` + `capabilities` into the request scope.
- Every repository/data access goes through a tenant-scoped repository method; a missing `orgId` is a *programming error* (500), never a "return everything" default.

## 12. Reliability & Idempotency

- Webhook: `X-Hub-Delivery` id dedup (24 h) + signature + timestamp window.
- Review job: `(org, repo, pr, commitSha)` unique → at most one *completed* review per commit; re-review on the *same* SHA is a no-op, on a *new* SHA is a new job.
- GitHub publish: a "published review id" stored per job; a retried publish that already has an id is a no-op.
- Payment events: event-id idempotency table.

## 13. Performance Expectations

See `PERFORMANCE_SCALABILITY.md`. Targets: NFR-01..04, NFR-12..19. The review pipeline is the long pole; static analysis and AI run in parallel where safe, with a wall-clock budget (default 240 s) after which the job publishes *partial* results with a note rather than timing out the webhook.

## 14. Security Controls

Full detail in `SECURITY/*`. The architectural controls that the TRD owns:

- All secrets in the process via the `config` package (env + KMS for BYOK master key); no secret in a DB column except KMS-wrapped BYOK keys.
- Prompt-injection boundary: the AI prompt is *assembled by the engine with repo content clearly delimited as untrusted data*; the engine has no tool-calling path in review mode; output is schema-validated and redacted.
- Static analysis and (Phase 2) execution run in a separate process with no access to production credentials.
- Tenant isolation is a *database design* property (every tenant table carries `org_id`, composite indexes lead with `org_id`), not just a middleware property.

## 15. Observability

- Structured JSON logs (pino), one record per stage, correlation id throughout.
- OTel: `trace_id`/`span_id` auto-injected; the review pipeline is one trace.
- Sentry: `api` + `worker` + `web` (client, no PII).
- Metrics: job queue depth/age, review latency histogram, provider error rate, GitHub 4xx/5xx rate, cost/review. Alerts on DLQ depth and p95 latency breach.

## 16. Scaling Strategy

- Horizontal: `api` stateless (scale on CPU), `worker` scale on queue depth (KEDA-style), Postgres read-replica for dashboard, Redis for sessions/queue/cache.
- Hot-path protection: the webhook route never blocks on LLM or diff fetch (async hand-off to queue). Dashboard reads hit the rollup table, not raw `usage_events`.
- Cost scaling: per-org worker sharding by `org_id` hash is the escape hatch for a noisy-neighbor org (defers queue isolation).

## 17. External Dependencies

GitHub (App + webhooks + REST), Postgres, Redis, an AI provider (OpenAI default; Anthropic/Ollama optional), Stripe (billing), Sentry + OTel collector (observability). Each has a failure mode documented in `ERROR_HANDLING.md`.

## 18. Deployment Topology

- **Prod:** managed Postgres (PITR), managed Redis, three containers (`web`, `api`, `worker`) on a Kubernetes/ECS-equivalent; `worker` autoscales on queue depth; `web`/`api` on CPU/RPS.
- **Dev:** `docker-compose` — Postgres, Redis, and the three apps, with a mock-GitHub provider for pipeline tests and a mock-AI provider for deterministic runs.
- **Isolation:** no shared writable filesystem between `api` and `worker`; the only shared state is Postgres + Redis.

## 19. Failure Modes & Recovery

| Failure | Detection | Recovery |
| --- | --- | --- |
| AI provider outage | Provider 5xx / timeout rate | Bounded retry → secondary provider → partial publish (static findings) → job `partial`; no data loss |
| GitHub rate limit | 403/429 + `x-poll-interval` | Backoff queue; publish retried independently of AI |
| Postgres outage | Readiness probe | `worker` pauses (drains in-flight), `api` returns 503 on writes; no job loss (durable queue) |
| Redis outage | Readiness probe | Sessions degrade to read-only for 5 min; queue paused; graceful degradation, no enqueue |
| Webhook replay | `X-Hub-Delivery` seen | 200 no-op, audit-logged |
| Worker crash mid-pipeline | Process exit | BullMQ redelivers the incomplete job; idempotency key prevents double publish |
| Bad model output | Zod validation fail | Dropped invalid findings; if the *entire* structured payload is invalid, the AI stage retries once with a "be strict" system note, then falls to partial |

## 20. Testing, Docs, Status

Tests per phase, TypeScript + lint on every commit (root scripts). After each phase: run tests, `pnpm typecheck`, `pnpm lint`, fix regressions, update docs, update the task checklist in `IMPLEMENTATION/TASK_BREAKDOWN.md`.
