# VERCODE — Service Boundaries

The contract for what lives where. This is the boundary the code review gate enforces.

## Process boundaries

### `apps/api` (stateless, horizontally scalable)

**Owns:**
- Authentication (signup, sign-in, session, sign-out, invite accept)
- Tenant context resolution + RBAC capability checks
- All dashboard REST endpoints (orgs, repos, reviews, findings, usage, rules, providers, billing state, audit)
- Webhook ingress: GitHub (`verify + dedup + enqueue` only) and billing (verify + idempotent state transition + enqueue accounting)
- Job *enqueue* (never job execution)

**Must NOT:**
- Run the review pipeline (no LLM calls, no static analysis, no GitHub review publication) on the request path
- Write review findings directly (only the worker writes findings; the API writes job receipts / idempotency rows)
- Trust any client-supplied payment/plan state

### `apps/worker` (stateless, scales on queue depth)

**Owns:**
- Dequeue → load durable state → fetch diff/context → static analysis → AI review → merge → validate → dedup → policy → summary
- GitHub review publication (summary + inline comments) with independent retry
- Usage event writes, cost accounting, job state transitions
- Retention purge jobs, usage rollup jobs

**Must NOT:**
- Accept auth from a browser (no session handling)
- Trust job *payload* for authorization — the payload is only a pointer (`jobId`); the worker re-reads org/quota/settings from Postgres
- Execute repo-provided code (MVP; see `SECURITY/SANDBOX_SECURITY.md` for the Phase-2 boundary)

### `apps/web` (stateless frontend)

**Owns:** UI, client-side state, design system, calling the API.
**Must NOT:** reach Postgres/Redis/GitHub/AI directly; enforce authorization (it hides, never enforces).

## Package boundaries

| Package | Public surface (what others may import) | Forbidden |
| --- | --- | --- |
| `contracts` | Zod schemas + inferred types + `plans` | Any runtime I/O; importing other packages |
| `config` | `loadConfig() → AppConfig` (typed) | Domain logic |
| `observability` | `logger`, `tracer`, `redact()`, `initSentry()` | Domain logic |
| `database` | Tenant-scoped repository classes (`orgId` first arg) | Bypassing `orgId` scoping |
| `github` | `GitHubApp` (auth), `verifyWebhook()`, `fetchPRDiff()`, `publishReview()` | Exposing installation credentials to the web |
| `diff-engine` | `parseUnifiedDiff(text) → ChangeSet`, `resolveAnchor(file, line, side)` | I/O |
| `static-analysis` | `runESLint(files)`, `runSemgrep(files, rules) → Finding[]` | Network beyond its own rule fetch |
| `ai-providers` | `AIProvider` interface, `createProvider()`, `routeTask(task, ctx)` | Hardcoded model names outside the config table |
| `review-engine` | `runReview(input) → ReviewResult` (the orchestrator) | Direct GitHub/DB writes (it *returns* results; the worker persists + publishes) |
| `policy-engine` | `applyPolicy(findings, policy) → Findings`, `checkQuota(org, month)` | AI/DB calls |
| `billing` | `BillingProvider` interface + Stripe/Razorpay adapters, `handlePaymentEvent()` | Client-trusted state |

## The "must never cross" lines

1. **Secrets** never cross into a prompt, a log line, a finding, or the browser.
2. **Repo source text** crosses into the AI provider *only* as bounded context (changed files + 1-hop imports, token-budgeted), never the whole repo.
3. **Client payment/plan state** never crosses into authoritative decisions; only verified provider webhooks do.
4. **Cross-org rows** never cross a tenant query; every repository method is `orgId`-scoped.
5. **Job payload** never carries authorization; it's a pointer.
