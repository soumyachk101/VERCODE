---
title: "GitHub App install & permissions"
description: "The GitHub App install steps, the 5 least-privilege scopes, and how the App discovers repositories on install and removal. No admin:org or secrets scope."
date: 2026-10-23
status: published
tags: [github, installation, permissions]
docsAuthor: "the VERCODE team"
frIds: [FR-201, FR-202, FR-208, FR-210, NFR-10]
group: get-started
---

<!--
  U: a named doc author (the FR-201..FR-210 block owner) is an open P2
  decision — "the team's public names" (UNRESOLVED_DECISIONS U-item);
  "the VERCODE team" is the honest team label until it resolves.
  The scope list is verbatim FR-210 from docs/PRODUCT/PRD.md §4.2.
-->

The GitHub App is the integration surface between VERCODE and your repositories. This page covers the install steps, the 5 permission scopes the App requests, and how repository discovery and removal work.

The App is installed per organization or per repository; the least-privilege scope list is fixed and is not expandable without a contract change (NFR-10).

## Install the App

1. On the dashboard's repositories page, choose **Install VERCODE**. The install URL is generated server-side; the App is pre-scoped to the 5 permissions below, so the GitHub authorization screen shows only those.
2. Authorize the install on GitHub and select the repositories the App should access.
3. GitHub dispatches the `installation.created` webhook. VERCODE records the install for the org and discovers the connected repositories through the `installation/repositories` event (FR-202).

The repositories page reflects the connected set immediately: each repository is listed with its status, and a newly added repository is reviewed on its next open pull request without any further configuration.

## The 5 scopes

The App requests exactly 5 permissions (FR-210, the least-privilege list, verbatim from the PRD):

| Scope | Direction | What it permits |
| --- | --- | --- |
| `contents:read` | read | Fetch the diff and bounded file context at the PR's head SHA |
| `pull_requests:write` | write | Publish the summary comment and the inline findings |
| `checks:write` | write | Post the review's check-run status on the PR |
| `metadata:read` | read | Repository and PR metadata, for routing |
| `issues:read` | read | PR metadata (a pull request is an issue in GitHub's model) |

There is no `admin:org` and no secrets scope (NFR-10). The `pull_requests:write` scope is the only write in the set; it is the publication path, and nothing else in the App can write to your repositories.

## Removing the App

Removing the App is a first-class event, not an edge case. GitHub dispatches `installation.deleted`, and VERCODE handles it (FR-208):

- The install is marked removed, and its repositories are flagged disconnected.
- A content-purge job is scheduled for that install: the diff cache is evicted immediately and any embedding index is hard-deleted. The deletion detail is on the [privacy page](/docs/privacy/).
- In-flight reviews for that install finish but do not publish; no further reviews are enqueued for it.

Source: docs/PRODUCT/PRD.md (FR-210's scope list); docs/PRODUCT/FUNCTIONAL_REQUIREMENTS.md (FR-201..FR-208, FR-210)

## Related

- [Quickstart](/docs/quickstart/) — the install as step 1 of the first-review journey
- [Security findings](/docs/security/) — how the checks:write scope publishes a rollup
