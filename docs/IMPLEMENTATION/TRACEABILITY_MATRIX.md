# VERCODE — Traceability Matrix

The FR → component → test → doc link map. This is the *drift gate* (`RELEASE_CRITERIA gate-11`): a FR whose behavior changed has updated docs *in the same PR*; a FR with no test is an *incomplete* feature; a test with no FR is an *orphan*. The matrix is the *single place* that proves "the docs match the implementation" (PHASE 10 step 14) — it's a *CI-checked* artifact (a new FR without a row, a new test without a row, a new component without a row = a gate-11 failure).

## 1. The *rule* (a *what a row is + a what a missing row means*)

- **A *row* = a FR → a component (a package/route) → a test (a named `UT-*`/`IT-*`/`ST-*`/`E2E-*`) → a doc (a the `ACCEPTANCE_CRITERIA` AC + a the relevant `docs/` page).**
- **A *FR without a test* = an incomplete feature (a `TEST_STRATEGY §7 "an AC with no test is an incomplete feature"`).**
- **A *test without a FR* = an orphan (a "why does this test exist?" — a either link it to a FR or remove it).**
- **A *component without a FR* = a un-tracked surface (a "what requirement does this code satisfy?" — a either link it to a FR or it's dead code).**
- **A *doc without a FR* = a un-tracked statement (a "what requirement is this doc the spec for?" — a either link it to a FR or it's a non-normative note).**

## 2. The *matrix* (a *the MVP scope, a `MVP_SCOPE.md`'s P0 items*)

| FR (a `FUNCTIONAL_REQUIREMENTS`) | The *component* (a package/route) | The *test* (a named) | The *doc* (a the AC + the spec) |
| --- | --- | --- | --- |
| **FR-101** (a email+password sign-in) | a `api` (a the `/auth/*` routes) + a `config` (a the session signing key) | a `IT-auth-lockout`, a `IT-auth-noenum`, a `IT-session-*` | a `AC-101` + a `AUTHENTICATION.md §3/§7` |
| **FR-102** (a create org) | a `api` (a the `POST /orgs`) + a `database` (a the org + membership) | a `IT-auth-*` (a the org-create test, a `auth.spec.ts`) | a `AC-102` + a `DATABASE_DESIGN.md §3 "organizations"` |
| **FR-103** (a invite members) | a `api` (a the `POST /orgs/:id/invitations` + a accept) | a `auth.spec.ts` (a the invite + accept) | a `AC-103` + a `DATABASE_DESIGN.md §3 "invitations"` |
| **FR-104** (a roles + the capability matrix) | a `api` (a the capability middleware) + a `database` (a the memberships + the partial-unique owner index) | a `IT-authz-*`, a `ST-authz-self-promote`, a `ST-authz-owner-transfer`, a `ST-authz-last-owner` | a `AC-104` + a `AUTHORIZATION.md §1` + a `SCHEMA_REFERENCE.md "the owner uniqueness"` |
| **FR-105** (a tenant scoping by org_id) | a `database` (a the tenant-scoped repository; a the `org_id`-leading index) + a `api` (a the tenant middleware) | a `IT-tenant-01..05`, a `ST-isolation-oracle` | a `AC-902` + a `TENANT_ISOLATION.md §2/§5` + a `INDEXING_STRATEGY.md §1` |
| **FR-106** (a session security) | a `api` (a the session store + a the revocation) | a `IT-session-*` | a `AC-106` + a `AUTHENTICATION.md §2/§7` |
| **FR-107** (a the account/org lifecycle, a P1) | a `api` (a the leave/delete) + a `database` (a the soft-delete + a the hard-purge cascade) | a `IT-retention-03` (a the org-delete path) | a `AC` (a the P1, a the `DATA_RETENTION.md §5`) |
| **FR-201** (a the GitHub App install flow) | a `github` (a the App auth) + a `api` (a the install URL route) | a `onboarding.spec.ts` (a the mock install) + a `live.spec.ts` (a the real, a **blocked**) | a `INTEGRATION_DESIGN.md §1.1/§1.2` + a `SAAS_LAUNCH_PLAN §5 P1 "a live App"` |
| **FR-202** (a repo discovery) | a `github` (a the `installation_repositories` handler) + a `database` (a the `github_repos` upsert) | a `IT-webhook-*` (a the repo-discovery test) | a `INTEGRATION_DESIGN.md §1.4 "installation_repositories"` |
| **FR-203** (a PR event handling) | a `api` (a the `webhooks/github` route) + a `github` (a the event routing) | a `IT-webhook-opened`, a `daily-loop.spec.ts` | a `WEBHOOK_SPECIFICATION.md §1.2` + a `INTEGRATION_DESIGN.md §1.4` |
| **FR-204** (a the webhook HMAC + the timestamp + the dedup) | a `github` (a the `verifyWebhook()`) | a `ST-webhook-forged`, a `ST-webhook-replay`, a `ST-webhook-stale` | a `WEBHOOK_SPECIFICATION.md §1.1` + a `THREAT_MODEL.md T-01` |
| **FR-205** (a the bounded diff + context fetch) | a `github` (a the `fetchPRDiff()`) + a `diff-engine` (a the `parseUnifiedDiff()`) + a the Redis diff cache | a `UT-diff-parse-*`, a `IT-publish-*` (a the context) | a `CONTEXT_RETRIEVAL.md §2/§4` + a `INTEGRATION_DESIGN.md §1.5` |
| **FR-206** (a review publication: a summary + a validated inline comments + a fallback) | a `github` (a the `publishReview()`) + a `diff-engine` (a the `resolveAnchor()`) | a `IT-publish-inline`, a `IT-publish-fallback`, a `IT-publish-summary-only`, a `IT-publish-idempotent` | a `AC-203` + a `INTEGRATION_DESIGN.md §1.6` |
| **FR-207** (a the commit-SHA idempotency) | a `worker` (a the idempotency key check) + a `database` (a the `(org,repo,pr,sha)` UK) | a `IT-idempotency-01` | a `AC-202` + a `ADR-007` + a `DATABASE_DESIGN.md §3 "review_jobs"` |
| **FR-208** (a install removal) | a `api` (a the `installation.deleted` handler) + a the `retention_jobs` schedule | a `IT-webhook-install-removed` | a `AC-204` + a `INTEGRATION_DESIGN.md §1.7 "install removed"` |
| **FR-209** (a GitHub rate-limit handling) | a `github` (a the backoff + a the per-installation throttler) | a `IT-queue-*` (a the rate-limit retry) | a `INTEGRATION_DESIGN.md §1.7 "403/429 rate-limited"` |
| **FR-210** (a the least-privilege App permissions) | a `github` (a the scope set) | a `ST-github-scopes` | a `INTEGRATION_DESIGN.md §1.2 "the permission set"` + a `THREAT_MODEL.md T-04` |
| **FR-301** (a diff parsing) | a `diff-engine` | a `UT-diff-parse-01..03` | a `REVIEW_ENGINE_SPEC.md §7 "the UT-diff-parse"` |
| **FR-302** (a file classification) | a `review-engine` (a the classify stage) + a `diff-engine` | a `UT-engine-classify` | a `REVIEW_ENGINE_SPEC.md §2 stage [3]` |
| **FR-303** (a bounded context retrieval) | a `github` (a the import fetch) + a `CONTEXT_RETRIEVAL` | a `UT-context-*` (a the budget) + a `ST-context-bound` | a `CONTEXT_RETRIEVAL.md §1/§6` + a `NFR-29` |
| **FR-304** (a deterministic static analysis) | a `static-analysis` | a `UT-static-sql-01..02`, a `UT-static-runner-01..02` | a `AC-301` + a `ADR-005` + a `REVIEW_ENGINE_SPEC.md §2 stage [4]` |
| **FR-305** (a task-routed AI review) | a `ai-providers` + a `review-engine` | a `UT-ai-route-01..02`, a `IT-ai-fail*` | a `AI_SYSTEM_DESIGN.md §3` + a `MODEL_ROUTING.md §2` |
| **FR-306** (a finding validation: a line-exists, a enum, a schema) | a `review-engine` (a the validate stage) + a `contracts` (a the Zod re-validation) | a `UT-engine-validate`, a `UT-ai-revalidate-01..03` | a `AC-302` + a `REVIEW_ENGINE_SPEC.md §2 stage [9]` + a `AI_SYSTEM_DESIGN.md invariant 1` |
| **FR-307** (a finding dedup) | a `policy-engine` (a the dedup) | a `UT-dedup-01..02` | a `AC-303` + a `REVIEW_ENGINE_SPEC.md §2 stage [10]` |
| **FR-308** (a severity + confidence policy) | a `policy-engine` | a `UT-policy-floor`, a `UT-policy-suppress`, a `UT-policy-static-exempt` | a `AC-304` + a `REVIEW_ENGINE_SPEC.md §2 stage [11]` |
| **FR-309** (a review summary verdict + top risks) | a `review-engine` (a the summary stage) | a `UT-engine-summary` | a `AC-305` + a `REVIEW_ENGINE_SPEC.md §2 stage [12]` |
| **FR-310** (a cost + token accounting) | a `ai-providers` (a the cost capture) + a `worker` (a the `usage_events` write) | a `UT-ai-cost-01..03`, a `IT-tx-*` | a `AC-306` + a `MODEL_ROUTING.md §6` + a `DATA_FLOW.md §2 "the usage_events"` |
| **FR-311** (a the provider abstraction) | a `ai-providers` (a the interface + a the adapters) | a `UT-ai-revalidate-*`, a `IT-ai-fail*` | a `AI_SYSTEM_DESIGN.md §2 "the adapters"` + a `ADR-006` |
| **FR-312** (a prompt versioning) | a `ai-providers` (a the prompt version) + a `review-engine` | a `UT-ai-route-01` (a the prompt version recorded) | a `PROMPT_ENGINEERING.md §4` + a `AC-306 "the promptVersion"` |
| **FR-313** (a the encrypted BYOK, a P1) | a `database` (a the `byok_keys` KMS-wrapped) + a `ai-providers` | a `ST-byok-wrapped`, a `ST-byok-scope` | a `SECRETS_MANAGEMENT.md §2` + a `THREAT_MODEL.md T-05` |
| **FR-314** (a the provider fallback, a P1-pulled-into-MVP) | a `ai-providers` (a the one-switch fallback) | a `UT-ai-retry-01`, a `IT-ai-fallback` | a `AI_SYSTEM_DESIGN.md §5 "the provider fallback"` + a `MODEL_ROUTING.md §5` |
| **FR-401** (a changed-files + 1-hop only) | a `github` (a the import fetch) + a `CONTEXT_RETRIEVAL` | a `ST-context-bound` | a `CONTEXT_RETRIEVAL.md §2 "what is NOT retrieved"` + a `NFR-29` |
| **FR-402** (a test-file discovery, a P1) | a `review-engine` (a the classify) | a `UT-engine-classify` (a the test-file flag) | a `CONTEXT_RETRIEVAL.md §2 "the test-file adjacency"` |
| **FR-403** (a the pgvector, a P2) | a *not in MVP* (a a documented deferral) | a *not in the MVP test suite* | a `CONTEXT_RETRIEVAL.md §5` + a `KNOWN_LIMITATIONS.md` |
| **FR-404** (a deletion on access revocation) | a the `retention_jobs` + a the Redis cache eviction | a `IT-retention-02` | a `DATA_RETENTION.md §4` + a `THREAT_MODEL.md T-12/T-13` |
| **FR-501** (a the Overview) | a `web` (a the Overview page) + a `api` (a the security/usage/reviews endpoints) | a `onboarding.spec.ts` + a `cost.spec.ts` (a the Overview's data) | a `PAGE_SPECIFICATIONS.md §1` |
| **FR-502** (a the Repositories) | a `web` (a the Repositories) + a `api` | a `security-triage.spec.ts` | a `PAGE_SPECIFICATIONS.md §2` |
| **FR-503** (a the PR review detail) | a `web` (a the Reviews) + a `api` | a `daily-loop.spec.ts` | a `PAGE_SPECIFICATIONS.md §3` |
| **FR-504** (a the Security rollup) | a `web` (a the Security) + a `api` (a the security endpoint) | a `security-triage.spec.ts` | a `PAGE_SPECIFICATIONS.md §4` |
| **FR-505** (a the custom rules) | a `web` (a the Rules) + a `api` (a the rules endpoint) + a `policy-engine` | a `security-triage.spec.ts` (a the suppression is effective) | a `PAGE_SPECIFICATIONS.md §6` + a `REVIEW_ENGINE_SPEC.md §2 stage [11]` |
| **FR-506** (a the usage analytics, a Recharts, a real data) | a `web` (a the Usage) + a `api` (a the usage endpoint, a the `usage_daily` rollup) | a `cost.spec.ts` | a `PAGE_SPECIFICATIONS.md §5` + a `NFR-03` |
| **FR-507** (a the org management) | a `web` (a the Team) + a `api` | a `auth.spec.ts` | a `PAGE_SPECIFICATIONS.md §7` |
| **FR-508** (a the AI provider settings) | a `web` (a the Providers) + a `api` (a the providers endpoint) | a `settings.spec.ts` | a `PAGE_SPECIFICATIONS.md §6` |
| **FR-509** (a the usage reporting) | a `web` (a the Usage page, a `apps/web/src/app/usage/`) + a `api` (a `GET /orgs/:id/usage`, a `apps/api/src/routes/usage.ts`) + a `usage_events`/`usage_daily` | a the "Usage API" tests in `apps/api/src/routes.test.ts` + a the platform-cap gate (a `PLATFORM_TOKEN_SPEND_CAP_USD`, a `packages/config/src/index.ts`) | a `PAGE_SPECIFICATIONS.md §5` + a `INTEGRATION_DESIGN.md §2.3` |
| **FR-510** (a the audit log) | a `web` (a the Audit) + a the `audit_events` (a the append-only) | a `audit.spec.ts` + a `IT-audit-01` | a `PAGE_SPECIFICATIONS.md §7` + a `DATABASE_DESIGN.md §3 "audit_events"` |
| **FR-511** (a the account settings) | a `web` (a the Account) + a `api` | a `auth.spec.ts` (a the sessions + the sign-out-everywhere) | a `PAGE_SPECIFICATIONS.md §7` + a `AUTHENTICATION.md §2` |

## 3. The *non-functional* → test link (a *the NFRs are test-oracle'd too*)

| NFR (a `NON_FUNCTIONAL_REQUIREMENTS`) | The *test* (a named) | The *doc* |
| --- | --- | --- |
| **NFR-01** (a the review reliability ≥ 99%) | a *the `review_jobs.status` aggregation over 30d* (a a production metric, a not a PR test) | a `SUCCESS_METRICS.md "review success rate"` |
| **NFR-02** (a the latency p50/p95) | a *the `review_jobs.created_at/finished_at`* (a a production metric) + a the benchmark harness's latency | a `SUCCESS_METRICS.md "review latency"` + a `AI_EVALUATION §2 "latency p50/p95"` |
| **NFR-03** (a the dashboard API p95) | a *the `usage_daily` rollup read* (a a production metric) | a `PERFORMANCE_SCALABILITY.md §1 "the hot-path"` |
| **NFR-04** (a the webhook constant-latency) | a `IT-queue-backpressure` (a the ingress p95 under a flood) | a `SYSTEM_ARCHITECTURE.md §4 "the webhook never blocks on LLM"` |
| **NFR-05** (a the ASVS L2) | a *the `ST-*` suite (a the security test plan)* | a `SECURITY_ARCHITECTURE.md §3 "the threat-to-control-to-test matrix"` |
| **NFR-06** (a the 100% webhook rejection) | a `ST-webhook-forged` + a `ST-webhook-replay` + a `ST-webhook-stale` | a `WEBHOOK_SPECIFICATION.md §1.1` + a `THREAT_MODEL.md T-01` |
| **NFR-07** (a the tenant isolation, a zero cross-tenant rows) | a `IT-tenant-01..05` + a `ST-isolation-oracle` | a `TENANT_ISOLATION.md §5 "the verification"` + a `THREAT_MODEL.md T-02` |
| **NFR-08** (a the secrets never in logs) | a `ST-secret-leak` + a `ST-redaction-01..03` | a `SECRETS_MANAGEMENT.md §3/§5` + a `THREAT_MODEL.md T-05` |
| **NFR-09** (a the prompt-injection defense) | a `ST-injection-01..04` | a `PROMPT_INJECTION_DEFENSE.md` + a `THREAT_MODEL.md T-06` |
| **NFR-10** (a the least-privilege + no PAT) | a `ST-github-scopes` + a the install flow (a the server-side URL, a never the browser) | a `INTEGRATION_DESIGN.md §1.2` + a `THREAT_MODEL.md T-04` |
| **NFR-11** (a the static analysis isolation) | a `ST-malicious-file` (a the manifest is analyzed, not executed) | a `ADR-008` + a `THREAT_MODEL.md T-07/T-08` |
| **NFR-12** (a the 99.5% availability + a 30-min tolerance) | a `IT-queue-*` (a the queue durability) | a `TRD.md §18 "the queue is the decoupling point"` |
| **NFR-13** (a the idempotent queue processing) | a `IT-queue-idempotent-redeliver` + a `IT-publish-idempotent` | a `ERROR_HANDLING.md §3` + a `REVIEW_ENGINE_SPEC.md §5` |
| **NFR-14** (a the bounded retries) | a `IT-queue-retry-transient` | a `ERROR_HANDLING.md §3` + a `TRD.md §7` |
| **NFR-15** (a the graceful shutdown) | a *the worker SIGTERM drain* (a a integration test, a `IT-queue-*` the drain) | a `ERROR_HANDLING.md §8` |
| **NFR-16** (a the zero-downtime migration) | a *the `MIGRATION_STRATEGY` the expand/backfill/contract* | a `MIGRATION_STRATEGY.md §2 "the zero-downtime rule"` |
| **NFR-17** (a the horizontal scaling) | a *the worker concurrency + a the queue autoscale* (a a config, a not a PR test) | a `PERFORMANCE_SCALABILITY.md §4 "the scaling model"` |
| **NFR-18** (a the cost backstop: a platform token-spend cap) | a the platform-cap config gate (a `PLATFORM_TOKEN_SPEND_CAP_USD`, a over-cap = a platform alert, a not a customer-visible skip) | a `RATE_LIMITING.md §2` + a `ENVIRONMENT_VARIABLES.md §6 "PLATFORM_TOKEN_SPEND_CAP_USD"` |
| **NFR-19** (a the per-review input budget) | a `UT-budget-degrade` | a `REVIEW_ENGINE_SPEC.md §2 stage [2]` + a `CONTEXT_RETRIEVAL.md §1` |
| **NFR-20..22** (a the structured logs + a the OTel + a the Sentry) | a `OBSERVABILITY` the trace-per-pipeline (a a integration test) | a `OBSERVABILITY.md §1/§2/§4` |
| **NFR-23** (a the health endpoints) | a *the `/healthz` + a `/readyz`* (a a smoke test) | a `OBSERVABILITY.md §6` + a `DEPLOYMENT.md §6` |
| **NFR-24** (a the WCAG AA) | a `a11y-keyboard.spec.ts` + a the axe + a the reduced-motion | a `ACCESSIBILITY.md §6 "the CI gates"` |
| **NFR-25** (a the `prefers-reduced-motion`) | a `a11y-keyboard.spec.ts` (a the reduced-motion run) | a `ACCESSIBILITY.md §4` + a `DESIGN_SYSTEM.md §8` |
| **NFR-26** (a the dark mode) | a *the theme toggle* (a a E2E) | a `DESIGN_SYSTEM.md §4.3 "the dark theme"` |
| **NFR-27..29** (a the retention + a the minimization) | a `IT-retention-01..03` + a `ST-ephemeral-content` + a `ST-context-bound` | a `DATA_RETENTION.md` + a `PRIVACY.md §2` |
| **NFR-30..32** (a the independent deploy + a the `.env` + a the backups) | a *the Docker/Compose smoke* + a the `.env.example` (a a generated artifact) + a the `ops-backup-*` | a `DEPLOYMENT.md` + a `ENVIRONMENT_VARIABLES.md §10` + a `BACKUP_RESTORE.md` |

## 4. The *gate-11* *drift check* (a *the CI check, a `RELEASE_CRITERIA gate-11`*)

The *matrix* is *checked* by a CI job (a the "docs-drift" lane, a `CI_CD.md §1 "the PR lane: a docs [the traceability-matrix drift check]"`):
- **A *new* FR (a a `FUNCTIONAL_REQUIREMENTS` addition)** without a row in this matrix → a gate-11 failure (a "the new FR is un-traced").
- **A *new* test (a a `UT-*`/`IT-*`/`ST-*`/`E2E-*` addition)** without a row → a gate-11 failure (a "the new test is an orphan").
- **A *new* component (a a package/route addition)** without a row → a gate-11 failure (a "the new surface is un-tracked").
- **A *FR whose behavior changed*** (a a git diff on the FR's code) without a *doc update in the same PR* → a gate-11 failure (a "the docs don't match the implementation", a `PHASE 10 step 14`).

**The *matrix* is the *living* artifact that makes "the docs match the implementation" (a `PHASE 10 step 14`) a *measured, CI-checked* property, a not a vibes-check.** A matrix that's *stale* (a a FR added, a row not added) is a *gate-11* failure (a *the docs drift*). A matrix that's *complete* (a every FR/test/component has a row + every doc is traced) is the "docs match" proof.
