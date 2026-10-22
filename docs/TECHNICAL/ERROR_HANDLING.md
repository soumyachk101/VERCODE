# VERCODE — Error Handling

The error-handling contract across API, worker, and the external integrations. The goals: no silent failure, no data loss, no secret leakage in errors, and a bounded, observable retry posture.

## 1. Error taxonomy

| Class | Example | Where handled | User-visible? |
| --- | --- | --- | --- |
| **Validation** | malformed webhook body, invalid API input, out-of-enum finding | API (Zod) / engine (re-validation) | Yes — 422 with the exact error shape; no stack trace |
| **AuthN** | missing/expired/revoked session, bad signature | API middleware / webhook verify | Yes — 401 |
| **AuthZ** | cross-org access, role lacks capability | API middleware | Yes — 404 (tenancy, to avoid existence oracles) / 403 (capability) |
| **Quota/policy** | over monthly cap, suppressed category, below floor | worker pre-flight / policy-engine | Yes — a *posted notice* on the PR + dashboard record (skip, not silent) |
| **External dependency** | GitHub 403/429, provider 429/5xx/timeout | github / ai-providers adapters | No — retried with backoff; surfaced in observability |
| **Terminal failure** | install removed, PR closed, provider fully down | worker | Yes — job `skipped`/`partial` with a reason; a notice is posted |
| **Internal/bug** | unexpected exception | global handler | No — 500 to the caller; captured in Sentry with the correlation id |

## 2. API error responses

- Every error is a structured JSON body: `{ "error": { "code", "message", "details?" } }` where `code` is a stable machine code (see `API/ERROR_CODES.md`), never a stack trace.
- **Sanitization:** a global error handler maps internal exceptions to a safe shape; the original error is captured to Sentry with the correlation id, *not* returned to the client.
- **Webhook route** is special: an *unverifiable* webhook returns 401 (no body that leaks internals) and is audit-logged; a *verified-but-malformed* webhook returns 422 and is **not** enqueued.
- **Rate limit** responses carry `Retry-After` and the standard error code `RATE_LIMITED` (`API/RATE_LIMITING.md`).

## 3. Queue / worker retry behavior (NFR-13/14)

- **Bounded retries:** `maxAttempts: 3` for the review job; exponential backoff `2^attempt` seconds + jitter; terminal failures go to `review-dead-letter` with the reason recorded (observable, not lost).
- **Retry classification:** a transient error (provider 5xx, GitHub 429) is *retryable*; a terminal error (install removed, PR closed, quota exceeded) is *not retried* — it's a clean skip. The worker distinguishes these so a terminal condition isn't re-run three times.
- **Idempotent redelivery:** because the idempotency key is `(org, repo, pr, sha)` and publication stores the published-review id, a redelivered job for an *already-published* review no-ops the publish step (NFR-13).
- **In-flight lock:** a Redis lock `lock:{org:repo:pr:sha}` with a TTL guards against two workers running the same job; a duplicate that finds a live lock drops to the DLQ with `duplicate_in_flight` (REVIEW_ENGINE_SPEC §5).

## 4. GitHub integration errors (INTEGRATION_DESIGN §1.7)

| Error | Handling |
| --- | --- |
| 403/429 (rate limit) | Backoff honoring `x-poll-interval` / `retry-after`; retry the *publish* step only (the AI already ran); a per-installation throttler prevents one org from starving the shared App |
| 422 (invalid anchor) | Demote that finding to a PR-body section; mark `anchor_failed`; the rest publish |
| 401/404 (install gone) | Job → `skipped: install_removed`; stop all GitHub calls for that install |
| 409 (PR closed/merged) | Job → `skipped: pr_closed`; no retry |

## 5. AI provider errors (AI_SYSTEM_DESIGN §5)

- 400/overflow → truncate context to the budget, retry once, else `partial`.
- 429/5xx/timeout → bounded retry (2×) → provider fallback (FR-314, one switch) → `partial`.
- **A provider failure never fails the review:** deterministic (static) findings still publish; the job is `partial`, not `failed`, and the summary notes which stages degraded.

## 6. Transaction boundaries (worker)

- **Persist-then-publish:** findings + job state + usage are written in a *single Postgres transaction* (atomic); GitHub publication happens *after* the commit and stores its own id. If publish fails, the findings are still durable and the publish is retried independently — a failed publish never rolls back the stored review.
- **Usage accounting** is in the same transaction as the job's terminal state, so a review that completed but "forgot" to account is impossible (a missing `usage_events` row for a `succeeded` job is a detectable integrity error, caught by a nightly reconciliation job).

## 7. Safe error handling (no secret leakage)

- The global error handler + the log redactor (`observability.redact`) guarantee that a stack trace, an env var, a DB URL, or an API key never reaches a log line or a response body (NFR-08, AC-903). The redactor runs on *every* structured log record before it's emitted.
- Sentry events are PII/secret-scrubbed before send (breadcrumb filters).

## 8. Graceful shutdown (NFR-15)

- **Worker:** on SIGTERM, stop dequeueing; let in-flight jobs finish within a 60 s budget; any job that can't finish is re-queued atomically (BullMQ `removeOnComplete` + a job-lifecycle hook re-queues on SIGTERM mid-flight).
- **API:** stop accepting new connections; drain in-flight requests; the webhook route, being fast (verify+enqueue only), drains quickly.
- A shutdown that can't drain in 60 s logs a warning and exits — BullMQ's durable queue means no job is lost, only re-run.

## 9. Observability of failures

- Every skip/partial/failure writes a structured log record with the `jobId`, `orgId`, the reason code, and the attempt count — queryable in the dashboard's "Failed / skipped reviews" view (the "failures and retries are observable" requirement, DEFINITION OF DONE #12).
- DLQ depth, provider error rate, GitHub 4xx/5xx rate, and review-latency p95 are alertable metrics (TRD §15).

## 10. The "never silent" rule

Every terminal outcome of a job — `succeeded`, `partial`, `skipped:<reason>`, `failed:<reason>` — is (a) stored with a reason, (b) posted as a notice on the PR when user-facing (skip reasons), and (c) surfaced in the dashboard. A review that "just didn't happen" without a recorded reason is a defect the integrity reconciliation job is built to catch.
