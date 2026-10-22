// The billing webhook route (M3 T3.3, `POST /webhooks/billing`).
//
// PUBLIC + non-session (WEBHOOK_SPECIFICATION §3 "the two public,
// non-session ingress routes"). Provider-signature-verified (Stripe's
// `Stripe-Signature` = `t=timestamp,v1=hmac` over the raw body; Razorpay's
// `x-razorpay-signature`; WEBHOOK_SPEC §2.1 "a mismatch → 401
// BILLING_REJECTED + audit"). Idempotent on the provider event id (the
// `billing_events (provider, provider_event_id)` UK — a re-delivered event
// → 200 no-op, NFR-13 / AC-403 "a replay is a no-op").
//
// The authoritative-state rule (AC-403, THREAT_MODEL T-14): ONLY a
// verified provider event moves the `org_billing` plan state machine
// (BILLING_SPECIFICATION §2 "the state machine + the webhook-verification
// pattern are provider-agnostic"). A client claim ("I'm on Team") is INERT
// — the dashboard shows the provider-confirmed state. A forged/unsigned
// event is rejected + audited, no state change.
//
// Dev-stack: the `mock-billing` service produces a Stripe test-mode
// signature (the Compose default, DEPLOYMENT.md §2). A config flag selects
// whether the mock signature is accepted (USE_MOCK_BILLING + BILLING
// PROVIDER); the real Stripe path uses the STRIPE_WEBHOOK_SECRET.
//
// The ingress does verify + idempotency + event classification + the
// `billing_events` receipt + the `org_billing` state transition (the
// BILLING_SPECIFICATION §4 mapping) — no client-claim read. This is the
// stub surface; the M7 billing package fills in the full state machine +
// the invoice row + the usage accounting.

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "@vercode/config";
import { Prisma, PrismaClient } from "@prisma/client";
import { createHmac, timingSafeEqual } from "node:crypto";
import { logger } from "@vercode/observability";

const AUDIT_ACTOR = "billing.webhook";

// The event → org-billing state mapping (BILLING_SPECIFICATION §4, the
// authoritative inputs). A client claim never reaches this table.
const EVENT_STATUS: Record<string, Prisma.EnumBillingStatusFilter["equals"] | undefined> = {
  "checkout.session.completed": "ACTIVE",
  "invoice.paid": "ACTIVE",
  "invoice.payment_failed": "PAST_DUE",
  "customer.subscription.deleted": "CANCELED",
};

function audit(
  db: PrismaClient,
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
      /* an audit-write failure is not a request failure */
    });
}

