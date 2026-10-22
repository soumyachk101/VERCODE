# VERCODE — SaaS Launch Plan

The go-to-market for VERCODE: the *target*, the *wedge*, the *activation* funnel (the *Free* tier), the *conversion* path, and the *launch* sequence. The *product* capability is `MVP_SCOPE.md` (a *what we ship*); this is the *how we get the first N customers* — and it's *honest* about what's *external* (a *GitHub App* + a *billing provider* + a *domain* are *launch* *prerequisites*, not *product* features).

## 1. The *wedge* (the *one-line* *positioning*)

> **VERCODE is the AI code-review that a team actually reads** — a *deterministic-first* pipeline (a *static analysis* + a *task-routed AI*) that posts a *summary verdict* + *evidence-backed inline comments* on a GitHub PR, and a *premium dashboard* that *answers the org's risk + cost question*, not just the PR's.

The *wedge* is the *anti-CodeRabbit* position (a *PRODUCT_VISION* "the dominant failure mode of AI review tools is noise"; a *differentiator* "a deterministic precision, an evidence-backed reasoning, a cost discipline, a workspace not just a bot"). The *one-line* *wedge* is what a *launch* *post* / a *landing page* / a *sales* *deck* says (a *consistency* across the *marketing*, the *product*, and the *docs* — a *launch* that says *one thing* in the *post* and *another* in the *dashboard* is a *trust* *deficit*, `PRODUCT_VISION §4 "a review verdict + risk narrative as a first-class artifact"`).

## 2. The *target* *segments* (the *who*, `USER_PERSONAS` + `PRICING_STRATEGY`'s ladder)

