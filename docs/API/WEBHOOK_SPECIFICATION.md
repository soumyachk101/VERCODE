# VERCODE — Webhook Specification

The single public, non-session ingress route: **GitHub**. It follows the *public endpoint, signature-verified, idempotent, verify-then-handoff* shape (no heavy work on the ingress path).

## 1. GitHub webhook (`POST /webhooks/github`)

### 1.1 Verification (all three, in order; failure at any → reject)

1. **HMAC-SHA256** — `X-Hub-Signature-256: sha256=<hmac>`, computed over the *raw request body* with `GITHUB_WEBHOOK_SECRET`. A mismatch → **401** + audit `webhook.rejected` + **no queue write**. (Constant-time compare.)
2. **Timestamp window** — `X-Hub-Timestamp` must be within **5 minutes** of server time. Outside the window → **401** (replay protection layer 1; the event may be old enough that reprocessing is wrong).
3. **Delivery dedup** — `X-Hub-Delivery` is unique in `webhook_deliveries` for a **24 h** window (the replay-dedup table, NFR-06). A seen id → **200 no-op** (idempotent; the original was already processed or is in-flight). A *new* id → insert the receipt row, then continue.

The three layers are *defense in depth*: an attacker who guesses the delivery id still fails the HMAC; an attacker who captures a signed event still fails the 5-min window or the 24 h dedup.

### 1.2 Event routing (verified events only)

| `X-GitHub-Event` | Hand-off |
| --- | --- |
| `installation` (created) | Record the install (upsert `github_installs`); discover repos |
| `installation` (deleted) | Deactivate install + repos → `disconnected`; schedule content purge (AC-204) |
| `installation_repositories` (added/removed) | Upsert / disable `github_repos` |
| `pull_request` opened/reopened/synchronize | Resolve the install→org; enqueue `review-queue` job `{ jobId, orgId, repoId, prNumber, commitSha }` (commit-SHA idempotency downstream, ADR-007) |
| `pull_request` closed/edited | Receipt-only ack (202, no enqueue; terminal-marking in-flight jobs is the later path) |
| `pull_request_review` / `pull_request_target` | **Receipt-only acks** — a verified event in no known schema is acknowledged (202 `{ ok, event, receipt: true }`), not routed |

**Ingress-time rules:**
- The route *only* does verify + receipt + enqueue. It does **not** fetch diffs, run analysis, or call the AI (NFR-04 — the webhook's latency is constant regardless of review cost).
- Resolving the install to an org that's `removed`/`deleted` → the receipt is logged, the event is *dropped* (no enqueue) + audit `webhook.dropped_install_inactive`.
- A verified event whose install isn't known to us (an install we never recorded) → 404 + audit (not 200, so the sender can notice).

### 1.3 Payload schemas (from `contracts/webhooks.ts`)

The event body is validated against per-event Zod schemas (e.g., `PullRequestEventSchema` → `action ∈ {opened, reopened, synchronize, closed}`, `number`, `pull_request.head.sha`, `repository.full_name`, `installation.id`). A verified-but-malformed body (signature OK, schema fail) → **422** + audit `webhook.malformed` + **not** enqueued. The signature proves *origin*; the schema proves *shape* — both are required.

## 2. Shared ingress guarantees

| Guarantee | How |
| --- | --- |
| Public, no session | The route skips the session middleware; auth is signature-only |
| Idempotent | delivery-id / event-id UK (a replay is a 200 no-op, not a double side-effect) |
| No heavy work on ingress | verify + receipt + enqueue/state-transition only; everything else is queued or a bounded state write |
| Every rejection is audited | 401/422/404 on the ingress writes an `audit_events` row with reason + source IP (a forged-webhook attempt is *investigable*, AC-901 area) |
| Constant latency | A slow provider or a large diff cannot slow the ingress (NFR-04, NFR-06) |

## 3. The "never trust the sender's claim" rule

A GitHub event says "this PR exists" — we *re-fetch* the PR before reviewing (the event is a trigger, not the source of truth). A webhook is a *signal*, and the authoritative state is always re-derived server-side (the install→org resolution + the durable `review_jobs` row). This is what makes a forged-but-plausible payload inert: even a perfect forgery of the *body* fails the *signature*, and a signature-passing body is still reconciled against durable state.