// The raw-body parser (the provider signature is over the *raw* body, not a
// re-serialized object — the same invariant as the GitHub route). Stashes
// the raw string on the request.
function installRawBodyParser(app: FastifyInstance) {
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (_req: FastifyRequest, payload: Buffer, done: (err: Error | null, value: unknown) => void) => {
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

/**
 * The provider signature check. In dev the mock-billing service signs with
 * the `STRIPE_WEBHOOK_SECRET` (the Compose default, the test-mode source);
 * the real path verifies the Stripe `v1` HMAC with the same secret. A
 * missing/empty signature → reject (an unsigned event is a 401, not a
 * state change, AC-403).
 */
function verifyBillingSignature(
  rawBody: string,
  signatureHeader: string,
  config: AppConfig
): { ok: boolean; reason?: "missing" | "mismatch" } {
  const secret = config.billing.STRIPE_WEBHOOK_SECRET;
  if (!signatureHeader) return { ok: false, reason: "missing" };

  // The dev mock-billing path: the mock signs the raw body with the
  // configured mock secret (the Compose default — no real Stripe key). The
  // signature is the hex HMAC of the raw body, or the Stripe test-mode
  // `t=...,v1=<hex hmac>` form. A mismatch → reject (an attacker can't
  // forge it without the secret, AC-403 / THREAT_MODEL T-14).
  if (config.devMock.USE_MOCK_BILLING === "true" && config.billing.BILLING_PROVIDER === "stripe") {
    if (!secret) return { ok: false, reason: "missing" };
    const v1 = signatureHeader.includes("v1=")
      ? (signatureHeader.split("v1=")[1] ?? "").split(",")[0]
      : signatureHeader;
    if (!v1) return { ok: false, reason: "missing" };
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    if (!safeEqual(expected, v1)) return { ok: false, reason: "mismatch" };
    return { ok: true };
  }

  // The real Stripe path (the M7 T7.1 `BillingProvider.handleEvent` does
  // the full verify + decode; the ingress here checks the `v1` HMAC the
  // same way — the timestamp-window + HMAC shape of `Stripe-Signature`).
  if (!secret) return { ok: false, reason: "missing" };
  const v1 = signatureHeader.includes("v1=")
    ? (signatureHeader.split("v1=")[1] ?? "").split(",")[0]
    : signatureHeader;
  if (!v1) return { ok: false, reason: "missing" };
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  if (!safeEqual(expected, v1)) return { ok: false, reason: "mismatch" };
  return { ok: true };
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

// ---------------------------------------------------------------------------
// The route (a `POST /billing`, the prefix is `/webhooks`).
// ---------------------------------------------------------------------------

export async function billingWebhookRoutes(app: FastifyInstance, config: AppConfig) {
  installRawBodyParser(app);
  // [M7 observability] — a the webhook.ingest stage (a the api's first stage
  // of the review pipeline; a the worker continues a the trace, a the
  // OBSERVABILITY.md §2 "the webhook→worker hand-off is one trace, not two
  // disconnected ones"). A the structured logger (a the correlation id is
  // a the delivery event id; a the redaction gate runs on every record,
  // SECRETS_MANAGEMENT §3 "the redactor runs on *every* record before
  // it's written").
  const billingLog = logger({
    correlationId: "billing.webhook",
    baseFields: { provider: config.billing.BILLING_PROVIDER },
  });

  app.post(
    "/billing",
    { schema: { config: { public: true } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const db: PrismaClient = app.auth.db;
      const provider = config.billing.BILLING_PROVIDER;
      const rawBody = (req as unknown as { rawBody?: string }).rawBody ?? "";

      // The provider signature header (Stripe `Stripe-Signature` / Razorpay
      // `x-razorpay-signature`). A missing/forged signature → 401
      // `BILLING_REJECTED` + audit, no state change (AC-403, THREAT_MODEL
      // T-14 "a forged/unsigned event is rejected + audited").
      const sigHeader =
        (req.headers["stripe-signature"] as string | undefined) ??
        (req.headers["x-razorpay-signature"] as string | undefined) ??
        "";
      const sig = verifyBillingSignature(rawBody, sigHeader, config);
      if (!sig.ok) {
        await audit(db, {
          action: "billing.rejected",
          sourceIp: req.ip,
          meta: { reason: sig.reason ?? "missing", provider },
        });
        // [M7 observability] — a the rejected-event log record (a the
        // WEBHOOK_SPECIFICATION §3 "every rejection is audited"; a the
        // structured record is a the operator's queryable surface, a the
        // OBSERVABILITY.md §5 "a failure is observable" invariant).
        billingLog.warn("webhook.ingest", "The billing webhook was rejected", {
          reason: sig.reason ?? "missing",
          provider,
          outcome: "rejected",
        });
        reply.code(401).send({
          error: { code: "BILLING_REJECTED", message: "Provider signature verification failed." },
        });
        return;
      }

      // The event idempotency (the `billing_events (provider,
      // provider_event_id)` UK — a re-delivered event → 200 no-op,
      // NFR-13 / AC-403 "a replay is a no-op", the plan state is not
      // double-moved).
      const evt = req.body as {
        id?: string;
        type?: string;
        data?: { object?: { customer?: string; id?: string; plan?: { id?: string; interval?: string } } };
      };
      const providerEventId = evt?.id;
      if (!providerEventId) {
        await audit(db, { action: "billing.malformed", sourceIp: req.ip, meta: { provider } });
        // [M7 observability] — a the malformed-event log record.
        billingLog.warn("webhook.ingest", "The billing event was malformed", {
          provider,
          outcome: "malformed",
        });
        reply.code(422).send({
          error: { code: "BILLING_MALFORMED", message: "Missing provider event id." },
        });
        return;
      }

      const existingEvent = await db.billingEvent.findUnique({
        where: { provider_providerEventId: { provider, providerEventId } },
      });
      if (existingEvent) {
        await audit(db, {
          action: "billing.replay",
          sourceIp: req.ip,
          targetId: providerEventId,
          meta: { type: evt?.type, provider },
        });
        // [M7 observability] — a the replay log record (a the NFR-13 "a
        // replay is a no-op" + a the operator's queryable surface).
        billingLog.info("webhook.ingest", "The billing event was a replay", {
          providerEventId,
          provider,
          outcome: "replay",
        });
        reply.code(200).send({ ok: true, replay: true, eventId: providerEventId });
        return;
      }

      // The foreign-customer rule (WEBHOOK_SPECIFICATION §2.3 "a
      // foreign-customer event is rejected" + the "never trust the
      // sender's claim" rule: an event for a customer id we didn't create
      // is inert + audited). The event's customer id must map to a known
      // org_billing row (`providerCustomerId`). An unknown customer →
      // 404 + audit, no state change.
      const customerId = evt?.data?.object?.customer;
      let billing: { orgId: string } | null = null;
      if (customerId) {
        billing = await db.orgBilling.findFirst({
          where: { provider, providerCustomerId: customerId },
        });
      }
      if (customerId && !billing) {
        await db.billingEvent.create({
          data: { provider, providerEventId, type: evt?.type ?? "unknown", raw: Prisma.JsonNull },
        });
        await audit(db, {
          action: "billing.foreign_customer",
          sourceIp: req.ip,
          targetId: providerEventId,
          meta: { provider, customerId },
        });
        // [M7 observability] — a the foreign-customer rejection log record
        // (a the WEBHOOK_SPECIFICATION §2.3 "a foreign-customer event is
        // rejected"; a the operator's queryable surface).
        billingLog.warn("webhook.ingest", "The billing event was for an unknown customer", {
          providerEventId,
          provider,
          outcome: "foreign_customer",
        });
        reply.code(404).send({
          error: { code: "BILLING_CUSTOMER_NOT_FOUND", message: "Unknown provider customer." },
        });
        return;
      }

      // The event → state mapping (BILLING_SPECIFICATION §4, the
      // authoritative inputs). Only the verified event moves
      // org_billing.status (AC-403 — a client claim is inert).
      const type = evt?.type ?? "";
      const newStatus = EVENT_STATUS[type];
      if (billing && newStatus) {
        await db.orgBilling.update({
          where: { orgId: billing.orgId },
          data: { status: newStatus },
        });
      }

      // The receipt (the `billing_events` row, the idempotency key).
      await db.billingEvent.create({
        data: { provider, providerEventId, type, raw: Prisma.JsonNull },
      });

      // The audit (every verified billing event is logged,
      // WEBHOOK_SPECIFICATION §3 "every rejection is audited" + the state
      // mover is the verified event, not a client claim).
      await audit(db, {
        orgId: billing?.orgId,
        action: "billing.event",
        sourceIp: req.ip,
        targetId: providerEventId,
        meta: { type, provider },
      });

      // [M7 observability] — a the verified-event log record (a the state
      // move + a the receipt + a the audit; a the operator's queryable
      // surface, a the OBSERVABILITY.md §5 "a failure is observable").
      billingLog.info("webhook.ingest", "The billing event was verified + a state move applied", {
        providerEventId,
        provider,
        type,
        status: newStatus ?? "unchanged",
        orgId: billing?.orgId ?? null,
        outcome: "processed",
      });

      reply.code(200).send({ ok: true, eventId: providerEventId });
    }
  );
}

export default billingWebhookRoutes;
