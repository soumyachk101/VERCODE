# VERCODE — Observability

The "failures and retries are observable" requirement (DEFINITION OF DONE #12) is a first-class design property, not a logging bolt-on. Three pillars: structured logs, traces, metrics — plus error tracking. The invariant: a failure, a retry, a skip, or a degraded stage is *queryable* by an operator, not just present in a log file someone scrolls.

## 1. Structured logging (pino, the redaction gate)

- **One JSON record per stage** of the review pipeline: `webhook.ingest`, `job.enqueue`, `diff.fetch`, `static.analyze`, `ai.review`, `findings.validate`, `github.publish`, `usage.record`. Every record carries the **correlation id** (= the `job_id`), the `org_id`, the stage, the outcome, and the duration.
- **The redactor runs on *every* record before it's written** (`SECRETS_MANAGEMENT §3`, `ST-redaction-*`): a secret-shaped value in a log line is masked (`OPENAI_API_KEY=***`), not emitted. A log line is *not* a place a secret may reach.
- **A skip is a log record, not an absence:** a `skipped: install_removed` / `skipped: same_sha` job writes a structured record with the `skip_reason` (the "never silent" rule, NFR-18) — an operator can query "why did this job not run?" from the log, and the dashboard's failed/skipped view reads the same rows.
- **Levels + the PII scrub:** `debug` (dev only), `info` (the stage records), `warn` (a degraded stage, a retried publish), `error` (a terminal failure, a DLQ write). No PII (a user email, a name) in a log record beyond the `org_id`/`user_id` (the ids are the PII-safe join, not the PII itself).

## 2. Tracing (OpenTelemetry, one trace per pipeline)

- **A review is a single trace** with spans per stage (`webhook.ingest` → `job.enqueue` → `diff.fetch` → `static.analyze` (a parallel sibling) → `ai.review` → `findings.validate` → `github.publish`), `SYSTEM_ARCHITECTURE §2.1`. The trace id = the `job_id` (a trace is queryable by the job, and the job is queryable by the PR + org — the correlation is end-to-end, webhook to GitHub publish).
- **The provider calls carry token + cost attributes** (an `ai.review` span: `model`, `inputTokens`, `outputTokens`, `estUsd`, `promptVersion`, `finishReason`) — the cost/latency of the AI stage is in the trace, not just a DB row (AC-306's numbers are trace-observable).
- **The GitHub publish span** carries the outcome (the inline-comment count, the `anchor_failed` demotes, a 429-retry count) — a "the publish hit the rate limit" is a span attribute, queryable.
- **The spans cross the process boundary** (the webhook in `api`, the pipeline in `worker`) via the trace context in the queue payload (the `jobId` carries the trace context; the worker continues the trace, not a new one) — the webhook→worker hand-off is one trace, not two disconnected ones.

## 3. Metrics (the alertable signals)

The metrics are the *leading indicators* a canary + an on-call watch (`RELEASE_CRITERIA §3`):

| Metric | The signal | Alert when |
| --- | --- | --- |
| **`review-queue` depth + age** | worker under-scale (a growing lag = the pipeline is falling behind) | depth > the SLO, or the oldest job's age > the p95 budget (300 s) |
| **DLQ depth** | terminal failures piling up | non-zero *and growing* (a DLQ is a real incident, `PERFORMANCE_SCALABILITY §7`) |
| **provider error rate + fallback rate** | a provider degradation | a sustained fallback spike (a provider is degrading *before* review quality drops) |
| **GitHub 4xx/5xx rate** | a GitHub-side issue (a rate-limit storm, an App-permission problem) | a sustained 4xx (the `GITHUB_RATE_LIMITED` partial states) |
| **review-latency p95** | the NFR-02 budget (300 s) | a p95 breach |
| **cost/review + the platform token-spend** | the cost-abuse backstop (`RATE_LIMITING §2`, `THREAT_MODEL T-11`) | a spend trend toward the `PLATFORM_TOKEN_SPEND_CAP_USD` |
| **the web/worker/api error rates** | an unexpected exception (a 500, an unhandled worker crash) | a non-trivial rate (the Sentry captures are the detail) |
| **the tenant-isolation audit rate** (`access.denied_cross_tenant`) | a cross-org access attempt | a non-zero rate (a 404 cross-tenant is *expected* for a user hitting the wrong org, but a *sustained* rate from one source is a probe — it's audited + alertable, `TENANT_ISOLATION §2`) |

The **dashboard's "Failed / skipped reviews" view** (the `DEFINITION OF DONE #12` surface) reads the job rows + the audit rows: a skip with its `skip_reason`, a failure with its error + the retry count, a DLQ entry — the operator sees *why* a review didn't happen, not just that it didn't.

## 4. Error tracking (Sentry)

- **`api` + `worker` + `web`** each have a Sentry DSN (`ENVIRONMENT_VARIABLES §5`). A 500 / an unhandled worker exception is captured with the **correlation id** (the `job_id`) — a Sentry event is joinable to the trace + the log records (the same id threads all three, `SYSTEM_ARCHITECTURE §2`).
- **PII + secret scrubbing:** breadcrumbs + the capture are scrubbed (no user email/name, no a secret — the redactor applies to the Sentry payload pre-send, `SECRETS_MANAGEMENT §3`). A Sentry event that carries a secret is a *leak* (the `ST-secret-leak` test covers the log + the finding + the prompt; the Sentry scrub is the same gate extended to the capture).
- **Org-scoped release tags:** a Sentry event is tagged with the `org_id` (a "which org does this error belong to" query is possible) + the release (a "did the last release introduce this error" query — a deploy-rollback decision, `DEPLOYMENT §6`).

## 5. The "a failure is observable" invariant (the acceptance test)

DEFINITION OF DONE #12 ("Failures and retries are observable") is *testable*, not aspirational:

| Observable fact | Where |
| --- | --- |
| A job's status transition (queued → running → succeeded/partial/skipped/failed) + its `skip_reason`/`error` | the `review_jobs` row (the dashboard's "Failed / skipped reviews" view + the structured log record) |
| A retry (attempt N of 3, the backoff, the reason) | the queue's attempt counter + a structured log record per attempt + the trace's retry span |
| A DLQ entry (a terminal failure's reason) | the `review-dead-letter` queue + a metric + an alert |
| A degraded stage (a `partial` job: which stage degraded) | the job's `status=partial` + the trace's stage spans (the failed/absent span) + the log record |
| A skipped review (the reason, the posted notice) | the `skip_reason` + the posted-notice (the mock/real GitHub recorded it) + the audit row |
| A cross-tenant denial | the `access.denied_cross_tenant` audit row (the *attempt* is recorded, not just the success, `AUTHORIZATION §8`) |

**The test (`E2E_TEST_PLAN §3`'s "real data" rule):** an operator can answer "why did this review not publish?" from *stored* data (the job row + the audit + the trace), not from a log scroll. A failure that's *only* in a log file (not queryable) is an observability defect.

## 6. Health endpoints (NFR-23)

- **Liveness** (`/healthz`): the process is up (a trivial, always-200 — a container-liveness probe).
- **Readiness** (`/readyz`): the process can serve (the DB + Redis are reachable) — a 503 when they aren't (a readiness probe: the instance is drained from the load balancer, not killed). A *webhook* route that can't reach the queue is *not ready* (it can't enqueue → a 503, so a GitHub retry lands on a healthy instance, not a 500).
- **The queue-depth metric** is exposed (a Prometheus endpoint on the worker) — the KEDA scaler + the dashboard read it (`PERFORMANCE_SCALABILITY §4`).

## 7. The data-retention of observability data

- **The logs + traces + the Sentry captures** have a retention (the log store's TTL, a Sentry project's retention) — the audit *events* (the 180 d floor, NFR-27) are the *compliance* record (they outlive the logs); the logs/traces are the *operational* record (shorter-lived). A security investigator uses the *audit* (the long-lived, append-only) + the *trace* (the short-lived, detailed) — the two are joined on the `job_id`/correlation id (a trace that's expired still has its audit trail).
