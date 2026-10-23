---
title: "Plans & pricing"
description: "The 4-plan ladder — Free, Developer, Team, Enterprise — with each plan's role and price. The /pricing page carries the plan cards and the full quota table."
date: 2026-10-23
status: published
tags: [pricing, plans]
docsAuthor: "the VERCODE team"
frIds: [FR-509, NFR-18]
group: reference
---

<!--
  U: a named doc author (the billing-block owner) is an open P2 decision
  — "the VERCODE team" is the honest team label until it resolves.
  Price values MUST match content/pricing/pricing.json (the CS-05
  PricingSource, the single source of truth): Free $0, Developer $24,
  Team $199, Enterprise custom (negotiated). The /pricing page and the
  Product/Offer JSON-LD are generated from that file; a number here that
  drifts from it is a build-time pricing-drift failure (CONTENT_SCHEMAS
  §4.2 check 4), not a stale value.
-->

VERCODE prices the capability, not the seats: a plan is a review capacity (reviews per month, a token-spend cap, a model tier), billed on the reviews a team runs, not on the heads that open pull requests. The 4-plan ladder is Free, Developer, Team, Enterprise.

The pricing figures on this page match `content/pricing/pricing.json` — the single source that feeds the /pricing page, the Product/Offer JSON-LD, and the /api/answer route in one build.

## The ladder

| Plan | Price (per month) | Role |
| --- | --- | --- |
| Free | $0 | The activation tier: a permanent Free org, not a trial |
| Developer | $24 | An individual's first paid step: 10× the Free volume at the same per-review cost |
| Team | $199 | The core commercial tier: the strong-model review pass, 5,000 reviews a month |
| Enterprise | Custom (negotiated) | BYOK and Ollama cost-shifting, frontier-model access, SSO/SCIM, data residency |

The Free plan is a real product, not a time-boxed trial: a review is published, a finding is actionable, and the plan does not expire. That is the activation funnel — an org that activates on Free converts on the paid plans.

## What each step buys

- **Free → Developer** is a volume step: 50 reviews a month becomes 500, at the same per-review cost and the same standard model tier.
- **Developer → Team** is a capability step: 5,000 reviews a month, plus the strong-model access the deep and security passes use.
- **Team → Enterprise** is a cost-shifting and compliance step: configurable caps, the frontier tier, BYOK and Ollama (a near-zero COGS account), and data residency.

The per-plan quota detail — the exact review, file, concurrency, and retention numbers — is on the [quotas page](/docs/quotas/). The plan cards, the full quota comparison table, and the pricing FAQ are on the [pricing page](/pricing/).

Source: content/pricing/pricing.json (the price figures, the CS-05 source of truth); docs/BUSINESS/PRICING_STRATEGY.md §2 (the ladder shape)

## Related

- [Quotas](/docs/quotas/) — the per-plan limits, verbatim from the plans source
- [GitHub App install & permissions](/docs/github-app/) — the install a Free plan starts from
