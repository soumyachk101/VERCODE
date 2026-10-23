# VERCODE Architecture Diagram — Prompt (Cloud-Deployed Variant)

> **Output format:** PNG (rendered from SVG source; keep the SVG on disk as the
> source of truth, export at 2× scale for crispness). Save to
> `docs/assets/architecture.png`. The SVG stays at `docs/assets/architecture.svg`.
> **Canvas:** 1340 × 890 (or scale to 1400 × 950 if space needed).
> **PNG export:** 2680 × 1780 px (2× of 1340 × 890) — use `sharp` or `svgexport`.
> **Language:** English labels.
> **Color scheme:** keep the existing palette (Untrusted = red accents, Trusted Core = blue, External = green, Data = purple, Telemetry/KMS = teal).

---

## What to draw (from right to left)

### LEFT COLUMN — UNTRUSTED DOMAIN (red dashed border)

Five white cards stacked vertically, each with a 3px colored top strip and a small rounded badge under the title:

| Card | Title | Badge | Body lines |
| --- | --- | --- | --- |
| 1.1 | GitHub App Webhooks | `HMAC-SHA256 SIGNED` (red badge) | "PR opened, synchronize, review requested" / "5-min timestamp window · 24h delivery dedup" |
| 1.2 | Pull Request Content | `ADVERSARIAL INPUT` (red badge) | "Raw unified diffs · changed file bodies · title" / "Treated strictly as data, never as control instructions" |
| 1.3 | AI Provider Responses | `UNTRUSTED STREAM` (red badge) | "Structured JSON completions from LLM" / "Must pass Zod schema re-validation + anchor check" |
| 1.4 | Billing Provider Webhooks | `STRIPE / RAZORPAY` (red badge) | "Checkout & subscription status events" / "Idempotent on event_id · client claims inert" |
| 1.5 | Developer & Org Members | `BROWSER CLIENT` (blue badge — this is a client, not adversarial) | "Dashboard access via Next.js web application" / "Signed HTTP-only session cookie authentication" |

Bottom of this column: a thin red banner:
`▲ Ingress Boundary: HMAC Verification & Auth`

---

### CENTER COLUMN — PLATFORM TRUSTED CORE (blue dashed border)

Four cards stacked vertically.

**Card 2.1 — Fastify API (apps/api)**
- Title in blue, top strip blue
- Badge (right): `PORT 4000 · FASTIFY 5`
- Body bullets:
  - Webhook receiver: signature verify + delivery dedup (< 300 ms)
  - Enqueues jobs to Redis — **NEVER runs pipeline or calls LLM** (make "NEVER" bold red)
  - Tenant-scoped REST API for dashboard UI with RBAC capability guard
  - Auth service (Argon2id + session hash), rate limits, health probes
- Yellow inner banner (full width of card): `ISOLATION INVARIANT: NO LLM CALLS ON API HOT PATH (DoS DEFENSE)`

**Card 2.2 — CloudFront + S3 (static export layer)**
- Top strip blue, title "CloudFront CDN + S3 Static Export"
- Badge (right): `HTTPS · WAF · EDGE`
- Body bullets:
  - `apps/web` Next.js static export hosted on S3
  - CloudFront distribution in front; WAF rules at edge
  - Auth session cookie checked server-side on API, CDN caches static assets only

**Card 2.3 — ECS Fargate Service: API Task (public subnet)**
- Top strip orange (queue/workflow color)
- Title "API Task — ECS Fargate (public subnet)"
- Badge (right): `NLB BACKEND · 4 TASKS`
- Body bullets:
  - Load-balanced behind Application Load Balancer (ALB)
  - Scales 0–N per autoscaling policy; each task is stateless
  - No model keys in this task's environment; keys are pulled from Secrets Manager at worker tier only

**Card 2.4 — ECS Fargate Service: Worker Task (private subnet)**
- Top strip orange
- Title "Worker Task — ECS Fargate (private subnet)"
- Badge (right): `BULLMQ · REVIEW PIPELINE`
- Body bullets:
  - BullMQ consumer; only task with LLM API keys
  - 12-stage orchestration: quota gate → bounded diff → static analysis → task-routed AI → dedup → persist → publish
  - Wall-clock budget 240 s; degrades to partial results on timeout
  - **Persist-then-publish:** findings written to Postgres before GitHub API call

