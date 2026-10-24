---
title: "Security findings"
description: "The org-wide security rollup: severity-filtered findings across every repository, linked to the source PR. The FR-504 view, the severity model, the L-1 limit."
date: 2026-10-23
status: published
tags: [security, rollup, severity]
docsAuthor: "the VERCODE team"
frIds: [FR-504, FR-306, L-1]
group: configure
---

<!--
  U: a named doc author (the FR-504 block owner) is an open P2 decision —
  "the VERCODE team" is the honest team label until it resolves.
-->

The security findings rollup is the org's triage view: one screen of open security findings across every connected repository, filtered by severity and by time. It is not a per-pull-request list; it is the answer to "what is our security posture right now, and which PR does it come from?"

The rollup is the FR-504 surface.

## What the rollup shows

- Open security findings across all connected repositories, with the source pull request linked from each finding.
- A severity filter: the rollup's default view is severity ≥ high, and the full list is available on demand.
- A time filter: the rollup is a window over the finding set, not a cumulative backlog.

Each finding carries the finding shape the pipeline publishes: a category, a severity, a confidence, a reason, a suggested fix, and the file + line it proves (FR-306 validates that the line location exists in the diff and that the category and severity are allowed values; an invalid finding is dropped, not posted).

## The severity model

The severity scale is four levels: **critical, high, medium, low**. The model is fixed and is not org-configurable — an org configures which severities it sees (the rollup filter), not what a severity means. A security-category finding is reviewed on the strongest model the org's quota tier allows, and that pass is never downgraded for cost (the routing invariant in the model-routing doc, invariant 3).

The deterministic static-analysis pass produces the high-precision security findings: a Semgrep rule that flags an injection sink or a hardcoded credential is a measured check, not an estimate. The model's security findings are the delta on top of it.

## The honest limit

The MVP does not execute the PR's tests; it analyzes the diff (L-1). The security findings are a static-analysis result and a model pass over the bounded context, not a dynamic test of the PR's behavior. A sandboxed execution that reports a test failure as a finding is the Phase 2 item; until it ships, the static pass is the stand-in, and this page says so plainly rather than implying otherwise.

Source: docs/PRODUCT/FUNCTIONAL_REQUIREMENTS.md (FR-504, FR-306); docs/IMPLEMENTATION/KNOWN_LIMITATIONS.md (L-1)

## Related

- [Custom rules](/docs/rules/) — the suppression that shapes the rollup
- [Providers](/docs/providers/) — why the security pass runs on the strongest model
