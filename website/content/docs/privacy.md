---
title: "Privacy: what VERCODE stores"
description: "What VERCODE stores, for how long, and what is not stored: raw diffs are ephemeral, findings retain 30 days, and deletion runs on install removal (FR-404)."
date: 2026-10-23
status: published
tags: [privacy, retention, data]
docsAuthor: "the VERCODE team"
frIds: [FR-404, NFR-27, NFR-28, NFR-29]
group: legal-security
---

<!--
  U: a named doc author (the privacy-block owner) is an open P2 decision
  — "the VERCODE team" is the honest team label until it resolves.
  The full policy is /legal/privacy/ (a separate agent's route, WFR-406);
  this docs page is the reference summary that points at it.
-->

VERCODE is a review system, not a code host: the analysis is the product, and the source code is transient input. A customer's full codebase is not stored as a durable asset — only the bounded, quoted snippet inside a finding, and even that is derived data, not a copy of the repository.

This page summarizes what is stored, for how long, and how deletion is enforced. The full privacy policy is at /legal/privacy/.

## What is stored, and for how long

| Data class | Retention | Notes |
| --- | --- | --- |
| Findings + review history | 30 d | The product value; expires on the retention window, then a hard purge |
| Raw repo content | Ephemeral | Not stored beyond the review lifetime: a 24-hour cache, not a database column (NFR-28) |
| Usage events | 24 months | Usage and analytics; append-only, age-hard-delete |
| Audit log | 180 days minimum | The compliance floor (NFR-27); append-only |

A finding may quote a bounded snippet of the diff in its payload; the full file content is not written to the database. A schema gate asserts no raw-content column exists.

## What is not stored

- **The full repository.** The model receives a bounded context: the changed files plus one-hop imports, within a token budget, on the provider's no-training contract (NFR-29). The whole repository never reaches a provider.
- **Code-content telemetry.** The usage analytics are about reviews, findings, and cost — not about which code patterns are common. There is no code-shape telemetry to a third party.

## Deletion

Deletion on access revocation is a first-class path (FR-404). Removing the GitHub App installation:

- Marks the install removed and flags its repositories disconnected.
- Evicts the org's diff-cache entries immediately, and hard-deletes any embedding index.
- Opens a short export window for the org's findings before any hard-purge.

The audit trail for a removed install keeps its 180-day minimum regardless. An org deletion is a soft-delete first (the data becomes unreadable but is preserved for a grace window), then a hard-purge cascade on the retention schedule.

Source: docs/DATABASE/DATA_RETENTION.md (the retention schedule + the FR-404 deletion); docs/SECURITY/PRIVACY.md (the data-minimization controls)

## Related

- [Quotas](/docs/quotas/) — the retention windows
- [GitHub App install & permissions](/docs/github-app/) — the removal event that triggers deletion
