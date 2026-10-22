# VERCODE — Product Requirements Document (PRD)

## 1. Product Summary

VERCODE is an AI code-review SaaS for development teams. It automatically reviews GitHub pull requests by combining deterministic static analysis with LLM-driven reasoning, publishes evidence-backed inline comments and a summary verdict to the PR, and gives organizations a premium dashboard to manage, audit, and configure the system.

Target: engineering teams of 3–500 developers who already use GitHub and want a second pair of AI eyes that doesn't flood the PR with noise.

## 2. Core Problems Solved

| # | Problem | How VERCODE solves it |
| - | --- | --- |
| P1 | Review latency — PRs wait for a human reviewer | Automatic AI review posted within ~1–3 minutes of PR creation/update |
| P2 | Noisy AI reviews — too many low-value comments | Deterministic-first pipeline, confidence floors, dedup, severity policies |
| P3 | Reviews without evidence — "this looks wrong" with no reason | Every finding carries a category, severity, confidence, and a suggested fix |
| P4 | Security findings buried in chat history | Dedicated security-findings rollup, severity-gated, org-visible |
| P5 | No org-level visibility into review quality | Dashboard: review history, finding trends, usage/cost, audit log |
| P6 | Unbounded AI cost | Per-org quotas, per-review cost accounting, plan-based limits |

## 3. Target Users and Personas

See `USER_PERSONAS.md`. Summary:

- **Individual contributor / developer** — opens PRs, wants useful inline feedback in < 3 minutes.
- **Tech lead / senior reviewer** — wants signal over noise, security callouts, a way to mute categories, and a dashboard to check on the team.
- **Engineering manager** — wants org-level usage, cost, review-coverage, and trend data.
- **Platform / DevSecOps engineer** — configures the GitHub App, custom rules, model routing, and monitors the system.
- **Org owner / admin** — manages members, roles, billing, and audit.

## 4. Functional Requirements

IDs follow `FR-<n>`. All P0 items are MVP.

### 4.1 Authentication & Organizations

- `FR-101` Users sign in securely (email + password with optional passkey/SSO at P1). *(P0 email+password)*
- `FR-102` Users can create an organization; the creator becomes Owner. *(P0)*
- `FR-103` Members are invited by email or link; invitation must be accepted. *(P0)*
- `FR-104` Roles: Owner, Admin, Developer, Viewer — with server-enforced permission matrix. *(P0)*
- `FR-105` All tenant data (repos, PRs, reviews, findings, usage, settings, audit) is scoped by `org_id`; no query returns cross-tenant rows. *(P0)*
- `FR-106` Session management: signed HTTP-only cookies, server-side revocation, absolute + idle expiry. *(P0)*
- `FR-107` Account lifecycle: user deactivation, org deletion (data purge per retention policy). *(P1)*

### 4.2 GitHub Integration (GitHub App)

- `FR-201` GitHub App installation flow via OAuth device-style flow or app install URL; install recorded per org. *(P0)*
- `FR-202` On `installation/repositories` event, discover added/removed repos and store per org. *(P0)*
- `FR-203` Receive PR events: `pull_request` opened/reopened/synchronize, `pull_request_review` submit (for re-review trigger), `pull_request_target` on forks (sandboxed review). *(P0)*
- `FR-204` Validate every webhook with HMAC-SHA256 signature (`X-Hub-Signature-256`) and timestamp window; reject forges. *(P0)*
- `FR-205` Fetch PR diff + relevant file context (bounded, LRU cached) at the PR head SHA. *(P0)*
- `FR-206` Run review pipeline, publish a review: summary comment + inline comments anchored to verified diff lines; fall back to PR comment when anchoring fails. *(P0)*
- `FR-207` Commit-SHA-based idempotency: re-running the same PR at the same head SHA does not re-run the pipeline; re-review happens only on new SHA or explicit re-review request. *(P0)*
- `FR-208` Handle installation removal: revoke credentials, mark repos disabled, stop reviewing. *(P0)*
- `FR-209` GitHub API rate-limit handling: 403/429 backoff with retry queue. *(P0)*
- `FR-210` Least-privilege App permissions: `contents:read`, `pull_requests:write`, `checks:write`, `metadata:read`, `issues:read`. No `admin:org`, no secrets scopes. *(P0)*

