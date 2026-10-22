// The `@vercode/billing` package — the provider-agnostic boundary
// (BILLING_SPECIFICATION §1) + the plan state machine (re-exported from
// `state-machine.js`, §2/§4).
//
// The `BillingProvider` interface is the swappable leaf (ADR-009,
// INTEGRATION_DESIGN §2): the state machine + the webhook-verification
// pattern are provider-agnostic; the adapter is a config choice
// (`BILLING_PROVIDER`). Three adapters:
// - `StripeAdapter` — a the fetch-based real client (a test-mode is
//   deterministic; `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`, §10).
// - `RazorpayAdapter` — a the INR-market adapter stub (a the UPI + INR
//   acquisition, ADR-009; a PRICING_STRATEGY §5).
// - `MockAdapter` — a deterministic, test-only adapter (a pre-computed
//   event + a signature helper; the IT-payment test seam).
//
// The state machine is re-exported so the api's `billing-webhook` route +
// the worker's pre-flight gate import from the same surface (the §1
// "provider-agnostic boundary").

import { createHmac } from "node:crypto";
import type { Plan } from "@vercode/contracts";
import {
  applyEvent,
  clearPending,
  DEFAULT_GRACE_PERIOD_MS,
  graceStatus,
  InMemoryEventDedup,
  recordClientClaim,
  type BillingStatus,
  type ClientClaim,
  type EventDedup,
  type GraceCheck,
  type MachineInput,
  type MachineResult,
  type OrgBillingState,
  type PendingTransition,
  type VerifiedBillingEvent,
} from "./state-machine.js";

export {
  applyEvent,
  clearPending,
  DEFAULT_GRACE_PERIOD_MS,
  graceStatus,
  InMemoryEventDedup,
  recordClientClaim,
};
export type {
  BillingStatus,
  ClientClaim,
  EventDedup,
  GraceCheck,
  MachineInput,
  MachineResult,
  OrgBillingState,
  PendingTransition,
  VerifiedBillingEvent,
};

// ---------------------------------------------------------------------------
// The provider-agnostic boundary (BILLING_SPECIFICATION §1, the interface)
// ---------------------------------------------------------------------------

/** The invoice row (the `fetchInvoices` return, the billing page's list). */
export interface Invoice {
  id: string;
  amountDue: number;
  currency: string;
  status: "draft" | "open" | "paid" | "void";
  /** The ISO-8601 period end the invoice covers. */
  periodEnd: string;
}

export interface OrgRef {
  /** The org's id (the VERCODE tenant). */
  id: string;
  /** The org's slug / name (a provider-facing display). */
  name?: string;
}

/** A decoded + signature-verified provider event (a the handleEvent return). */
export interface VerifiedEvent {
  /** The provider (the `billing_events.provider` half of the UK). */
  provider: string;
  /** The provider event id (the `billing_events.providerEventId` half). */
  providerEventId: string;
  type: string;
  plan?: Plan;
  currentPeriodEnd?: string | null;
  customer?: string;
  raw: unknown;
}

/** The provider-agnostic boundary (the §1 interface, a verbatim copy). */
export interface BillingProvider {
  readonly id: string; // "stripe" | "razorpay" | "mock"
  createCustomer(org: OrgRef): Promise<string>;
  startSubscription(org: OrgRef, plan: Plan, externalCustomerId: string): Promise<string>;
  /** Verify + decode the provider webhook (a signature check + a body parse). */
  handleEvent(rawBody: string, signatureHeader: string, secret: string): Promise<VerifiedEvent>;
  cancelSubscription(subscriptionId: string, atPeriodEnd: boolean): Promise<void>;
  fetchInvoices(customerId: string): Promise<Invoice[]>;
}

// ---------------------------------------------------------------------------
// The Stripe adapter (a the fetch-based real client, §1 "the default")
// ---------------------------------------------------------------------------

export interface StripeConfig {
  /** The `STRIPE_SECRET_KEY` (a the deploy env, §10 "never a DB column, never a log"). */
  secretKey: string;
  /** The `STRIPE_WEBHOOK_SECRET` (a the webhook HMAC key, §10 "a deploy env value"). */
  webhookSecret: string;
  /** The API base (a override for the test-mode; the default is the live URL). */
  baseUrl?: string;
  /** The fetch implementation (a the injection for the test — a real fetch by default). */
  fetchImpl?: typeof fetch;
}

/**
 * The Stripe adapter (a the fetch-based, §1 "the default adapter — a global
 * card + a mature state machine + a test-mode that's deterministic").
 *
 * The webhook verification (the `Stripe-Signature: t=...,v1=<hex hmac>`
 * shape, WEBHOOK_SPECIFICATION §2.1): the HMAC is over the raw body, not a
 * re-serialized object — the ingress raw-body parser (the api's
 * `billing-webhook.ts`) stashes it on the request.
 */
export class StripeAdapter implements BillingProvider {
  readonly id = "stripe";
  private config: StripeConfig;

  constructor(config: StripeConfig) {
    this.config = config;
  }

