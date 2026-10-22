# VERCODE — Billing Specification

The *mechanics* of the billing system: the plan state machine, the provider-agnostic `BillingProvider` boundary, the verified-webhook rule, the idempotency, and the quota-enforcement flow. The *commercial* numbers (the plan ladder, the pricing) are in `PRICING_STRATEGY.md`; the *quota* source-of-truth is `packages/contracts/src/plans.ts` (AC-401). This document is the *engineering contract* for `packages/billing`.

## 1. The provider-agnostic boundary (`packages/billing`)

The *state machine* + the *webhook-verification pattern* are **provider-agnostic**; the *adapter* is a swappable leaf (`ADR-009`, `INTEGRATION_DESIGN §2`):

```ts
interface BillingProvider {
  readonly id: string;                     // "stripe" | "razorpay"
  createCustomer(org): Promise<externalCustomerId>;
  startSubscription(org, plan, externalCustomerId): Promise<subscriptionId>;
  handleEvent(rawBody, signatureHeader): Promise<VerifiedEvent>;  // verify + decode
  cancelSubscription(subscriptionId, atPeriodEnd: boolean): Promise<void>;
  fetchInvoices(customerId): Promise<Invoice[]>;
}
```

- **Stripe** is the *default* adapter (a *global-card* + a *mature state machine* + a *test-mode* that's *deterministic*, `TECH_STACK`'s billing row).
- **Razorpay/Rajatko** is the *INR-market* adapter (a *UPI + INR* *acquisition*, a *local* *compliance*, `ADR-009`, `PRICING_STRATEGY §5`). A *deployment* selects the adapter via `BILLING_PROVIDER` (`ENVIRONMENT_VARIABLES §4`); the *state machine* + the *webhook-verification pattern* are *identical* across adapters (a *swap* is a *config* change, not a *redesign*).
- **The *state machine* is the *authoritative* plan source** (`org_billing.status` + `org_billing.plan`, `DATABASE_DESIGN §3` "the billing side is authoritative, `organizations.plan` is the effective plan, reconciled") — a *plan change* is a *billing event*, not a *client claim*.

## 2. The plan state machine (the *authoritative* states)

```
        ┌─────────┐  subscription.created/trial  ┌──────────┐
        │(none)   │──────────────────────────────▶│ TRAILING │
        └─────────┘                               └────┬─────┘
        invoice.paid / subscription.updated            │
        ┌─────────┐  (a paid plan)                     ▼
        │ ACTIVE  │◀──────────────────────── ┌──────────┐
        └────┬────┘  subscription.updated    │ (plan ⇄) │
             │   (a plan change:              └──────────┘
             │    upgrade/downgrade,          current_period_end advances)
             │  atPeriodEnd semantics)
             │
   invoice.payment_failed
             ▼
        ┌──────────┐   grace period (reviews still run, a warning surfaced)
        │PAST_DUE  │──────────────────────────────────────────┐
        └────┬─────┘  (grace exceeded)                        │
             │  subscription.deleted (at end)                   │
             ▼                                                  ▼
        ┌──────────┐                                    ┌──────────┐
        │ CANCELED │◀───────────────────────────────────┤(grace    │
        └──────────┘  (a canceled sub, quota frozen,     │expired) │
             │            new reviews skipped w/ notice)  └──────────┘
             │  (a re-subscribe: a new subscription → ACTIVE)
             ▼
        ┌──────────┐
        │ (new sub)│────▶ ACTIVE (the plan's new state)
        └──────────┘
```

**The *authoritative-state rule* (AC-403, `THREAT_MODEL T-14`):** *only* a *verified* provider webhook *moves* this machine. A *client claim* ("I'm on Team") is *inert* (the dashboard shows the *provider-confirmed* state, with an "Upgrading…" *pending* state until the webhook confirms it, `API_SPECIFICATION` "the 'Upgrading…' state persists until the webhook confirms it"). A *forged / unsigned* event is *rejected + audited* (a `BILLING_REJECTED`, no state change).

## 3. The verified-webhook + idempotency (the *only* plan-state mover)

