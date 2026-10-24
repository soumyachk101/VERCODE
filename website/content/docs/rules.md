---
title: "Custom rules"
description: "Org-level and repo-level custom rules: the 0.6 default confidence floor, per-category suppression, quiet categories, and per-language toggles (FR-505)."
date: 2026-10-23
status: published
tags: [configuration, rules, confidence]
docsAuthor: "the VERCODE team"
frIds: [FR-308, FR-505, NFR-18]
group: configure
---

<!--
  U: a named doc author (the FR-505 block owner) is an open P2 decision —
  "the VERCODE team" is the honest team label until it resolves.
-->

Custom rules are the org's and the repo's control over which findings are published. A rule is versioned: each change is audit-logged and applies to the next review, not the in-flight ones. The rule types and their scope are the FR-505 surface.

The confidence floor is the primary knob: a finding under the floor is dropped before publication, so the pull request is not flooded with hedges. The default is 0.6 (FR-308).

## The rule types

| Rule | What it does | Scope |
| --- | --- | --- |
| Confidence floor | Findings under the floor are not posted | org, or a single repo |
| Category suppression | An entire finding category is muted | org, or a single repo |
| Quiet categories | Low-severity categories are muted in a defined window | org |
| Per-language toggle | A language's review pass is enabled or disabled | org, or a single repo |

The deterministic static-analysis pass is exempt from the confidence floor: its precision is measured, not estimated, so the floor does not apply to it (FR-304).

## Org-level vs repo-level

An org-level rule is the default for every repository in the org. A repo-level rule overrides the org default for that repository only. The precedence is repo over org: a repo that sets a category to suppressed keeps it suppressed even if the org default is to post it.

The two scopes answer different questions. An org-level rule is a policy: "we do not want dependency-manifest findings posted anywhere". A repo-level rule is a local override: "this legacy repo's generated files are noise, suppress them here".

## Suppression, the floor, and the skip

Suppression and the confidence floor drop findings; a quota stoppage is a different control, the NFR-18 skip-with-notice. A rule never silences a quota skip: when an org is over its cap, the review is skipped with a notice on the pull request and a dashboard row, not quietly stopped. The rule surface and the quota surface are separate, and the skip is the only quota behavior a customer ever sees.

Rules are bounded by the quota: the number of custom rules an org can define is a quota (3 on a 50-review quota, 10 on a 500-review quota, 50 on a 5,000-review quota). A rule create over the cap is a 409 on the API and a dashboard notice.

Source: docs/PRODUCT/FUNCTIONAL_REQUIREMENTS.md (FR-308, FR-505); docs/PRODUCT/PRD.md (the rule types, FR-505's line)

## Related

- [Security findings](/docs/security/) — the rollup a category suppression shapes
- [Quotas](/docs/quotas/) — the custom-rules count cap
