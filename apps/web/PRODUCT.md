# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Engineering teams of 3–500 developers who use GitHub as their primary code host. Primary user: the code reviewer / tech lead who opens a PR and wants an evidence-backed verdict before approving. Secondary user: the platform/security engineer who enforces merge gates and audits review history across the org.

## Product Purpose

VERCODE is an AI code-review platform for GitHub pull requests. It reads a PR the way a careful senior engineer would: deterministic static analysis (ESLint, Semgrep, secret scanning) runs first, then task-routed LLM reasoning runs on the bounded, relevant slice of the diff. The result is published back to the PR as inline findings — each with a category, severity, confidence score, a reason, and a suggested fix — plus a summary verdict. A first-class multi-tenant dashboard surfaces review history, security rollups, usage, and billing per org.

Success = a PR reviewer can act on VERCODE's findings in under two minutes and the team's rules become a real, enforced merge gate.

## Positioning

- **Static analysis runs before the LLM.** Findings are deltas on top of grounded, reproducible checks — not raw model output. A neighboring product that runs only an LLM cannot truthfully make this claim.
- **Git-aware, bounded context.** The model reviews the bounded diff plus a 1-hop import graph, capped at 60 files / 3,000 lines — never the whole repository.
- **Your rules become a merge gate.** The verdict is published as a GitHub required check, so enforcement is branch protection, not a suggestion.
- **Cost discipline by design.** Per-plan quotas, per-review cost accounting, and tiered model routing; the static pass costs almost nothing.

## Operating Context

- Developers trigger a review by opening or pushing to a GitHub PR; the GitHub App webhook enqueues the job; the worker publishes results back to the PR as inline comments.
- The dashboard is the org workspace: Overview (first-run → "Get started" card), Reviews (list + detail + findings), Security rollup, Repositories, Settings (rules, providers, members, audit), Usage/Billing, Changelog, Blog.
- The sign-in surface is a public marketing page (dark palette, one form, one primary action); after sign-in the user lands on /overview.

## Capabilities and Constraints

- **Auth:** email + password (Argon2id) + cookie session; GitHub OAuth per-user (handle read for audit) — `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` must be set; without them the connect flow returns `GITHUB_OAUTH_NOT_CONFIGURED` (503) and the UI shows an honest not-configured state.
- **GitHub App:** repo-scoped install (`/orgs/:id/github/install-url` → `https://github.com/apps/vercode/installations/new`), webhook receiver for `installation` / `pull_request` events.
- **Quotas:** 50 reviews/month free tier; over-cap → review is `skipped` with a notice posted (never silent), zero AI tokens consumed.
- **AI providers:** pluggable; BYOK keys are KMS-wrapped, decrypted only at the provider call edge. Mock mode available in dev.
- **Billing:** Stripe, USD.
- **Open/undecided:** no customer names, no case studies, no public press, no live deployment URL. No fabricated testimonials allowed in any future surface.

## Terminology

- **VERCODE** — the product and platform name.
- **Org / organization** — the tenant; one GitHub installation maps to one org.
- **Review / review job** — a run of the pipeline on a specific commit of a specific PR.
- **Finding** — a single issue: category, severity, confidence, reason, suggested fix.
- **Verdict** — the PR-level summary (pass / changes requested).
- **Skip** — a review that hit the quota or a pre-flight gate and did not run; the skip reason is posted, never silent.
- **Gate** — the required-check enforcement on a branch.

## Brand Commitments

- Name: VERCODE (all caps, wide tracking: `0.14em`).
- Logo: "V" in a small rounded square, accent-red on dark.
- Palette: dark indigo/near-black ground with a single red accent (`hsl(0 90% 55%)`) — one palette, no light variant.
- Voice: plain, direct, engineering-grade. Copy uses the product's own terms (review, finding, gate, verdict). No marketing hyperbole.

## Evidence on Hand

- Real product docs: `docs/PRODUCT/*.md`, `docs/TECHNICAL/*`, `docs/DESIGN/*` (in-repo).
- Representative review output shown in the hero (clearly labeled "Representative review output — a static finding on your rules, gated at merge").
- Changelog data: `apps/web/src/lib/changelog-data.ts` (real, in-repo entries).
- Blog data: `apps/web/src/lib/blog-data.ts` (in-repo entries).
- Absences to never fabricate: customer logos, real PR screenshots, testimonial quotes, named case studies, "trusted by" lists, press mentions, benchmark numbers beyond what's in the changelog/data files.

## Product Principles

1. **Deterministic before probabilistic** — static checks always run first; AI is a delta on top.
2. **Bounded, not exhaustive** — review the slice that matters, never the whole repo.
3. **Findings are evidence, not vibes** — every finding has a confidence score and a fix; under the floor, it's demoted.
4. **The gate is real** — VERCODE's verdict is a required check, enforced by branch protection.
5. **Cost is a first-class metric** — usage and spend are visible to the user, not hidden.