- **The *event* is *verified*** (a *provider signature* — Stripe's `Stripe-Signature` = `t=timestamp,v1=hmac` over the raw body, or Razorpay's `x-razorpay-signature`; a *mismatch* → `401 BILLING_REJECTED` + an audit, `WEBHOOK_SPECIFICATION §2.1`).
- **The *event id* is *idempotent*** (a `billing_events (provider, provider_event_id)` UK, `DATABASE_DESIGN §3` — a *re-delivered* event is a *no-op*, `IT-payment-03` (AC-403) "a replay is a 200 no-op").
- **The *foreign-customer* event is *rejected*** (an event for a *customer id* we *didn't create* is *inert* + audited, `WEBHOOK_SPECIFICATION §2.3` "a foreign-customer event is rejected" — a *forged* "this customer is on Enterprise" *for a customer we don't recognize* *doesn't move* an org's plan).

## 4. The event → state mapping (the *authoritative* inputs, `WEBHOOK_SPECIFICATION §2.2`)

| Verified event | The state move | The *grace* behavior |
| --- | --- | --- |
| `checkout.session.completed` / `invoice.paid` | `TRIALING → ACTIVE` (or a plan *change* on `ACTIVE`); `plan` + `current_period_end` set | — |
| `customer.subscription.updated` | a *plan / period* update; on a *downgrade*, the *new* quota *applies at period end* (a *downgrade* is *not* retroactive, `RATE_LIMITING §4` "a plan change takes effect on the next window") | — |
| `invoice.payment_failed` | `ACTIVE → PAST_DUE` | a *grace* period: the org *keeps* its plan; a *warning* is surfaced (a `past_due` banner, `PAGE_SPECIFICATIONS §5`); *reviews still run* |
| `customer.subscription.deleted` | `PAST_DUE → CANCELED` (or `ACTIVE → CANCELED` at period end) | the *quota* is *frozen*; *new* reviews are *skipped* with a *posted notice* (NFR-18, "never a silent stop, never a silent over-bill") |
| `invoice.finalized` | fetch + store the *invoice row* (the billing page's invoice list, `PAGE_SPECIFICATIONS §5`) | — |

**The *grace* invariant (NFR-18, the "a `past_due` org keeps running through the grace; after grace, the quota freezes + new reviews skip-with-notice"):** a *billing* failure is a *degradation* (a *grace*), not a *revoke* (a *cancellation*) — an org that's *temporarily* *payment-blocked* (a *failed* invoice, a *card* expiry) *keeps* its *plan* through the *grace* (a *review* still *runs*, a *warning* is *surfaced*), and *only after* the *grace* does the *quota* *freeze* + the *new* reviews *skip-with-notice*. A *billing* *failure* that *instantly* *revokes* access (a *no-grace* failure) is a *defect* (a *transient* payment *hiccup* should not *stop* a team's *reviews*).

## 5. The quota enforcement (the *billing* → *review* flow, the *commercial* cap)

The *plan's* quota (the *reviews/month* + the *token-spend cap*, `plans.ts`, `USAGE_QUOTAS.md`) is *enforced* at the *worker pre-flight* (`REVIEW_ENGINE_SPEC §2` stage [0], `QUOTA` gate):

```
worker dequeues a job
  → checkQuota(org, month)   [reads the plan's quota (plans.ts) + the org's usage_events monthly aggregate]
     over reviews OR over token cap
        → job = "skipped: quota_exceeded"   (ZERO AI tokens consumed, AC-402 — the skip is *before* the AI stage)
        → a *posted notice* on the PR ("Quota reached this period. Upgrade or reduce review volume.")
        → a *dashboard* row + a *banner* (the 80% warning, `USER_JOURNEYS J4`, `PAGE_SPECIFICATIONS §5` "the quota strip")
     under both
        → proceed to the pipeline (a *cost* is *recorded* to usage_events, AC-306)
```

**The *two-cap* design (a *commercial* cap + a *platform* cap, `RATE_LIMITING §5`, `THREAT_MODEL T-11`):**
- **The *plan's* cap** (the *org's* reviews/month + the *org's* token-spend cap, `plans.ts`) — a *customer* is *bounded* to *their plan*.
- **The *platform's* cap** (`PLATFORM_TOKEN_SPEND_CAP_USD`, `ENVIRONMENT_VARIABLES §6`, `RATE_LIMITING §6`) — even a *misconfigured* *huge* plan + *huge* volume *can't breach* the *platform's* *provider* budget (a *cost-abuse* *backstop*: a *DoS* on the *AI* budget is *bounded* by the *platform* cap, not just the *plan* cap).
- **The *skip-with-notice*** — an *over-cap* review is *skipped* (a *posted* notice, *never* a *silent* stop, NFR-18), so a *cost-abuse* is *observable* (a *runaway* org is *alerted* + *informed*, `RATE_LIMITING §6` "an anomaly alert").