  private async call<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const url = `${this.config.baseUrl ?? "https://api.stripe.com"}${path}`;
    const res = await fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body ? new URLSearchParams(body as Record<string, string>).toString() : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`stripe ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }

  async createCustomer(org: OrgRef): Promise<string> {
    const res = await this.call<{ id: string }>("POST", "/v1/customers", {
      name: org.name ?? org.id,
      metadata: JSON.stringify({ orgId: org.id }),
    });
    return res.id;
  }

  async startSubscription(org: OrgRef, plan: Plan, externalCustomerId: string): Promise<string> {
    // The plan id is a VERCODE-side mapping (a the `price_id` per plan, the
    // PRICING_STRATEGY §2's per-plan price). The plan name is the metadata
    // the webhook carries back (a the event's `data.object.plan.id`).
    const res = await this.call<{ id: string }>("POST", "/v1/subscriptions", {
      customer: externalCustomerId,
      "items[0][price]": `vercode_${plan}`,
      metadata: JSON.stringify({ orgId: org.id, plan }),
    });
    return res.id;
  }

  async handleEvent(rawBody: string, signatureHeader: string, secret: string): Promise<VerifiedEvent> {
    // The Stripe signature shape (WEBHOOK_SPECIFICATION §2.1 "Stripe's
    // `Stripe-Signature` = `t=timestamp,v1=hmac` over the raw body"): the
    // HMAC is a sha256 over `t + '.' + rawBody`, the hex.
    const t = (signatureHeader.match(/t=(\d+)/) ?? [])[1];
    const v1 = (signatureHeader.match(/v1=([0-9a-f]+)/) ?? [])[1];
    if (!t || !v1) throw new Error("STRIPE_SIGNATURE_MALFORMED");
    const expected = createHmac("sha256", secret || this.config.webhookSecret).update(`${t}.${rawBody}`).digest("hex");
    if (expected !== v1) throw new Error("STRIPE_SIGNATURE_MISMATCH");
    // The timestamp window (a 5-min replay-protection, the WEBHOOK_SPEC
    // §1.1 layer 2): a a stale `t` → reject (a captured event is replayed).
    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - Number(t)) > 300) throw new Error("STRIPE_SIGNATURE_STALE");
    const evt = JSON.parse(rawBody) as {
      id: string;
      type: string;
      data?: {
        object?: {
          customer?: string;
          plan?: { id?: string; interval?: string };
          id?: string;
          current_period_end?: string;
        };
      };
    };
    const planName = evt.data?.object?.plan?.id as Plan | undefined;
    return {
      provider: "stripe",
      providerEventId: evt.id,
      type: evt.type,
      plan: planName && ["free", "developer", "team", "enterprise"].includes(planName) ? planName : undefined,
      currentPeriodEnd: evt.data?.object?.current_period_end ?? null,
      customer: evt.data?.object?.customer,
      raw: evt,
    };
  }

  async cancelSubscription(subscriptionId: string, atPeriodEnd: boolean): Promise<void> {
    await this.call("POST", `/v1/subscriptions/${subscriptionId}`, {
      at_period_end: atPeriodEnd ? "true" : "false",
    });
  }

  async fetchInvoices(customerId: string): Promise<Invoice[]> {
    const res = await this.call<{
      data: Array<{ id: string; amount_due: number; currency: string; status: string; period_end: number }>;
    }>("GET", `/v1/invoices?customer=${encodeURIComponent(customerId)}`);
    return res.data.map((i) => ({
      id: i.id,
      amountDue: i.amount_due / 100,
      currency: i.currency,
      status: i.status as Invoice["status"],
      periodEnd: new Date(i.period_end * 1000).toISOString(),
    }));
  }
}

// ---------------------------------------------------------------------------
// The Razorpay adapter (a the INR-market stub, §1 "a the config change, not
// a redesign")
// ---------------------------------------------------------------------------

/**
 * The Razorpay adapter (a the INR-market, ADR-009 "a UPI + INR acquisition,
 * a local compliance, PRICING_STRATEGY §5"). A the stub: the surface is the
 * §1 interface; the real Razorpay API calls land in the M8 integration
 * seam. The webhook verification (a Razorpay's `x-razorpay-signature` HMAC
 * over the raw body, WEBHOOK_SPECIFICATION §2.1) uses the same pattern — a
 * the signature check is the same shape as Stripe's, the header name
 * differs.
 */
export class RazorpayAdapter implements BillingProvider {
  readonly id = "razorpay";
  private config: { keySecret: string; baseUrl?: string; fetchImpl?: typeof fetch };

  constructor(config: { keySecret: string; baseUrl?: string; fetchImpl?: typeof fetch }) {
    this.config = config;
  }

  async createCustomer(_org: OrgRef): Promise<string> {
    throw new Error("RAZORPAY_STUB: not wired (a the M8 seam)");
  }
  async startSubscription(_org: OrgRef, _plan: Plan, _externalCustomerId: string): Promise<string> {
    throw new Error("RAZORPAY_STUB: not wired (a the M8 seam)");
  }
  async handleEvent(rawBody: string, signatureHeader: string, secret: string): Promise<VerifiedEvent> {
    // A the Razorpay signature shape (a `x-razorpay-signature` hex hmac over
    // the raw body, WEBHOOK_SPECIFICATION §2.1): the same shape as
    // Stripe's, the header name differs (a the pattern is provider-agnostic,
    // §1).
    const expected = createHmac("sha256", secret || this.config.keySecret).update(rawBody).digest("hex");
    if (expected !== signatureHeader) throw new Error("RAZORPAY_SIGNATURE_MISMATCH");
    const evt = JSON.parse(rawBody) as {
      event_id: string;
      event: string;
      payload?: {
        components?: Array<{
          type: string;
          event?: { entity?: { customer_id?: string; plan_id?: string } };
        }>;
      };
    };
    const component = evt.payload?.components?.[0];
    return {
      provider: "razorpay",
      providerEventId: evt.event_id,
      type: component?.type === "subscription" ? `razorpay.${evt.event}` : evt.event,
      plan: undefined, // a the plan mapping is a the Razorpay-specific entity.plan_id → plan
      customer: component?.event?.entity?.customer_id,
      raw: evt,
    };
  }
  async cancelSubscription(_subscriptionId: string, _atPeriodEnd: boolean): Promise<void> {
    throw new Error("RAZORPAY_STUB: not wired (a the M8 seam)");
  }
  async fetchInvoices(_customerId: string): Promise<Invoice[]> {
    throw new Error("RAZORPAY_STUB: not wired (a the M8 seam)");
  }
}

// ---------------------------------------------------------------------------
// The Mock adapter (a the deterministic test seam, §9 "the billing test
// surface" + IT-payment-01..03 "a pre-computed signature")
// ---------------------------------------------------------------------------

export interface MockEventInput {
  id: string;
  type: string;
  plan?: Plan;
  currentPeriodEnd?: string | null;
  customer?: string;
}

export interface MockAdapterConfig {
  /** The webhook secret (a fixed test value; a deterministic). */
  webhookSecret: string;
}

/**
 * The Mock adapter (a deterministic, test-only). A the test seam (the
 * `IT-payment-01..03` "a pre-computed event + a signature helper"): the
 * signature is a synchronous hex hmac over the raw body with a fixed test
 * secret — a deterministic + verifiable + forgeable only with the secret
 * (a a forged event fails the signature check, AC-403 "a forged/unsigned
 * event is rejected + audited").
 */
export class MockAdapter implements BillingProvider {
  readonly id = "mock";
  private config: MockAdapterConfig;

  constructor(config: MockAdapterConfig) {
    this.config = config;
  }

  /** A the signature helper (a deterministic — a hex hmac over the raw body). */
  sign(rawBody: string): string {
    return createHmac("sha256", this.config.webhookSecret).update(rawBody).digest("hex");
  }

  /** A the pre-computed event body (a deterministic — a stable JSON). */
  event(input: MockEventInput): string {
    const evt = {
      id: input.id,
      type: input.type,
      data: {
        object: {
          customer: input.customer ?? "cus_mock",
          ...(input.plan ? { plan: { id: input.plan } } : {}),
          current_period_end: input.currentPeriodEnd ?? "2026-01-31T00:00:00.000Z",
          id: input.id,
        },
      },
    };
    return JSON.stringify(evt);
  }

  async createCustomer(_org: OrgRef): Promise<string> {
    return "cus_mock_000";
  }
  async startSubscription(_org: OrgRef, _plan: Plan, _externalCustomerId: string): Promise<string> {
    return "sub_mock_000";
  }
  async handleEvent(rawBody: string, signatureHeader: string, _secret: string): Promise<VerifiedEvent> {
    // A the deterministic signature check (a a mismatch → throw, a the
    // ingress turns it into a 401 BILLING_REJECTED + audit, AC-403).
    const expected = this.sign(rawBody);
    if (signatureHeader !== expected) throw new Error("MOCK_SIGNATURE_MISMATCH");
    const evt = JSON.parse(rawBody) as {
      id: string;
      type: string;
      data?: {
        object?: {
          customer?: string;
          plan?: { id?: string };
          current_period_end?: string | null;
          id?: string;
        };
      };
    };
    const planName = evt.data?.object?.plan?.id as Plan | undefined;
    return {
      provider: "mock",
      providerEventId: evt.id,
      type: evt.type,
      plan: planName && ["free", "developer", "team", "enterprise"].includes(planName) ? planName : undefined,
      currentPeriodEnd: evt.data?.object?.current_period_end ?? null,
      customer: evt.data?.object?.customer,
      raw: evt,
    };
  }
  async cancelSubscription(_subscriptionId: string, _atPeriodEnd: boolean): Promise<void> {
    /* a no-op (a the test seam) */
  }
  async fetchInvoices(_customerId: string): Promise<Invoice[]> {
    return [
      {
        id: "in_mock_000",
        amountDue: 29,
        currency: "USD",
        status: "paid",
        periodEnd: "2026-01-31T00:00:00.000Z",
      },
    ];
  }
}
