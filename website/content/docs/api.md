---
title: "API reference"
description: "The dashboard REST contract at a glance: the endpoint families, the auth and error conventions, and the GitHub webhook. The OpenAPI spec is the source."
date: 2026-10-23
status: published
tags: [api, rest, webhooks]
docsAuthor: "the VERCODE team"
frIds: [FR-204, NFR-04, NFR-06]
group: reference
---

<!--
  U: a named doc author (the API-block owner) is an open P2 decision —
  "the VERCODE team" is the honest team label until it resolves.
  This page summarizes the contract and points at the source of truth;
  it does not replicate the spec (docs/API/API_SPECIFICATION.md +
  OPENAPI.yaml own the full shape, and a drift between this page and
  the spec is a docs-drift gate failure, not a spec update).
-->

The dashboard API is a REST surface under `/api/v1`, JSON, authenticated by a signed HTTP-only cookie. The source of truth is `docs/API/API_SPECIFICATION.md` and `docs/API/OPENAPI.yaml`; this page summarizes the endpoint families and the conventions a caller needs to integrate.

The API is same-origin with the dashboard web app; the webhook routes are the public exception (no cookie, signature-verified).

## Conventions

- **Base:** `https://<host>/api/v1`.
- **Auth:** a signed, HTTP-only session cookie. Webhook routes are public and are verified by signature instead.
- **Authorization:** every non-webhook route is tenant-scoped; a cross-tenant request is a 404, a capability miss is a 403.
- **Errors:** a structured body, `{ "error": { "code", "message", "details?" } }`. The code is stable and machine-readable; a client switches on the code, not the message.
- **Idempotency:** mutating routes accept a client-generated idempotency key; webhook and payment routes dedupe on the provider's event id instead.
- **Pagination:** cursor-based, `?cursor=` + `?limit=`.

## The endpoint families

The families, with a representative route each:

| Family | Representative route | Purpose |
| --- | --- | --- |
| Auth & account | `POST /auth/signin` | Sign in, set the session |
| Organizations | `POST /orgs` | Create an org (the creator is the owner) |
| Members & invitations | `GET /orgs/:id/members` | List, invite, change role |
| GitHub | `GET /orgs/:id/github` | Install state, connected repos, disconnect |
| Reviews & findings | `GET /orgs/:id/reviews` | The review job list, job detail, findings |
| Security rollup | `GET /orgs/:id/security` | The org-wide security findings view |
| Configuration | `GET /orgs/:id/settings` | Floors, budgets, provider, custom rules |
| Usage & billing | `GET /orgs/:id/usage` | Usage, plan, invoices, quota |
| Audit | `GET /orgs/:id/audit` | The audit log, filtered |

The full per-endpoint detail — request and response shapes, error codes, capability gates — is in the API specification; the OpenAPI file is the machine-readable form.

## The webhook contract

The GitHub webhook is the pipeline's ingress. Three lines cover its contract:

- `POST /webhooks/github` is public and HMAC-verified: an `X-Hub-Signature-256` header, a 5-minute timestamp window, and delivery deduplication (NFR-04, NFR-06).
- On a verified `pull_request` open/reopen/synchronize, the route enqueues a review job and returns 202; it does not fetch the diff or run the pipeline (the webhook's latency is constant regardless of review cost).
- A same-head-SHA re-delivery is a no-op by commit-SHA idempotency; a re-review of an open PR is a separate, explicit endpoint (`POST /orgs/:id/github/review`).

Source: docs/API/API_SPECIFICATION.md (the endpoint index + conventions); docs/API/OPENAPI.yaml (the machine-readable contract)

## Related

- [Custom rules](/docs/rules/) — the configuration family's rules surface
- [GitHub App install & permissions](/docs/github-app/) — the scopes the App's routes exercise
