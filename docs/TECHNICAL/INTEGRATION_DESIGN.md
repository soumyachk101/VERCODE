# VERCODE — Integration Design

This document covers the two hard integrations: **GitHub** and **billing providers**. AI-provider integration is specified in `AI_SYSTEM_DESIGN.md` / `MODEL_ROUTING.md`.

## 1. GitHub App

### 1.1 App model

VERCODE ships as a **GitHub App** (not a user OAuth app, not PATs). The App is installed per-organization (or per-account) and receives the repositories the installer scopes it to.

- `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` (PEM, KMS-wrapped at rest), `GITHUB_WEBHOOK_SECRET` (HMAC) are the only GitHub credentials.
- **Installation credentials are never exposed to the browser** (FR-210, NFR-10). The install URL is generated server-side; the browser only follows it.
- No PAT collection, ever. The install flow is the only credential path.

### 1.2 Permission set (least privilege, FR-210)

| Permission | Level | Why |
| --- | --- | --- |
| `contents` | read | Fetch PR diff + bounded file context |
| `pull_requests` | write | Publish review + inline comments |
| `checks` | write | Optional: post a CI check marking review status (P1; read in MVP) |
| `issues` | read | Read PR-related issue context |
| `metadata` | read | Standard, required |
| `webhooks` | (events) | PR + installation events |

**Explicitly NOT requested:** `admin:org`, `admin:repo`, `secrets` (any), `actions` (write), `members` (write). The install screen should show this minimal set; a reviewer auditing the App sees exactly what's needed.

### 1.3 Auth flow

```
api ──(App JWT, RS256, 10-min TTL, refreshed at 50%)──▶ GitHub → installation access token (per-install, 1-h TTL, cached at 50%)
worker ──(installation token)──▶ GitHub REST/GraphQL
```

- App JWT is signed with the App's private key; it authorizes *exchange* for installation tokens.
- Installation tokens are cached per `(installation_id, token, expires_at)` in Redis; a token is reused until 50% of its lifetime.
- Every Octokit call carries the installation token for the *relevant* installation. A request that has lost its install (removal) fails fast with a clean error (AC-204).

### 1.4 Webhook events (MVP)

| Event | Action |
| --- | --- |
| `installation` (created/deleted) | Record / deactivate install; on deleted → AC-204 |
| `installation_repositories` (added/removed) | Upsert / mark repos disabled |
| `pull_request` opened/reopened/synchronize | Enqueue review job (idempotent on head SHA) |
| `pull_request` closed | Mark job terminal; stop publishing |
| `pull_request_review` submitted | Optional re-review trigger (a "re-run" request, US-105) |
| `pull_request_target` (forks) | Review in sandboxed context; publish to base repo only |

**All** webhooks go through `verifyWebhook()` (HMAC + timestamp window + delivery-id dedup) before any processing. The receipt row (`webhook_deliveries`) is the idempotency record (NFR-06).

### 1.5 Diff + context fetch

- `GET /repos/{owner}/{repo}/pulls/{n}` → PR metadata (head/ref, base/ref, state).
- `GET /repos/{owner}/{repo}/pulls/{n}` with `Accept: application/vnd.github.diff` → unified diff.
- Bounded context: for each changed file, `GET contents` at head SHA for the file + its direct imports (1 hop, FR-401). Token budget per review; over-budget → highest-risk files first, with a degradation note in the summary.
- **Fetched diffs are cached in Redis** under an org-scoped key with a 24 h TTL; a re-review at the same SHA reuses the cache.

### 1.6 Review publication

- Create a **review** (summary) with `event: COMMENT` (or `APPROVE`/`REQUEST_CHANGES` gated by a finding policy flag — MVP always `COMMENT` to avoid a bot blocking merges).
- Add **review comments** (inline) per validated finding: `commit_id`, `path`, `side: RIGHT`, `line`.
- **Anchor validation:** before each inline comment, `resolveAnchor(file, line, side)` against the diff line map (diff-engine). A line that does not exist on the right side → demoted to a structured section in the review body, marked `anchor_failed`.
- Published review id is stored per job; a retry of publication finds the stored id and no-ops (NFR-13).
- **Rate limiting:** Octokit retries 403/429 with `x-poll-interval`; a per-installation throttler serializes publish calls so one org cannot starve the shared App quota (FR-209).

