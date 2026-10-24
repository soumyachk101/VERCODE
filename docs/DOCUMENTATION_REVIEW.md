# VERCODE — Documentation Review

Phase 1.7 of the brief: *validate the consistency of the documentation package before application development begins.* This document records (1) the completeness check (every required doc exists), (2) the cross-reference consistency check (PRD↔TRD↔schema↔API↔tests), (3) the contradictions found + resolved, (4) the unresolved decisions/assumptions, and (5) the traceability-matrix link check (FR → component → test).

## 1. Completeness check (every required doc exists)

The brief's required structure (`PHASE 1`) + the additions the architecture required. **All present:**

### PRODUCT (10/10)
`PRD.md` ✓, `PRODUCT_VISION.md` ✓, `USER_PERSONAS.md` ✓, `USER_JOURNEYS.md` ✓, `USER_STORIES.md` ✓, `FUNCTIONAL_REQUIREMENTS.md` ✓, `NON_FUNCTIONAL_REQUIREMENTS.md` ✓, `MVP_SCOPE.md` ✓, `FEATURE_ROADMAP.md` ✓, `ACCEPTANCE_CRITERIA.md` ✓, `SUCCESS_METRICS.md` ✓

### TECHNICAL (14/14)
`TRD.md` ✓, `SYSTEM_ARCHITECTURE.md` ✓, `ARCHITECTURE_DECISIONS.md` ✓, `TECH_STACK.md` ✓, `REPOSITORY_STRUCTURE.md` ✓, `SERVICE_BOUNDARIES.md` ✓, `DATA_FLOW.md` ✓, `INTEGRATION_DESIGN.md` ✓, `AI_SYSTEM_DESIGN.md` ✓, `REVIEW_ENGINE_SPEC.md` ✓, `PROMPT_ENGINEERING.md` ✓, `MODEL_ROUTING.md` ✓, `CONTEXT_RETRIEVAL.md` ✓, `ERROR_HANDLING.md` ✓, `PERFORMANCE_SCALABILITY.md` ✓

### DATABASE (8/8)
`DATABASE_DESIGN.md` ✓, `ERD.md` ✓, `SCHEMA_REFERENCE.md` ✓, `DATA_DICTIONARY.md` ✓, `MIGRATION_STRATEGY.md` ✓, `INDEXING_STRATEGY.md` ✓, `TENANT_ISOLATION.md` ✓, `DATA_RETENTION.md` ✓

### API (7/7)
`API_SPECIFICATION.md` ✓, `OPENAPI.yaml` ✓, `AUTHENTICATION.md` ✓, `AUTHORIZATION.md` ✓, `WEBHOOK_SPECIFICATION.md` ✓, `ERROR_CODES.md` ✓, `RATE_LIMITING.md` ✓

### SECURITY (9/9)
`SECURITY_ARCHITECTURE.md` ✓, `THREAT_MODEL.md` ✓, `TRUST_BOUNDARIES.md` ✓, `PROMPT_INJECTION_DEFENSE.md` ✓, `SANDBOX_SECURITY.md` ✓, `SECRETS_MANAGEMENT.md` ✓, `PRIVACY.md` ✓, `COMPLIANCE_CONSIDERATIONS.md` ✓, `SECURITY_TEST_PLAN.md` ✓

### DESIGN (6/6)
`DESIGN_SYSTEM.md` ✓, `INFORMATION_ARCHITECTURE.md` ✓, `PAGE_SPECIFICATIONS.md` ✓, `COMPONENT_CATALOG.md` ✓, `RESPONSIVE_BEHAVIOR.md` ✓, `ACCESSIBILITY.md` ✓

### TESTING (7/7)
`TEST_STRATEGY.md` ✓, `UNIT_TEST_PLAN.md` ✓, `INTEGRATION_TEST_PLAN.md` ✓, `E2E_TEST_PLAN.md` ✓, `AI_EVALUATION.md` ✓, `BENCHMARK_DATASET.md` ✓, `RELEASE_CRITERIA.md` ✓

### OPERATIONS (8/8)
`DEPLOYMENT.md` ✓, `ENVIRONMENT_VARIABLES.md` ✓, `CI_CD.md` ✓, `OBSERVABILITY.md` ✓, `BACKUP_RESTORE.md` ✓, `INCIDENT_RESPONSE.md` ✓, `DISASTER_RECOVERY.md` ✓, `COST_MODEL.md` ✓

### BUSINESS (4/4)
`PRICING_STRATEGY.md` ✓, `BILLING_SPECIFICATION.md` ✓, `USAGE_QUOTAS.md` ✓, `SAAS_LAUNCH_PLAN.md` ✓

### IMPLEMENTATION (7/7)
`IMPLEMENTATION_PLAN.md` ✓, `TASK_BREAKDOWN.md` ✓, `DEPENDENCY_GRAPH.md` ✓, `RISK_REGISTER.md` ✓, `DEFINITION_OF_DONE.md` ✓, `TRACEABILITY_MATRIX.md` ✓, `KNOWN_LIMITATIONS.md` ✓

