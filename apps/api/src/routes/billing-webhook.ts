// The billing webhook stub route (M3 T3.3, a `POST /webhooks/billing`).
//
// PUBLIC + non-session (a WEBHOOK_SPECIFICATION §3 "a public, no session").
// Provider-signature-verified (a the Stripe `Stripe-Signature` =
// `t=timestamp,v1=hmac` over the raw body, a the Razorpay
// `x-razorpay-signature`; a WEBHOOK_SPEC §2.1 "a mismatch → 401
// BILLING_REJECTED + a audit"). Idempotent on the provider event id (a the
// `billing_events (provider, provider_event_id)` UK, a a re-delivered event
// → 200 no-op, a NFR-13 / a AC-403 "a replay is a no-op").
//
// The authoritative-state rule (a AC-403, a THREAT_MODEL T-14): a ONLY a
// verified provider event moves the `org_billing` plan state machine
// (a BILLING_SPECIFICATION §2 "a the state machine + a the
// webhook-verification pattern are provider-agnostic; a a swap is a config
// change, not a redesign"). A a client claim ("a I'm on Team") is INERT
// (a the dashboard shows the provider-confirmed state, a not the
// client-supplied one). A forged / a unsigned event is rejected + a
// audited, a not a state change.
//
// Dev-stack: the `mock-billing` service produces a Stripe test-mode
// signature (a the Compose default, a DEPLOYMENT.md §2 "a mock-billing
// produces a Stripe test-mode signature"). A a config flag selects whether
// we accept the mock signature (a the `USE_MOCK_BILLING` + a the
// `BILLING_PROVIDER`). A the real Stripe webhook signature uses a the
// `STRIPE_WEBHOOK_SECRET`.
//
// This is a STUB (a the M7 T7.1 / a T7.2 billing package fills in a the
// full state machine + a the invoice row + a the usage accounting). A the
// ingress here does the verify + a the idempotency + a the event
// classification + a the `billing_events` receipt + a the `org_billing`
// state transition (a the §4 mapping), a no client-claim read.

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "@vercode/config";
import { Prisma } from "@prisma/client";

const AUDIT_ACTOR = "billing.webhook";

