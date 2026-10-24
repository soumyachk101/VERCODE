---
title: "Quotas & limits"
description: "The quota table: reviews a month, the file and concurrency caps, retention windows, and the skip-with-notice rule at each cap."
date: 2026-10-23
status: published
tags: [quotas, limits, usage]
docsAuthor: "the VERCODE team"
frIds: [NFR-18, NFR-19, NFR-27]
group: reference
---

<!--
  U: a named doc author (the quotas-block owner) is an open P2 decision
  — "the VERCODE team" is the honest team label until it resolves.
  Quota values MUST match packages/contracts/src/plans.ts (the USAGE_QUOTAS
  single source of truth, AC-401): Free 50/20/1/30d/3, Developer
  500/60/3/90d/10, Team 5000/100/10/1y/50, Enterprise 50000/500/50/custom/
  500 (a configurable floor, a per-account negotiation can raise it).
  A hardcoded quota number anywhere else is a defect; the numbers here
  are the plans.ts values, not a second source.
-->

An organization's quota is a set of usage limits, each a number, a unit, and a ceiling. The source of truth is `packages/contracts/src/plans.ts`; the API quota check, the worker pre-flight check, and the dashboard display all read from it. The table below is those values.

The caps are the org's shape; the skip behavior at the cap is the NFR-18 rule: a stoppage is never silent.

## The quota table

| Dimension | Standard | Large | Heavy usage | Enterprise |
| --- | --- | --- | --- | --- |
| Reviews / month | 50 | 500 | 5,000 | Configured |
| Files / review | 20 | 60 | 100 | 500 |
| Concurrent reviews | 1 | 3 | 10 | 50 |
| Finding retention | 30 d | 90 d | 1 y | Custom |
| Custom rules | 3 | 10 | 50 | 500 |
| Model tier | standard | standard | standard + strong | any |
| Audit retention | 180 d | 180 d | 180 d | Custom |

Enterprise caps are configurable: the values shown are the floor, and a per-account agreement raises them. A hardcoded "unlimited" is deliberately not a value: it would be a cost-abuse vector (a platform cap is the backstop).

## The ceiling semantics

Each dimension behaves differently at its cap:

- **Reviews per month** is a hard cap: the N+1th review in a month skips with a notice (NFR-18). The 50th review on a 50-cap quota runs; the 51st skips. The skip is before the AI stage, so it consumes zero tokens.
- **Files and lines per review** is a degrade, not a skip: a diff over the cap is reviewed on its highest-risk files, and the rest is listed in a summary appendix (NFR-19). An over-budget review does not error.
- **Concurrent reviews** is a queue: a job over the in-flight cap waits, it is not skipped. A throughput cap delays; a volume cap skips.
- **Finding retention** is a hard delete on schedule: findings expire on the quota's window (30 / 90 / 365 / custom days) and are purged on a retention job, not soft-flagged.
- **Custom rules** is a count cap: a create over the cap is a 409 and a dashboard notice.

## The 80% warning

The dashboard's quota strip warns at 80% of a cap — a banner plus a dashboard row, the USER_JOURNEYS J4 early signal. An 80% near-miss is a warning; a 100% breach is a skip with a notice; a volume spike over 3× an org's 30-day baseline is an anomaly alert. Every one of those is a visible record, not a silent stop.

Source: packages/contracts/src/plans.ts (the values, the AC-401 source of truth); docs/BUSINESS/USAGE_QUOTAS.md §2, §5, §7 (the semantics)

## Related

- [Custom rules](/docs/rules/) — the custom-rules count cap
