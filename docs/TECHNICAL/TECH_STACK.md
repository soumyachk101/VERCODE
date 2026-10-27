# VERCODE — Tech Stack

The pinned stack. Anything not listed here is a deviation and must be recorded in `ARCHITECTURE_DECISIONS.md`.

## Frontend (`apps/web`)

| Layer | Choice | Version target | Notes |
| --- | --- | --- | --- |
| Framework | Next.js (App Router) | 15.x | RSC for data pages; `output: standalone` for Docker |
| Language | TypeScript strict | 5.x | Root `tsconfig.base.json` shared |
| Styling | Tailwind CSS | 4.x | Tokens from `DESIGN/DESIGN_SYSTEM.md` |
| Components | shadcn/ui (Radix-based) | latest | Plus Lucide icons |
| Forms | React Hook Form + Zod | 7.x / 3.x | Validation schemas shared from `packages/contracts` where the shape is an API contract |
| Data | TanStack Query | 5.x | Server state; no global app store in MVP |
| Charts | Recharts | 2.x | Real data only (NFR / FR-506) |
| Motion | CSS transitions + `@starting-style` (+ `motion` only where interruptible springs are genuinely needed) | — | Follows `emil-design-eng` rules; no keyframe-heavy libraries |

## Backend (`apps/api`, `apps/worker`)

| Layer | Choice | Notes |
| --- | --- | --- |
| Runtime | Node.js ≥ 22, ESM | `NodeNext` resolution; relative imports end in `.js` (verbatimModuleSyntax) |
| API | Fastify | Plugin routes; schema-validated handlers |
| ORM | Prisma | Postgres; typed client; migrations versioned |
| DB | PostgreSQL 16 | JSONB for finding payloads |
| Queue | Redis 7 + BullMQ | Durable jobs, retries, DLQ, sessions |
| GitHub | Octokit (app strategy) | App JWT → installation tokens; webhook HMAC verify |
| Validation | Zod (shared via `packages/contracts`) | Every API input + AI output |
| Auth | Argon2id + signed sessions (Redis-backed) | HTTP-only Secure cookie |
| Secrets | env + KMS-wrapped master key for BYOK | No secret in a DB column (except wrapped BYOK) |
| Observability | pino + OpenTelemetry + Sentry | Correlation id end-to-end |

## Review Engine (`packages/*`)

| Package | Contents |
| --- | --- |
| `diff-engine` | Unified-diff parser → structured change set + line map; pure, no I/O |
| `static-analysis` | ESLint + Semgrep runner wrappers; deterministic finding shape |
| `ai-providers` | `AIProvider` interface + OpenAI/Anthropic/Ollama adapters + routing + cost |
| `review-engine` | Orchestration: classify → static → AI → merge → validate → dedup → policy → summary |
| `policy-engine` | Confidence floors, suppression, severity gating, file-budget checks |
| `github` | App auth, webhook verify, diff fetch, review publication, rate-limit |
| `contracts` | Zod schemas: findings, webhooks, API payloads (the shared source of truth) |
| `database` | Prisma schema + generated client + tenant-scoped repositories |
| `observability` | Logging, tracing, redaction, error capture |
| `config` | Env parsing + typed config, model routing table, provider rate table |

## Testing

| Layer | Tool |
| --- | --- |
| Unit | Vitest (root, per-package `*.test.ts`) |
| Integration | Vitest + testcontainers (Postgres + Redis) + mock GitHub/AI providers |
| E2E | Playwright (auth → org → GitHub connect → review → dashboard) |
| Security | Dedicated `tests/security` suite: forged webhooks, cross-tenant, prompt-injection fixtures, secret leakage |
| AI benchmark | `tests/fixtures/benchmark` dataset + a scoring script (precision/FP/latency/cost) |

## Infrastructure

| Concern | Choice |
| --- | --- |
| Containers | Multi-stage Dockerfiles per deployable; Compose for dev (Postgres, Redis, web, api, worker, mock-github, mock-ai) |
| CI | GitHub Actions: typecheck, lint, unit, integration, build; on-merge: e2e + security + benchmark gate |
| Hosting | Managed Postgres (PITR) + managed Redis; `web`/`api`/`worker` on K8s/ECS-equivalent; worker autoscales on queue depth |
| Secrets | Platform secret store + KMS; `.env.example` placeholders only |

## Deviations from the brief

| # | Deviation | Rationale |
| - | --- | --- |
| DEV-1 | ~~Billing provider default is Stripe, with a documented Razorpay/Rajatko adapter path for the INR market~~ | **SUPERSEDED (2026-10)** — no-paywall: billing, plans, and quota gating were removed; usage is a plain visibility report. See ADR-009 (superseded). |
| DEV-2 | Static analysis is a *worker sub-process* in MVP, not a fully isolated sandbox | The sandbox boundary is designed (ADR-008, `SECURITY/SANDBOX_SECURITY.md`) and realized in Phase 2; MVP keeps the isolation *contract* (no production credentials, resource limits) without the separate runner |
| DEV-3 | Content-hash dedup is P1, not MVP | ADR-007; commit-SHA idempotency is sufficient for MVP correctness |
