# VERCODE — Environment Variables

The full env-var inventory. `.env.example` (at the repo root) holds **placeholders only** (no real secrets, `NFR-31`); real values live in the deploy secret store. A variable that's *not* in this doc is a defect (an undocumented env var is a config bug).

## 1. Core (required in every deploy)

| Var | Used by | Description | Placeholder |
| --- | --- | --- | --- |
| `NODE_ENV` | all | `development` / `production` / `test` | `development` |
| `DATABASE_URL` | api, worker | Postgres connection (`postgresql://user:pass@host:port/vercode`) | `postgresql://user:pass@localhost:5432/vercode` |
| `REDIS_URL` | api, worker | Redis connection | `redis://localhost:6379` |
| `SESSION_SIGNING_KEY` | api | signs + verifies the session cookie | `<64-byte base64 hex, generate with openssl>` |
| `API_BASE_URL` | api, web | the public origin of the API (webhooks + redirects) | `https://api.vercode.example` |
| `WEB_BASE_URL` | web, api | the public origin of the web app (the dashboard) | `https://app.vercode.example` |

## 2. GitHub App (the `github` package + `api` + `worker`)

| Var | Description | Placeholder |
| --- | --- | --- |
| `GITHUB_APP_ID` | the App's numeric id | `123456` |
| `GITHUB_APP_PRIVATE_KEY` | the App's PEM private key (**KMS-wrapped at rest**, decrypted in-process, `SECRETS_MANAGEMENT §4`) | `<KMS-wrapped PEM>` |
| `GITHUB_WEBHOOK_SECRET` | the HMAC secret for `X-Hub-Signature-256` (a *test* value in dev, the *real* value in prod) | `test-webhook-secret-dev` |
| `GITHUB_API_BASE` | the GitHub API base (default `https://api.github.com`; a GHE deployment overrides) | `https://api.github.com` |

## 3. AI provider (`ai-providers` + `config`)

| Var | Description | Placeholder |
| --- | --- | --- |
| `AI_DEFAULT_PROVIDER` | the default provider (`openai` / `anthropic` / `ollama` / `mock` in dev) | `mock` (dev) / `openai` (prod) |
| `OPENAI_API_KEY` | the platform's default OpenAI key (env, *not* the DB) | `<sk-...>` (real: in the secret store, never committed) |
| `ANTHROPIC_API_KEY` | the Anthropic key (multi-provider, Phase 1) | `<sk-ant-...>` |
| `OLLAMA_BASE_URL` | a self-hosted Ollama endpoint (the BYOK/zero-cost path) | `http://ollama.internal:11434` |
| `AI_FOBID_TRAINING` | a flag the integration verifies against the provider's no-training classification (NFR-29) | `true` |
| `AI_FALLBACK_PROVIDER` | the task-level fallback provider (FR-314, one switch) | `anthropic` |

**The model routing table + the rate table live in `packages/config`** (not env) — the concrete model ids are a *config* decision, versioned + auditable (`MODEL_ROUTING §1`), not a per-deploy env value. Env sets the *provider*; config sets the *model within the provider*.

## 4. Billing (`billing`)

| Var | Description | Placeholder |
| --- | --- | --- |
| `BILLING_PROVIDER` | `stripe` / `razorpay` (the adapter selection, ADR-009) | `stripe` |
| `STRIPE_SECRET_KEY` | the Stripe secret key (env / secret store, *never* a DB column) | `<sk_test_...>` |
| `STRIPE_WEBHOOK_SECRET` | the Stripe webhook-verification secret | `<whsec_...>` |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | the Razorpay credentials (the INR-market adapter) | `<rzp_test_...>` |
| `BILLING_CURRENCY` | the billing currency (the INR path is a `INR` deploy, ADR-009) | `USD` / `INR` |

## 5. Observability (`observability`)

| Var | Description | Placeholder |
| --- | --- | --- |
| `SENTRY_DSN_API` / `SENTRY_DSN_WORKER` / `SENTRY_DSN_WEB` | the per-process Sentry DSNs (PII-scrubbed, TRD §15) | `https://...@sentry.io/...` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | the OTel collector endpoint | `http://otel-collector:4317` |
| `OTEL_SERVICE_NAME` | the per-process service name (`vercode-api`, `vercode-worker`, `vercode-web`) | `vercode-api` |
| `LOG_LEVEL` | `debug`/`info`/`warn`/`error` (the redactor runs at *every* level, `SECRETS_MANAGEMENT §3`) | `info` |

## 6. Quota + limits (`policy-engine` + `config`)