**Inner data row (two side-by-side cards under 2.4):**

| Left card | Right card |
| --- | --- |
| **PostgreSQL (RDS)** — purple strip, `PRISMA` badge | **ElastiCache Redis** — purple strip, `EPHEMERAL` badge |
| • org_id leading index | • Session tokens store |
| • review_jobs (SHA unique) | • 24 h TTL PR diff cache |
| • review_findings (JSONB) | • BullMQ job state queues |
| • append-only audit_events | • In-flight lock keys (SET NX) |

Banner below data row (blue): `▲ Multi-Tenant Isolation: Every query scoped by org_id; cross-tenant yields 404`

---

### RIGHT COLUMN — EXTERNAL INTEGRATIONS (green dashed border)

| Card | Title | Badge | Body lines |
| --- | --- | --- | --- |
| 3.1 | GitHub REST & GraphQL | `APP AUTHENTICATED` (green) | "Fetch PR diff (bounded: max 60 files / 3k lines)" / "Publish verdict summary + validated inline comments" |
| 3.2 | Static Analysis Runners | `DETERMINISTIC CHECKS` (green) | "ESLint + Semgrep security & logic AST scanning" / "Zero LLM cost · exempt from confidence floor" |
| 3.3 | AI Provider Gateways | `TASK-ROUTED ADAPTERS` (green) | "OpenAI · Anthropic · Local Ollama" / "No-training headers (NFR-29) · token cost tracked per org" |
| 3.4 | AWS Secrets Manager + KMS | `ENCRYPTION AT REST` (teal) | "LLM API keys & GitHub App credentials in Secrets Manager" / "GitHub App private key KMS-wrapped; tenant BYOK in AES-256-GCM" |
| 3.5 | Observability & Telemetry | `OPENTELEMETRY / SENTRY` (teal) | "Pino JSON structured logs with secret redaction" / "Trace correlation by review jobId across worker tasks" |

Banner (green): `▲ Zero Plaintext Secrets: Masking gates on all logs`

---

## Arrows (draw with the existing marker style, 2px, labeled)

| From → To | Label | Color |
| --- | --- | --- |
| GitHub Webhooks → Fastify API | `verify` | red |
| Billing Webhooks → Fastify API | `billing` | red (orthogonal, routed behind queue card) |
| Browser Client → CloudFront/S3 (via API for auth) | `session` | blue (routed to CloudFront card, then down to API) |
| Fastify API → ECS API Task | `enqueue` | orange |
| ECS API Task → ElastiCache Redis | `queue write` | orange |
| ECS Worker Task ← ElastiCache Redis | `dequeue` | orange |
| ECS Worker Task → PostgreSQL | `persist tx` | purple |
| ECS Worker Task → GitHub REST | `diff fetch & publish` | green (routed via channel at x ≈ 920) |
| ECS Worker Task → Static Analysis | `execute` | green |
| ECS Worker Task → AI Provider Gateways | `LLM call` | green |
| ECS Worker Task → KMS | `secret fetch` | teal |
| ECS Worker Task → Observability | `telemetry` | teal |

---

## Legend (bottom bar, same as existing)

Six colored line samples with labels:
- Red — Ingress (Webhook / External)
- Blue — REST / Session Auth
- Orange — Queue Job Enqueue / Dequeue
- Purple — Transactional Data Persistence
- Green — External Integrations & Providers
- Teal — Telemetry & KMS

---

## Text / caption to place above the diagram in the README

```
The VERCODE deployment runs entirely on AWS ECS Fargate inside a two-tier
VPC. The API tier sits in public subnets behind an Application Load Balancer
and holds no model credentials. The worker tier runs in private subnets
and is the only tier that can reach the LLM provider gateways. Postgres
(RDS) and Redis (ElastiCache) live in the private tier; the Next.js
dashboard is a static export on S3 fronted by CloudFront with WAF.
```
