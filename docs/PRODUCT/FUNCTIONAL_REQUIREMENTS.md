# VERCODE — Functional Requirements (Index)

This file is the canonical *index* of functional requirements. Full descriptions live in `PRD.md` §4; this index guarantees every requirement has a stable ID and a priority. Priorities: **P0 = MVP**, **P1 = post-MVP**, **P2 = horizon**.

## Authentication & Organizations

| ID | Requirement | Priority | Source story |
| --- | --- | :-: | --- |
| FR-101 | Email+password sign-in (SSO P1) | P0 | US-001 |
| FR-102 | Create organization (creator = Owner) | P0 | US-002 |
| FR-103 | Invite members by email/link | P0 | US-003, US-005 |
| FR-104 | Roles: Owner/Admin/Developer/Viewer, server-enforced matrix | P0 | US-004 |
| FR-105 | Tenant scoping by `org_id` on all data | P0 | — |
| FR-106 | Session security (HTTP-only cookie, revocation, expiry) | P0 | US-008 |
| FR-107 | Account/org lifecycle (deactivate, delete + purge) | P1 | US-006, US-007 |

## GitHub Integration

| ID | Requirement | Priority |
| --- | --- | :-: |
| FR-201 | GitHub App install flow | P0 |
| FR-202 | Repo discovery on `installation/repositories` | P0 |
| FR-203 | PR event handling (opened/reopened/synchronize/review-submit/target) | P0 |
| FR-204 | Webhook HMAC + timestamp-window validation | P0 |
| FR-205 | Bounded diff + context fetch at head SHA | P0 |
| FR-206 | Review publication (summary + validated inline comments, fallback to PR comment) | P0 |
| FR-207 | Commit-SHA idempotency | P0 |
| FR-208 | Install removal handling + data purge | P0 |
| FR-209 | GitHub rate-limit backoff/retry | P0 |
| FR-210 | Least-privilege App permission set | P0 |

## AI Review Engine

| ID | Requirement | Priority |
| --- | --- | :-: |
| FR-301 | Diff parsing to structured change set | P0 |
| FR-302 | File classification (language, risk tier, generated/test) | P0 |
| FR-303 | Bounded context retrieval (imports, symbols, 1-hop) | P0 |
| FR-304 | Deterministic static analysis (ESLint, Semgrep) | P0 |
| FR-305 | Task-routed AI structured review | P0 |
| FR-306 | Finding validation (line-exists, enum, schema) | P0 |
| FR-307 | Finding deduplication | P0 |
| FR-308 | Severity + confidence policy (org-configurable floor, suppressions) | P0 |
| FR-309 | Review summary verdict + top risks | P0 |
| FR-310 | Per-review cost + token accounting | P0 |
| FR-311 | Provider abstraction (OpenAI P0; multi-provider P1) | P0/P1 |
| FR-312 | Prompt versioning | P0 |
| FR-313 | Encrypted BYOK | P1 |
| FR-314 | Provider fallback (bounded retry) | P1 |

## Repository Intelligence

| ID | Requirement | Priority |
| --- | --- | :-: |
| FR-401 | Changed-files + 1-hop import graph only | P0 |
| FR-402 | Test-file discovery / missing-coverage hint | P1 |
| FR-403 | Optional pgvector retrieval | P2 |
| FR-404 | Data deletion on access revocation | P0 |

## Dashboard

| ID | Requirement | Priority |
| --- | --- | :-: |
| FR-501 | Overview (recent reviews, severity counts, usage vs quota, install health) | P0 |
| FR-502 | Repositories list + per-repo detail | P0 |
| FR-503 | PR review detail (job history by commit, findings, cost, status) | P0 |
| FR-504 | Security findings rollup | P0 |
| FR-505 | Custom rules (org + repo) | P0 |
| FR-506 | Usage analytics (Recharts, real data) | P0 |
| FR-507 | Org management (members, roles, invitations, billing, quotas) | P0 |
| FR-508 | AI provider settings (routing, BYOK P1) | P0 |
| FR-509 | Billing (plan, invoices, usage, upgrade/downgrade/cancel) | P0 |
| FR-510 | Audit log | P0 |
| FR-511 | Account settings (profile, sessions, sign-out) | P0 |
