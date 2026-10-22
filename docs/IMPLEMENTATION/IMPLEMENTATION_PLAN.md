# VERCODE — Implementation Plan

The *ordered* build plan, in milestone units that each end with a *coherent, verifiable* increment (the "finish the current coherent unit of work, document the exact state, identify the next concrete task" rule, `PHASE 9`). The *documentation package is complete* (this is `PHASE 1`'s exit — every doc in `docs/` exists + is cross-referenced, `DOCUMENTATION_REVIEW.md` validates it); *implementation* now begins.

## 0. The *state* of the repo at the start of implementation (the *discovery* + the *doc* work is done)

- **The *contracts* package is *partially* built** (a `packages/contracts/src/index.ts` with the *finding/job/plan* schemas + a *re-export* of a *missing* `plans.js`, `PROJECT_DISCOVERY §4.1`). The *first* implementation task is to *create* `plans.ts` (closing the *broken* import), then the *rest* of the plan.
- **The *docs* package is *complete*** (the `docs/` tree, every doc, the *traceability matrix*, the *DOCUMENTATION_REVIEW*). The *implementation* is now *built against* the *docs* (a *doc-first*, a *not* a *code-first* — a *code change* that *diverges* from a *doc* is a *docs-drift* gate-11 failure, `RELEASE_CRITERIA`).
- **The *auto-sync* daemon is *live*** (a `scripts/run_loop.sh` → `auto_sync.sh`, a *dirty-tree* auto-merge). The *implementation* is *committed in small, coherent units* (a *D-5* in `PROJECT_DISCOVERY §7 "commit discipline is a requirement of this repo"`).

## 1. The *milestone* *sequence* (the *ordered* build, each *verifiable*)

### M1 — the *contracts + plans* foundation (the *closed* gap, `PROJECT_DISCOVERY §4.1`)
- **Create `packages/contracts/src/plans.ts`** (a `Plan` type + a `PlanQuota` + a `planQuota(plan)` resolver + the *four* `*_QUOTA` constants, `AC-401` — the *`packages/contracts/src/index.ts` re-export of `./plans.js` is the *closed* import).
- **The *contracts* package `package.json` + a `tsconfig`** (a *workspace* entry, a *NodeNext* + `verbatimModuleSyntax`, the `.js` extension rule, `PROJECT_DISCOVERY §4.3`).
- **A *`UT-plans-01` *import-identity test* + a *`UT-plans-02` *plan-lookup test*** (`UNIT_TEST_PLAN §2` "the `plans.ts` import identity: the four quota constants + planQuota are the source of truth; a grep-level assertion that no other package hardcodes the numbers").
- **The *verified* state:** `pnpm typecheck` + `pnpm test` (the `UT-plans-*`) green; the *broken import* closed; the *contracts* package *complete*.
- **The *next concrete task*:** M2.

### M2 — the *auth + org + roles + tenancy* (the *identity + tenancy core*, `SERVICE_BOUNDARIES` "the authn/authz module")
- **The *`config`* package** (a `loadConfig()` → a typed `AppConfig`, a *env* parser + a *validation*, `ENVIRONMENT_VARIABLES §9 "a variable not in the doc doesn't exist; the config package validates the exact set"`).
- **The *`database`* package** (a *Prisma schema* — the *full* schema in `SCHEMA_REFERENCE.md` — + a *migration* + a *tenant-scoped repository* (a *`orgId` first arg*), `DATABASE_DESIGN` + `TENANT_ISOLATION` "every tenant-owned table's leading composite index begins with org_id").
- **The *authn* (a *signup*, a *signin*, a *session* (a *Redis-backed*, a *signed* HTTP-only cookie, a *server-side revocation*), a *sign-out*, a *sign-out-everywhere*, a *verify-email*, a *lockout* on 5 fails, `AUTHENTICATION.md`).
- **The *orgs* (a *create org*, a *memberships*, a *roles* (a *capability matrix*, `AUTHORIZATION §1`), an *invite* + *accept*, a *role change*, a *remove*, a *the one-owner invariant* (a *partial-unique index* + a *service check*, `SCHEMA_REFERENCE` "the owner uniqueness")).
- **The *tenant middleware* + the *capability middleware* (a *tenancy* 404 [no oracle, AC-902] + a *capability* 403, `TENANT_ISOLATION §2` "the 404-vs-403 split matters").**
- **The *verified state:* `IT-auth-*` + `IT-authz-*` + `IT-tenant-01..05` green; a *sign-in* + a *create org* + a *role change* + a *cross-tenant 404* *demonstrable*; the *tenant-isolation test* *re-run on the schema* (a *`TENANT_ISOLATION §5` "re-run on every schema change"*).**
- **The *next concrete task*:** M3.

### M3 — the *GitHub App + webhooks* (the *ingress*, `INTEGRATION_DESIGN §1`, `WEBHOOK_SPECIFICATION`)
- **The *`github`* package** (a *GitHub App auth* (a *App JWT* → an *installation token* [a *cached at 50% lifetime*]), a *`verifyWebhook()`* (a *HMAC* + a *timestamp window* + a *delivery dedup*), a *`fetchPRDiff()`*, a *`publishReview()`*, a *rate-limit handling*, a *per-installation throttler*).
- **The *`webhooks/github` route* (a *verify + receipt + enqueue* [a *no LLM*, NFR-04], a *`webhook_deliveries`* receipt, a *event routing* (a *`installation`* / a *`pull_request`* / a *`pull_request_review`*), `WEBHOOK_SPECIFICATION §1.2`).
- **The *install flow* (a *server-side install URL*, a *never-exposed-to-the-browser*, `FR-210` "an installation credential is never exposed to the browser").
- **The *repo discovery* (a *`installation_repositories`* upsert / a *disable*, `FR-202`).
- **The *install removal* (a *`installation.deleted`* → an *inactive install* + a *`disconnected`* repo + a *content-purge schedule* [a *`retention_jobs`* row], `AC-204`).
- **The *verified state:* `IT-webhook-*` (a *forged* → 401, a *replay* → 200 no-op, a *stale* → 401, a *malformed* → 422, a *opened* → enqueued) green; the *idempotency* (a *same-SHA* no-op, `IT-idempotency-01`) verified.
- **The *external* *blocker* (a *honest* *mark, `PHASE 10`): a *real* GitHub App is a *live-integration-blocked* in a *no-credentials* env (a *mock GitHub* proves the *pipeline*; a *live App* is the *gate-13* release lane, `CI_CD §4`).**
- **The *next concrete task*:** M4.

### M4 — the *review pipeline* (the *deterministic-first core*, `REVIEW_ENGINE_SPEC`, `AI_SYSTEM_DESIGN`, `ADR-005`)
- **The *`diff-engine`* (a *`parseUnifiedDiff()`* → a *`ChangeSet`* + a *line map*; a *`resolveAnchor(file, line, side)`*; a *pure*, no I/O, `REVIEW_ENGINE_SPEC` "the diff parser + line map is the most-tested pure code in the repo").
- **The *`static-analysis`* (a *ESLint + Semgrep* runner, a *deterministic finding* (a *`source: eslint|semgrep`*, a *no confidence floor* [they're rules, not guesses], `REVIEW_ENGINE_SPEC §2 stage [4] "the static findings are authoritative for their classes")).
- **The *`ai-providers`* (a *`AIProvider` interface* + a *OpenAI / Anthropic / Ollama / mock* adapter; a *`completeStructured()`* [a *JSON-schema constrained*]; a *routing table*; a *cost capture*; a *bounded retry*; a *provider fallback*, `AI_SYSTEM_DESIGN` + `MODEL_ROUTING`).
- **The *`review-engine`* (the *orchestrator*, `REVIEW_ENGINE_SPEC §2` the *12 stages* [a *pre-flight quota gate*, a *same-SHA idempotency gate*, a *budget gate*, a *file classification*, a *deterministic static analysis*, a *AI risk triage* [a *cheap* model], a *AI deep review* [a *strong* model], a *AI security pass*, a *merge*, a *validate* (a *line-exists*, a *enum*, a *schema*), a *dedup*, a *policy* (a *floor*, a *suppression*), a *summary*]; a *pure*, no I/O [a *returns* `ReviewResult`], `REVIEW_ENGINE_SPEC §1 "the engine has no I/O side effects of its own").
- **The *`policy-engine`* (a *confidence floor* (a *default 0.6*, a *org-configurable*), a *suppression*, a *severity gating*, a *quota check*, a *file-budget check*, `REVIEW_ENGINE_SPEC §2` the *gates*).
- **The *verified state:* `UT-diff-*` + `UT-static-*` + `UT-ai-*` + `UT-policy-*` + `UT-engine-*` + `IT-pipeline-full` green; a *diff* → a *classifies* → a *static + AI* → a *validates* → a *dedups* → a *policies* → a *summarizes* *demonstrable*; a *provider-down* *still publishes* the *deterministic* findings (a *`partial`* job, `AI_SYSTEM_DESIGN §5 "never fail the whole review because the AI is down"`).
- **The *next concrete task*:** M5.

### M5 — the *queue + worker + publication* (the *async pipeline*, `TRD §7`, `INTEGRATION_DESIGN §1.6`)
- **The *`worker`* (a *BullMQ* consumer [a *`review-queue`* + a *`retention-queue`* + a *`billing-queue`*]; a *job shape* [a *`jobId` pointer* + a *re-read the durable state*, a *never trust the payload for authz*, `SERVICE_BOUNDARIES` "a job payload carries only a jobId"]; a *concurrency* [a *default 4*, NFR-17]; a *retry* [a *maxAttempts 3*, a *exponential backoff + jitter*, NFR-14]; a *DLQ* [a *`review-dead-letter`*]).
- **The *publication* (a *GitHub review creation* (a *summary*) + a *inline review comments* (a *validated anchor* [a *`resolveAnchor`* before *posting*], a *invalid anchor* → a *PR-body section* (a *`anchor_failed`*), a *published review id* stored per job [a *retry no-ops*, NFR-13], `INTEGRATION_DESIGN §1.6` "anchor validation precedes publication").
- **The *transaction* (a *persist-then-publish* [a *findings + job state + usage in one Postgres transaction*], a *publish after the commit*, a *failed publish* does not *rollback the stored findings*, a *independent* publish retry [a *GitHub 429 does not re-run the AI*, `ERROR_HANDLING §6 "persist-then-publish"]).
- **The *usage accounting* (a *`usage_events`* row per job [a *`input_tokens`*, a *`output_tokens`*, a *`est_usd_cost`*, a *`model`*, a *`prompt_version`*], a *attributed to the requesting org*, AC-306/AC-401).
- **The *verified state:* `IT-queue-*` (a *transient retry* + a *terminal-not-retried* + a *idempotent-redeliver* + a *in-flight lock*) + `IT-publish-*` (a *valid anchor inline* + a *invalid anchor fallback* + a *summary-only* + a *idempotent publish*) + `IT-tx-*` (a *publish-not-rollback* + a *no-orphan-success* + a *atomic-persist*) green; a *review job* *processed with correct idempotency* + a *diff + context retrieved* + a *static + AI execute* + a *findings validated against the actual diff* + a *summary + valid inline comments published* (a *DEFINITION OF DONE #5–#9*).
- **The *next concrete task*:** M6.

### M6 — the *dashboard* (the *real-data UI*, `MVP_SCOPE "every page must use real backend data"`, `DESIGN_SYSTEM`)
- **The *`web`* (a *Next.js App Router* + a *TypeScript strict* + a *Tailwind* + a *shadcn/ui* + a *Lucide* + a *RHF + Zod* + a *Recharts* + a *TanStack Query*, `TECH_STACK §Frontend`).
- **The *all P0 pages* (an *Overview* [a *verdict-lead figure* + a *attention queue* + a *quota strip*], a *Repositories* [a *list* + a *detail*], a *Reviews* [a *list* + a *PR detail* [a *commit-history*] + a *review detail* [a *verdict* + a *findings* + a *static-vs-AI* + a *summary* + a *actions*]], a *Security* [a *rollup* + a *trend* + a *actioned rate*], a *Usage & billing* [a *cost/PR* + a *reviews/day* + a *by-provider* + a *quota track* + a *plan state* + a *invoices* + a *upgrade/cancel*], a *Rules & AI* [a *confidence floor* + a *suppressions* + a *per-repo rules* + a *provider routing* + a *BYOK*], a *Team & audit* [a *members* + a *roles* + a *invitations* + a *audit log* + a *account*], a *Page specifications* [a *`PAGE_SPECIFICATIONS`* the *page-by-page*]).
- **The *real-data rule* (a *every page reads from the real API*; a *no fabricated repositories, activity, review results, billing, or statistics*; a *an empty state is a designed zero, not a placeholder*, `MVP_SCOPE "do not fabricate"` + `PAGE_SPECIFICATIONS §5 "every destination has a first-run + an in-scope-empty state"` + a *`E2E_TEST_PLAN §3` "a UI number matches the DB row"*).**
- **The *design gate* (a *`DESIGN_SYSTEM §11` "the design-taste lint.mjs --app + inspect.mjs --app run as a CI job; every FAIL fixed, every WARN defended"*; a *app-screens* *tokens* [a *one data hue*, a *severity-mark* [the *product's signature*], a *no KPI tiles*, a *flat surfaces*], a *emil-design-eng* *motion* [a *transform/opacity only*, a *custom ease-out*, a *`@starting-style`*, a *`prefers-reduced-motion`*]).
- **The *verified state:* `E2E_TEST_PLAN` *journey specs* (a *`auth`* + a *`onboarding`* + a *`daily-loop`* + a *`security-triage`* + a *`cost`* + a *`audit`* + a *`settings`* + a *`usage-limits`* + a *`cross-tenant-ui`* + a *`a11y-keyboard`*) green against the *Com* stack; the *`inspect.mjs --app`* 0-FAIL at 1440/768/390; a *`cross-tenant-ui`* [a *hide-never-enforce* check, `AUTHORIZATION §7`]; a *`a11y-keyboard`* [a *keyboard-only journey* + a *reduced-motion*, `ACCESSIBILITY §6`].
- **The *next concrete task*:** M7.

### M7 — the *billing + usage + audit* (the *commercial + the observability*, `BILLING_SPECIFICATION`, `OBSERVABILITY`)
- **The *`billing`* package (a *`BillingProvider` interface* + a *Stripe / Razorpay adapter*; a *plan state machine*; a *verified-webhook*; a *event idempotency*; a *grace*; a *skip-with-notice*, `BILLING_SPECIFICATION §2–§8`).
- **The *`webhooks/billing` route* (a *verified*; a *idempotent on event id*; a *foreign-customer rejected*, `WEBHOOK_SPECIFICATION §2`).
- **The *usage accounting* (a *`usage_events`* append-only; a *`usage_daily`* rollup [a *hourly*, NFR-03], a *quota gate* [a *pre-flight*, `REVIEW_ENGINE_SPEC §2` stage [0]), a *`IT-payment-*` + a *`IT-quota-skip`* + a *`ST-cost-abuse`*).
- **The *audit log* (a *append-only `audit_events`*; a *every state change* + a *every authz denial* [a *`access.denied_cross_tenant`*], a *180 d floor*, NFR-27, `AUTHORIZATION §8 "every denial is written to audit_events"`).
- **The *observability* (a *structured JSON logs* [a *correlation id*, a *redaction gate*], a *OTel* [a *one trace per pipeline*], a *Sentry* [a *PII-scrubbed*], a *metrics* [a *queue depth/age*, a *DLQ depth*, a *provider error rate*, a *GitHub 4xx/5xx*, a *cost/review*, a *platform token-spend*], `OBSERVABILITY §3` "the alertable signals").
- **The *verified state:* `IT-payment-01..03` + `IT-quota-skip` (a *AC-402* "a zero-token skip") + `ST-cost-abuse` + `IT-audit-01` green; a *billing state* *moved by a verified webhook only* (a *client claim inert*, AC-403); a *quota skip* *with a posted notice* (a *never silent*, NFR-18); a *audit event* *for every state change + every denial* (a *`AC-503`*); a *trace* *per pipeline* (a *`OBSERVABILITY §2`*).
- **The *next concrete task*:** M8.

### M8 — the *security suite + observability + Docker/CI* (the *release gates*, `SECURITY_TEST_PLAN`, `RELEASE_CRITERIA`)
- **The *`tests/security`* suite (a *all the ST-* tests*: a *forged/replayed webhook*, a *cross-tenant*, a *prompt-injection* [a *4 fixtures*], a *secret leakage* [a *redaction*], a *billing manipulation*, a *privilege escalation*, a *oversized/malformed*, `SECURITY_TEST_PLAN §1` the *test groups*).
- **The *`tests/fixtures`* (a *diff fixtures*, a *injection fixtures*, a *secret samples*, a *webhook event bodies*, a *malformed-AI outputs*, a *benchmark set* [a *`BENCHMARK_DATASET`*], `SECURITY_TEST_PLAN §2` the *fixture library*).
- **The *benchmark harness* (a *the deterministic harness* over the *benchmark set*; a *score* [a *precision*, a *per-class recall*, a *FP on clean*, a *anchor success*, a *cost/review*, a *latency*, a *injection outcomes*, a *confidence curve*]; a *gate* [a *precision ≥ baseline − 5%*, a *security-recall ≥ baseline − 3%*, a *injection clean*, a *cost within ceiling*, a *anchor ≥ 92%*, a *`AI_EVALUATION §3` the release gate*]).
- **The *Docker* (a *a Dockerfile per deployable* [a *web*, a *api*, a *worker*]; a *a Compose* [a *Postgres*, a *Redis*, a *web*, a *api*, a *worker*, a *mock-github*, a *mock-ai*, a *mock-billing*]; a *a `smoke` target* [a *boot + a health + a mock PR through the pipeline*], `DEPLOYMENT.md §2` the dev topology).
- **The *CI* (a *the PR lane* [a *typecheck + lint + unit + integration + security (reduced) + E2E (Com) + docs-drift*]; a *the merge lane* [a *full integration + full security + full E2E + benchmark + design + supply-chain*]; a *the release lane* [a *live external suite* + a *soak* + a *secret-scanner*], `CI_CD.md` the lanes).
- **The *`.env.example`* (a *placeholders only*, a *`config` codegen of the env-var doc*, `ENVIRONMENT_VARIABLES §10` the generated artifact).
- **The *verified state:* the *`RELEASE_CRITERIA`* gates 1–12 green (a *typecheck + lint + unit + integration + security + tenant + benchmark + E2E + a11y + design + docs-drift + supply-chain*); a *`PHASE 10` the 15-step DEFINITION OF DONE* *demonstrable* (a *a user signs in → creates an org → installs the App [a mock, a live-blocked] → a real PR webhook [a mock-dispatched] → a review job processed idempotently → the diff + context retrieved → static + AI execute → findings validated against the actual diff → summary + valid inline comments published → results in the dashboard → usage attributed → failures + retries observable → tenant isolation + security pass → docs match → setup + deployment verified*); a *any unverified external integration* *marked blocked* (a *the live GitHub App + a live provider + a live billing = a gate-13 blocked in a no-credentials env*, `PHASE 10 "any unverified external integration must be explicitly marked as blocked or unverified"`).
- **The *done* state:** the *MVP* is *complete* when M1–M8 are *each* *verified* (a *`MVP_SCOPE "the MVP is the vertical slice that makes the end-to-end workflow demoable"`* + a *`RELEASE_CRITERIA`* green).

## 2. The *milestone* *verification* (a *each* *milestone* ends with a *measured* state, a *`RELEASE_CRITERIA §2` "the pass is a measurement, not a checkbox"*)

| Milestone | The *measured* state (a *the* *verification*, not a *checkbox*) |
| --- | --- |
| M1 | `pnpm typecheck` + `pnpm test` (a *UT-plans-*) green; the *broken import closed*; the *contracts complete* |
| M2 | `IT-auth-*` + `IT-authz-*` + `IT-tenant-01..05` green; a *sign-in + a create org + a role change + a cross-tenant 404* demonstrated |
| M3 | `IT-webhook-*` + `IT-idempotency-01` green; a *forged* rejected, a *replay* no-op, a *opened* enqueued; a *live App* marked blocked |
| M4 | `UT-diff/static/ai/policy/engine-*` + `IT-pipeline-full` green; a *diff → classify → static + AI → validate → dedup → policy → summary* demonstrated; a *provider-down* still publishes the *deterministic* findings |
| M5 | `IT-queue-*` + `IT-publish-*` + `IT-tx-*` green; a *review job processed with correct idempotency* + a *validated inline comments published* (a *DEFINITION OF DONE #5–#9*) |
| M6 | the *E2E journey specs* + the *`inspect.mjs --app`* 0-FAIL + the *`cross-tenant-ui`* + the *`a11y-keyboard`* green; a *real-data* dashboard (a *UI number = a DB row*) |
| M7 | `IT-payment-*` + `IT-quota-skip` + `ST-cost-abuse` + `IT-audit-01` green; a *billing state moved by a verified webhook only* + a *quota skip with a posted notice* + a *audit event for every state change + every denial* |
| M8 | the *`RELEASE_CRITERIA`* gates 1–12 green; a *`PHASE 10`* 15-step DEFINITION OF DONE demonstrated (a *mock-dispatched*); a *live* integration marked blocked |

## 3. The *milestone* *dependencies* (a *the order is the dependency*, a *`DEPENDENCY_GRAPH`* the *detail*)

- **M1 → M2** (a *a contracts/plans is the foundation; a config + a database + an auth is on top*).
- **M2 → M3** (a *a tenancy is the boundary the webhook enforces; a verifyWebhook is on top of the tenancy*).
- **M3 → M4** (a *a GitHub ingress enqueues; a pipeline is the handler*).
- **M4 → M5** (a *a pipeline is the job; a queue + a worker + a publication is the runner*).
- **M5 → M6** (a *a publication is the data; a dashboard is the surface*).
- **M5 → M7** (a *a publication + a usage is the billing; a billing + a usage + an audit is the commercial*).
- **M6 + M7 → M8** (a *a security + an observability + a Docker/CI is the gate on the rest*).

## 4. The *milestone* *commit discipline* (a *the auto-sync*, a *`PROJECT_DISCOVERY §7 D-5`*)

- **Each milestone is committed in *small, coherent units*** (a *a M1 is the plans.ts + a package.json + a tsconfig + a UT-plans* [a *one* *coherent* *commit*]; a *a M2 is the config + the database + the authn + the orgs + the tenancy* [a *several* *coherent* *commits*], a *not a single giant commit*).
- **A *dirty tree is auto-merged*** (a *`scripts/run_loop.sh`* → a *`auto_sync.sh`* [a *a 60s poll* + a *a PR* + a *a merge*], a *`PROJECT_DISCOVERY §2` "in-flight work that sits in the tree for minutes may be auto-merged"*). A *WIP that sits is a risk* (a *commit in small units* + a *a WIP on a branch*, a *never a long-lived dirty tree on main*).
- **A *milestone* *is not a release*** (a *a milestone is a *coherent increment*; a *release is the* `RELEASE_CRITERIA` *gate + a canary*, a *`DEPLOYMENT §4` "the contract step is a separate, later release"*). A *milestone* *is verified by its own suite* (a *M1 by the UT-plans; a M2 by the IT-auth + the IT-tenant*), a *not by the full gate* (a *the full gate is M8*, a *the release*).

## 5. The *milestone* *risk* (a *the* *`RISK_REGISTER`* tie-in, a *the* *`KNOWN_LIMITATIONS`*)

- **A *live-integration-blocked*** (a *a M3's GitHub App + a M4's provider + a M7's billing are *live-blocked* in a no-credentials env; a *the mock proves the pipeline; the live is the gate-13 release lane*, a *`PHASE 10` "any unverified external integration must be explicitly marked as blocked or unverified"*).
- **A *benchmark-gate regression*** (a *a M4's prompt/model is a benchmark-gated; a regression > 5% precision or > 3% security-recall blocks the merge*, a *`AI_EVALUATION §3` the release gate*).
- **A *tenant-isolation regression*** (a *a M2's schema + a M8's re-run; a cross-tenant leak is a Critical — an automatic block*, a *`TENANT_ISOLATION §5 "re-run on every schema change"* + a *`RELEASE_CRITERIA gate 6`*).
- **A *design-slop regression*** (a *a M6's inspect.mjs --app; a 0-FAIL gate; a tell is a FAIL*, a *`DESIGN_SYSTEM §11` "the anti-slop rules are checked, not hoped"*).

## 6. The *plan's* *status* + the *next concrete task* (a *the exact state, a `PHASE 9 "finish the current coherent unit of work, document the exact state, identify the next concrete task"`*)

**The exact state at the start of implementation:** the *documentation package is complete* (a *`docs/`* tree, every doc, the *traceability matrix*, the *DOCUMENTATION_REVIEW*); the *contracts package is partially built* (a *`index.ts`* + a *broken import*); the *no other package/app* *exists* (a *`apps/*`* empty, a *`packages/*`* only a *contracts*, a *`infra/`* + a *`tests/`* not created).

**The next concrete task (a *the* *first* implementation task):**
1. **Create `packages/contracts/src/plans.ts`** (a *`Plan`* + a *`PlanQuota`* + a *`planQuota`* + the *four* `*_QUOTA` constants, a *`AC-401`* the *source of truth*).
2. **Create a *`packages/contracts/package.json`* + a *tsconfig*** (a *a workspace entry*, a *NodeNext + verbatimModuleSyntax*).
3. **Write a *`UT-plans-01`* + a *`UT-plans-02`*** (a *import-identity + a plan-lookup*, a *`UNIT_TEST_PLAN §2`*).
4. **Run a *`pnpm typecheck`* + a *`pnpm test`*** (a *the closed import + the green UT-plans*).
5. **Commit the M1 (a *coherent, a small, a verified*)** + a *the next task* = a *M2 (a config + a database + an authn + an orgs + a tenancy*).

**The *plan's* *status:* the *documentation* *is* *complete* + *validated* (a *`PHASE 1`* exit, a *`DOCUMENTATION_REVIEW.md`*); the *implementation* *is* *starting* (a *M1* next). A *plan* *that* *stops* *at* *documentation* *is* *not* *a* *plan* (a *`PHASE 9 "do not stop after generating the initial documentation or scaffold. Continue implementation through the planned milestones whenever the environment and available time permit"`* — a *the milestones continue*).
