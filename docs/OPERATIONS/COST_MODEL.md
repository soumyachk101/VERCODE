# VERCODE — Cost Model

The unit economics of an AI-review product: what a review *costs* to produce, and where the margin is (or isn't). This is the document that answers Dana's "what are our per-review costs?" (`USER_PERSONAS.md`) and the "cost control" NFR (`NFR-07`, `NFR-18`) — and it's *modeled*, not vibes (the "never claim without measured evidence" rule applies to *cost* as much as to *quality*: the `BENCHMARK_DATASET` measures cost/review, `AI_EVALUATION`'s cost gate).

## 1. The cost per review (the unit)

A review's cost is the **sum of its AI calls** (`REVIEW_ENGINE_SPEC §6`, the `ReviewResult.cost`), which the task decomposition (`AI_SYSTEM_DESIGN §3`) makes *controllable*:

| Stage | Model tier (default routing, `MODEL_ROUTING §1`) | Cost driver |
| --- | --- | --- |
| risk-triage (per file, cheap) | standard (cheap) | high-volume, low-stakes → the *cheap model earns its keep* (a gate, not a finding) |
| deep-review (only high-risk files, strong) | standard+ / strong | the *long pole*; the cheap triage is what *keeps this bounded* (only ~the high-risk files go to the strong model, `MODEL_ROUTING §2`) |
| security-review (security-sensitive files, strong) | strong (top tier, never downgraded, `MODEL_ROUTING §2`) | the *highest-cost* + *highest-value* call; a *cost* here is a *security* investment |
| summary (cheap) | standard (cheap) | low-stakes |
| **static analysis (deterministic)** | — | **zero AI cost** (ESLint/Semgrep are *our* compute, a *fixed* worker cost, not a *per-token* provider cost — the *deterministic-first* design, ADR-005, is a *cost* feature: a review with zero AI findings still has a *useful* cost profile) |

**The `estUsdCost` per review** is computed from the `config` rate table (`inputTokens/1e6 * inputPer1M + outputTokens/1e6 * outputPer1M`, `MODEL_ROUTING §6`), *recorded per job* (AC-306), and *aggregated* to the org's `usage_events` (the *single source of truth* for the usage report + the dashboard, `DATA_FLOW.md`). The Ollama (self-hosted) path is a **$0** `estUsdCost` (the org's *compute* cost is out of VERCODE's accounting, `MODEL_ROUTING §6`).

## 2. The cost levers (where the margin lives)

1. **The cheap-triage gate** (`MODEL_ROUTING §2`): routing a PR's 40 files through the *cheap* model first and sending only the ~5 high-risk files to the *strong* model is *the* cost lever (a *40-file PR* is ~`40 × cheap + 5 × strong`, *not* `40 × strong`). This is what keeps `cost/review` *inside* the platform spend cap (`SUCCESS_METRICS` "Cost per review" target: ≤ $0.35 at p95).
2. **The content-hash short-circuit (P1)** (`ADR-007`): a re-push with an *identical* diff *skips the AI stage* (a *blake3* of the diff; unchanged → no re-run). This *cuts* the cost of the *common* re-push case (a branch rebase, a commit reword — the *force-push churn* that dominates PR *volume* but not *novelty*).
3. **The deterministic-first** (ADR-005): the *static* findings are *zero-cost* (our compute, not a per-token provider bill). A review that's *mostly* deterministic (a *style/lint* PR, a *generated-code* PR) is *cheap* (a provider-down *still* yields a *useful* review at *zero* AI cost, `AI_SYSTEM_DESIGN §5`).
4. **The platform token-spend cap** (`NFR-18`, `RATE_LIMITING.md §6`): the *platform-level* `PLATFORM_TOKEN_SPEND_CAP_USD` is the *single* spend backstop (the no-paywall product has *no* per-org plan cap — a *misconfigured* huge volume can't breach the *platform's* provider budget).

## 3. The *revenue* side (deferred, no plans)

With the no-paywall decision, there is *no* plan ladder, *no* per-plan revenue, and *no* billing provider. The cost model's *output* is the *per-review* cost (`estUsdCost`, §1) + the *fixed* cost base (§4) + the *cost-abuse* backstop (§5). The *revenue* question (a *how do we price this later* — a *BYOK* *cost-recovery*, a *seat-based* *enterprise* *contract, a *future* *decision*) is a *P3*+ *commercial* *decision*, *not* a *launch* *prerequisite* (`SAAS_LAUNCH_PLAN`'s *monetization* note). A *cost* *claim* is a *projection* from the *rate table* + the *routing*; a *revenue* *claim* is *not* a *documented* *number* (a *margin* that's *modeled* but *not measured* is a *projection*, not a *fact*, `AI_EVALUATION §5`'s "never claim without measurement").

## 4. The *fixed* cost base (the infra, not the AI)

The *per-review* cost is the *variable* cost (the *provider tokens* + the *worker compute*); the *fixed* cost base (a *monthly*, not a *per-review*) is:

