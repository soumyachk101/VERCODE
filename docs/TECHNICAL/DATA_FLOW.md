# VERCODE — Data Flow

Field-level map of what crosses each boundary and the invariants around it.

## Flow 1 — Webhook ingestion

```
GitHub ──(signed event)──▶ API
```

| Data | From → To | Invariant |
| --- | --- | --- |
| `X-Hub-Signature-256`, `X-Hub-Delivery`, `X-Hub-Timestamp`, `X-GitHub-Event` | GitHub → API | Signature MUST verify (HMAC, `GITHUB_WEBHOOK_SECRET`); delivery id MUST be unseen within 24 h; timestamp within 5 min |
| Event body (`installation`, `pull_request`, etc.) | API → (idempotency row) → queue | API writes **only**: `webhook_deliveries(delivery_id, event, org_id, received_at)` + enqueues `review-queue` for PR events. No LLM, no diff fetch, no finding writes. |
| `jobId` (durable, generated) | API → Redis → worker | The worker re-reads *everything else* from Postgres; the payload is a pointer. |

## Flow 2 — Review pipeline (worker)

```
worker ─▶ GitHub (diff + context) ─▶ diff-engine ─▶ static-analysis + ai-providers ─▶ policy-engine ─▶ GitHub (publish) ─▶ Postgres (findings, usage)
```

| Data | From → To | Invariant |
| --- | --- | --- |
| PR diff, changed files, 1-hop import graph | GitHub → worker → AI provider | **Bounded:** ≤ 60 files / ≤ 3,000 lines per review (NFR-19); over-budget → degrade to highest-risk files with a note. Only changed files + 1 hop — never the whole repo (NFR-29). |
| Deterministic findings (ESLint/Semgrep) | static-analysis → merge | `source: "eslint"\|"semgrep"`, authoritative for their classes, no confidence floor applies to them (they're rules, not guesses). |
| AI findings | ai-providers → Zod re-validation | Every field validated: `line` exists in the diff's added ranges for that file (else dropped/anchor-fallback), severity/category in enum, confidence in [0,1]. The provider's *claimed* compliance is never trusted. |
| Merged, deduped, policy-filtered findings | review-engine → worker → Postgres + GitHub | Dedup key `(file, line, category)`; policy applies org floor + per-repo suppression; summary computed. |
| Published review + inline comments | worker → GitHub | Each inline comment's `line`/`side`/`commit_id` validated against the diff map first; invalid → demoted to a PR-body section marked `anchor_failed`. Published review id stored per job (retries no-op). |
| `input_tokens`, `output_tokens`, `model`, `est_usd_cost`, `prompt_version` | ai-providers → worker → `usage_events` | Attributed to the *requesting org*; drives the org's plain usage report (NFR-18) and the dashboard (FR-506/509). No quota or plan gating applies. |

## Flow 3 — Dashboard reads

```
web ─▶ api ─▶ (Redis org-scoped cache) ─▶ Postgres (rollups + detail)
```

| Data | From → To | Invariant |
| --- | --- | --- |
| Cookie (session) | web → api | Signed, HTTP-only, Secure; server validates against Redis session store; a missing/revoked session → 401. |
| Requested resource | api → Postgres | **Every** query is scoped by the resolved `org_id`; a Viewer's read is enforced by the same tenancy as an Admin's — the role gates *which* reads, never *whether* tenancy applies. |
| Usage trends | Postgres `usage_daily` rollup → API → Recharts | The rollup is materialized (hourly job), so dashboard p95 < 400 ms (NFR-03) without scanning raw `usage_events`. |

## Flow 4 — Retention & deletion

```
worker (retention-queue) ─▶ Postgres (hard-delete per FR-404 / NFR-27/28)
```

| Data | From → To | Invariant |
| --- | --- | --- |
| Repo content (raw diffs) | ephemeral → purged | Raw source text is NOT stored beyond review lifetime (NFR-28). Findings + summary ARE stored (they're the product), subject to the configured retention period. |
| Install-removed repos | Postgres → purge | `installation.deleted` → repos `disconnected` → content purge scheduled; audit trail kept 180 d regardless (NFR-27). |

## Invariants that the security suite asserts

1. **No secrets in any prompt, log, finding, or browser payload** (`ST-redaction-*`).
2. **No whole-repo content to AI providers** — only bounded context (`ST-context-bound`).
3. **No cross-tenant row ever returned** — every endpoint, cross-org attempt → 404 (`IT-tenant-*`).
4. **No client-trusted usage state** — usage is written only by the pipeline into `usage_events` and reported as a plain visibility report; a client claim of spend or usage has no effect (`IT-usage-*`).
5. **No job payload carrying authz** — the worker re-reads durable state (`IT-idempotency-*`).
6. **Prompt-injection attempts surface as findings, never as leaked prompt / tool calls / scope change** (`ST-injection-*`).