### 4.3 AI Review Engine

- `FR-301` Diff parsing: unified diff → structured change set (files, hunk map, added/removed line ranges). *(P0)*
- `FR-302` File classification: by language, risk tier (security-sensitive, DB-touching, dependency manifests, generated code, test files). *(P0)*
- `FR-303` Context retrieval: imports, function signatures, nearby definitions, referenced symbols — bounded token budget per file. *(P0)*
- `FR-304` Static analysis: ESLint + Semgrep on changed files; results as deterministic findings (zero-confidence floor, high-precision, non-AI source). *(P0)*
- `FR-305` AI review: task-routed model calls producing structured findings (schema-validated). *(P0)*
- `FR-306` Finding validation: line location must exist in the diff; category/severity must be in allowed enums; invalid findings dropped, not posted. *(P0)*
- `FR-307` Deduplication: same file+line+category within a review collapses to one finding (keeps highest confidence / most specific). *(P0)*
- `FR-308` Severity + confidence policy: org-configurable floor (default 0.6), per-category suppression, quiet-hours for low-severity. *(P0)*
- `FR-309` Review summary: verdict (approve/changes/none-of-concern), top-risks narrative, counts by severity. *(P0)*
- `FR-310` Cost tracking: per-review input/output tokens, model used, estimated USD cost, attributed to org. *(P0)*
- `FR-311` Provider abstraction: OpenAI first, Anthropic + local/Ollama adapters; task-specific model selection. *(P0 OpenAI; P1 multi-provider)*
- `FR-312` Prompt versioning: prompts stored with versions; each finding records `promptVersion`. *(P0)*
- `FR-313` BYOK: org-level encrypted API-key override (AES-256-GCM, KMS-wrapped master key). *(P1)*
- `FR-314` Model fallback: on provider failure, fall back to a configured secondary provider, bounded to one retry. *(P1)*

### 4.4 Repository Intelligence

- `FR-401` Fetch only changed files + their direct import graph (1 hop), not the whole repo. *(P0)*
- `FR-402` Test-file discovery: flag changed files with adjacent test changes; suggest missing test coverage as a low-severity finding. *(P1)*
- `FR-403` Optional pgvector index: embedding-based retrieval for large repos, incremental re-index on PR merge. *(P2)*
- `FR-404` Deletion on access revocation: hard-delete repo data when the GitHub App install is removed (subject to audit retention). *(P0)*

### 4.5 Dashboard

Every page reads from the real API. No fabricated data, ever.

- `FR-501` Overview: recent reviews, finding counts by severity, org usage vs quota, install health. *(P0)*
- `FR-502` Repositories: list connected repos, last-reviewed PR, finding trends. *(P0)*
- `FR-503` PR review detail: job history for a PR (by commit), findings with file/line, AI summary, cost, status. *(P0)*
- `FR-504` Security findings: org-wide rollup, severity-filtered, with source PR link. *(P0)*
- `FR-505` Custom rules: org-level and repo-level review rules (category suppression, confidence floor, quiet categories, per-language toggles). *(P0)*
- `FR-506` Usage analytics: reviews/day, findings/PR, cost/PR, provider breakdown — Recharts from real `usage_events`. *(P0)*
- `FR-507` Organization management: members, roles, invitations, billing, plan, quotas. *(P0)*
- `FR-508` AI provider settings: provider selection, model routing, BYOK key management (masked display), per-task model overrides. *(P0; BYOK P1)*
- `FR-509` Billing: plan, invoices, usage breakdown, upgrade/downgrade/cancel. *(P0 with Stripe stub; live payments P1)*
- `FR-510` Audit log: member actions, review publications, role changes, key rotations — with actor + timestamp + source IP. *(P0)*
- `FR-511` Account settings: profile, email, session list, sign-out everywhere. *(P0)*

## 5. Non-Functional Requirements

See `NON_FUNCTIONAL_REQUIREMENTS.md` for the full list. Summary:

