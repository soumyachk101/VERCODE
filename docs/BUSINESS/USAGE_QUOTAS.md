# VERCODE — Usage Quotas

The *commercial* limits, per plan. The **single source of truth is `packages/contracts/src/plans.ts`** — the API quota check, the worker pre-flight check, and the dashboard display *all import from there* (AC-401 "no hardcoded quota numbers anywhere else"; a quota number in a *second* place is a defect the code-review gate catches). This document is the *design rationale*; `plans.ts` is the *code*; a drift between them is a `RELEASE_CRITERIA` gate-11 (docs-drift) failure.

## 1. The quota dimensions (the *shape* of a quota, `PRICING_STRATEGY §2`'s ladder)

A plan's quota is a *set* of *commercial* dimensions (the *capability* a plan *sells*), each a *number* + a *unit* + a *ceiling* semantics:

| Dimension | The *what* it limits | The unit | The *ceiling* semantics |
| --- | --- | --- | --- |
| **`reviewsPerMonth`** | the *number* of review jobs an org can run per calendar month (the *volume* cap) | reviews / month | a *hard* cap: the *N+1th* review in a month → `skipped: quota_exceeded` (the *worker pre-flight* check, `REVIEW_ENGINE_SPEC §2` stage [0], NFR-18 "the skip is before the AI stage, zero tokens consumed") |
| **`filesPerReview`** | the *number of changed files* in a *single* review that the *AI stage* will *process* (the *context* cap, NFR-19 "over-budget reviews degrade") | files / review | a *degrade* (not a *skip*): a diff over the cap → the *top-N highest-risk files* are reviewed, the *rest* are listed in a *summary appendix* (`over_budget_degraded`, `REVIEW_ENGINE_SPEC §2` stage [2], "degrade, not fail") |
| **`linesPerReview`** | the *changed lines* (added+removed) in a *single* review (a *token* *budget* cap) | lines / review | a *degrade* (same as `filesPerReview`, NFR-19) |
| **`concurrentReviews`** | the *number of review jobs* an org can have *in-flight* (a *throughput* cap, a *noisy-neighbor* control) | concurrent jobs | a *queue* (a job over the concurrency *waits* in the queue, a *not a skip* — a *throughput* cap *delays*, a *volume* cap *skips*) |
| **`findingRetentionDays`** | the *how long* a finding is *retained* before a *hard* purge (the *data-minimization* cap, NFR-27/28) | days | a *hard-delete* on schedule (a `retention_jobs` row, `DATA_RETENTION.md §2` "a retention queue hard-deletes") |
| **`customRules`** | the *number of custom review rules* (a category-suppression + a per-repo rule) an org can define (a *config* cap) | rules | a *count* cap (a `custom rule` create over the cap → a `409 QUOTA_EXCEEDED` on the API, a *dashboard* "you've used all your rules" notice) |
| **`modelTierAccess`** | the *model tier* the plan's *routing table* can select (a *cost/quality* cap, `MODEL_ROUTING §4` "a Free org cannot pin security-review to an Enterprise-only model") | tier (standard / standard+strong / any) | a *routing* gate (a task's *model route* is *resolved* within the tier; a *gated* row is *disabled + named*, `PAGE_SPECIFICATIONS §6` "a tier-gated control is legibly disabled + named") |
| **`tokenSpendCapMonthlyUsd`** | the *monthly* *provider* *token spend* a *single* org can incur (the *cost-abuse* backstop, `RATE_LIMITING §5` "the plan's cap is a commercial cap; the platform's cap is the backstop") | USD / month | a *skip* (a *token-spend* cap *trip* → an *over* review *skips* with a *notice*, NFR-18; a *per-org* cap, *distinct* from the *platform* `PLATFORM_TOKEN_SPEND_CAP_USD` backstop, `THREAT_MODEL T-11`) |
| **`auditRetentionDays`** | the *how long* an *audit event* is *retained* (a *compliance* floor, NFR-27 "audit log 180 d min") | days | a *hard-delete* on schedule (a *compliance* floor — an *audit* *retention* that's *below* the *compliance* minimum is a *compliance* defect, `COMPLIANCE_CONSIDERATIONS.md §4`) |

## 2. The four plans (the *ladder*, `plans.ts` is the source of truth; this is the *shape*)

| Plan | `reviewsPerMonth` | `filesPerReview` | `concurrentReviews` | `findingRetentionDays` | `customRules` | `modelTierAccess` | `tokenSpendCapMonthlyUsd` | `auditRetentionDays` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **FREE** | 50 | 20 | 1 | 30 | 3 | `standard` | a *low* cap (a *Free* org *cannot* be a *cost-abuse* vector, `PRICING_STRATEGY §6` "a Free tier's cost is bounded by the routing + the cap") | 180 |
| **DEVELOPER** | 500 | 60 | 3 | 90 | 10 | `standard` | a *modest* cap | 180 |
| **TEAM** | 5,000 | 100 | 10 | 365 | 50 | `standard + strong` | a *Team-level* cap | 180 |
| **ENTERPRISE** | a *configurable* "unlimited-ish" cap (a *negotiated* level, a `config`-driven override, *not* a hardcoded "unlimited") | a *configurable* cap | a *configurable* cap | a *custom* (≥ 365) | a *configurable* cap | `any` (a *frontier* model access) | a *negotiated* per-account cap (a `RATE_LIMITING §6` "the platform cap is a per-plan negotiated ceiling on Enterprise") | a *custom* (≥ 180) |

**The *ladder* logic (a *step*, not a *cliff*, `PRICING_STRATEGY §2` "each rung is a distinct value, not a 10× the previous"):**
- **FREE → DEVELOPER:** a *volume* step (50 → 500 reviews, a *10× volume*; the *same* `standard` model tier; the *per-review cost* is the *same*, the *volume* is *higher*).
- **DEVELOPER → TEAM:** a *capability* step (500 → 5,000 reviews *and* the `standard + strong` tier access — a *stronger* model; the *cost/review rises*, the *price* rises *more* (`COST_MODEL §3` "a Team plan sells the strong model; the cost is higher but the price is much higher")).
- **TEAM → ENTERPRISE:** a *cost-shifting + compliance* step (a *configurable* cap + a *frontier* tier + a *BYOK/Ollama* (a *$0* COGS, `MODEL_ROUTING §6`) + a *data-residency* (a *compliance* play, `COMPLIANCE_CONSIDERATIONS.md`)).

## 3. The *Enterprise* "configurable" dimensions (the *not-a-number* caps)

An *Enterprise* plan's caps are *negotiated* (a *per-account* commercial decision, `PRICING_STRATEGY §7` "the exact price points are a market decision"). The *mechanics* are a *config-driven override* (a `plans.ts` *Enterprise* entry is a *`config`* reference, not a hardcoded "unlimited"):
- **`ENTERPRISE.quota`** is a *`config`* shape (a *per-account* *`org_settings`* override + a *platform* default), *not* a hardcoded "Infinity" (a *hardcoded* "unlimited" is a *cost-abuse* vulnerability, `THREAT_MODEL T-11` — a *genuinely unlimited* plan *can* burn the *platform* budget; the *platform* cap, `PLATFORM_TOKEN_SPEND_CAP_USD`, is the *backstop*).
- **A *Enterprise* *config* is *audited*** (a *per-account* cap *change* is an *audit* event, `DATABASE_DESIGN §7` "a config change is audit-logged").
- **A *Enterprise* *BYOK/Ollama* is a *cost-shifting* *cap-set*** (a *$0* marginal cost to *us*; the *customer's* provider bill / the *customer's* infra is the *cost*, `COST_MODEL §3` "an Enterprise BYOK/Ollama is a near-zero-COGS, high-margin account").

## 4. The *quota check* (the *worker pre-flight*, the *single* enforcement point)

A *quota* check is a *pre-flight* decision (a *before* the *pipeline*, `REVIEW_ENGINE_SPEC §2` stage [0], "a quota gate that's over → skipped, zero AI tokens consumed"):

```
checkQuota(org, month) →
  reviewsUsedThisMonth = aggregate(usage_events, org, month).review_count
  tokenSpendThisMonth  = aggregate(usage_events, org, month).est_usd_cost
  quota = planQuota(org.plan)             // from plans.ts, the source of truth
  if reviewsUsedThisMonth >= quota.reviewsPerMonth  → "skip: quota_exceeded" (a posted notice)
  if tokenSpendThisMonth >= quota.tokenSpendCapMonthlyUsd → "skip: quota_exceeded" (a posted notice)
  if platformTokenSpend >= PLATFORM_TOKEN_SPEND_CAP_USD → "skip: platform_cap" (a cost-abuse backstop, RATE_LIMITING §5)
  else → proceed (the pipeline runs; a cost is recorded to usage_events, AC-306)
```

**The *single enforcement point* property (AC-401 "no hardcoded quota numbers anywhere else"):** the *only* place a *quota number* is *enforced* is this *pre-flight* check (reading from `plans.ts` + `usage_events` + `PLATFORM_TOKEN_SPEND_CAP_USD`). The *dashboard* *displays* the quota (a *read* from `plans.ts`, *not* an *enforcement*); the *API* *validates* a request against the quota (a *read*); the *worker* *enforces* it (the *pre-flight*). A *quota* number in a *second enforcement point* (a *dashboard* that *skips a review*, an *API* that *charges tokens*) is a *defect* (a *two-source* quota is a *drift* vector, the `RELEASE_CRITERIA` gate-11 docs-drift check catches it).

## 5. The *graceful quota-exceeded* behavior (NFR-18 "the skip-with-notice, never a silent stop")

A *quota-exceeded* review is *never* *silent* (NFR-18, `THREAT_MODEL T-11` "a skip is never silent; every quota/rate/budget stoppage leaves a user-visible record"):
- **The *job* is `skipped: quota_exceeded`** (a *job status* + a *`skip_reason`*, `DATABASE_DESIGN §3` "a skipped job has a skip_reason").
- **A *notice* is *posted* on the PR** (a "Quota reached this period. Upgrade or reduce review volume." — a *customer-visible* record, `BILLING_SPECIFICATION §8` "a billing state that stops reviews always has a customer-visible record").
- **A *dashboard* *row* + a *banner*** (the *org* sees the *skip* + the *reason* + the *upgrade* path, `PAGE_SPECIFICATIONS §5` "the 80% banner" + `USER_JOURNEYS J4` "the quota warning email + in-app banner").
- **The *skip* consumes *zero* AI tokens** (AC-402 "the skip is before the AI stage; a skipped review is not a cost" — a *quota* *skip* is a *cost-control*, not a *cost* — an *over-quota* review that *still* *incurs* a *cost* is a *cost-abuse* defect, `ST-cost-abuse`).

## 6. The *quota* *source of truth* + the *drift gate*

- **`plans.ts` is the *single* source** (the *quota numbers* + the *`planQuota(plan)` resolver* + the *four* *`*_QUOTA` constants*, `AC-401`). The *existing scaffold* (`packages/contracts/src/index.ts`) *re-exports* `FREE_QUOTA`, `DEVELOPER_QUOTA`, `TEAM_QUOTA`, `ENTERPRISE_QUOTA` *from* `./plans.js` (a *missing* module, `PROJECT_DISCOVERY §4.1` "the first concrete gap to close" — `plans.ts` is *created* to *define* them).
- **The *drift gate* (the `RELEASE_CRITERIA` gate-11):** a *code-review* check that *greps* the *repo* for *hardcoded* *quota numbers* *outside* `plans.ts` (a *`50`* / a *`500`* / a *`5000`* *review* quota in a *non-plans* file is a *drift* — a *two-source* quota). The *dashboard* / the *API* / the *worker* *import* from `plans.ts` (a *single* import surface, `packages/contracts/src/index.ts` "re-export plan helpers (single import surface)").
- **A *quota* *change* is a *`plans.ts`* change + a *migration*** (a *quota* that's *bumped* for a *plan* is a *`plans.ts`* edit + a *`org_billing`* / a *`org_settings`* *reconciliation* (an *existing* org's *effective* quota *updates*), a *docs* update (the *ladder* in this doc), a *drift-gate* re-run).