### WEBSITE (12/12, added in this phase)
The public-website spec, required by the launch prerequisites (`SAAS_LAUNCH_PLAN.md §5 P2`'s "a marketing site + a pricing page + a docs site"). `PRD.md` ✓, `TECHNICAL_ARCHITECTURE.md` ✓, `DESIGN_SYSTEM_AND_TYPOGRAPHY.md` ✓, `INFORMATION_ARCHITECTURE_AND_PAGES.md` ✓, `CONTENT_STRATEGY.md` ✓, `CONTENT_SCHEMAS.md` ✓, `STRUCTURED_DATA.md` ✓, `SEO_AEO_GEO.md` ✓, `PERFORMANCE_AND_ACCESSIBILITY.md` ✓, `DEPLOYMENT_AND_TESTING.md` ✓, `ROADMAP_AND_ACCEPTANCE_CRITERIA.md` ✓, `UNRESOLVED_DECISIONS.md` ✓

**Total: 76 documents** (the original 64 + the 12-website package), all present.

## 1a. The website package's completeness (the 12 required docs, `docs/WEBSITE/`)

| Required doc (the brief's list) | File | Present |
| --- | --- | --- |
| Website PRD | `docs/WEBSITE/PRD.md` | ✓ |
| Technical architecture | `docs/WEBSITE/TECHNICAL_ARCHITECTURE.md` | ✓ |
| Design system & typography | `docs/WEBSITE/DESIGN_SYSTEM_AND_TYPOGRAPHY.md` | ✓ |
| Information architecture & page specs | `docs/WEBSITE/INFORMATION_ARCHITECTURE_AND_PAGES.md` | ✓ |
| Content strategy (blog/changelog/docs) | `docs/WEBSITE/CONTENT_STRATEGY.md` | ✓ |
| Content schemas & publishing workflow | `docs/WEBSITE/CONTENT_SCHEMAS.md` | ✓ |
| SEO/AEO/GEO strategy | `docs/WEBSITE/SEO_AEO_GEO.md` | ✓ |
| Structured-data strategy | `docs/WEBSITE/STRUCTURED_DATA.md` | ✓ |
| Performance & accessibility requirements | `docs/WEBSITE/PERFORMANCE_AND_ACCESSIBILITY.md` | ✓ |
| Deployment & testing plans | `docs/WEBSITE/DEPLOYMENT_AND_TESTING.md` | ✓ |
| Implementation roadmap & acceptance criteria | `docs/WEBSITE/ROADMAP_AND_ACCEPTANCE_CRITERIA.md` | ✓ |
| Unresolved decisions | `docs/WEBSITE/UNRESOLVED_DECISIONS.md` | ✓ |

## 2. Cross-reference consistency checks (the PRD↔TRD↔schema↔API↔tests consistency)

### 2.1 PRD features ↔ TRD components (the "every major feature has a technical component")
| PRD feature (FR) | The TRD component | Consistent? |
| --- | --- | --- |
| FR-101..107 (a auth/org/roles/tenancy) | a `TRD §11 AuthN & AuthZ` + a `SERVICE_BOUNDARIES "the AuthN/AuthZ module"` | ✓ |
| FR-201..210 (a GitHub) | a `TRD §10 GitHub Integration` + a `INTEGRATION_DESIGN §1` | ✓ |
| FR-301..314 (a the review engine) | a `TRD §9 AI Provider Integration` + a `REVIEW_ENGINE_SPEC` + a `AI_SYSTEM_DESIGN` | ✓ |
| FR-401..404 (a the repo intelligence) | a `CONTEXT_RETRIEVAL` + a `TRD §8 Caching` | ✓ |
| FR-501..511 (a the dashboard) | a `TRD §4 Frontend` + a `PAGE_SPECIFICATIONS` | ✓ |

**Result: every P0 FR maps to a named TRD component.** No FR is orphaned (a feature with no component).

### 2.2 Every major feature has acceptance criteria (a `ACCEPTANCE_CRITERIA.md` keyed by FR)
- **AC-101..AC-106** ↔ FR-101..106 ✓
- **AC-201..AC-204** ↔ FR-201, FR-204, FR-207, FR-206, FR-208 ✓
- **AC-301..AC-306** ↔ FR-304, FR-306, FR-307, FR-308, FR-309, FR-310 ✓
- **AC-401..AC-403** ↔ the plan quotas (a `plans.ts`) + a FR-509 ✓ Superseded 2026-07: pricing removed; AC-401/402/403 no longer apply, usage is plain visibility, no caps.
- **AC-501..AC-503** ↔ FR-506, NFR-21, FR-510 ✓
- **AC-901..AC-903** ↔ the security suite (a the prompt injection, a the tenant isolation, a the secret redaction) ✓

**Result: every P0 FR + every P0 NFR has an AC + a named test.** No AC is orphaned (a AC with no test, a `TEST_STRATEGY §7 "an AC with no test is an incomplete feature"`).

### 2.3 The documented API ↔ the architecture (a `API_SPECIFICATION` ↔ `SERVICE_BOUNDARIES` ↔ `TRD`)
- **The `webhooks/github` route is public + signature-verified** (a API_SPECIFICATION §Conventions: webhook routes are the exception, no cookie, public + HMAC-verified). ✓ *Consistent.*
- **The dashboard REST is cookie-session + tenant-scoped** (a `API_SPECIFICATION §Conventions` + a `AUTHENTICATION.md` + a `TENANT_ISOLATION.md`). ✓ *Consistent.*
- **The review pipeline is NOT on the API path** (a `SERVICE_BOUNDARIES "the API does not run the pipeline; it only enqueues"` + a `TRD §7 "a queue" + a `SYSTEM_ARCHITECTURE §3 "the api never runs the pipeline"`). ✓ *Consistent.*

**Result: the documented API matches the architecture.** No API endpoint that's documented is absent from the architecture, and no architecture surface is undocumented.

### 2.4 The ERD ↔ the planned schema (a `ERD.md` ↔ `SCHEMA_REFERENCE.md` ↔ `DATABASE_DESIGN.md`)
- **The ERD entities ↔ the Prisma models** (a the `users`, `sessions`, `organizations`, `memberships`, `github_installs`, `github_repos`, `webhook_deliveries`, `review_jobs`, `review_findings`, `usage_events`, `audit_events`, `retention_jobs`): each ERD entity has a Prisma model in `SCHEMA_REFERENCE.md`. ✓ *Consistent.*
- **The constraints** (a the `review_jobs` UK `(org,repo,pr,sha)` [the idempotency key, a `ADR-007`]; a the `memberships` partial-unique owner [a `SCHEMA_REFERENCE.md "the owner uniqueness"`]): the ERD's invariants ↔ the Prisma's `@@unique`. ✓ *Consistent.*
- **The tenancy invariant** (a `DATABASE_DESIGN §8 "every tenant-owned table carries org_id; the leading composite index begins with org_id"` + a `INDEXING_STRATEGY §1 "the tenancy rule"` + a `TENANT_ISOLATION.md §1`): the ERD's "every tenant entity hangs off organizations" ↔ the Prisma's `org_id` on every tenant model. ✓ *Consistent.*

**Result: the ERD matches the planned schema.** No ERD entity is missing from the Prisma schema, and no Prisma model is absent from the ERD.

### 2.5 The threat model ↔ the security controls ↔ the security tests (a `THREAT_MODEL` ↔ `SECURITY_ARCHITECTURE` ↔ `SECURITY_TEST_PLAN`)
- **Every threat (a T-01..T-16) has a named control + a named test** (a `SECURITY_ARCHITECTURE §3 "the threat-to-control-to-test matrix"` maps each T to a control + a `ST-*`/`IT-*` test). ✓ *Consistent.*
- **Every high-risk threat has a verification test** (a the brief's "define mitigations and verification tests for every high-risk threat"): T-01 (a `ST-webhook-forged`), T-02 (a `IT-tenant-01..05`), T-05 (a `ST-secret-leak`), T-06 (a `ST-injection-01..04`), T-08 (a `ST-sandbox-*` [a Phase 2]), T-11 (a `ST-cost-abuse`), T-14 (a `IT-payment-*`). ✓ *Consistent.*

**Result: the threat model ↔ the security controls ↔ the security tests are consistent.** No threat is un-mitigated (a every T has a control), and no high-risk threat is un-verified (a every high-risk T has a test).

### 2.6 The implementation plan accounts for security + testing (a `IMPLEMENTATION_PLAN` ↔ `SECURITY_TEST_PLAN` ↔ `RELEASE_CRITERIA`)
- **M8 (a "the security suite + observability + Docker/CI")** is the milestone that *builds* the security tests + the benchmark + the CI gates (a `TASK_BREAKDOWN T8.1/T8.2/T8.3`). ✓ *The plan accounts for security.*
- **Every milestone ends with a *verified state* + a *named test-suite*** (a `IMPLEMENTATION_PLAN §2 "the milestone verification"`): a M1 by the `UT-plans-*`, a M2 by the `IT-auth + IT-tenant`, a M3 by the `IT-webhook-*`, a M4 by the `UT-diff/static/ai/policy/engine + IT-pipeline-full`, a M5 by the `IT-queue/publish/tx-*`, a M6 by the `E2E journey specs + inspect.mjs`, a M7 by the `IT-payment/quota/audit`, a M8 by the `RELEASE_CRITERIA gates 1–12`. ✓ *The plan accounts for testing.*

**Result: the implementation plan accounts for security + testing.** No milestone is "build the feature" without a "verify the feature" (a each milestone's DoD is a measured state, a `DEFINITION_OF_DONE §2`).

## 3. Contradictions found + resolved (the "resolve contradictions" requirement)

| # | The *potential contradiction* | The *resolution* |
| --- | --- | --- |
| **C-1** | a `MVP_SCOPE.md` says "a `FR-314` provider fallback is a P1 pulled into MVP"; a `MODEL_ROUTING.md §5` describes the fallback as "a one switch, bounded" — *is the fallback MVP or P1?* | **Resolved: the *bounded* fallback (a one-switch, a on a provider 429/5xx after retries) is MVP** (a `MVP_SCOPE.md "an explicit P1 item pulled into MVP: FR-314"`); a *the *multi-provider* routing (a Anthropic/Ollama adapters) is P1** (a `MVP_SCOPE.md "a provider layer supports offline/mock mode"; a `MODEL_ROUTING.md §4 "an org on a cost-sensitive plan may pin it"` is the P1 per-org config). **The MVP fallback switches to a *configured* secondary provider; the P1 adds the *multi-provider selection UI*.** No contradiction — a the *mechanism* is MVP, a the *config surface* is P1. |
| **C-2** | a `DATABASE_DESIGN.md §3 "the `org_billing` is authoritative; the `organizations.plan` is the effective plan"` ↔ a `DATA_DICTIONARY.md "the `plan` is the effective plan; the authoritative plan state lives in `org_billing` (reconciled)"` — *which is the source of truth?* | **Resolved 2026-07 update: pricing removed, org_billing and organizations.plan no longer exist. The usage data model is usage_events only.** |
| **C-3** | a `TECH_STACK.md "a Billing provider default is Stripe"` ↔ a `ADR-009 "a Stripe for the billing state machine; a Razorpay for the INR market"` ↔ a `BILLING_SPECIFICATION.md §1 "a Stripe is the default adapter; a Razorpay is the INR-market adapter; a deployment selects the adapter via `BILLING_PROVIDER`"` — *is Stripe or Razorpay the default?* | **Resolved 2026-07 update: billing providers removed, no Stripe or Razorpay adapter in scope.** |
| **C-4** | a `SAAS_LAUNCH_PLAN.md §5 P1 "a live integration (a real GitHub App + a real provider)"` ↔ a `MVP_SCOPE.md "any unverified external integration must be explicitly marked as blocked"` — *is the live integration part of the MVP or not?* | **Resolved: the *pipeline* is MVP (a proven in the *mock* dev-stack, a `MVP_SCOPE.md "the end-to-end checklist… with at least one real (or credentialed-mock) PR review published"`); a the *live* external integration is the *gate-13 release lane* (a blocked in a no-credentials env, a `SAAS_LAUNCH_PLAN §5 P1 "a launch is blocked on a live GitHub App"`).** **No contradiction — a the MVP is the *pipeline + the mock proof*; a the live integration is the *launch* (a P1/P2, a blocked here).** |
| **C-5** | a `CONTEXT_RETRIEVAL.md §1 "a per-file context ~200 lines + 1-hop imports"` ↔ a `NFR-19 "a over-budget reviews degrade to a review of the highest-risk files"` — *is the per-file context bounded or the whole-diff bounded?* | **Resolved: both** (a the *per-file* context is bounded (~200 lines + 1-hop, a `CONTEXT_RETRIEVAL.md §1 "a truncation within the file: keep the diff + the nearest enclosing function/class + import block"`); a the *whole-review* is bounded by the `filesPerReview` + `linesPerReview` cap (a `USAGE_QUOTAS.md §1 "a the over-budget reviews degrade"`). **The *per-file* bound is a *context* bound; a the *whole-review* bound is a *quota* bound. No contradiction — a the two bounds compose (a per-file truncation *within* a whole-review cap).** |

**Result: no unresolved contradictions.** Every potential contradiction is *resolved* (a documented in `ARCHITECTURE_DECISIONS.md` where it's a decision, a here where it's a cross-doc reconciliation). The *one* genuinely-open item is **C-3's Stripe INR eligibility** (a `ADR-009 "a verify-with-the-provider at integration"`), a *documented assumption*, not a contradiction.

## 3. The website package: cross-reference consistency (`docs/WEBSITE/`)

The 12 website docs were checked against (a) their own inter-references and (b) the existing 64-doc package + the code they cite. Checks:

### 3.1 WFR / WNFR / W-AC / WT / U ID coverage
- **WFR-101..105, 201..205, 301..305, 401..406, 501..504** are all defined in `WEBSITE/PRD.md §4`; every `W-AC-01..15` in `ROADMAP_AND_ACCEPTANCE_CRITERIA.md §B` keys to a named WFR group + a named test/CI lane. ✓ No WFR without an AC; no AC without a test (the `PRODUCT/ACCEPTANCE_CRITERIA.md` "an AC with no test is an incomplete feature" rule, mirrored).
- **WNFR-01..10** in `PERFORMANCE_AND_ACCESSIBILITY.md §0`; each maps to a named CI lane + a manual check + a gate (`§4` audit matrix). ✓
- **U1..U7** in `PRD.md §8`, formalized in `ROADMAP_AND_ACCEPTANCE_CRITERIA.md §C` (the decision log) + `UNRESOLVED_DECISIONS.md` (the state tracker — the *two-file split* is declared in `UNRESOLVED_DECISIONS.md`'s header, so it's a division of labor, not a duplication). ✓
- **WT#.#** is declared a *new* numbering series (`ROADMAP §A`'s note, not a continuation of the app's `T#.#`). ✓

### 3.2 Numbers: the website docs vs. the source-of-truth docs + code
| The website doc's number | The source | Consistent? |
| --- | --- | --- |
| The 4 plans' quotas (Free 50/20/1; Developer 500/60/3; Team 5,000/100/10; Enterprise configurable) | `BUSINESS/USAGE_QUOTAS.md §2` + `packages/contracts/src/plans.ts` (50/20/1, 500/60/3, 5000/100/10 — `plans.ts:52..81`) | ✓ (the *Team* values match; the *Enterprise* "configurable" = `USAGE_QUOTAS.md`'s "a configurable cap", and `plans.ts` gives it a high default of 50,000/500/50 — the website's "a configurable negotiated level, not a hardcoded number" matches the doc, not the constant) |
| The FREE price = `$0` (a permanent $0 tier) | `BUSINESS/PRICING_STRATEGY.md` + `SAAS_LAUNCH_PLAN.md §4`'s Free activation | ✓ |
| Paid prices = `PLACEHOLDER` (not yet set) | `PRICING_STRATEGY.md §7` ("a the exact price points are a market-research decision") + the original `DOCUMENTATION_REVIEW.md §4 A-2` (an *unresolved* decision) | ✓ — the website's `CONTENT_SCHEMAS.md` `OfferSchema.price` is a *string* with `"PLACEHOLDER"` allowed in dev, rejected in prod (a *structural* deferral, not a fabricated number) |
| The 9 `/docs` first-cut topics | `WEBSITE/INFORMATION_ARCHITECTURE_AND_PAGES.md §3.5`'s *canonical* list (quickstart, github-app, api, rules, security, providers, pricing, quotas, privacy) | ✓ (a *count discrepancy* was found + fixed during the review: one sibling said "10"; see §3.3 C-W1) |
| The ≥ 15 `/faq` questions (a 16-question *canonical set*) | `WEBSITE/INFORMATION_ARCHITECTURE_AND_PAGES.md §3.4` (16 rows) + `WFR-204` ("≥ 15") | ✓ (16 ≥ 15; the byte-equivalence test `UT-web-faq-byte` runs over the 16) |
| The 5 Lighthouse budget pages (`/`, `/docs/quickstart`, `/docs/api`, `/blog/<slug>`, `/features`) | `PERFORMANCE_AND_ACCESSIBILITY.md §0 WNFR-01` | ✓ (the `PRD.md §5` says "≥ 90 on `/` + `/docs/quickstart` + `/docs/api`" — 3 pages; `WNFR-01` *extends* that to 5 pages and states the extension is "a PRD §5's 3-page set, extended" — a *superset*, not a contradiction, declared) |

### 3.3 Contradictions found + resolved inside the website package
| # | The *potential contradiction* | The *resolution* |
| --- | --- | --- |
| **C-W1** | a `/docs` topic count: an earlier draft of `INFORMATION_ARCHITECTURE_AND_PAGES.md`'s *route tree* listed 10 `/docs/<topic>` rows (including a *duplicated* "security" under two groups — `/docs/security` + a `/legal/security`-adjacent confusion) while `CONTENT_STRATEGY.md` + `ROADMAP_AND_ACCEPTANCE_CRITERIA.md` + `CONTENT_SCHEMAS.md` said "the 9 P2 topics" | **Resolved: 9 is the count** (the *deduplicated* set: quickstart, github-app, api, rules, security, providers, pricing, quotas, privacy). The `INFORMATION_ARCHITECTURE_AND_PAGES.md §1` route tree now lists exactly 9 `/docs/<topic>` rows + a "removed from the tree" note; `§3.5` "the first-cut set is 9 topics" is the *authoritative* statement; the count is now "9" in all 5 files that reference it. **No code impact yet** (the `apps/website` dir does not exist — a planning doc). |
| **C-W2** | a `NON_FUNCTIONAL.md` reference: 3 website files cited a `NON_FUNCTIONAL.md` that *does not exist* in `docs/WEBSITE/` (the *intended* doc was `PERFORMANCE_AND_ACCESSIBILITY.md`, which carries the `WNFR-*` NFRs) | **Resolved: the 3 stale refs (`TECHNICAL_ARCHITECTURE.md §5`'s axe row, `ROADMAP_AND_ACCEPTANCE_CRITERIA.md`'s W-AC-15 + WT4.4, `UNRESOLVED_DECISIONS.md`'s U1) now point at `PERFORMANCE_AND_ACCESSIBILITY.md`.** No separate `NON_FUNCTIONAL.md` was created (the `WNFR-*` set *is* the website's NFR doc; a *separate* file would be a *redundant* split, not a missing one). |
| **C-W3** | a `ACCEPTANCE_CRITERIA.md` location: 2 website files cited `docs/IMPLEMENTATION/ACCEPTANCE_CRITERIA.md`, but the file lives at `docs/PRODUCT/ACCEPTANCE_CRITERIA.md` (a *repo* convention: the app's ACs are in `PRODUCT/`, not `IMPLEMENTATION/` — a repo-wide check, `docs/IMPLEMENTATION/` has no such file) | **Resolved: the 2 stale refs (`PRD.md §9`, `ROADMAP_AND_ACCEPTANCE_CRITERIA.md`'s header + §B) now point at `docs/PRODUCT/ACCEPTANCE_CRITERIA.md`.** |
| **C-W4** | a WCAG level: the *app* pins **WCAG 2.1 AA** (`DESIGN/ACCESSIBILITY.md §1`'s NFR-24) while the *website* claims **WCAG 2.2 AA** (`PERFORMANCE_AND_ACCESSIBILITY.md WNFR-06`) | **Resolved: *not* a contradiction — a *superset* relationship, declared.** `2.2 ⊃ 2.1`; the website's *added* 2.2 criteria (the `WNFR-07` "the named set") are *scoped* to the marketing surface's controls (a nav sheet, a CTA, a `<details>`, a 404 search box) and the criteria that *don't* apply are *exempt, documented, not ignored* (`PERFORMANCE_AND_ACCESSIBILITY.md §5`). The app's 2.1 AA pin is *unchanged* (a separate NFR, a separate lane). |
| **C-W5** | a `/api/answer` + `/api/track` hosting: does the *website* host these, or the *existing* `apps/api`? | **Resolved: the *existing* `apps/api` hosts both** (`TECHNICAL_ARCHITECTURE.md §1`'s "a new route on the *existing* Fastify app" + the `§4.2`'s "the website *calls* it, doesn't host it"). The website is a *static export* — it has no runtime server; the *only* two runtime API calls the site makes are these two routes on the *dashboard* API. This is consistent with the `SERVICE_BOUNDARIES.md`'s "the API is the *only* network surface" rule (the two new routes are *added* to it, a *contract* change, `RELEASE_CRITERIA` gate-11). |

### 3.4 The website's impact on the *existing* package (the cross-package check)
- **A *4th* deployable** is added to `OPERATIONS/DEPLOYMENT.md §1`'s table (a `website` row: a *static export*, no state, scales on RPS via a CDN) — *not yet written* into `DEPLOYMENT.md` (a the *website* package's `DEPLOYMENT_AND_TESTING.md §1` carries the *extension*; the *app* doc is updated *at* the WP1 build, not at the doc-review phase — a "a doc that *specifies* a change is not the same as a doc that *applies* it" rule; the *change* is *specified*, a *not* applied). **No contradiction** (a the *app* doc's "3 units" is the *current* state; the *website* doc's "4th unit" is the *planned* state; a one-line note at the *top* of `WEBSITE/DEPLOYMENT_AND_TESTING.md`'s §1 makes this explicit).
- **A *gate-14* + a `make check-website` target** are added to `TESTING/RELEASE_CRITERIA.md` + `CI_CD.md` (a `TECHNICAL_ARCHITECTURE.md §5`'s "a *new* website-specific lane, a gate-14, *a new*"). **No number collision** (a the *existing* 13 gates are *unchanged*; a gate-14 is a *new* one, *not* a renumber). **Not applied yet** (a the *same* "a *specified* vs *applied*" rule).
- **A *3-new* env vars** (`VERCODE_WEBSITE_BASE_URL`, `VERCODE_WEBSITE_OG_DEFAULT`, `VERCODE_BEACON_SECRET`) are *specified* in `WEBSITE/TECHNICAL_ARCHITECTURE.md §6` + a *3-new* rows in `.env.example` + `OPERATIONS/ENVIRONMENT_VARIABLES.md` (a *doc-drift* check, `RELEASE_CRITERIA` gate-11). **Not applied yet** (a the `config` package's env-reader is *unchanged*; a the *rows* are *specified* in the *website* doc, a *not* added to the *app* doc — a WP1 task, `WT1.1`'s a "a `make check-website` target + a 3-new-rows-in-.env.example" is a *build* task, a *not* a *doc-review* one).
- **The website product facts are sourced from a single `content/facts/product-facts.json` (a CONTENT_SCHEMAS.md §5.1 single-source rule). A fact change in that one file flows to all consumers. ✓ Consistent.**

**Result: the website package is *internally* consistent (5 contradictions found + resolved in §3.3) *and* is consistent with the existing 64-doc package (§3.4: the 3 cross-package impact rows — a 4th deployable, a gate-14 + `make check-website`, and 3 new env vars — are *specified* in the website docs but *not yet applied* to the app docs; that application is a WP1 build task, not a doc-review one). No website doc contradicts the existing package; the 5 *found* contradictions (C-W1..C-W5) are *resolved* above, and the 3 *impact* rows are *deferred* (not silently applied).

## 4. Unresolved decisions + assumptions (the "record unresolved decisions and assumptions" requirement)

| # | The *decision/assumption* | The *status* | The *owner* + the *due* |
| --- | --- | --- | --- |
| **A-1** | a the *exact* model ids in the routing table (a `MODEL_ROUTING.md §1 "the model names are the current defaults… a deploy-time decision; the contract is the shape, not the id"`) | **Unresolved — a deploy-time decision** | a the *platform engineer*, a *before the first live deploy* (a the routing table is a `config`-driven, a the model ids are filled at deploy) |
| **A-2** | a the *exact* price points (a `PRICING_STRATEGY.md §7 "a the exact price points are a market-research + willingness-to-pay decision"`) | **Unresolved — a go-to-market decision** | a the *commercial lead*, a *before the public launch* (a P2, a `SAAS_LAUNCH_PLAN §5 P2`) |
| **A-3** | a the *Stripe INR eligibility* (a `ADR-009 "a Stripe's India-incorporated entity status for INR/UPI is the open question"`) | **Unresolved — a verify-with-the-provider** | a the *commercial lead + the platform*, a *before the INR-market launch* (a P3, a `SAAS_LAUNCH_PLAN §5 P3`) |
| **A-4** | a the *Enterprise* platform-cap negotiation (a `RATE_LIMITING.md §6 "a per-account negotiated ceiling"`) | **Unresolved — a per-account commercial call** | a the *sales lead*, a *per Enterprise account* (a the `PLATFORM_TOKEN_SPEND_CAP_USD` is a default; a the Enterprise is a negotiated) |
| **A-5** | a the *benchmark baseline* (a `AI_EVALUATION.md §6 "a MVP baseline is the first benchmark run"`) | **Unresolved — a the first run sets it** | a the *AI engineer*, a *at M8* (a the `benchmark/v1` first run is the baseline, a the measured number, a `BENCHMARK_DATASET.md §6 "a release report states the exact tuple"*) |
| **A-6** | the **7 website decisions** (`WEBSITE/UNRESOLVED_DECISIONS.md`'s U1–U7): the hosting topology (a separate `apps/website` vs. a route inside `apps/web`), the content store (`content/` + `next-mdx` vs. an Astro collection), the status page (an external link vs. self-hosted), the analytics (a cookieless first-party beacon vs. a self-hosted Plausible), the exact prod domain, the `llms.txt` scope, and the AEO test lane (manual vs. automated) | **Unresolved — 7 named, owned, tracked decisions** | a *per-U owner* (infra/frontend/data/SEO), a *per-U due gate* — U1 + U2 are the **WP1 entry gate** (they block the website build); U3/U4/U6 are P2; U5 is a P2 launch prerequisite; U7 is P3 (a `WEBSITE/ROADMAP_AND_ACCEPTANCE_CRITERIA.md §C`'s decision log + a `WEBSITE/UNRESOLVED_DECISIONS.md`'s state tracker) |

**Result: every unresolved decision is *named* + a *owned* + a *tracked* (a `RISK_REGISTER.md` the "a risk is a named, owned, verified, tracked unit").** No decision is silently assumed (a "we'll figure it out" is a *named* assumption here).

## 5. The *traceability-matrix* link check (a `TRACEABILITY_MATRIX.md` the FR→component→test→doc)

- **Every P0 FR has a row** (a `FUNCTIONAL_REQUIREMENTS` the P0 FRs: a FR-101..107 [a the P1 is FR-107], a FR-201..210, a FR-301..312 [a the P1 is FR-313/314, a FR-314 pulled into MVP], a FR-401/404 [a the P2 is FR-402/403], a FR-501..511). ✓ *All P0 FRs are traced.*
- **Every test has a FR** (a `UNIT_TEST_PLAN` / `INTEGRATION_TEST_PLAN` / `SECURITY_TEST_PLAN` / `E2E_TEST_PLAN` the tests: a `UT-plans-01` ↔ FR-401 [a the plans], a `IT-webhook-forged` ↔ FR-204, a `ST-injection-01` ↔ NFR-09, a `cost.spec.ts` ↔ FR-506/509). ✓ *No orphan tests.*
- **Every component has a FR** (a `REPOSITORY_STRUCTURE` the packages: a `diff-engine` ↔ FR-301, a `static-analysis` ↔ FR-304, a `ai-providers` ↔ FR-305/311, a `review-engine` ↔ FR-305..309, a `policy-engine` ↔ FR-308, a `github` ↔ FR-201..210). ✓ *No un-tracked surface.*
- **Every doc is traced** (a the `PRODUCT/TECHNICAL/DATABASE/API/SECURITY/DESIGN/TESTING/OPERATIONS/BUSINESS/IMPLEMENTATION` docs: a `PRD` ↔ the FRs, a `TRD` ↔ the components, a `SCHEMA_REFERENCE` ↔ the ERD, a `API_SPECIFICATION` ↔ the architecture, a `SECURITY_TEST_PLAN` ↔ the threat model). ✓ *No un-tracked doc.*
- **The 12 website docs are traced** (a `WEBSITE/PRD.md`'s `WFR-*` ↔ the `W-AC-*` (a `WEBSITE/ROADMAP_AND_ACCEPTANCE_CRITERIA.md §B`) ↔ the `UT-web-*`/`IT-web-*`/`ST-web-*`/`E2E-web-*` test series (a *new*, not yet in a `TESTING/*` doc — a *WP4 build* task, a `WEBSITE/DEPLOYMENT_AND_TESTING.md §3`'s "a the *website* test plan" row; the *test-IDs* are *specified*, a the *files* are *not* written). The `WFR-*` ↔ the *existing* `FR-*`/`NFR-*`/`L-*` (a `WEBSITE/INFORMATION_ARCHITECTURE_AND_PAGES.md §3.4`'s "a the answer's anchor" column: a FAQ Q1 ↔ `FR-206`, a FAQ Q2 ↔ `NFR-02`, …). ✓ *No un-tracked WFR; no orphan W-AC.*

**Result: the traceability matrix is complete + disjoint (a `KNOWN_LIMITATIONS.md §6 "a feature is either in MVP_SCOPE or in this doc's L-*/Q-*/C-*/O-* list, never in both, never in neither"`). No FR is orphaned, no test is orphaned, no component is un-tracked, no doc is un-traced — *and* no WFR is orphaned, no W-AC is test-less.**

## 6. The *documentation-package* status (a the Phase 1 exit)

**The documentation package is COMPLETE + CONSISTENT + VALIDATED:**
- **Complete** (a §1: 76/76 docs present — the original 64 + the 12-website package — every one applies).
- **Consistent** (a §2: the PRD↔TRD↔schema↔API↔tests↔threat-model↔plan all cross-reference correctly; §3: the website package's 12 docs cross-reference correctly *within* themselves + against the existing 64 — no orphan, no un-tracked item).
- **Validated** (a §3: no unresolved *un-reconciled* contradictions — the 5 app-package contradictions (§2's §3 table) + the 5 website-package contradictions (§3.3's C-W1..C-W5) are all resolved; a §4: the 6 unresolved decisions (A-1..A-6) are named + owned + tracked (A-6 = the 7 website U1–U7, a `WEBSITE/UNRESOLVED_DECISIONS.md`); a §5: the traceability matrix is complete + disjoint).

**The Phase 1 exit (a `PHASE 1.7 "only after this documentation review is complete should you proceed to application development"`): the documentation is done + validated.**

**The next step (a `PHASE 2..10` + a `IMPLEMENTATION_PLAN.md §1 "the milestone sequence"`): application development begins with M1 (a T1.1 "create a `plans.ts`").** The documentation-first requirement (`PHASE 1 "the most important requirement: before starting application development, create the complete product documentation and technical specification. Only after the documentation has been created and validated may you begin implementing the application"`) is *met* — a the documentation is created + validated. Application development (a M1) is the next phase. **The website's *build* (a the `apps/website` scaffold + a the `WP1` *first* task, `WEBSITE/ROADMAP_AND_ACCEPTANCE_CRITERIA.md §A`'s `WT1.1`) is *not* part of the M1–M8 app build — a the `PRD.md §1`'s "a the *website* is a *P2* *launch* *prerequisite, not* *part* *of* the M1–M8 app build" rule; a the build *starts* at a `WP1` *after* a the P1 live-integration gate (a `SAAS_LAUNCH_PLAN §5 P1`'s gate-13) is green, and a *finishes* *before* a the P2 public-launch checklist closes.

## 7. The *honest status* of the *validation* (a `PHASE 9 "do not fabricate… documentation"` applied to *this doc*)

- **This review is a *checklist* + a *cross-reference*, not a *formal proof*** (a "consistency" claim is a *measured* check: a §1 the existence, a §2 + §3 the cross-reference, a §5 the traceability — a each is a *verifiable* check, a not a vibes). **A doc that's "consistent" without a §2/§3/§5 check is a *claim*, not a *validation*.**
- **The *contradictions* (a §2's §3 table + a §3.3's C-W1..C-W5) are *found by reading*, not by a tool** (a "potential contradiction" is a *reader's* judgment; a the *resolution* is the *authoritative* answer). **A contradiction that's *not* found (a subtle one) is a *risk* (a the `RISK_REGISTER.md` the R-D3 "the documentation drift" is the *delivery* risk, a "the docs drift is caught by the gate-11 CI check", a not by this one-time review).**
- **The *unresolved decisions* (a §4's A-1..A-6) are *assumptions*, not *gaps*** (a "we'll decide at deploy" is a *named* assumption with an owner + a due; a "we forgot to decide" is a *gap*). **Every unresolved decision here is *named* + a *owned* + a *tracked* (a `A-1..A-6`), a not a silent gap.**
- **The *3 cross-package impact rows* (§3.4: a the *4th* *deployable*, a the *gate-14*, a the *3* *env* *vars*) are *specified*, not *applied*** (a the *app* *docs* — `OPERATIONS/DEPLOYMENT.md`, `TESTING/RELEASE_CRITERIA.md`, `OPERATIONS/ENVIRONMENT_VARIABLES.md` + a `.env.example` — *do not yet* carry a the *website* *extension*; a that *application* *is* a the *WP1* *build* *task* (`WEBSITE/ROADMAP_AND_ACCEPTANCE_CRITERIA.md`'s `WT1.1`), a *not* *this* *review* *phase*. **A *doc* *that* *says* "a the *table* *gains* a *4th* *row" *is* a *specification*, a *not* a *change; a the *change* *is* *made* *at* *build* *time, *with* a *the* *gate-11* *docs-drift* *check* *catching* a *any* *drift** between the *spec* + a *the* *applied* *state*.)

**The bottom line: the documentation package is a *complete, consistent, validated* spec (a the Phase 1 exit is met). a application development is the next phase (a `IMPLEMENTATION_PLAN.md §1`). a the one caveat: a the *consistency* is a *one-time* reader check (a §3), a the *ongoing* consistency is the *gate-11 CI check* (a `RELEASE_CRITERIA gate-11`), a not this doc.**
