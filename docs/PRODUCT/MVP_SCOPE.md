# VERCODE — MVP Scope

The MVP is the vertical slice that makes the end-to-end workflow in `IMPLEMENTATION/...` demoable and trustworthy. It is defined as: **every P0 requirement, plus the explicit "must-have" P1 items listed below.**

## In MVP (P0 complete)

### Core pipeline
- Auth (email+password, sessions), organizations, memberships, roles, invitations
- Tenant isolation on all reads/writes
- GitHub App: install, repo discovery, PR event handling, webhook signature validation
- Review pipeline: diff parse → classify → static analysis (ESLint + Semgrep) → AI review (OpenAI, task-routed) → validate → dedup → policy → summary
- GitHub review publication: summary comment + validated inline comments (fallback to PR comment)
- Commit-SHA idempotency, bounded retries, rate-limit handling
- Per-review cost + token accounting attributed to org

### Dashboard
- Overview, Repositories, PR review detail, Security rollup, Custom rules, Usage analytics, Org management, AI provider settings, Billing (Stripe integration stub + plan management), Audit log, Account settings

### Plans & quotas
- Free / Developer / Team / Enterprise with configurable quotas enforced server-side
- Quota-exceeded → skip with posted notice (never silent)

### Security baseline
- Webhook signature + replay protection
- Prompt-injection defenses
- Secret redaction in logs and findings
- Least-privilege GitHub scopes
- Encrypted BYOK storage shape (key management present; key UX P1)

### Ops
- Docker Compose dev stack (Postgres + Redis + web + api + worker)
- CI: typecheck, lint, unit, integration
- Structured logging + OpenTelemetry + Sentry wired
- `.env.example`, health endpoints, backup/restore docs

## Explicit P1 items pulled into MVP (must-haves)

These P1 items are small, high-leverage, and block real-world use — they ship with MVP:

- **FR-314** Provider fallback (bounded, one retry) — otherwise a single-provider outage is a total review outage
- **FR-509 (partial)** Billing *page* with plan state + upgrade flow wired to Stripe; **live webhook-driven payment capture** may ship as a stub that trusts a verified Stripe webhook, not client state
- **US-105** Re-review request (single endpoint; enforces the same idempotency + quota rules)

## Out of MVP (tracked, not built)

- Untrusted code execution sandbox (static analysis only)
- GitLab/Bitbucket
- pgvector retrieval
- IDE extensions
- SSO (SAML/OIDC)
- Multi-provider BYOK UI polish (storage shape present, UI P1)

## Definition of "MVP demoable"

The 15-step end-to-end checklist in the brief (`PHASE 10 — DEFINITION OF DONE`) is the gate. A user must be able to: sign in → create org → install the GitHub App on a test repo → open a real PR → receive a verified webhook → get a processed review job (idempotent) → see the diff+context fetched → see static analysis + AI run → see validated findings → see the summary + inline comments published on GitHub → see results in the dashboard → see usage attributed to the org → see a failure retry in observability → pass tenant isolation + security tests → have docs match code.

Any step that depends on external credentials (real GitHub App, real OpenAI key, real Stripe account) is **explicitly marked "requires external credential — blocked in this environment"** in the implementation status, not claimed complete.
