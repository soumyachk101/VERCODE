# VERCODE — SaaS Launch Plan

The go-to-market for VERCODE: the *target*, the *wedge*, the *activation* funnel (the *connect* path), the *launch* sequence. The *product* capability is `MVP_SCOPE.md` (a *what we ship*); this is the *how we get the first N teams* — and it's *honest* about what's *external* (a *GitHub App* + a *domain* are *launch* *prerequisites*, not *product* features).

> **The direction (recorded here, 2026-07):** VERCODE **launches without paid tiers.** The pricing/plan/quota/billing system is removed from the product: no plans, no tiers, no billing page, no quota-based gating. Usage remains as a **plain usage report** — information about what was reviewed, not a meter on a bill. The *activation* funnel is the **GitHub connection** (sign-up → connect your repo → first review), not a free-tier-to-paid conversion. This document's former "Free tier activation / quota-driven conversion / Free→paid" sections are restated below as that direction; the launch sequence keeps its P0–P3 phasing but drops every billing prerequisite.

## 1. The *wedge* (the *one-line* *positioning*)

> **VERCODE is the AI code-review that a team actually reads** — a *deterministic-first* pipeline (a *static analysis* + a *task-routed AI*) that posts a *summary verdict* + *evidence-backed inline comments* on a GitHub PR, and a *dashboard* that *answers the org's risk question*, not just the PR's.

