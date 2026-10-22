# VERCODE — Integration Test Plan

The integration suite proves the *seams* (DB, queue, webhook, provider, GitHub, payment) with **real** Postgres + Redis (testcontainers) and **mock** external providers (the mock GitHub Octokit transport, the mock AI provider, the Stripe test-mode webhook signatures). A seam is tested real; only the *outer edge* (the network boundary) is mocked. A test that mocks the DB or the queue is not an integration test and is rejected in review.

The suite layout (`tests/integration/`) and the test IDs referenced from `ACCEPTANCE_CRITERIA.md` + `SECURITY_TEST_PLAN.md`:

## 1. The harness

- **testcontainers** (or the Compose stack): a Postgres 16 instance with the Prisma migrations applied + a Redis 7 instance, per suite (an isolated container, no shared state between test files).
- **The mock providers** (from `packages/ai-providers`'s `mock` adapter + a `mock-github` HTTP stub):
  - **mock AI provider** — a deterministic `completeStructured` that returns fixture-shaped outputs (a "good" output, a "schema-invalid" output, a "steered/leak" output, a "down" that throws). The test *selects* which behavior by a config flag, so one provider serves every case.
  - **mock GitHub** — an HTTP stub that serves a canned PR diff, an install-token exchange, and a review-publi
cation endpoint that records what was posted (the assertion target). The *webhook direction* is driven by the test POSTing a pre-computed signed event (a fixture with a real HMAC against the test `GITHUB_WEBHOOK_SECRET`).
- **The Stripe test-mode webhook** — a `Stripe.constructEvent`-style pre-computed payload + signature (the provider's test library, a deterministic signature, no live call).

## 2. GitHub webhook (the ingress seam, `IT-webhook-*`)

| Test | Setup | Assertion |
| --- | --- | --- |
| `IT-webhook-opened` | A signed `pull_request.opened` event, a new delivery id | 202; a `webhook_deliveries` row; a `review-queue` job enqueued with the right `(orgId, repoId, pr, sha)`; **no** LLM call on the ingress path (a spy: the AI provider's call count is 0 at the webhook route) |
| `IT-webhook-forged` | An event signed with a *wrong* key / no signature | 401 `WEBHOOK_REJECTED`; **no** queue write; an audit row with the source IP |
| `IT-webhook-replay` | A valid event whose delivery id was seen < 24 h | 200 no-op; the pipeline is *not* re-run (the job count is unchanged) |
| `IT-webhook-stale` | A valid signature, `X-Hub-Timestamp` > 5 min | 401; audited |
| `IT-webhook-malformed` | A verified event whose body fails the event schema | 422 `WEBHOOK_MALFORMED`; *not* enqueued; audited |
| `IT-webhook-unknown-install` | A verified event for an install VERCODE never recorded | 404; audited (not a 200) |
| `IT-webhook-install-removed` | An `installation.deleted` | The install → `removed`; its repos → `disconnected`; a `retention_jobs` row scheduled; queued jobs for that install → `skipped: install_removed` (AC-204) |

## 3. Queue + retry (the durability seam, `IT-queue-*`)

| Test | Setup | Assertion |
| --- | --- | --- |
| `IT-queue-retry-transient` | A provider 5xx on a job | The job retries with exponential backoff up to 3 attempts; a 4th transient failure → the `review-dead-letter` queue (a DLQ row with the reason, observable) |
| `IT-queue-terminal-not-retried` | A terminal error (install removed) on a job | The job → `skipped` *without* 3 retries (a terminal condition isn't re-run, `ERROR_HANDLING §3`) |
| `IT-queue-idempotent-redeliver` | A redelivered job for a *completed* `(org,repo,pr,sha)` key | The existing completed row is found; the publish step is a no-op (the stored `published_github_review_id` is reused); **no** double GitHub post (a mock-GitHub spy: the review-create call count is 1) |
| `IT-queue-in-flight-lock` | Two workers pick up the same in-flight job | The second finds the Redis `lock:{key}`; it drops to the DLQ with `duplicate_in_flight` (the first worker owns it, `REVIEW_ENGINE_SPEC §5`) |
| `IT-queue-backpressure` | A flood of jobs exceeds the queue's depth cap | The overflow → the DLQ (not a crash); the ingress p95 stays flat (NFR-04, the webhook is constant-latency regardless) |

## 4. AI provider failures (the fail-soft seam, `IT-ai-fail*`)

| Test | Setup | Assertion |
| --- | --- | --- |
| `IT-ai-down-still-publishes` | The AI provider is *down* (a throwing mock) | The static-analysis findings **still publish**; the job is `partial` (not `failed`); the summary notes the degraded stage; **zero** AI tokens are recorded for the down calls (a cost sanity: a failed call isn't billed) |
| `IT-ai-malformed-retry` | The provider returns a schema-invalid structured payload | One "be strict" retry; on second failure, the AI stage drops + the deterministic findings survive; the `dropped.invalid` counter reflects the drop |
| `IT-ai-fallback` | The primary provider 429s/5xxs after its retries | The fallback provider is called (one switch, FR-314); the job's `model`/cost record the *actual* fallback model used (AC-306); a fallback failure → `partial` |
| `IT-ai-rate-limit` | The provider 429s with a `retry-after` | Bounded backoff honoring `retry-after`; the review completes (or `partial`) within the wall-clock budget, not a hang |

## 5. Database transactions (the integrity seam, `IT-tx-*`)

| Test | Setup | Assertion |
| --- | --- | --- |
| `IT-tx-publish-not-rollback` | The pipeline persists findings, then the GitHub publish *fails* | The stored findings + the `usage_events` row **survive** the failed publish (a separate commit); the publish retries independently (the findings aren't rolled back, `ERROR_HANDLING §6`) |
| `IT-tx-no-orphan-success` | A job marked `succeeded` | There is a matching `usage_events` row (the *nightly reconciliation* query finds zero `succeeded`-jobs-without-usage rows — an integrity invariant, `ERROR_HANDLING §6`) |
| `IT-tx-atomic-persist` | The findings + job-state + usage are written | They land in *one* transaction (a partial write is impossible — either all or none); a forced mid-transaction failure rolls back all three |

## 6. Inline comment publication (the anchor seam, `IT-publish-*`)

| Test | Setup | Assertion |
| --- | --- | --- |
| `IT-publish-inline` | A finding whose line resolves in the diff | A GitHub inline review comment is posted (a mock-GitHub spy: the comment's `commit_id`/`path`/`side`/`line` match the resolved anchor); the finding's `anchor_status` = `inline` |
| `IT-publish-fallback` | A finding whose line does *not* resolve | It's demoted to a structured section in the review body, marked `anchor_failed`; the *other* valid findings still post inline (AC-203) |
| `IT-publish-summary-only` | A review with zero publishable findings | A summary review is posted (verdict + "no actionable findings above threshold"); *no* inline comments; the job is `succeeded` (an empty review is a valid outcome, not an error) |
| `IT-publish-idempotent` | A re-run of a job that already published | The stored `published_github_review_id` → a no-op (no second review, NFR-13) |

## 7. Payment events (the billing seam, `IT-payment-*`)

| Test | Setup | Assertion |
| --- | --- | --- |
| `IT-payment-01` | A verified `invoice.paid` / `customer.subscription.updated` | `org_billing.status` → `active` (the plan moves); the `organizations.plan` is reconciled; a `billing_events` row (the idempotency record) |
| `IT-payment-02` | An *unsigned* / forged billing event, or a client claim "plan=enterprise" | `org_billing` is **unchanged** (a client claim is inert, AC-403); the event is rejected + audited |
| `IT-payment-03` | A re-delivered event (same event id) | A 200 no-op; the state is not double-moved (the `billing_events` UK makes it a no-op) |
| `IT-payment-grace` | An `invoice.payment_failed` → `past_due` | The org keeps its plan through the grace window (reviews still run, a warning surfaces); after grace → `canceled` → quota frozen + new reviews `skipped` with a notice (NFR-18, never a silent stop, never a silent over-bill) |

## 8. Tenant isolation (the release-gate seam, `IT-tenant-01..05`)

| Test | Setup | Assertion |
| --- | --- | --- |
| `IT-tenant-01` | Org A's session requests `/orgs/{B}/reviews` | **404** (not 403 — no existence oracle, AC-902); an `access.denied_cross_tenant` audit row |
| `IT-tenant-02` | A Viewer in org A hits a *mutating* org-A route | **403** (a capability denial, *distinct* from 01's tenancy 404) |
| `IT-tenant-03` | A user who's a member of *neither* org hits org B | 404 |
| `IT-tenant-04` | The `EXPLAIN` of every tenant fixture query | The leading index is `org_id`; **no** seq-scan on a tenant table for a tenant query (a regression = a tenancy bug, the gate) |
| `IT-tenant-05` | A Redis diff-cache write for org A, read under an org B key | Org B's key never resolves org A's entry (the key namespaces; a cache leak is a tenant leak) |

**Re-run on every schema change** (a new tenant table that forgot its `org_id` column / leading index fails 04's plan check) — tenancy is a *release gate*, not a one-time review.

## 9. Idempotency (the commit-SHA seam, `IT-idempotency-01`)

| Test | Setup | Assertion |
| --- | --- | --- |
| `IT-idempotency-01` | A `pull_request.synchronize` whose head SHA = the last completed review | **No** new job (the `skipped: same_sha` path, AC-202); the existing completed job is returned |
| `IT-idempotency-02` | A new head SHA (a force-push) | A *new* job (the content-hash short-circuit is P1, ADR-007 — a new SHA is a new review in MVP) |
| `IT-idempotency-03` | A *direct* re-review request (US-105) at the same SHA | An idempotent no-op (the API returns the existing job, a 409/202 with the existing state, `ERROR_CODES §2.5`) |

## 10. The seam rule (the review gate)

A test is an **integration test** iff it: (a) uses the *real* Postgres + Redis (testcontainers), (b) exercises a *cross-boundary* behavior (a webhook→queue→worker→DB→GitHub flow, a payment-event→plan-state, a tenant read), and (c) mocks *only* the network outer edge (the GitHub transport, the AI provider, the provider-webhook signature — with the mocks being *deterministic* + the assertion targets being *recorded side-effects*). A test that fails any of (a)–(c) is either a unit test (move it to the package) or a defect (a mocked DB/queue, rejected in review).
