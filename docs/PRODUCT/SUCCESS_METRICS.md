# VERCODE — Success Metrics

Metrics are defined so a dashboard can compute each one from stored rows without new instrumentation. Each metric lists its source columns.

## North-star

**Actioned-finding rate (7-day)** — the fraction of VERCODE findings on a PR that result in a developer action (code change attributed to the finding, an accepting reply, or a fix-commit reference) within 7 days of publication.

- Source: `review_findings.id` + `finding_actions` (action_type ∈ {accepted, dismissed_reasonable, fixed, ignored}, `acted_at`).
- Computation: `count(findings where finding_actions within 7d) / count(findings)` per org, per 30-day rolling window.
- Target (post-launch, 90 days): ≥ 10% for all active orgs (no plan tiers).

## Supporting product metrics

| Metric | Definition | Source | Target |
| --- | --- | --- | --- |
| Review latency p50/p95 | Webhook receipt → GitHub publish completion | `review_jobs.created_at`, `review_jobs.finished_at` | p50 < 120 s, p95 < 300 s (NFR-02) |
| Review success rate | Completed / (completed + failed) over 30 d, excluding explicit skips | `review_jobs.status` | ≥ 99% (NFR-01) |
| False-positive dismiss rate | Findings dismissed as `dismissed_unreasonable` / total published findings | `finding_actions` | ≤ 35%; trend flat-or-down; a rising trend gates a prompt change |
| Finding density | Published findings per reviewed PR (post-policy) | `review_findings` grouped by `job_id` | 3–8 sweet spot; < 1 or > 15 triggers a routing/tuning review |
| Inline anchor success rate | Inline-published findings / (inline + anchor-fallback) | `review_findings.anchor_status` | ≥ 92% |
| Review coverage | Merged PRs with a VERCODE job / merged PRs (connected repos) | `review_jobs` vs GitHub data | ≥ 95% across connected orgs |
| Cost per review (blended) | `sum(est_usd_cost) / completed jobs` per org | `review_jobs.est_usd_cost` | ≤ $0.35 at 95th percentile (all orgs) |

## Business metrics

| Metric | Target |
| --- | --- |
| Activation | Org reaches "first review published" within 10 min of GitHub install ≥ 80% |
| Active-org growth | ≥ 30% net new active orgs per quarter (active = ≥ 1 review in 30 d) |
| Org retention | ≥ 90% of orgs active in month N still active in month N+6 |
| NPS (semiannual, org admins) | ≥ 45 |

## Quality gates (engineering)

| Gate | Rule |
| --- | --- |
| Benchmark regression | Held-out AI benchmark precision must not drop > 5% between releases (`TESTING/BENCHMARK_DATASET.md`) |
| Tenant isolation | The cross-tenant suite passes 100% on every release candidate |
| Security suite | `ST-*` tests pass 100%; any P0 threat regression blocks release |
| Documentation drift | `docs/` re-reviewed; any FR whose behavior changed has updated docs in the same PR |

## What we explicitly do NOT optimize for

- **Raw finding volume.** More comments is not success; the metric is *actioned* findings. Volume without action is the CodeRabbit failure mode this product exists to avoid.
- **Provider cost alone.** Cost-per-review is tracked, but the ceiling is the platform token-spend cap; a cost drop that tanks precision fails the gate.
- **100% review success by any means.** Explicit skips (platform spend cap, same-SHA, install-removed) are *correct* behavior and excluded from the success denominator; fudging that denominator is a defect.
