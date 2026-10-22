# VERCODE Security

This document describes how to report a security vulnerability in VERCODE,
what we consider in scope, and how we handle reports.

The full security architecture, threat model (T-01…T-16 STRIDE register),
and the security test plan live in
[docs/SECURITY/](docs/SECURITY/). This page is the entry point for people
who want to report a problem.

## Supported versions

The project is at the **scaffold + design** stage. There is no production
release yet, so **no version is considered "supported"** in the traditional
sense. If you find a vulnerability in the design or in any in-flight phase,
report it — we will route it to the appropriate owner.

## Reporting a vulnerability

**Please do not open a public issue or pull request for a security
vulnerability.** Public disclosure of an unpatched vulnerability exposes
users to exploit risk.

Instead:

- Open a **private** security advisory on GitHub:
  `https://github.com/soumyachk101/VERCODE/security/advisories/new` — this
  is the preferred channel.
- Or email the repository owner at
  **`security@vercode.dev`** (add me — Soumya Chakraborty — as a CC if
  you'd like a personal acknowledgement).
- Or use the `gh` CLI:
  ```bash
  gh security advisory-templates   # see the templates we maintain
  ```

What to include:

- A short description of the vulnerability and the affected component
  (e.g. `packages/github`, `apps/api`, `packages/review-engine`).
- A minimal, reproducible proof-of-concept (PoC) or a reference to an
  existing exploit — **do not include real secrets or customer data**.
- The steps to reproduce, the expected behavior, and the observed behavior.
- Any mitigations you know of.

### What to expect

- **Acknowledge within 48 hours.**
- **First status update within 5 business days.**
- A public acknowledgement and coordinated disclosure within 90 days of
  the fix shipping (or as agreed with the reporter).

The security response team is composed of the maintainers. We work in a
dedicated branch (`security/*`) and do not push fixes to `main` until the
review is complete.

## In scope

The following components are in scope for security review:

- **All packages under `packages/`** (contracts, database, github,
  diff-engine, static-analysis, ai-providers, review-engine, policy-engine,
  billing, observability, config).
- **All apps under `apps/`** (web dashboard, API server, worker).
- **The review pipeline** and its security invariants — see
  [docs/SECURITY/](docs/SECURITY/) for the full threat model.

Specifically, we are interested in:

- **Webhook integrity bypass** — any way to forge, replay, or inject into
  GitHub webhook events that pass the HMAC + timestamp + dedup check
  (threats T-02, T-03 in the register).
- **Prompt-injection escapes** — any way to make the LLM review engine leak
  the system prompt, alter its scope, or produce a finding that points at
  an attacker-controlled URL without the repo content being the trigger
  (T-04…T-06).
- **Tenant isolation violations** — any query, cache key, or API route
  that lets an `org_id` read or write another org's data (the register
  treats cross-tenant leakage as a P0).
- **Secret leakage** — any path where a secret, API key, or PII reaches a
  log record, stored finding, or error response without going through the
  redaction gate (T-10).
- **BYOK key handling** — any path where a customer's own key is
  readable, exfiltrated, or used to exfiltrate data (T-11, T-12).
- **Billing integrity** — any way to inflate or deflate an org's token
  spend, or to trigger plan-state moves without a verified provider
  webhook (T-13…T-15).
- **Dependency supply-chain** — any path where an upstream dependency
  could be swapped or pinned to a vulnerable version.

## Out of scope

- Denial-of-service at the platform level (we rate-limit; we don't
  guarantee infinite throughput).
- Vulnerabilities in third-party services we call (OpenAI, Anthropic,
  Ollama, Stripe, Razorpay, GitHub) — report those to the provider.
- Missing or misconfigured features in *our* deployments of these
  providers (e.g. if you set `LOG_LEVEL=debug` and a secret leaks, that's
  your configuration; in the default `info` configuration it must not).
- Social engineering, phishing, or password-guessing against real users.

## Known design limits (accepted risks)

The design docs acknowledge some residual risks deliberately; these are
not considered "unreported" vulnerabilities:

| # | Limitation | Status |
| --- | --- | --- |
| L-1 | No untrusted code execution — a PR's own tests are not run in the MVP | **Closed by absence** until Phase 2 (gVisor/Firecracker sandbox) |
| L-2 | No pgvector semantic retrieval | Phase 2 |
| L-3 | GitHub-only (no GitLab/Bitbucket) | Phase 2 |
| L-5 | No SSO in MVP (OIDC Phase 1) | Phase 1 |
| L-6 | Content-hash dedup not in MVP | Phase 1 |
| L-8 | Live external integration blocked in build environment | Phase 1 |

If you find a way around any of the "closed by absence" mitigations above,
**that is a valid, high-severity report** — please file it.

## Acknowledgements

We keep a public log of security fixes in `docs/SECURITY/CHANGELOG.md`
(when it lands). Names of researchers who file valid reports are
acknowledged in that log with their permission.

## Legal note

All code and documentation in this repository is available under the
[MIT License](LICENSE.md). The security process is available in
[SECURITY.md](SECURITY.md) (this file).