## 7. The *quota* *edge cases* (the *graceful* *behaviors*, NFR-18)

| Edge case | The behavior | The *rule* |
| --- | --- | --- |
| A *review* that *exactly hits* the cap (a *50th* review on a *50-cap* Free plan) | the *50th* review *runs* (the *cap* is *reached*, not *exceeded*); the *51st* *skips* | a *cap* is a *`>=`* *trip* (a *50th* is *within*, a *51st* is *over*, `§4`'s "reviewsUsed >= quota") |
| A *review* that's *in-flight* when the cap is *reached* (a *concurrent* job) | the *in-flight* job *finishes* (a *not skipped mid-run* — a *skip* is a *pre-flight* decision, a *not a mid-run* one); a *new* enqueue *skips* | a *quota* *skip* is a *pre-flight* gate (a *before* the pipeline, `REVIEW_ENGINE_SPEC §2` stage [0], "the skip is before the AI stage") |
| A *plan* *upgrade* mid-month (a *Free → Team* upgrade) | the *new* (higher) quota *applies* from the *upgrade* (a *not* a *retroactive* re-billing — a *mid-month* upgrade *grants* the *new* cap for the *remainder* of the month; the *used* reviews are *not* re-billed) | a *plan* change takes effect on the *next window* (a *`RATE_LIMITING §4` "a plan change takes effect on the next window, not mid-window"* — a *mid-month* *upgrade* is a *new* window for the *quota* (a *`monthly`* aggregate *resets* on the *upgrade*), the *billing* is a *proration* (a *billing* detail, `BILLING_SPECIFICATION §7 "an upgrade is a client request that initiates the provider flow"*)) |
| A *plan* *downgrade* mid-month | the *new* (lower) quota *applies at period end* (§4 "on a downgrade, the new quota applies at period end", `RATE_LIMITING §4`) | a *downgrade* is *not* retroactive (a *month's* usage is billed at the old plan, a *new* month at the new plan, `BILLING_SPECIFICATION §7`) |
| A *token-spend cap* *breach* on a *high-cost* *review* (a *single* *giant* *PR*) | the *over* review *skips* (a *token-spend* cap is a *`>=`* trip, a *`§4`'s "tokenSpendThisMonth >= cap"*) | a *token-spend* cap is a *cost-abuse* backstop (a *single* *giant* PR that would *breach* the *cap* *skips* (a *not a partial* — a *partial* *that exceeds the cap* is a *cost-abuse* defect, `ST-cost-abuse` "a flood is bounded by the platform cap; the over-cap jobs skip")) |

## 8. The *quota* *observability* (the "a skip is observable" requirement, NFR-18, DEFINITION OF DONE #12)

A *quota* *skip* is *observable* in *three* places (a *never-silent* invariant, NFR-18):
- **The *job* row** (a `review_jobs.status = skipped` + a `skip_reason = quota_exceeded`, `DATABASE_DESIGN §3` "a skipped job has a skip_reason").
- **The *PR* notice** (a *posted* "Quota reached" comment, a *customer-visible* record, `BILLING_SPECIFICATION §8`).
- **The *dashboard*** (a *failed/skipped* *view* + a *quota strip* [the `Charts.plan` track, `PAGE_SPECIFICATIONS §5 "the quota strip"]` + a *banner*, the "80% warning" `USER_JOURNEYS J4`).

**The *quota* *anomaly* *alert* (`RATE_LIMITING §6` "an org whose review volume spikes > 3× its 30-day baseline gets an ops alert + a dashboard banner"):** a *quota* *near-miss* (a *80%* of the cap) is a *warning*; a *quota* *breach* (a *100%*) is a *skip* + a *notice*; a *quota* *flood* (a *3×* baseline *spike*) is an *anomaly* *alert* (a *cost-abuse* *detection*, a *surfaced* not a *hidden*, `THREAT_MODEL T-11` "the skip-with-notice is a UX rule and an abuse-detection signal").