- `NFR-01` Correctness: review published for ≥ 99% of valid PR webhooks over 30 days (P0).
- `NFR-02` Latency: p50 review completion < 120 s, p95 < 300 s for a 50-file diff (P0).
- `NFR-03` Tenant isolation: zero cross-tenant rows served — verified by integration test suite. *(P0)*
- `NFR-04` Webhook integrity: 100% rejection of unsigned/replayed webhooks (replay detected via idempotency key + timestamp window). *(P0)*
- `NFR-05` Availability: 99.5% API uptime target; queue-based workers tolerate 30 min of API degradation. *(P0)*
- `NFR-06` Security: OWASP ASVS L2 baseline; prompt-injection defenses; secret redaction in logs and findings. *(P0)*
- `NFR-07` Cost control: per-org hard caps on monthly token spend; review skips (with posted notice) when quota exceeded. *(P0)*
- `NFR-08` Observability: structured JSON logs, OpenTelemetry traces across API→queue→worker→GitHub, Sentry error capture. *(P0)*
- `NFR-09` Accessibility: WCAG 2.1 AA on dashboard; keyboard navigable; `prefers-reduced-motion` respected (per emil-design-eng skill). *(P0)*
- `NFR-10` Data retention: findings retained per org plan (Free 30 d, Developer 90 d, Team 1 y, Enterprise custom); audit log 180 d; hard-delete pipeline. *(P0 policy, P1 enforcement)*

## 6. Permissions and Roles

| Capability | Owner | Admin | Developer | Viewer |
| --- | :-: | :-: | :-: | :-: |
| Manage org (members, billing, plan) | ✓ | ✓ | — | — |
| Manage integrations (GitHub App, providers) | ✓ | ✓ | — | — |
| Manage custom rules | ✓ | ✓ | ✓ | — |
| Run/re-run reviews | ✓ | ✓ | ✓ | — |
| Read dashboard & findings | ✓ | ✓ | ✓ | ✓ |
| Read audit log | ✓ | ✓ | — | — |
| Delete org | ✓ | — | — | — |

All authorization is server-side; the frontend hides but never enforces.

## 7. Usage Limits and Subscription

See `BUSINESS/USAGE_QUOTAS.md` and `packages/contracts/src/plans.ts` (source of truth, imported by all services).

Plans: Free, Developer, Team, Enterprise. Quota dimensions: reviews/month, files per review, concurrent reviews, finding retention, custom rule count, model tier access.

## 8. Out of Scope (MVP)

- Native IDE extensions (VS Code/JetBrains) — P2.
- GitLab/Bitbucket adapters — P2 (GitHub App first).
- Untrusted code *execution* (running the PR's tests) — deferred; requires isolated sandbox boundary per `SECURITY/SANDBOX_SECURITY.md`. Static analysis only in MVP.
- Embeddings / pgvector retrieval — P2.
- Mobile apps — out.
- SSO (SAML/OIDC) — P1.
- Multi-branch baselines / merge-queue review — P2.

## 9. Product Risks and Assumptions

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| LLM cost exceeds plan pricing at high PR volumes | High | High | Cost model (`OPERATIONS/COST_MODEL.md`), per-review cap, cheap-model routing |
| Finding noise destroys trust (repeat user churn) | High | High | Confidence floor default 0.6, dedup, deterministic-first, per-org mute rules |
| GitHub App review-limit caps (200 PRs/hr on free-tier App limits) | Med | Med | Queue + retry, rate-limit-aware backoff, documented ceiling |
| Prompt injection via PR descriptions / repo READMEs | High | High | `SECURITY/PROMPT_INJECTION_DEFENSE.md` — repo content is data, never instructions; output schema validation; no tool access in review prompt |
| Review anchoring to wrong lines (GitHub 422s) | Med | Med | Line validation against the diff map before publication; fallback to PR comment |
| Tenant data leakage via shared caches | Low | Critical | Redis cache keys namespaced by `org:repo`; DB row-level org_id enforcement; integration tests |

## 10. Success Metrics

See `SUCCESS_METRICS.md`. North-star: **% of PRs where ≥ 1 VERCODE finding was acted on (accept/reply/dismiss-with-action) within 7 days.** Supporting: review latency p50/p95, false-positive dismiss rate, orgs hitting quota, cost/review, NPS.

## 11. Acceptance Criteria

Every `FR-###` has acceptance criteria in `ACCEPTANCE_CRITERIA.md`, keyed by the same ID. The traceability matrix in `IMPLEMENTATION/TRACEABILITY_MATRIX.md` links FR → component → test.