| Fixed cost | What it is | The cost control |
| --- | --- | --- |
| **Postgres + Redis** (managed) | the *DB* + the *queue* + the *cache* | a *read replica* (the dashboard reads, `PERFORMANCE_SCALABILITY §4`) + a *PgBouncer* (a bounded connection pool) — the *fixed* cost *scales* with the *org count* (a *managed* Postgres is a *near-fixed* monthly, a *Redis* is a *near-fixed* monthly; the *variable* part is the *storage* growth, the *retention* hard-delete, `DATA_RETENTION.md`, bounds it) |
| **The worker compute** (the static analysis + the AI-orchestration *CPU*) | a *per-review* *CPU* cost (a *worker* instance's time, *not* a *token* cost — the *static analysis* is *our* CPU, the *AI* is the *provider's*) | a *worker* autoscale on *queue depth* (a *variable* that *tracks* the *review volume*, a *KEDA* scaler, `DEPLOYMENT.md §3` — a *worker* that's *idle* is *scaled-to-zero*, a *worker* that's *busy* *scales up* (a *cost* that *tracks the load*, not a *fixed* cost that's *always-on*)) |
| **The observability** (Sentry + OTel) | a *per-event* + a *fixed* (the *collector*) | a *PITR* + a *log-retention* (the *retention* bounds the *cost*, `OBSERVABILITY §7`) |

**The *key* cost insight:** the *worker* is the *main* *variable-fixed* cost (a *static analysis* that *runs on our CPU* is a *real* cost, *not* a *zero-cost deterministic stage* — the "zero AI cost" of the deterministic stage, ADR-005, is *zero *provider* cost, *not* zero *compute* cost). The *cost model* accounts for *both*: the *provider tokens* (the *variable per-review*, `estUsdCost`) + the *worker CPU* (a *per-review compute*, a *separate* cost line, a *worker-instance-time × the instance cost*). A *review* that's *static-only* is *cheap on the provider bill* but *still* has a *compute cost* (a *worker* ran the *ESLint/Semgrep*) — the *cost/review* metric (`SUCCESS_METRICS`) is the *provider* cost (the *customer-visible* cost); the *worker* compute is the *internal* cost (the *gross-margin* cost, *not* a *customer-billed* cost).

## 5. The *cost-abuse* backstop (the "a customer's runaway isn't our bill", `RATE_LIMITING §2`, `THREAT_MODEL T-11`)

The *no-paywall* product has *no* per-org plan cap (the *billing* *system* is *removed*, ADR-009); the *single* spend backstop is the *platform's* token-spend cap:

- **The *platform's* cap** (`PLATFORM_TOKEN_SPEND_CAP_USD`) — even a *misconfigured* *huge* volume *can't* breach the *platform's* *provider* budget (a *cost-abuse* *backstop*: a *DoS* on the *AI budget* is *bounded* by the *platform* cap).
- **The *anomaly alert*** — a *runaway* org's *spend* trend *toward* the cap *alerts* an *ops* signal (a *cost-abuse* is *surfaced*, not *hidden*, `RATE_LIMITING.md §6`'s "anomaly alert").

## 6. The *unit-economics* summary (the numbers a decision needs, *modeled* + *measured*)

| Metric | The model (the *estimate*) | The *measured* value (the `BENCHMARK_DATASET` + the *production* `usage_events`) |
| --- | --- | --- |
| **cost/review** (a 10-file PR) | ~$0.03–0.05 (a *cheap-triage* + a *bounded* deep-review) | the *measured* `estUsdCost` (the *release-gate* number, `AI_EVALUATION §3` "cost/review" + the `SUCCESS_METRICS` "≤ $0.35 at p95" target) |
| **cost/review** (a 50-file PR, a strong model) | ~$0.15–0.35 (a *strong* deep + a *strong* security pass) | the *measured* `estUsdCost` (the "≤ $0.35 at p95" target, `SUCCESS_METRICS`) |
| **cost/review** (a BYOK/Ollama PR) | **~$0 to VERCODE** (a *BYOK* = the *customer's* bill; an *Ollama* = the *customer's* infra; a *$0* `estUsdCost`, `MODEL_ROUTING §6`) | the *measured* `estUsdCost` (a *$0*, the *cost-shifting* play) |

**The *revenue* row is *absent*:** a *margin* claim needs a *revenue* side that *doesn't exist* yet (a *P3*+ *commercial* *decision*, §3). A *cost* *claim* is a *measured* claim (a *release report* states the *measured* cost/review, `AI_EVALUATION §5`'s "a release report states the benchmark gate results… cost/review"); a *"we have a 40% gross margin"* claim is *not* a *documented* *number* (a *revenue* *model* is *deferred* — a *cost* *model* is a *projection*; a *measurement* is a *ratio* against *nothing* until a *revenue* is *introduced*).

## 7. The "don't claim what you can't measure" rule (the cross-doc invariant)

The *cost* claims in this doc are *modeled* (a *projection* from the *rate table* + the *routing*). A *release* states the *measured* cost/review (the `BENCHMARK_DATASET` + the *production* `usage_events`, `AI_EVALUATION §5`'s "a release report states the benchmark gate results… cost/review"). A *"we have a 40% gross margin"* claim is a *measured* claim (a `usage_events` *cost* vs a *revenue*, the *two* numbers, a *ratio*) — and a *revenue* *number* is *not* a *documented* *input* *yet* (a *P3*+ *decision*, §3), so a *margin* *claim* is a *projection*, not a *fact*, until a *revenue* *model* is *introduced*. A *cost* *claim* cites *both* the *model* + the *measurement* (a "modeled $0.05, measured $0.04 as of [release], benchmark/v1" — the *model* + the *measurement* + the *version*).
