---
title: "The quota skip is a feature: cost discipline without a silent stop"
description: "NFR-18 makes the over-quota review skip with a posted notice, never a silent drop. The checkQuota() mechanism and the 80% banner."
date: 2026-10-23
updated: 2026-10-23
author: the VERCODE team
tags: [quotas, trust]
status: published
ogImage: "/og.png"
---

<!-- author "the VERCODE team": a named human author is an unresolved item (UNRESOLVED_DECISIONS U-item); "the VERCODE team" is the honest placeholder, no fake individual name.
     ogImage "/og.png": per-slug OG image generation is a build task (WP1.x, the @vercel/og line); both posts point at the same shared /og.png for now. -->

## The claim

When an org hits its review cap, the right behavior is a visible stop with a notice — not a review that runs anyway, and not a silent drop. NFR-18 in the product spec states the rule in one line: "skip-with-notice, never a silent stop". The trust argument is the product argument: a team that gets a posted notice at the cap can plan around it; a team that gets a review that silently did not happen learns to distrust the tool, and the cap becomes a surprise, not a signal. A silent stop is worse than no stop — it is a stop you did not know you had.

## The mechanism: checkQuota() as one gate

The quota check is a worker pre-flight, not an afterthought. From docs/BUSINESS/USAGE_QUOTAS.md §4, the check reads the org's quota from packages/contracts/src/plans.ts — the single source of truth, so the API, the worker, and the dashboard all read the same numbers and only the worker *enforces* them — and the org's usage aggregate for the month:

```
checkQuota(org, month) ->
  reviewsUsedThisMonth = aggregate(usage_events, org, month).review_count
  tokenSpendThisMonth  = aggregate(usage_events, org, month).est_usd_cost
  quota = orgQuota(org)
  if reviewsUsedThisMonth >= quota.reviewsPerMonth    -> "skip: quota_exceeded" (posted notice)
  if tokenSpendThisMonth >= quota.tokenSpendCapUsd   -> "skip: quota_exceeded" (posted notice)
  else -> proceed (the pipeline runs; a cost is recorded to usage_events)
```

The skip happens *before* the AI stage, which means a skipped review consumes zero model tokens — a quota stoppage is a cost control, not a cost. A skipped review that still burns tokens is a documented abuse defect, not a rounding error. The 50th review on a 50-review quota runs; the 51st skips.

The skip is recorded in three places, and that is the invariant. The job lands in the database with status `skipped` and `skip_reason` `quota_exceeded`; the pull request gets the notice — "Quota reached this period. Reduce review volume or request a higher cap." — and the dashboard shows the row. docs/TECHNICAL/ERROR_HANDLING.md's "never silent" rule makes the three records a single check: a review that "just didn't happen" without a stored reason is a defect a nightly reconciliation job is built to catch.

## The 80% banner: the warning before the stop

The skip is the hard edge; the warning is the human one. The quota strip in the dashboard (docs/DESIGN/PAGE_SPECIFICATIONS.md §5) carries an 80% banner — "Quota 80% — you've used 4,000 of 5,000 reviews this month" — above the usage track, so the org sees the approaching cap *before* it is reached, with the queued reviews drawn as a lighter committed segment so "4,000 used + 300 queued" reads as "you are about to hit the cap". The banner, the posted notice, and the skipped-review row are the whole "you will not be surprised" design: the warning is at 80%, the stop is at 100%, and both are visible in the workspace, not only in an email.

## What this does not claim

The skip rule has edges that matter, and they are documented: an in-flight review finishes even when the cap is reached mid-run, because a skip is a pre-flight decision, not a mid-run one; a mid-month cap raise grants the new cap without re-running the used reviews; and a giant single PR that would breach the token-spend cap skips rather than partially publishes, because a partial that exceeds the cap is itself an abuse. The numbers in plans.ts are the source; a quota hardcoded in a second place is a build-time defect, not a design.

### Related

- The full quota table, and what a degrade means versus a skip: [the quotas docs](/docs/quotas/)

[Read the quotas docs →](/docs/quotas/)
