---
title: "Quickstart — install the App and get your first review"
description: "Sign up, install the GitHub App on one repo, open a pull request, and read the verdict. A real review is published within 10 minutes of the install."
date: 2026-10-23
status: published
tags: [getting-started, installation, quickstart]
docsAuthor: "the VERCODE team"
frIds: [FR-201, FR-202, FR-206, NFR-02]
group: get-started
---

<!--
  docsAuthor is "the VERCODE team" — a named-person rule (CONTENT_STRATEGY.md
  §2.1's "a doc owner" + §3.8's "a named team, never John Doe"). A real
  named author is a P2 open decision (UNRESOLVED_DECISONS U: the team's
  public names are unresolved); until it lands, the team label is the honest
  byline. J1 (USER_JOURNEYS.md) is the journey this doc mirrors; the exit
  criterion "within 10 minutes of install, a real review is published" is
  SUCCESS_METRICS.md's activation KPI.
-->

Install the GitHub App on one repository and open a pull request; the review lands as a summary comment plus validated inline findings. This is the public mirror of the J1 onboarding journey: sign up, install, open a PR, read the review. No configuration is required between the install and the first published review.

The activation bar is a measured one: an org that installs the App and publishes its first review within 10 minutes of the install counts as activated. That is the KPI the funnel is built against (the SUCCESS_METRICS activation target), and the rest of this page is how to hit it.

## Before you start

The two prerequisites, and nothing else:

- A GitHub account with admin rights on at least one repository. The App is installed at the organization or repository level; you need the permission that grants the install.
- A VERCODE account. Sign up on the dashboard; you become the owner of a new org on first sign-in.

That is the whole of the setup. No provider key is required for a first review on the platform's default provider is used until a BYOK key is set.

## Install the App

1. From the dashboard, open the repositories page and choose **Install VERCODE**. The install URL is generated server-side and is pre-scoped to the least-privilege permission set: `contents:read`, `pull_requests:write`, `checks:write`, `metadata:read`, `issues:read`. No `admin:org`, no secrets scope. The full scope table is on the GitHub App page.
2. Authorize the install on GitHub and select at least one repository.
3. GitHub dispatches the `installation` webhook; VERCODE records the install and discovers the connected repositories through `installation/repositories`. The repositories page now lists them with an active status.

The install takes under a minute. The repository does not need to be public; the App's read scope covers private repositories on the same account.

## Open a pull request

Open a pull request on a connected repository — a new branch is fine, an empty merge is not. GitHub dispatches the `pull_request` webhook on open, reopen, or synchronize. The webhook is verified and a review job is enqueued; the pipeline runs and publishes the result.

- The review publishes at p50 under 120 seconds and p95 under 300 seconds, from webhook receipt to GitHub publication (NFR-02, on a 50-file diff with 500 changed lines or fewer).
- The publication is a summary comment with the verdict and a severity count, plus inline findings anchored to the verified changed lines (FR-206). If a line anchor fails, the finding lands in the summary instead of a wrong line.

## Read the review

Open the pull request on GitHub and read the VERCODE comment. The summary states the verdict (approve, needs changes, or none of concern) and the top risks; each inline finding carries a category, a severity, a confidence, a reason, and a suggested fix.

The same review is on the dashboard, under the org's reviews list, with its cost, its status, and the per-finding detail. That dashboard view — not the PR comment — is the exit criterion: from "connected GitHub" to "first review visible in the dashboard", without any configuration except the install and, a provider key.

Source: docs/PRODUCT/USER_JOURNEYS.md (J1); docs/PRODUCT/SUCCESS_METRICS.md (the activation KPI)

## Related

- [GitHub App install & permissions](/docs/github-app/) — the 5 scopes, verbatim, and what each permits
- [API reference](/docs/api/) — the dashboard REST contract, including the re-review endpoint
