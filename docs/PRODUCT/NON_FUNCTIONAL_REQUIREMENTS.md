# VERCODE — Non-Functional Requirements

Stable IDs `NFR-##`. These are contractual; CI asserts where measurable.

## Performance

| ID | Requirement | Target |
| --- | --- | --- |
| NFR-01 | Review reliability | ≥ 99% of valid PR webhooks produce a completed or explicitly-skipped review over a rolling 30 d |
| NFR-02 | Review latency | p50 < 120 s, p95 < 300 s (50-file diff, ≤ 500 changed lines) from webhook receipt to GitHub publication |
| NFR-03 | Dashboard API | p95 < 400 ms at 10 concurrent orgs; p99 < 1 s |
| NFR-04 | Webhook endpoint | Accept + enqueue < 300 ms p95 (no LLM on the webhook path) |

## Security

| ID | Requirement |
| --- | --- |
| NFR-05 | OWASP ASVS L2 baseline across the API; L1 is the floor, L2 the target |
| NFR-06 | 100% rejection of forged/replayed webhooks (HMAC + `X-Hub-Delivery` dedup + 5 min timestamp window) |
| NFR-07 | Zero cross-tenant rows served — verified by the tenant-isolation integration suite on every release |
| NFR-08 | Secrets never in logs; findings and summaries pass through a redaction pass before storage |
| NFR-09 | Prompt-injection defenses: repository content is *data*, never instructions; review prompts carry no tool access; output is schema-validated (see `SECURITY/PROMPT_INJECTION_DEFENSE.md`) |
| NFR-10 | Least-privilege GitHub App scopes (`FR-210`); install tokens never exposed to the browser; no PAT collection |
| NFR-11 | Static analysis and (later) any code execution run in a separate process/isolation boundary with no production credentials |

## Reliability & Data

| ID | Requirement |
| --- | --- |
| NFR-12 | 99.5% API availability target; queue-backed workers tolerate a 30-minute API outage without job loss |
| NFR-13 | Idempotent queue processing: a redelivered webhook or redelivered job never double-posts a GitHub review (commit-SHA + `job_id` dedup) |
| NFR-14 | Bounded retries: max 3, exponential backoff with jitter, dead-letter queue for terminal failures with observability |
| NFR-15 | Graceful shutdown: workers stop pulling and finish in-flight work within a 60 s budget; API drains connections |
| NFR-16 | Database migrations are forward-only with rollback notes; zero-downtime deploy via expanded/contracted pattern where schema changes touch hot paths |

## Scalability

| ID | Requirement |
| --- | --- |
| NFR-17 | Modular monolith scales horizontally: API stateless (Redis-backed sessions/queues), workers horizontally scalable, Postgres connection-pooled |
| NFR-18 | Cost guardrails: per-org hard caps on monthly tokens and review counts; over-quota jobs are *skipped with notice*, never silently dropped or silently billed beyond cap |
| NFR-19 | Per-review input budget capped (default 60 files / 3,000 lines); over-budget reviews degrade to a *review of the highest-risk files* with a note, not an error |

## Observability

| ID | Requirement |
| --- | --- |
| NFR-20 | Structured JSON logs (correlation ID end-to-end: webhook → job → provider → GitHub call) |
| NFR-21 | OpenTelemetry traces: the review pipeline is a single trace with spans per stage; provider calls carry token + cost attributes |
| NFR-22 | Error tracking (Sentry) with org-scoped release tagging; no PII in breadcrumbs |
| NFR-23 | Health endpoints: liveness (process), readiness (DB + Redis), and queue-depth metric exposed to dashboards |

## Accessibility & UX

| ID | Requirement |
| --- | --- |
| NFR-24 | WCAG 2.1 AA: color contrast, keyboard reachability, focus management, form labeling, screen-reader announcements on async data |
| NFR-25 | `prefers-reduced-motion` respected: motion collapses to opacity-only crossfades (per emil-design-eng rules) |
| NFR-26 | Dark mode is first-class (developer tooling default); light mode supported |

## Data Retention & Privacy

| ID | Requirement |
| --- | --- |
| NFR-27 | Retention by plan: finding history Free 30 d / Developer 90 d / Team 1 y / Enterprise custom; audit log 180 d; usage events 24 months |
| NFR-28 | Repository content is ephemeral: raw diffs are not stored beyond the review lifetime (findings + summary stored, source text purged per FR-404 on disconnect) |
| NFR-29 | No codebase embedding sent to AI providers beyond the bounded context of the changed files + 1-hop imports; provider contracts prohibit training on payload (verified against provider ToS at integration) |

## Deployment & Ops

| ID | Requirement |
| --- | --- |
| NFR-30 | `web`, `api`, `worker` deployable independently; shared contracts package pins API shape |
| NFR-31 | All environment configuration via `.env` (no config baked into images); `.env.example` documents every variable |
| NFR-32 | Backups: Postgres PITR + logical dumps daily; restore runbook in `OPERATIONS/BACKUP_RESTORE.md` |