## 6. The *usage accounting* (the *billing* *revenue* *source*, `DATA_FLOW §4`)

- **Every *completed* review** writes a `usage_events` row (`org_id`, `month`, `review_count +1`, `input_tokens`, `output_tokens`, `est_usd_cost`, `model`, `DATABASE_DESIGN §3` "append-only, no updates, no deletes").
- **An *hourly* rollup** builds `usage_daily` (the *dashboard* read path, `NFR-03` — the *usage* charts *never scan* the *raw* `usage_events`, `PERFORMANCE_SCALABILITY §2`).
- **The *billing* *revenue*** (a *plan's* price) is *matched* to the *org's* *usage* (a *revenue* that's *metered* by the *usage_events* + a *price* that's *set* by the *plan*, `PRICING_STRATEGY §8` "a plan is profitable iff plan price > quota × per-review cost + fixed infra share"). A *Team* org that *exceeds* its *5,000* review *cap* is *either* *skipped* (a *hard* cap, the *default*) *or* *metered-overaged* (an *opt-in* + a *published* rate, `PRICING_STRATEGY §3` "a Team/Enterprise overage is an opt-in + a surfaced rate").
- **The *billing* *event* is *reconcilable*** (a *billing* *invoice* [the *revenue*] is *matched* to the *usage_events* [the *metered* *cost*] in a *monthly* *reconciliation* — a *billing* *event* that *doesn't match* the *usage* is a *reconciliation* *defect*, a `billing_events` + a `usage_events` *join* audit, `OPERATIONS/BACKUP_RESTORE.md §3.1`'s "integrity check" applied to the *billing* side).

## 7. The *cancel / downgrade / upgrade* flows (the *customer* actions, the *admin* surface)

- **A *cancel*** (`POST /orgs/:id/billing/cancel`, `API_SPECIFICATION`): an *owner*-only action; a *cancel-at-period-end* (the *grace* is *through* the *period end*, a *CANCELED* *at* the *period end*, the *plan* is *frozen* through the *grace*, NFR-18); a *cancel-now* (a *CANCELED* *immediately*, the *quota* *freezes*, *new* reviews *skip-with-notice* — a *cancel-now* is a *destructive* action, a *confirmation* that *names* the *object* + the *consequence*, `COMPONENT_CATALOG` "a destructive action goes last, in its own section, consequence-named + a confirmation").
- **An *upgrade*** (`POST /orgs/:id/billing/subscribe`, a *new* plan): a *client* *request* *initiates* the *provider* flow (a *Stripe* *checkout* / a *Razorpay* *subscription* *create*); the *plan change* *lands* *only* on the *verified* webhook (a *client* *claim* is *inert*, AC-403, §2 "a client claim is inert"); the *dashboard* shows an *"Upgrading…"* *pending* state *until* the *webhook confirms* it (§2 "an 'Upgrading…' state persists until the webhook confirms it").
- **A *downgrade*** (a *plan* *lowering*): the *new* (lower) quota *applies at period end* (§4 "on a downgrade, the new quota applies at period end", `RATE_LIMITING §4` "a plan change takes effect on the next window") — a *downgrade* is *not* *retroactive* (a *month's* *usage* is *billed* at the *old* plan, a *new* month is *billed* at the *new* plan).
- **The *renewal*** (a *period end*, the *current_period_end* *advances*): a *renewal* is *automatic* (a *provider* *subscription* *renews*; a *payment* *failure* on a *renewal* → `PAST_DUE` (the *grace*), §4).

## 8. The *billing* *failure* *modes* (the *grace* + the *skip-with-notice*, NFR-18)

| Failure | The state | The *review* behavior | The *customer-visible* |
| --- | --- | --- | --- |
| A *failed* invoice (a *card* expiry, a *provider* decline) | `PAST_DUE` (the *grace*) | *reviews still run* (the *grace*); a *warning* is *surfaced* | a *billing banner* ("Your payment failed. Reviews continue for the grace period.") |
| The *grace* *exceeded* (a *cancel* at the *period end*) | `CANCELED` | the *quota* *freezes*; *new* reviews *skip-with-notice* | a *billing* notice ("Your plan was canceled. New reviews are skipped. Re-subscribe to resume.") |
| A *platform-cap* *breach* (a *cost-abuse*, T-11) | a *platform* *cap* *trip* (a *provider* budget) | the *over* reviews *skip* (a *platform* cap, *not* the *plan* cap) | a *cost-abuse* *alert* (a *ops* alert + a *dashboard* banner, `RATE_LIMITING §6` "anomaly alert + a dashboard banner") |

**The *never-silent* invariant (NFR-18, the "a limit that stops reviews always leaves a user-visible record"):** a *billing* *state* that *stops* *reviews* (a *CANCELED* *freeze*, a *quota* *skip*) *always* has a *customer-visible* record (a *posted* PR *notice* + a *dashboard* *row* + a *billing* *banner*), a *skip* that's *silent* (a *stop* with *no* notice) is a *defect* (a *silent* *stoppage* is *how* a *cost-abuse* *hides*, `RATE_LIMITING §6` "a silent stoppage is how cost abuse hides").

## 9. The *billing* *test* surface (the *integration* seams, `INTEGRATION_TEST_PLAN §7`, `SECURITY_TEST_PLAN §1.7`)

| Test | The assertion |
| --- | --- |
| `IT-payment-01` | a *verified* `invoice.paid` / `subscription.updated` → `org_billing.status` *moves* to `ACTIVE` / the *plan* *advances*; a `billing_events` row (the *idempotency* record) |
| `IT-payment-02` | an *unsigned / forged* billing event *or* a *client* claim "plan=enterprise" → `org_billing` is *unchanged* (a *client claim* is *inert*, AC-403); the event is *rejected + audited* |
| `IT-payment-03` | a *re-delivered* event (a *same* event id) → a *200 no-op*; the *state* is *not* *double-moved* (the `billing_events` UK makes it a no-op) |
| `IT-payment-grace` | an `invoice.payment_failed` → `PAST_DUE` → the *org* keeps its *plan* through the *grace window* (reviews still run, a warning surfaces); after grace → `CANCELED` → the *quota* freezes + *new* reviews *skip* with a *notice* (NFR-18, "never a silent stop, never a silent over-bill") |
| `ST-quota-skip` (AC-402) | an *org at 100%* of its *monthly* review quota; a *new* PR webhook → the *job* is `skipped: quota_exceeded`, *zero* AI tokens consumed, a *notice* is *posted* on the PR |
| `ST-cost-abuse` (T-11) | a *flood* of reviews against a *misconfigured* org → the *platform* token-spend ceiling *holds* (the *provider-spend* metric does *not* exceed the cap); the *over-cap* jobs *skip* with a *notice* |

## 10. The *billing* *secrets* (the *SECRETS_MANAGEMENT* tie-in)

- **The *provider* key** (a `STRIPE_SECRET_KEY` / a `RAZORPAY_KEY_SECRET`, `ENVIRONMENT_VARIABLES §4`) is in the *deploy* *env* (a *secret store*), *never* a *DB column* + *never* a *log* + *never* a *prompt* + *never* a *queue payload* + *never* the *browser* (§5 "the 'must never cross' list", `SERVICE_BOUNDARIES`).
- **The *billing* *webhook* secret** (a `STRIPE_WEBHOOK_SECRET`) is a *deploy* *env* value; a *webhook* that's *unsigned* (a *forged* event) is *rejected* (a `401 BILLING_REJECTED`), *not* *trusted*.
- **The *card* data is *not* VERCODE's** (a *provider* *tokenizes* the card, a *VERCODE* stores *only* the *provider's* customer/subscription id + the *plan state*, `PRIVACY.md §3` "VERCODE is not in PCI cardholder-data scope" — a *PCI* scope *reduction* by *design*; a *billing* *secret* leak is a *provider key* leak, *not* a *card* leak — the *card* is *with the provider*).
