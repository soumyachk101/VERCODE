# VERCODE — Dependency Graph

The package dependency graph (a *what imports what*) + the milestone task dependency (a *what blocks what*) + the integration external-dependency graph (a *what's external + what's the blocker*). The *rule*: a *dependency* is a *directed edge* (a *A imports B*); a *cycle* is a defect (a *CI fails on it*, `REPOSITORY_STRUCTURE.md` "a cycle here is a defect").

## 1. The *package* dependency graph (a *`REPOSITORY_STRUCTURE §Package dependency graph`*)

```
contracts ──▶ (everyone; the shared source of truth for the findings/webhooks shapes)
config ────▶ observability, ai-providers, policy-engine, database, github
github ────▶ contracts, config
diff-engine (pure; no dependency)
static-analysis ─▶ contracts
ai-providers ───▶ contracts, config
review-engine ──▶ diff-engine, static-analysis, ai-providers, contracts
policy-engine ──▶ contracts
database ──────▶ contracts
worker ────────▶ review-engine, diff-engine, static-analysis, ai-providers, policy-engine, github, database, config, observability, contracts
api ───────────▶ database, github, config, observability, contracts
website ───────▶ contracts (types only; the marketing site, not a runtime API importer)
```

**The *layering* (a *the* *topology*, a *no cycle*):**
- **Layer 0 (a *pure*):** `diff-engine` (a *no dependency*, a *the parser + the line map*).
- **Layer 1 (a *the contracts + the config*):** `contracts` (a *the source of truth*), `config` (a *the env + the routing table + the rate table*), `observability` (a *the logging + the tracing + the redaction*).
- **Layer 2 (a *the adapters*):** `github` (a *the App auth + the webhook verify + the diff fetch + the publish*, a *depends on contracts + config*), `ai-providers` (a *the provider interface + the adapters + the routing*, a *depends on contracts*), `static-analysis` (a *the ESLint + the Semgrep runner*, a *depends on contracts*), `database` (a *the Prisma schema + the tenant repository*, a *depends on contracts*).
- **Layer 3 (a *the engine*):** `policy-engine` (a *the floor + the suppression + the file budget*, a *depends on contracts*), `review-engine` (a *the orchestrator*, a *depends on diff-engine + static-analysis + ai-providers + contracts* [a *the stages compose the layer-2 adapters*]).
- **Layer 4 (a *the deployables*):** `worker` (a *the BullMQ consumer + the pipeline runner*, a *composes review-engine + github + database + config + observability*), `api` (a *the auth + the dashboard REST + the webhook ingress + the GitHub OAuth routes*, a *composes database + github + config + observability + contracts*), `website` (a *the marketing site*, a *types-only* dependency on `contracts`), `web` (a *the dashboard*, a *no runtime package dependency* [a *the API is the runtime*]).