### 1.7 Failure modes

| Failure | Behavior |
| --- | --- |
| 403 rate-limited | Backoff + retry on the *publish* sub-step only (AI already ran; don't re-run it) |
| 422 anchor error | Demote that finding to a PR-body section; others proceed |
| Install removed mid-pipeline | Detection (401/404 on token) → job `skipped: install_removed`; no publish |
| PR closed during review | Publish attempt gets a clean "PR closed" → mark job `skipped: pr_closed`, no retry |

## 2. Billing providers

### 2.1 Provider abstraction

`packages/billing` exposes a `BillingProvider` interface:

```
interface BillingProvider {
  createCustomer(org): Promise<externalCustomerId>
  startSubscription(org, plan, externalCustomerId): Promise<subscriptionId>
  handleEvent(rawBody, signatureHeader): Promise<VerifiedEvent>   // verify + decode
  cancelSubscription(subscriptionId, atPeriodEnd: boolean): Promise<void>
  fetchInvoices(customerId): Promise<Invoice[]>
}
```

Adapters: **Stripe** (default in dev + global-card production), **Rajatko/Razorpay** (India INR + UPI; see ADR-009 for the eligibility note). The *state machine* and the *webhook-verification pattern* are provider-agnostic; the adapter is a swappable leaf.

### 2.2 State machine (org plan)

```
trialing → active(plan) ⇄ changed-plan
                │
                ├──> past_due (grace: reviews still run, warning surfaced)
                │         │
                │         └──> canceled (grace period → then `canceled`: quota frozen, new reviews skipped with notice, data retained per policy)
                └──> paused / churned
```

- **Only verified provider webhooks move this machine.** `invoice.paid`, `subscription.updated`, `subscription.deleted` are the authoritative inputs (AC-403).
- **Idempotency:** a `billing_events(event_id PK)` table — a re-delivered event is a no-op.
- **Grace on `past_due`:** the org keeps its plan until the grace period; after that, quota freezes and new reviews are `skipped` with a posted notice (NFR-18 behavior, not silent failure).

### 2.3 Usage accounting

- Every completed review writes a `usage_events` row (`org_id`, `month`, `review_count +1`, `input_tokens`, `output_tokens`, `est_usd_cost`).
- An hourly rollup builds `usage_daily` (the dashboard read path, NFR-03).
- The pre-flight quota check (worker) reads the *monthly* aggregate from `usage_events` + `org_billing.quota` (from `plans.ts`) — if `month_review_count >= quota.reviews` or `month_token_spend >= quota.token_spend_cap` → `skipped: quota_exceeded` (AC-401/402).

### 2.4 What the dashboard shows vs. what it can do

| Read | Mutate |
| --- | --- |
| Plan, invoices, usage, quota | Upgrade/downgrade/cancel (owner/admin only, via provider) |

A client can *request* an upgrade; the actual plan change lands only when the provider webhook confirms it. The "Upgrading…" state is shown until then — never claimed complete from client input.

## 3. AI provider integration

Specified in `AI_SYSTEM_DESIGN.md` (provider contract) and `MODEL_ROUTING.md` (task→model routing, cost, fallback). Key integration invariants:

- **No hardcoded model names** in any module; the routing table lives in `packages/config`.
- **Structured output** is requested via JSON-schema constraints *and* re-validated with Zod on the engine side (ADR-006).
- **Token + cost capture** per call → `usage_events` (drives AC-306, NFR-18).
- **BYOK:** an org-level encrypted key (AES-256-GCM, KMS-wrapped master key) overrides the platform default key for that org's calls; the key is never returned to the client in full (masked display only, FR-508/313).

## 4. Observability integration

- **Sentry** (api, worker, web-client) with org-scoped release tags, PII scrubbed from breadcrumbs.
- **OpenTelemetry:** one trace per review pipeline; spans per stage; provider calls carry token + cost attributes. Correlation id = `job_id`.
- **pino** structured JSON logs; the redaction pass (`observability.redact`) runs on *every* log line before it leaves the process (AC-903).
