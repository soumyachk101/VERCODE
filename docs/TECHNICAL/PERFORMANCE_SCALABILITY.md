# VERCODE — Performance & Scalability

The performance model: what's fast by construction, what's measured, and how each tier scales.

## 1. Latency budgets (from NFR)

| Path | Budget | Enforced by |
| --- | --- | --- |
| Webhook accept+enqueue | p95 < 300 ms, no LLM on the path | API is verify+dedup+enqueue only; all heavy work is queued (NFR-04) |
| Dashboard read (usage/rollups) | p95 < 400 ms, p99 < 1 s at 10 concurrent orgs | Rollup table + org-scoped Redis cache; never scan raw `usage_events` on the read path (NFR-03) |
| Review end-to-end | p50 < 120 s, p95 < 300 s (50 files / 500 lines) | Pipeline wall-clock budget 240 s; static + AI in parallel where disjoint; bounded retries (NFR-02) |

## 2. Where time goes in a review (measured, not assumed)

The benchmark suite (`TESTING/BENCHMARK_DATASET.md`) instruments each stage. Expected *relative* cost (to be confirmed by measurement, never asserted a priori):

```
diff fetch (GitHub)      │██
static analysis           │████
AI risk-triage (cheap)    │█████
AI deep/security (strong) │██████████   ← the long pole
validate/dedup/policy     │ (in-process, negligible)
GitHub publish            │██
```

Implications:

- **Parallelize the disjoint AI tasks** ([6] deep and [7] security run concurrently when their file sets are disjoint) — REVIEW_ENGINE_SPEC §4.
- **The cheap triage gate is the cost lever**: routing a PR's 40 files through the cheap model first and sending only the ~5 high-risk files to the strong model is what keeps `cost/review` inside the plan ceiling (MODEL_ROUTING §2).
- **Cache the diff**: a re-review at the same SHA or a sibling PR off the same base reuses the Redis diff cache (CONTEXT_RETRIEVAL §4).

## 3. Hot-path protections

1. **The webhook route never blocks on LLM, diff fetch, or static analysis.** It enqueues and returns (NFR-04). A slow provider or a large diff cannot make the webhook path slow — the webhook's latency is constant regardless of review cost.
2. **Dashboard reads hit the rollup, not the raw table.** `usage_daily` (materialized hourly) serves the trend charts; a per-PR detail read is a bounded indexed query. This is what keeps NFR-03 true under org growth.
3. **Static analysis is resource-capped.** Semgrep/ESLint run with per-file and per-batch CPU/memory limits in the worker sub-process (the isolation *contract* of ADR-008/DEV-2), so a pathological repo cannot exhaust a worker.

## 4. Scaling model

| Component | Stateless? | Scales on | Notes |
| --- | --- | --- | --- |
| `api` | yes | CPU / RPS | Session + queue are in Redis; any instance serves any request |
| `worker` | yes | queue depth | N instances, each `concurrency=4` default; KEDA-style autoscale on `review-queue` lag |
| `static-analysis` | (sub-process of worker in MVP) | worker count | Becomes a separate sandboxed runner in Phase 2 (isolation boundary) |
| Postgres | no (shared) | — | Read replica for dashboard; write pool (PgBouncer) sized to `api`+`worker` connection sum |
| Redis | no (shared) | — | Sessions + queues + org-scoped diff cache; sharded if a single node is a bottleneck |

## 5. Noisy-neighbor controls

- **Per-org queue sharding (escape hatch):** if one org dominates the queue, route its jobs to a dedicated worker pool (shard by `org_id` hash). This is a config change + worker-labeling, not a redesign.
- **Per-org token-spend cap** (NFR-18) is a *hard* cap enforced at pre-flight: an org cannot burn the platform's provider budget by opening many large PRs. Over-cap jobs are `skipped` with a notice, not silently billed beyond the cap.
- **Per-installation GitHub throttler** (INTEGRATION_DESIGN §1.6) prevents one org from monopolizing the shared App's rate-limit window.

## 6. Data-volume growth

| Table | Growth driver | Control |
| --- | --- | --- |
| `review_jobs` / `review_findings` | reviews × findings/review | Plan retention (NFR-27): Free 30 d → Enterprise custom; the retention queue hard-deletes expired rows on schedule |
| `usage_events` | reviews | 24-month retention; the rollup table is the read path, so raw-event age is bounded |
| `audit_events` | state changes | 180 d minimum (NFR-27), then hard-delete |
| `webhook_deliveries` | webhooks | 24 h dedup window; pruned after |
| Redis diff cache | reviews | 24 h TTL, org-scoped eviction; bounded memory by TTL, not by count |

## 7. What we measure and gate on

- **Stage-latency histograms** per review stage (OTel) — a stage whose p95 breaches its budget triggers an alert, not a silent slowdown.
- **Cost/review** per plan tier (SUCCESS_METRICS) — a routing change that pushes cost over the plan ceiling fails the release gate.
- **Queue depth + age** — a growing `review-queue` age is the leading indicator of worker under-scale; autoscale reacts to it.
- **Provider error rate + fallback rate** — a sustained fallback spike indicates a provider degradation; it's observable before it degrades review quality.
- **DLQ depth** — non-zero and *growing* DLQ is a real incident, not background noise.

## 8. Scaling strategy (summary, TRD §16)

- **Horizontal** first: scale `api` on CPU, `worker` on queue depth, Postgres read-replica + PgBouncer, Redis for shared state.
- **Sharding** only as an escape hatch: per-org worker pools, then (much later) per-region Postgres if data-residency demands it.
- **The queue is the decoupling point** that lets each tier scale independently — the webhook path, the review pipeline, and the dashboard read path each scale on their own axis.