**The *no-cycle* guarantee (a *CI*):** a *layer* N *imports* a *layer* < N (a *never a layer > N*). A *worker* importing a *api* is a defect (a *the deployables don't import each other*); a *review-engine* importing a *worker* is a defect (a *the engine is pure, a *the worker is the I/O boundary*). A *lint rule* (a *import-boundary*, a *`REPOSITORY_STRUCTURE §Rules "a lint rule (import-boundary) enforces it"`*) enforces it.

## 2. The *milestone* task dependency graph (a *`IMPLEMENTATION_PLAN §3 "the milestone dependency"*; a *the `TASK_BREAKDOWN` task IDs*)

```
M1 (the contracts)
  T1.1 (a the contracts package.json + tsconfig) ─▶ T1.2 (a the schemas split)
M2 (the auth + org + roles + tenancy)
  T2.1 (a config) ─▶ T2.2 (a database + tenancy repo) ─▶ T2.3 (a authn) ─▶ T2.4 (a orgs + roles) ─▶ T2.5 (a tenant + capability middleware)
M3 (the GitHub App + webhooks)
  T3.1 (a the github pkg: the App auth + the verifyWebhook + the fetch + the publish) ─▶ T3.2 (a the webhooks/github route) ─▶ T3.3 (a the install flow + the repo discovery + the install removal)
M4 (the review pipeline)
  T4.1 (a diff-engine) ─▶ T4.2 (a static-analysis) ─▶ T4.3 (a ai-providers) ─▶ T4.4 (a review-engine) ─▶ T4.5 (a policy-engine)
M5 (the queue + worker + publication)
  T5.1 (a the worker) ─▶ T5.2 (a the publication) ─▶ T5.3 (a the transaction + the usage accounting)
M6 (the dashboard)
  T6.1 (a the web shell + the tokens) ─▶ T6.2 (a the pages) ─▶ T6.3 (a the design + the a11y gate)
M7 (the usage reporting + audit)
  T7.1 (a the usage_events write path) ─▶ T7.2 (a the usage dashboard read path) ─▶ T7.3 (a the audit log + the observability)
M8 (the security suite + observability + Docker/CI)
  T8.1 (a the tests/security + the fixtures) ─▶ T8.2 (a the benchmark harness) ─▶ T8.3 (a the Docker + the CI + the .env.example)
```

**The *milestone* *order* (a *a milestone blocks the next*):** M1 → M2 → M3 → M4 → M5 → M6 → M7 → M8 (a *the `IMPLEMENTATION_PLAN §3` order*). **The *in-milestone* *order* is *sequential* (a *a T blocks the next T in the milestone*); the *milestones* are *sequential* (a *a M blocks the next M*). **The *one* *parallelism*: M6 (a *the dashboard*) can *partially* *run in parallel* with M4 (a *the pipeline*) once the *API shapes* (a *the `contracts` + the *API spec*, a *`API_SPECIFICATION.md`*) are *frozen* (a *the dashboard reads the API, a *the pipeline produces the data*; a *the API contract is the coupling, a *not the implementation*). **The *critical path**: M1 → M2 → M3 → M4 → M5 → M8 (a *the security suite + the CI is the gate on the rest*; a *M6/M7 are the surfaces, a *they can parallel with M4/M5 up to M8*).

## 3. The *external* dependency graph (a *what's external + what's the blocker*, a *`PROJECT_DISCOVERY §5` the credential inventory*)

```
web/api/worker ─▶ Postgres (a managed; a the source of truth)
web/api/worker ─▶ Redis (a managed; a the sessions + the queue + the diff cache)
api/worker ────▶ GitHub App (a the GITHUB_APP_ID + the KMS-wrapped GITHUB_APP_PRIVATE_KEY + the GITHUB_WEBHOOK_SECRET)
worker ────────▶ AI provider (a the platform key + the BYOK [a KMS-wrapped]; a the routing table)
web/api/worker ─▶ Observability (a the Sentry DSN + the OTel collector endpoint)
api/worker ────▶ KMS (a the BYOK master + the App key; a a SECRETS_MANAGEMENT §2 the KMS-wrapped case)
```

**The *external* *blocker* (a *the live-integration, a `PHASE 10 "any unverified external integration must be explicitly marked as blocked or unverified"`*):**

| External | The *dev-stack* (a *the mock*, a *the no-credentials* path) | The *live* (a *the gate-13* release lane) | The *blocker* (a *a no-credentials env*) |
| --- | --- | --- | --- |
| **Postgres + Redis** | a *the Compose* (a *a real, a no-external*) | a *the managed* (a *a PITR + a read replica*) | *none* (a *the Compose is local*) |
| **GitHub App** | a *a mock-github* (a *a canned PR diff + a the install-token exchange + a the review-publication recorder*) | a *a real App* (a *a real ID + key + webhook*) | **BLOCKED** (a *a real GitHub App is a live-integration-blocked, a `SAAS_LAUNCH_PLAN §5 P1 "a live integration"`*) |
| **AI provider** | a *a mock-ai* (a *a deterministic fixture output*) | a *a real provider key* (a *an OpenAI/Anthropic*) | **BLOCKED** (a *a real provider key is a live-integration-blocked*) |
| **KMS** | a *a local key* (a *a dev-only, a a no-KMS path*) | a *a cloud KMS* (a *a the BYOK master + the App key*) | **BLOCKED** (a *a live deploy needs a KMS*) |
| **Observability** | a *a no-op* (a *a local log*) | a *a Sentry + a OTel collector* | *not a blocker* (a *a observability is a non-blocking dependency, a `PROJECT_DISCOVERY §5 "non-blocking"`*) |

**The *dev-stack* *proves the pipeline* (a *a mock GitHub + a mock AI*, a *`DEPLOYMENT.md §2 "the Compose stack brings up the whole system with no external credentials"`*); **the *live* is the gate-13* (a *a real GitHub App + a real provider*, a *`CI_CD §4 "the release lane"*). A *launch* is *blocked* on the *live* credentials (a *a `SAAS_LAUNCH_PLAN §7 "a launch is blocked on: a live GitHub App, a platform provider key, a domain, a KMS"`*).

## 4. The *contract* *coupling* (a *the API shape is the coupling between the web + the api + the worker*)

- **The *`contracts`* package is the *single source of truth*** (a *the findings/webhooks/usage-event shapes*, a *`REPOSITORY_STRUCTURE §Rules "no module imports another module's internals; cross-package communication is via packages/contracts types"`*). A *contract change is a breaking change* (a *`TECHNICAL/TRD §6 "a contract change is a breaking change requiring a version bump"`* — a *a two-way break that CI enforces, a `TRD §2 "two TypeScript codebases share packages/contracts; a contract change is a two-way break"`*).
- **The *API spec* (a *`OPENAPI.yaml`*) is a *projection* of the `contracts` types (a *a codegen step; a *a drift is a CI failure, a `RELEASE_CRITERIA gate-11` the docs-drift*).*
- **The *web* is a *types-only* dependent on the contracts (a *the API client types, a *not a runtime import*, a *the web is a browser build, a *the API is the runtime*).

## 5. The *dependency* *review gate* (a *the `RELEASE_CRITERIA` ties-in*)

- **A cycle** (a *a layer N imports a layer > N*) → a *CI failure* (a *the import-boundary lint rule*).
- **A hardcoded spend cap outside `config`** (a *a two-source cap*, a *the `PLATFORM_TOKEN_SPEND_CAP_USD` value lives in `packages/config` and nowhere else* — there is no per-plan quota anymore, so the platform cap is the single source) → a *code-review gate* (a *the grep-level assertion*).
- **A model name outside `config`** (a *a routing-table drift*, a *`MODEL_ROUTING §7 "no module outside config names a concrete model"`*) → a *grep gate*.
- **A contract change without a version bump** (a *a breaking change*, a *`TRD §6`*) → a *CI failure*.
- **A dependency that's not in the lockfile** (a *a fresh resolve, a *`THREAT_MODEL T-09 "a compromised dependency = RCE in the trusted core"`*) → a *supply-chain gate* (a *the CI installs from the lockfile, a *not a fresh resolve*).
