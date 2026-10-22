# VERCODE — Rate Limiting

Per-org and per-user limits that protect the API, the AI budget, and the GitHub App quota. Limit enforcement is the *platform's* defense against abuse; the plan quota (`plans.ts`) is the *commercial* limit — the two are distinct and both enforced.

## 1. The three limit layers

| Layer | What it limits | Basis | Effect on exceed |
| --- | --- | --- | --- |
| **Commercial quota** (plan) | Reviews/month, token spend/month | `plans.ts` + `usage_events` | Review job `skipped` with a posted notice (NFR-18); API returns `QUOTA_EXCEEDED` on a direct request |
| **Org rate limit** | API RPS per org | per-org sliding window (Redis) | 429 `RATE_LIMITED` with `Retry-After` |
| **User rate limit** | API RPS per user (sign-in, mutations) | per-user sliding window | 429 `RATE_LIMITED`; sign-in failures additionally trip the lockout (`ACCOUNT_LOCKED`) |

The commercial quota is a *monthly aggregate* (cost control); the rate limits are *short-window* (abuse/DoS control). A plan can have an infinite quota (Enterprise) but still hits the org RPS limit (the App's GitHub budget and the platform's provider budget are finite regardless of plan).

## 2. Limits by plan and endpoint class

| Endpoint class | Free | Developer | Team | Enterprise | Notes |
| --- | --- | --- | --- | --- | --- |
| Read (GET dashboard) | 300 req/min | 600 req/min | 1,200 req/min | 2,400 req/min | Per org |
| Mutating (POST/PATCH) | 60 req/min | 120 req/min | 240 req/min | 480 req/min | Per org |
| Sign-in attempts | 10/15 min | same | same | same | Per user → lockout on 5 fail |
| Webhook ingress (GitHub) | — | — | — | — | Not rate-limited by plan; bounded by GitHub's own dispatch + our dedup (the ingress is constant-latency, NFR-04) |
| Re-review requests (`POST /github/review`) | 20/hr | 100/hr | 500/hr | 2,000/hr | Prevents a hammer of re-runs against the pipeline |

These are **configurable** (the brief: "keep commercial limits configurable"). The table is the *default*; an Enterprise org's limits are tuned per-org in `org_settings` (admin-visible, audit-logged on change).

## 3. The GitHub-side budget (the real ceiling)

The GitHub App has its own rate limit (REST: ~5,000 req/h per install + secondary limits; GraphQL cost-based). The plan's *review count* is only a soft ceiling if GitHub's limit is hit first. So:

- A **per-installation GitHub throttler** (`INTEGRATION_DESIGN.md` §1.6) serializes the App's GitHub calls so one org's large-PR week doesn't starve other installs of the shared App quota.
- GitHub 403/429 with `x-poll-interval` / `retry-after` → the publish step backs off (the AI already ran — don't re-run it); the review job is *not* failed, it waits for the budget to clear (bounded wait, then `GITHUB_RATE_LIMITED` partial state).

## 4. Enforcement mechanics

- **Redis sliding window** per `(org, class)` and `(user, sign-in)` — a small, bounded store; a window expiry is a TTL, not a scan.
- **Burst tolerance:** a short burst (a dashboard load = N parallel requests) is allowed within the window; sustained excess trips the 429.
- **`Retry-After`:** computed from the window's reset time; the web client respects it (no immediate retry hammer).
- **Plan changes take effect on the next window**, not mid-window (a downgrade doesn't retroactively 429 in-flight requests).

## 5. What the limits protect

1. **The AI budget** — a rate limit is a backstop to the token cap; a bug that lets an org enqueue unbounded reviews is caught by the *monthly* quota, but a *sustained flood* is caught by the RPS limit first.
2. **The GitHub App** — one org's flood must not 403 other orgs' publishes (the per-install throttler + the App's shared budget).
3. **The platform** — a DoS on the public API is bounded by the per-user + per-org RPS limits; a sign-in flood is bounded by the lockout.

## 6. Abusive-usage detection (API cost abuse, threat T-12 in the threat model)

- **Anomaly alert:** an org whose review volume or token spend spikes > 3× its 30-day baseline gets an ops alert *and* a dashboard banner (the org is informed, not just throttled).
- **Hard platform cap:** beyond the *org's* plan cap, there's a **platform-level** token budget (the provider spend ceiling). If an org's requests would breach the *platform* budget (a misconfigured huge plan + huge volume), the platform cap trips and reviews degrade/skip with a notice — the platform's provider bill is bounded even if a single org's plan isn't (the cost-abuse backstop).
- **The skip-with-notice invariant:** no limit is ever hit *silently*. A quota/rate limit that stops reviews always leaves a user-visible record (a posted PR notice + a dashboard row), which is both a UX rule and an abuse-detection signal (a silent stoppage is how cost abuse hides).

## 7. Verification

| Test | Assertion |
| --- | --- |
| `IT-rate-01` | N+1 requests over an org's read limit → the N+1th is 429 with a sane `Retry-After` |
| `IT-rate-02` | Sign-in: 6th failure in 15 min → `ACCOUNT_LOCKED` (not just 401) |
| `IT-quota-skip` (AC-402) | Over the monthly review quota → job `skipped: quota_exceeded`, **zero** AI tokens consumed, a notice posted |
| `ST-cost-abuse` | A misconfigured org's flood is bounded by the platform cap; the platform's provider-spend metric does not exceed its ceiling |
