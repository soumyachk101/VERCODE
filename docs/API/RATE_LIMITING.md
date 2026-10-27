# VERCODE — Rate Limiting

What is actually in place today (verified against `apps/api`). There is **no per-plan quota** and **no Redis 429 middleware in the API process** — limits are two separate mechanisms:

1. **The sign-in lockout** (in the `apps/api` sign-in route): a per-email failure counter (Redis in prod; an in-memory store in the current build). **5 failures in 15 min → `429` `ACCOUNT_LOCKED` for 30 min.** The counter is keyed by the *email*, not the user row, so a fake email can't be distinguished from a real one (a no-enumeration lockout, `AUTHENTICATION.md` §7).
2. **The queue's backpressure** (`apps/api/src/queue.ts`, BullQueue over Redis): when `REDIS_URL` is unreachable the queue *degrades* — a no-op enqueue + a warning, and the durable `review_jobs` row is the source of truth (the worker's re-drain picks it up; a queue outage never 5xxs the webhook ingress, NFR-04). That's a degraded-mode rule, not a throttle.

## 1. The GitHub-side budget (the real ceiling)

The GitHub App has its own rate limit (REST: ~5,000 req/h per install + secondary limits; GraphQL cost-based). A review job that hits GitHub 403/429 is not failed — the publish step backs off with `x-poll-interval` / `retry-after` (the AI already ran — don't re-run it).

## 2. Abusive-usage detection (threat T-12 in the threat model)

- **Usage reporting, not gating.** `GET /orgs/:id/usage` returns plain aggregates (reviews, tokens, est. cost) — no quota, no plan tier, no skip-on-exceed. An org's review volume is visible to the org, not capped by the platform.
- **The skip-with-notice invariant:** when a review job is skipped (a pipeline-level skip reason, e.g. an in-flight same-SHA or a degraded stage), the reason is recorded on the job and surfaced in the dashboard (NFR-18 — failures are observable, never silent).
- **The platform cost-abuse backstop (threat T-11).** The only cost bound is the platform-level `PLATFORM_TOKEN_SPEND_CAP_USD` (`packages/config`) — an operational backstop, not a per-org gate: when total platform spend crosses the cap the *platform* is alerted; no customer-visible skip is emitted (the cap is config-only; the worker-side alert is a later seam, `OBSERVABILITY.md §3`). An org whose review volume spikes > 3× its 30-day baseline gets an ops alert (`INTEGRATION_DESIGN.md §2.3`).

## 3. Verification

| Test | Assertion |
| --- | --- |
| `IT-signin-lockout` (AC-101) | 6th failed sign-in within 15 min → `429` `ACCOUNT_LOCKED` (not just 401) |
| `ST-queue-degraded` | An unreachable Redis → the webhook ingress still 202s; the enqueue is a no-op + a warning; the durable `review_jobs` row is written |