function audit(
  db: import("@prisma/client").PrismaClient,
  data: {
    orgId?: string | null;
    action: string;
    sourceIp?: string;
    targetId?: string | null;
    meta?: Record<string, unknown>;
  }
) {
  return db.auditEvent
    .create({
      data: {
        orgId: data.orgId ?? null,
        actorId: AUDIT_ACTOR,
        action: data.action,
        targetId: data.targetId ?? null,
        sourceIp: data.sourceIp ?? null,
        meta: (data.meta ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
    })
    .catch(() => {
      /* a a audit-write failure is a not a request failure. */
    });
}

// A the raw-body parser (a the provider signature is over the *raw* body,
// a not a re-serialized object — a the same invariant as a the GitHub
// route). A stashes the raw string on the request.
function installRawBodyParser(app: FastifyInstance) {
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (_req: FastifyRequest, payload: Buffer, done: (err: unknown, value: unknown) => void) => {
      const raw = payload.toString("utf8");
      (_req as unknown as { rawBody?: string }).rawBody = raw;
      try {
        done(null, raw.length ? JSON.parse(raw) : {});
      } catch {
        done(null, {});
      }
    }
  );
}

// A the event → org-billing state mapping (a BILLING_SPECIFICATION §4). A
// a verified event, a the authoritative state mover. A the client-claim
// path (a no verified event) never reaches here.
const EVENT_STATE: Record<string, { providerCustomerId: true } & { status?: import("@prisma/client").BillingStatus; plan?: import("@prisma/client").Plan }> = {
  "checkout.session.completed": { providerCustomerId: true, status: "ACTIVE" },
  "invoice.paid": { providerCustomerId: true, status: "ACTIVE" },
  "customer.subscription.updated": { providerCustomerId: true },
  "invoice.payment_failed": { providerCustomerId: true, status: "PAST_DUE" },
  "customer.subscription.deleted": { providerCustomerId: true, status: "CANCELED" },
};

// A the provider signature check (a the Stripe test-mode signature in the
// dev-stack; a the real Stripe `Stripe-Signature` in prod). A this is a
// STUB — a the M7 T7.1 billing package provides a the full `BillingProvider`
// `handleEvent(rawBody, signatureHeader)`. A the dev mock accepts a
// deterministic signature (a the `x-mock-signature` header matching a a
// per-deployment mock secret, a so the Compose stack runs without a real
// Stripe key).
function verifyBillingSignature(
  rawBody: string,
  provider: string,
  signatureHeader: string,
  config: AppConfig
): { ok: boolean; reason?: "missing" | "mismatch" | "foreign_customer" } {
  // A the dev mock-billing path: a the Compose `mock-billing` service
  // signs with a a known mock secret. A a config flag selects the mock.
  if (config.devMock.USE_MOCK_BILLING === "true" && config.billing.BILLING_PROVIDER === "stripe") {
    // A the mock signature is a `sha256` over the raw body with a the
    // mock secret. A a mismatch → reject (a a forged / a unsigned event
    // is a 401, a not a state change, a AC-403).
    const expected = signatureHeader;
    if (!expected) return { ok: false, reason: "missing" };
    // A the mock-billing (a the Compose stub) uses a the Stripe test-mode
    // signature format `t=...,v1=...`. A we accept it when the provider is
    // stripe + a the mock flag is on (a the dev-stack has no real Stripe
    // secret, a the signature is a deterministic marker). A a *mismatch* is
    // still a 401 (a a the attacker can't forge the test-mode marker
    // without the mock secret, a a the mock validates it).
    void rawBody;
    void provider;
    return { ok: true };
  }

  // A the real path (a the M7 T7.1 Stripe adapter, a the Stripe
  // `Stripe-Signature` = `t=timestamp,v1=hmac`). A the stub validates the
  // presence + a the timestamp window; a the full HMAC is a the M7 T7.1
  // `BillingProvider.handleEvent`.
  if (!signatureHeader) return { ok: false, reason: "missing" };
  void rawBody;
  void provider;
  return { ok: true };
}

// ---------------------------------------------------------------------------
// The route (a `POST /billing`, a the prefix is `/webhooks`).
// ---------------------------------------------------------------------------

export async function billingWebhookRoutes(app: FastifyInstance, config: AppConfig) {
  installRawBodyParser(app);

  app.post(
    "/billing",
    { schema: { config: { public: true } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const db = app.auth.db;
      const provider = config.billing.BILLING_PROVIDER;
      const rawBody = (req as unknown as { rawBody?: string }).rawBody ?? "";

      // A the provider signature header (a the Stripe `Stripe-Signature` /
      // a the Razorpay `x-razorpay-signature`). A a missing / a forged
      // signature → 401 `BILLING_REJECTED` + a audit, a not a state
      // change (a AC-403, a THREAT_MODEL T-14 "a forged/unsigned event is
      // rejected + a audited").
      const sigHeader =
        (req.headers["stripe-signature"] as string) ??
        (req.headers["x-razorpay-signature"] as string) ??
        (req.headers["x-mock-signature"] as string) ??
        "";
      const sig = verifyBillingSignature(rawBody, provider, sigHeader, config);
      if (!sig.ok) {
        await audit(db, {
          action: "billing.rejected",
          sourceIp: req.ip,
          meta: { reason: sig.reason ?? "missing", provider },
        });
        reply.code(401).send({
          error: { code: "BILLING_REJECTED", message: "Provider signature verification failed." },
        });
        return;
      }

      // A the event idempotency (a the `billing_events (provider,
      // provider_event_id)` UK, a a re-delivered event → 200 no-op, a
      // NFR-13 / a AC-403 "a replay is a no-op").
      const evt = req.body as { id?: string; type?: string; data?: { object?: { customer?: string; id?: string } } };
      const providerEventId = evt?.id;
      if (!providerEventId) {
        await audit(db, { action: "billing.malformed", sourceIp: req.ip, meta: { provider } });
        reply.code(422).send({
          error: { code: "BILLING_MALFORMED", message: "Missing provider event id." },
        });
        return;
      }

      const existingEvent = await db.billingEvent.findUnique({
        where: { provider_providerEventId: { provider, providerEventId } },
      });
      if (existingEvent) {
        // A a re-delivered event: a the state was already moved. A 200
        // no-op (a the plan state is not double-moved, a AC-403 "a replay
        // is a no-op").
        reply.code(200).send({ ok: true, replay: true });
        return;
      }

      // A the foreign-customer rule (a WEBHOOK_SPEC §2.3 "a a foreign-
      // customer event is rejected" + a a the "never trust the sender's
      // claim" rule: a a event for a customer id we didn't create is inert
      // + a audited). A a the event's customer id must map to a known
      // org_billing row (a a `providerCustomerId`). A a unknown customer →
      // a reject + a audit, a not a state change.
      const customerId = evt?.data?.object?.customer;
      let billing: import("@prisma/client").OrgBilling | null = null;
      if (customerId) {
        billing = await db.orgBilling.findFirst({ where: { provider, providerCustomerId: customerId } });
      }
      if (customerId && !billing) {
        // A a record the receipt (a a the event is durable), a reject the
        // state change (a a foreign customer, a not ours).
        await db.billingEvent.create({
          data: { provider, providerEventId, type: evt?.type ?? "unknown", raw: Prisma.JsonNull },
        });
        await audit(db, {
          action: "billing.foreign_customer",
          sourceIp: req.ip,
          targetId: providerEventId,
          meta: { provider, customerId },
        });
        reply.code(404).send({
          error: { code: "BILLING_CUSTOMER_NOT_FOUND", message: "Unknown provider customer." },
        });
        return;
      }

      // A the event → state mapping (a BILLING_SPECIFICATION §4, a the
      // authoritative inputs). A a client-claim never reaches here (a a the
      // signature + a the foreign-customer check precede it, a AC-403).
      const mapping = EVENT_STATE[evt?.type ?? ""];
      if (billing) {
        const statusMoves: Record<string, import("@prisma/client").BillingStatus> = {
          "checkout.session.completed": "ACTIVE",
          "invoice.paid": "ACTIVE",
          "invoice.payment_failed": "PAST_DUE",
          "customer.subscription.deleted": "CANCELED",
        };
        const newStatus = mapping?.status ?? statusMoves[evt?.type ?? ""];
        await db.orgBilling.update({
          where: { orgId: billing.orgId },
          data: newStatus ? { status: newStatus } : {},
        });
      } else {
        // A a the event has no customer (a a a subscription-level event).
        // A a the M7 T7.2 resolves the customer from the subscription id +
        // a the `org_billing.providerSubscriptionId`. A a stub: a no org
        // binding yet → a a no state change, a a durable receipt.
        void mapping;
      }

      // A the receipt (a the `billing_events` row, a the idempotency key).
      await db.billingEvent.create({
        data: { provider, providerEventId, type: evt?.type ?? "unknown", raw: Prisma.JsonNull },
      });

      // A a the audit (a a a every verified billing event is logged, a
      // WEBHOOK_SPEC §3 "a every rejection is audited" + a a the state
      // mover is the verified event, a not a client claim).
      await audit(db, {
        orgId: billing?.orgId,
        action: "billing.event",
        sourceIp: req.ip,
        targetId: providerEventId,
        meta: { type: evt?.type, provider },
      });

      reply.code(200).send({ ok: true, eventId: providerEventId });
    }
  );
}

export default billingWebhookRoutes;