| Segment | The *why* they *buy* | The *plan* | The *sales* *motion* |
| --- | --- | --- | --- |
| **A *small team* (3–20 devs, a *GitHub-native* SaaS startup)** | a *second pair of eyes* on *PRs* that *isn't noise*; a *cost* that's *predictable* (a *Free/Developer* *activation* + a *Team* *conversion*) | a *Free* *activation* → a *Developer* → a *Team* | a *self-serve* (a *sign-up* → a *GitHub App install* → a *first review* — the *J1* onboarding, a *no-sales* motion, a *product-led* growth) |
| **A *mid-market team* (20–200 devs, a *Team*-plan)** | a *strong* model + a *security* rollup + a *cost* that *scales* (a *Team* plan's *strong-tier access* + a *5,000-review* quota, `USAGE_QUOTAS`); a *tech-lead* *triage* path (a *Marcus* *persona*, a *Security* rollup + a *finding-trend* chart) | a *Team* | a *product-led* + a *light-touch* sales (a *Team* *org* that *hits* the *quota* → a *Team* *upgrade*, a *self-serve* *upsell*, a *`PAGE_SPECIFICATIONS §5` "the 80% banner" + the upgrade path*) |
| **An *Enterprise* (a *frontier* model + a *BYOK/Ollama* + a *compliance* + a *residency*)** | a *cost-shifting* (a *BYOK/Ollama* = a *$0* *COGS* to *us*, `COST_MODEL §3 "an Enterprise BYOK/Ollama is a near-zero-COGS, high-margin account"`); a *compliance* (a *SOC 2* evidence, `COMPLIANCE_CONSIDERATIONS §2`); a *residency* (a *Phase 3* *feature*, a *documented* *future*, `COMPLIANCE_CONSIDERATIONS §6 "a residency commitment is not made until Phase 3"*) | an *Enterprise* | a *sales-led* (a *named* *account* + a *security* review + a *BYOK/Ollama* *integration* + a *compliance* packet — a *high-touch* motion, a *longer* *sale*, a *higher* *margin*) |

**The *launch* *focus* (a *beachhead*, not a *big-tent*):** a *mid-market* *SaaS* *team* (a *20–200* dev org, a *GitHub-native*, a *security-conscious* — a *Team*-plan *wedge*). A *launch* that *targets* *everyone* is a *launch* that *targets* *no one* (a *wedge* is a *narrow* *first* *customer*, a *expand* *later*). The *beachhead* is *documented* (a *ICP* [ideal-customer profile]: a *GitHub-native SaaS team*, 20–200 devs, a *security-conscious*, a *willing* to *pay* for a *strong-model* review).

## 3. The *activation* *funnel* (the *Free* tier, `MVP_SCOPE` "a user signs in → creates an org → installs the App on a test repo → a real PR webhook is received + verified → a review job is processed" — the DEFINITION OF DONE #1–#6)

A *Free* *activation* is a *J1* onboarding (`USER_JOURNEYS J1`): a *sign-up* → a *create org* → a *GitHub App install* (a *real* install, a *`FR-201` "a GitHub App installation flow via the app install URL, server-side"*) → a *first review* (a *real* webhook, a *real* review published on a *real* PR). The *activation* metric is the *"first review published within 10 min of GitHub install"* (`SUCCESS_METRICS "activation: ≥ 80% of orgs reach first-review within 10 min of install"`).

**The *activation* *friction* (the *external* *prerequisites*, a *honest* *launch* *blocker* list):**
- **A *GitHub App* is a *real* *App** (a *`GITHUB_APP_ID`* + a *`GITHUB_APP_PRIVATE_KEY`* + a *webhook* secret — a *launch* *prerequisite*, a *not* a *product* feature; a *dev-stack* (a *mock* GitHub) *proves* the *pipeline*, a *live* App is the *launch* *gate*, `DEPLOYMENT.md §5 "a deploy without the external credentials runs the dev-stack (mock) but not the live pipeline"`).
- **A *billing provider* is a *real* provider** (a *Stripe* *account* / a *Razorpay* account for the *INR* market, a *webhook* secret, a *test-mode* → a *live* — a *launch* *prerequisite*, a *billing* that's *stubbed* is *not* a *launch* state, `BILLING_SPECIFICATION §1 "a Stripe test-mode that's deterministic"` — a *launch* flips the *test-mode* to a *live*).
- **An *AI provider key* is a *real* key** (a *platform* OpenAI/Anthropic key for the *default* routing, a *launch* *prerequisite*; a *BYOK/Ollama* is an *Enterprise* *option*, a *not* a *launch* *requirement*).

**The *honest* *launch* *status* (a *launched* ≠ a *mock-launched*):** a *launch* *claim* is a *live* *launch* (a *real* GitHub App + a *real* provider + a *live* billing), *not* a *dev-stack* launch (a *mock* pipeline). A *launch* that's *only* the *dev-stack* is a *pre-launch* (a *"we've built it + tested it in the mock"* state, a *not* a *"it's live"* state). The *`RELEASE_CRITERIA` gate-13* is the *honest* gate: a *live* external suite that's *blocked* (no credentials) is *marked blocked*, *not claimed* (`CI_CD.md §7 "CI does not claim a live integration that the credentialed lane didn't actually run"`).

## 4. The *conversion* *path* (a *Free* → a *paid*, `SUCCESS_METRICS "Free→paid conversion ≥ 8% of active free orgs in 60 d"`)

A *Free* → a *paid* conversion is a *quota-driven* *upsell* (a *`PAGE_SPECIFICATIONS §5` "the 80% banner + the upgrade path"*):
1. **A *Free* org *activates*** (a *first review*, a *J1*).
2. **A *Free* org *hits* the *quota*** (a *50-review* month cap, `USAGE_QUOTAS §2 "Free: 50 reviews/mo"`).
3. **A *quota* *warning*** (a *80%* banner + a *email*, `USER_JOURNEYS J4 "the quota warning email + in-app banner"`).
4. **A *quota* *skip*** (a *51st* review *skips* + a *"Quota reached"* notice, `NFR-18` "the skip-with-notice, never a silent stop").
5. **A *conversion*** (a *Team/Developer* upgrade, a *`BILLING_SPECIFICATION §7 "an upgrade initiates the provider flow"`* + a *verified webhook confirms* it).

**The *conversion* *friction* (a *honest* *note*):** a *Free* org that *never* *hits* the *quota* (a *low-volume* *team*) *doesn't* *convert* (a *a *low-volume* Free org is a *not-a-lead*, a *a *churn* risk). A *Free* → *paid* *conversion* is a *volume-driven* path (a *high-volume* Free org *converts*; a *low-volume* Free org *doesn't*). A *launch* *plans* for this (a *Free* tier that's *low-volume* is a *not* a *conversion* *source*; a *Team* plan that's *volume-gated* is a *conversion* *source*).

## 5. The *launch* *sequence* (a *phased*, a *honest* *timeline*)

| Phase | The *what* | The *gate* (a *measured*, not a *claimed*, `RELEASE_CRITERIA`) |
| --- | --- | --- |
| **P0: a *dev-stack* *verified*** | the *pipeline* works *end-to-end* in the *Com* stack (a *mock* GitHub + a *mock* AI + a *mock* billing), a *review* is *published* on a *mock* PR | a *`E2E_TEST_PLAN` dev-stack run* + a *`RELEASE_CRITERIA` gates 1–12* (a *typecheck, lint, unit, integration, security, tenant, benchmark, E2E, a11y, design, docs-drift, supply-chain*) — a *dev-stack* *verified* |
| **P1: a *live* *integration*** | a *real* GitHub App + a *real* provider + a *live* billing (a *Stripe/Razorpay* test-mode → a *live*), a *real* PR *webhook* + a *real* review *published* | a *`E2E_TEST_PLAN §5 "the release lane"`* + a *`RELEASE_CRITERIA` gate-13* (a *live external suite*, a *credentialed* lane) — a *live* *verified* (a *"a real PR webhook is received + verified + a review published"*, a *DEFINITION OF DONE #4*) |
| **P2: a *public* *launch*** | a *public* sign-up (a *domain* + a *marketing site* + a *GitHub App* that's *publicly installable* + a *pricing page* + a *docs site*), a *Free* tier that's *publicly* available | a *launch* *checklist* (a *domain*, a *billing live*, a *GitHub App public*, a *pricing* live, a *docs* live, a *status page* live, a *support* live) — a *public* *launched* |
| **P3: a *designated* *market*** | the *INR* *market* (a *Razorpay* adapter, a *INR* pricing, a *DPDP* alignment, `ADR-009 "a Razorpay adapter for the INR market"`), a *compliance* packet (a *SOC 2* evidence, `COMPLIANCE_CONSIDERATIONS §2`) | a *market* *launch* (a *provider* *eligible*, a *compliance* *packaged*, a *pricing* *market-adjusted*) — a *market* *launched* |

**The *launch* *status* (a *honest* *report*, a *`CI_CD §7 "do not fabricate… deployments"`*):** each *phase* has a *measured* *state* (a *dev-stack verified* / a *live verified* / a *public launched* / a *market launched*), a *not* a *vague* "we're launching." A *launch* *report* *names* the *phase* + the *measured gate* that *passed* (a *"P1: the live integration is verified — a real GitHub App, a real provider, a live billing test-mode; the live external suite (gate-13) passed on [date]"* — a *claim* that's a *measurement*, a *not* a *hope*).

## 6. The *launch* *metrics* (a *`SUCCESS_METRICS`-backed*, a *measured*, not a *projected*)

| Metric | The *target* (`SUCCESS_METRICS`) | The *launch* *relevance* |
| --- | --- | --- |
| **Activation** | a *first review* *within 10 min of* GitHub install, *≥ 80% of orgs* | a *P2* *launch* *KPI* (a *activation* rate *measured* from a *real* *install*, a *not* a *mock* activation) |
| **Free→paid conversion** | *≥ 8% of active free orgs in 60 d* | a *P2→P3* *KPI* (a *conversion* *funnel* from a *real* *Free* org) |
| **NRR (Team+)** | *≥ 100% by month 6* | a *P3* *KPI* (a *revenue* *retention* *measured* from a *live* billing) |
| **Churn (Team+ monthly)** | *≤ 4%* | a *P2* *KPI* (a *churn* *measured* from a *live* billing) |
| **Actioned-finding rate** | *≥ 18% (Team+)* / *≥ 10% (Free/Dev)* | a *product* *KPI* (a *`finding_actions`* *measured*, a *north-star*, `SUCCESS_METRICS`) |

**The *launch* *report* (a *`SUCCESS_METRICS "what we explicitly do NOT optimize for"`*):** a *launch* *report* *names* the *measured* *metrics* (a *activation* + a *conversion* + a *NRR* + a *actioned-finding rate*), a *not* a *projected* "we'll have 100 customers." A *launch* that's *claimed* without a *measured* metric is a *not a* launch (a *"launched"* = a *measured* *state*, a *`RELEASE_CRITERIA §2 "the pass is a measurement, not a checkbox"`* applied to *launch*).

## 7. The *launch* *prerequisites* (the *external*, a *honest* *blocker* list, `PHASE 10 "any unverified external integration must be explicitly marked as blocked or unverified"`)

A *launch* is *blocked* (a *not claimed*) on:
- **A *live* GitHub App** (a *real* App ID + key + webhook, a *not* a mock) — *a P1 gate* (a *P2* is *blocked* until a *live App is verified*).
- **A *live* billing** (a *Stripe/Razorpay* *live*, a *not* a test-mode) — *a P2 gate* (a *public launch* is *blocked* until a *live billing is verified*; a *test-mode* is a *pre-launch*).
- **A *platform* provider key** (a *real* OpenAI/Anthropic key for the *default routing*) — *a P1 gate*.
- **A *domain* + a *marketing site* + a *docs site* + a *status page*** — *a P2 gate*.
- **A *KMS* for the *BYOK master* + the *App key*** — *a P1 gate* (a *live* deploy needs a KMS, a *dev-stack* doesn't).

**The *honest* *launch* *status* (a *blocked* vs a *verified*, `DEPLOYMENT.md §5 "a deploy that's missing the external credentials is marked live-integration-blocked"`):** a *launch* *report* *names* each *prerequisite* + its *state* (a *"verified"* / a *"blocked — requires [external]"*), a *not* a *vague* "we're almost ready." A *launch* that's *blocked* on a *prerequisite* is *marked* *blocked* (a *`PHASE 10` "any unverified external integration must be explicitly marked as blocked or unverified"`), a *not* *claimed* *launched*.

## 8. The *post-launch* (a *P3* *expand*, a *`FEATURE_ROADMAP`-backed*)

A *launch* is a *P2*; a *P3* is a *market expand* (a *INR market*, a *compliance packet*, a *Enterprise* account) + a *product depth* (a *P1* features that *didn't* make the *launch*: a *SSO*, a *BYOK UI polish*, a *content-hash dedup*, a *test-file discovery*, `FEATURE_ROADMAP Phase 1`). A *launch* *report* *names* the *P3* *roadmap* (a *launch* *plan* that's *only* a *P2* is a *not a* *plan* — a *launch* is a *milestone*, a *not* the *end*).