The *wedge* is the *anti-CodeRabbit* position (a *PRODUCT_VISION* "the dominant failure mode of AI review tools is noise"; a *differentiator* "a deterministic precision, an evidence-backed reasoning, a workspace not just a bot"). The *one-line* *wedge* is what a *launch* *post* / a *landing page* / a *sales* *deck* says (a *consistency* across the *marketing*, the *product*, and the *docs* — a *launch* that says *one thing* in the *post* and *another* in the *dashboard* is a *trust* *deficit*, `PRODUCT_VISION §4 "a review verdict + risk narrative as a first-class artifact"`). The landing page frames the product as **"connect your repo, get reviews"** — a connection CTA, not a pricing CTA (`WEBSITE/PRD.md`'s direction note).

## 2. The *target* *segments* (the *who*, `USER_PERSONAS`)

| Segment | The *why* they *adopt* | The *path* | The *sales* *motion* |
| --- | --- | --- | --- |
| **A *small team* (3–20 devs, a *GitHub-native* SaaS startup)** | a *second pair of eyes* on *PRs* that *isn't noise* | sign-up → *connect the GitHub App* → *select repositories* → *first review* (the *J1* onboarding) | a *self-serve* (a *sign-up* → a *GitHub App install* → a *first review* — the *J1* onboarding, a *no-sales* motion, a *product-led* growth) |
| **A *mid-market team* (20–200 devs)** | a *security* rollup + a *finding-trend* view + a *tech-lead* *triage* path (a *Marcus* *persona*, a *Security* rollup + a *finding-trend* chart) | the *same* connect path; the adoption wedge is the dashboard's triage value, not a tier upgrade | a *product-led* + a *light-touch* sales (a *Team*-class *org* that *adopts* the *security rollup* → a *usage report* + *audit trail* deepens the seat) |
| **An *Enterprise* (a *frontier* model + a *BYOK/Ollama* + a *compliance* + a *residency*)** | a *cost-shifting* (a *BYOK/Ollama* = a *$0* *COGS* to *us*, `COST_MODEL §3 "an Enterprise BYOK/Ollama is a near-zero-COGS, high-margin account"`); a *compliance* (a *SOC 2* evidence, `COMPLIANCE_CONSIDERATIONS §2`); a *residency* (a *Phase 3* *feature*, a *documented* *future*, `COMPLIANCE_CONSIDERATIONS §6 "a residency commitment is not made until Phase 3"*) | the *same* connect path; the enterprise wedge is *BYOK* + *compliance* + *residency*, delivered to the *same* product surface (no enterprise-only plan) | a *sales-led* (a *named* *account* + a *security* review + a *BYOK/Ollama* *integration* + a *compliance* packet — a *high-touch* motion, a *longer* *sale*, a *higher* *margin*) |

**The *launch* *focus* (a *beachhead*, not a *big-tent*):** a *mid-market* *SaaS* *team* (a *20–200* dev org, a *GitHub-native*, a *security-conscious* — a *product-led* *wedge*). A *launch* that *targets* *everyone* is a *launch* that *targets* *no one* (a *wedge* is a *narrow* *first* *customer*, a *expand* *later*). The *beachhead* is *documented* (a *ICP* [ideal-customer profile]: a *GitHub-native SaaS team*, 20–200 devs, a *security-conscious*, a *willing* to *connect* its *repos* for a *strong-model* review).

**The *monetization* note (stated, honest):** a *launch* *without* *paid* *tiers* is a *launch* *with* a *conversion* *question* (a *how* *do* *we* *revenue* *this* *later* — a *BYOK* *cost-recovery*, a *seat-based* *enterprise* *contract*, a *future* *decision*). The *launch* *plan* *does not* *speculate* in *this* *document*: the *pricing* *system is* *removed*, and the *monetization* *re-introduction* (if any) is a *P3*+ *commercial* *decision* *owned* *by* *the* *commercial* *lead*, *not* *a* *launch* *prerequisite*. Until then, the *activation* + *retention* *metrics* *below* are the *product* *metrics* — no *Free→paid* *conversion* *row*.

## 3. The *activation* *funnel* (the *connect* *path*, `MVP_SCOPE` "a user signs in → creates an org → installs the App on a test repo → a real PR webhook is received + verified → a review job is processed" — the DEFINITION OF DONE #1–#6)

A *connect* *activation* is a *J1* onboarding (`USER_JOURNEYS J1`): a *sign-up* → a *create org* → a *GitHub App install* (a *real* install, a *`FR-201` "a GitHub App installation flow via the app install URL, server-side"*) → a *repository* *selection* (a *per-org* *settings* *row*, a *dashboard* *`/repositories`* *connect* *flow*, the *`/api/v1/github/*`* *surface*, `WEBSITE/TECHNICAL_ARCHITECTURE.md §9`*) → a *first review* (a *real* webhook, a *real* review published on a *real* PR). The *activation* metric is the *"first review published within 10 min of GitHub install"* (`SUCCESS_METRICS "activation: ≥ 80% of orgs reach first-review within 10 min of install"`).

**The *activation* *friction* (the *external* *prerequisites*, a *honest* *launch* *blocker* list):**
- **A *GitHub App* is a *real* *App** (a *`GITHUB_APP_ID`* + a *`GITHUB_APP_PRIVATE_KEY`* + a *webhook* secret — a *launch* *prerequisite*, a *not* a *product* feature; a *dev-stack* (a *mock* GitHub) *proves* the *pipeline*, a *live* App is the *launch* *gate*, `DEPLOYMENT.md §5 "a deploy without the external credentials runs the dev-stack (mock) but not the live pipeline"`).
- **An *AI provider key* is a *real* key** (a *platform* OpenAI/Anthropic key for the *default* routing, a *launch* *prerequisite*; a *BYOK/Ollama* is an *Enterprise* *option*, a *not* a *launch* *requirement*).
- *(The *former* **billing-provider** *prerequisite is removed: no Stripe/Razorpay account, no webhook secret, no test-mode→live flip is part of the launch sequence — there is no billing to go live.)*

**The *honest* *launch* *status* (a *launched* ≠ a *mock-launched*):** a *launch* *claim* is a *live* *launch* (a *real* GitHub App + a *real* provider), *not* a *dev-stack* launch (a *mock* pipeline). A *launch* that's *only* the *dev-stack* is a *pre-launch* (a *"we've built it + tested it in the mock"* state, a *not* a *"it's live"* state). The *`RELEASE_CRITERIA` gate-13* is the *honest* gate: a *live* external suite that's *blocked* (no credentials) is *marked blocked*, *not claimed* (`CI_CD.md §7 "CI does not claim a live integration that the credentialed lane didn't actually run"`).

## 4. The *retention* *path* (usage visibility, *not* a *quota-driven* *upsell*, `SUCCESS_METRICS "actioned-finding rate"`-backed)

The *former* *Free* → *paid* *conversion* *section* (a *quota* *banner*, a *skip-with-notice* at the cap, a *`BILLING_SPECIFICATION §7`* *upgrade* *flow*) is **removed** with the billing system. What *replaces* it is a **plain usage-report** loop:

1. **A *org* *activates*** (a *connect* + a *first review*, a *J1*).
2. **The *usage report* *shows* the team what ran** (reviews/day + per-repo + per-PR, the token + prompt-version attribution per review — `USAGE_QUOTAS`'s former *quota* *rows* are gone; the *same* *data* *shapes* *now* *feed* a *report*, not a cap).
3. **Findings *drive* *retention*** (a *finding* *actions* *rate*, the *north-star*, `SUCCESS_METRICS "actioned-finding rate ≥ 10–18%"`): a team that *acts* on *findings* is the *retention* *mechanism* — no *80% banner*, no *quota warning email*, no *skip-with-notice* (a `NFR-18`'s skip-with-notice *rule is removed* with the quota it enforced; a *failed* *review* *still* *posts* a *notice*, but the *notice* *never* *is* "you hit your cap — upgrade").
4. **A *usage-based* *revenue* *question* is *deferred*** (a *P3*+ *commercial* *decision*, §2's *monetization* note) — the *launch* *does not* *gate* on it.

**The *honest* *note*:** a *launch* *without* *gating* *means* a *low-volume* *team* *is* a *retained* *team* (the *former* "a low-volume Free org is a not-a-lead / churn risk" caveat no longer applies as a *billing* *caveat — it applies as a* *usage-report* *question* (a team that *connects* and *never* *acts* *on* *findings* *is* a *churn* *risk* *by* *engagement*, not *by* *a* *quota* *wall*). The *usage* *report* *is* the *signal* for that: reviews run over time, no "cap" row, a *retention* *team* reads *activity*, not a meter.

## 5. The *launch* *sequence* (a *phased*, a *honest* *timeline*)

| Phase | The *what* | The *gate* (a *measured*, not a *claimed*, `RELEASE_CRITERIA`) |
| --- | --- | --- |
| **P0: a *dev-stack* *verified*** | the *pipeline* works *end-to-end* in the *Compose* stack (a *mock* GitHub + a *mock* AI), a *review* is *published* on a *mock* PR (a *mock* billing is no longer part of the stack — it's removed, not mocked) | a *`E2E_TEST_PLAN` dev-stack run* + a *`RELEASE_CRITERIA` gates 1–12* (a *typecheck, lint, unit, integration, security, tenant, benchmark, E2E, a11y, design, docs-drift, supply-chain*) — a *dev-stack* *verified* |
| **P1: a *live* *integration*** | a *real* GitHub App + a *real* provider, a *real* PR *webhook* + a *real* review *published* (a *live* *billing is no longer a P1 row — it's removed from the sequence*) | a *`E2E_TEST_PLAN §5 "the release lane"* + a *`RELEASE_CRITERIA` gate-13* (a *live external suite*, a *credentialed* lane) — a *live* *verified* (a *"a real PR webhook is received + verified + a review published"*, a *DEFINITION OF DONE #4*) |
| **P2: a *public* *launch*** | a *public* sign-up (a *domain* + a *marketing site* + a *GitHub App* that's *publicly installable* + a *docs site*), a *connect* *flow* that's *publicly* usable (the *former* "a *pricing* *page*" row is removed; the *landing* CTA is the *connect* CTA, `WEBSITE/PRD.md`'s direction note) | a *launch* *checklist* (a *domain*, a *GitHub App public*, a *docs* live, a *status page* live, a *support* live — no *billing* row, no *pricing* row) — a *public* *launched* |
| **P3: a *designated* *market*** | the *INR* *market* (a *DPDP* alignment, a *compliance* packet — a *Razorpay* *adapter* is *out of* the *scope: no* *billing*), a *compliance* *packet* (a *SOC 2* evidence, `COMPLIANCE_CONSIDERATIONS §2`) | a *market* *launch* (a *compliance* *packaged*) — a *market* *launched* |

**The *launch* *status* (a *honest* *report*, a *`CI_CD §7 "do not fabricate… deployments"`*):** each *phase* has a *measured* *state* (a *dev-stack verified* / a *live verified* / a *public launched* / a *market launched*), a *not* a *vague* "we're launching." A *launch* *report* *names* the *phase* + the *measured gate* that *passed* (a *"P1: the live integration is verified — a real GitHub App, a real provider; the live external suite (gate-13) passed on [date]"* — a *claim* that's a *measurement*, a *not* a *hope*).

## 6. The *launch* *metrics* (a *`SUCCESS_METRICS`-backed*, a *measured*, not a *projected*)

| Metric | The *target* (`SUCCESS_METRICS`) | The *launch* *relevance* |
| --- | --- | --- |
| **Activation** | a *first review* *within 10 min of* GitHub install, *≥ 80% of orgs* | a *P2* *launch* *KPI* (a *activation* rate *measured* from a *real* install, a *not* a *mock* activation) |
| **Actioned-finding rate** | *≥ 18%* (a *product* *KPI*, the *north-star*) | a *retention* *KPI* — the *engagement* *signal* that *replaces* the *former* *Free→paid* row |
| **Churn (monthly)** | *≤ 4%* (a *usage-report* *measurement*: a *org* whose *reviews/day* *trend* *flattens* is a *churn* *signal*, *not* a *quota* *signal*) | a *P2* *KPI* |
| **A *revenue* *row* is *absent*** | — | a *launch* *launched* *without* *paid* *tiers* has *no* *NRR* / *Free→paid* row; a *monetization* *re-introduction* (if any) is a *P3*+ *commercial* *decision* (§2's note), *not* a *launch* *metric* |

**The *launch* *report* (a *`SUCCESS_METRICS "what we explicitly do NOT optimize for"`*):** a *launch* *report* *names* the *measured* *metrics* (a *activation* + a *actioned-finding rate* + a *churn*), a *not* a *projected* "we'll have 100 customers." A *launch* that's *claimed* without a *measured* metric is a *not a* launch (a *"launched"* = a *measured* *state*, a *`RELEASE_CRITERIA §2 "the pass is a measurement, not a checkbox"`* applied to *launch*).

## 7. The *launch* *prerequisites* (the *external*, a *honest* *blocker* list, `PHASE 10 "any unverified external integration must be explicitly marked as blocked or unverified"`)

A *launch* is *blocked* (a *not claimed*) on:
- **A *live* GitHub App** (a *real* App ID + key + webhook, a *not* a mock) — *a P1 gate* (a *P2* is *blocked* until a *live App is verified*).
- **A *platform* provider key** (a *real* OpenAI/Anthropic key for the *default* routing) — *a P1 gate*.
- **A *domain* + a *marketing site* + a *docs site* + a *status page*** — *a P2 gate* (a *former* "a *pricing* *page*" row is removed from the checklist, §5's P2).
- **A *KMS* for the *BYOK master* + the *App key*** — *a P1 gate* (a *live* deploy needs a KMS, a *dev-stack* doesn't).
- *(The *former* **live billing** prerequisite — a *Stripe/Razorpay* *live* — is removed: there is no billing to verify live. The *P2* gate list is shorter, not merely re-worded.)*

**The *honest* *launch* *status* (a *blocked* vs a *verified*, `DEPLOYMENT.md §5 "a deploy that's missing the external credentials is marked live-integration-blocked"`):** a *launch* *report* *names* each *prerequisite* + its *state* (a *"verified"* / a *"blocked — requires [external]"*), a *not* a *vague* "we're almost ready." A *launch* that's *blocked* on a *prerequisite* is *marked* *blocked* (a *`PHASE 10` "any unverified external integration must be explicitly marked as blocked or unverified"*), a *not* *claimed* *launched*.

## 8. The *post-launch* (a *P3* *expand*, a *`FEATURE_ROADMAP`-backed*)

A *launch* is a *P2*; a *P3* is a *market expand* (a *INR market* — a *DPDP* *alignment*, no *billing* *adapter*, a *compliance packet*, a *Enterprise* account) + a *product depth* (a *P1* features that *didn't* make the *launch*: a *SSO*, a *BYOK UI polish*, a *content-hash dedup*, a *test-file discovery*, `FEATURE_ROADMAP Phase 1`) + a *commercial re-decision* (a *monetization* *question*, §2's note: a *re-introduction* of *paid* *tiers* is a *P3*+ *commercial* *decision*, *deferred*, not a *launch* assumption). A *launch* *report* *names* the *P3* *roadmap* (a *launch* *plan* that's *only* a *P2* is a *not a* *plan* — a *launch* is a *milestone*, a *not* the *end*).