| Var | Description |
| --- | --- |
| `PLATFORM_TOKEN_SPEND_CAP_USD` | the **platform-level** monthly provider-spend ceiling (the cost-abuse backstop, `RATE_LIMITING §6` — an org's plan cap is *on top of* this, not instead of it) |
| `DEFAULT_CONFIDENCE_FLOOR` | the default floor (0.6; an org's override is in `org_settings`, not env) |
| `REVIEW_WALL_CLOCK_BUDGET_MS` | the pipeline's wall-clock cap (default 240 s, `REVIEW_ENGINE_SPEC §4`) |
| `REVIEW_MAX_FILES` / `REVIEW_MAX_LINES` | the per-review budget defaults (60 files / 3000 lines, NFR-19; an org override is in `org_settings`) |
| `WORKER_CONCURRENCY` | the per-worker-instance concurrency (default 4, NFR-17) |
| `QUEUE_MAX_ATTEMPTS` | the review-job retry cap (default 3, NFR-14) |

These are **defaults** — an org-level override is in the DB (`org_settings`), not env (a per-org knob is a config row, audited; env is a platform default).

## 7. Dev-only (the mock providers, the Compose stack)

| Var | Description |
| --- | --- |
| `USE_MOCK_GITHUB=true` | the api/worker use the mock-GitHub stub (the Compose default; a live deploy is `false`) |
| `USE_MOCK_AI=true` | the pipeline uses the deterministic mock provider (the Compose default; a live deploy is `false` + the real key) |
| `USE_MOCK_BILLING=true` | the billing webhook is the Stripe test-mode signature source (the Compose default) |

**A live deploy flips these to `false` + provides the real keys.** A deploy that's `true` is a *dev/mock* deploy (the live pipeline is *blocked*, the unverified-integration rule, `PHASE 10`) — a live-pipeline claim requires the `false` + the real keys + a verified run.

## 8. The KMS

| Var | Description |
| --- | --- |
| `KMS_ENDPOINT` / `KMS_REGION` | the KMS the BYOK master key + the App private key are wrapped under (a cloud KMS; the BYOK path, `SECRETS_MANAGEMENT §2`) |
| `KMS_BYOK_MASTER_KEY_ID` | the KMS CMK that wraps the per-org BYOK keys |
| `KMS_APP_KEY_KEY_ID` | the KMS CMK that wraps `GITHUB_APP_PRIVATE_KEY` at rest |

## 8.5. Website (the public-website surface, `docs/WEBSITE/TECHNICAL_ARCHITECTURE.md §6`)

| Var | The one-line comment |
| --- | --- |
| `VERCODE_WEBSITE_BASE_URL` | the canonical domain of the website (a `sitemap.xml` + a `robots.txt` + a `canonical` + an `og:url` source; a static export reads it at build time, not at runtime) |
| `VERCODE_WEBSITE_OG_DEFAULT` | the default OG image path (a per-blog-slug image is a front-matter field, `docs/WEBSITE/CONTENT_SCHEMAS.md`'s `ogImage`) |
| `VERCODE_BEACON_SECRET` | the HMAC key for a `POST /api/track` (a cookieless first-party beacon, a `WFR-504`; the API route verifies it — the secret is never in the website's static export, `docs/WEBSITE/TECHNICAL_ARCHITECTURE.md §4.2`) |

## 9. Rules (the config-inventory gate)

- **No secret in `.env.example`** — placeholders only (`NFR-31`, `SECRETS_MANAGEMENT §4`); a committed `.env` with a real value is a CI-secret-scanner defect.
- **A variable not in this doc doesn't exist** (an undocumented env var is a config bug — the `config` package's `loadConfig()` validates the *exact* set, a missing/extra var is a startup error, not a silent default).
- **The `config` package is the *only* reader of env** (a `process.env.X` outside `config` is a lint/review defect — env access is centralized + typed + validated).
- **Secrets never reach a log/finding/prompt/queue payload/browser** (the redaction gate, `SECRETS_MANAGEMENT §5`; a secret observed in a log is a *released* secret → rotate, the §6 lifecycle).

## 10. The `.env.example` (the generated artifact)

The `.env.example` at the repo root is a *projection* of this doc (a `config` codegen step: the var names + the placeholders + a one-line comment per var, grouped as above). It's checked in + regenerated on a `config` change (a drift between the doc and the example is a CI failure, the `RELEASE_CRITERIA` gate 11 family). A deployer copies `.env.example` → `.env`, fills the real values into the secret store, and the `config` package validates the set at boot (a boot that can't resolve a required var fails *fast*, with the var named, not a mid-run crash).
