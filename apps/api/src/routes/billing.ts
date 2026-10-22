// The billing routes: /orgs/:id/billing, /orgs/:id/billing/subscribe,
// /orgs/:id/billing/cancel (API_SPECIFICATION.md "Usage & billing").
// Owner-gated for mutations; admin+ for reads.

import type { FastifyInstance } from "fastify";
import {
  SubscribeRequestSchema,
  CancelSubscriptionRequestSchema,
  planQuota,
  type Plan,
} from "@vercode/contracts";
import { BillingStatus, Plan as DbPlan } from "@prisma/client";

export async function billingRoutes(app: FastifyInstance) {
  // GET /:id/billing — Current plan, subscription status, and billing details
  app.get(
    "/:id/billing",
    { schema: { config: { capability: "billing.read" } } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const db = app.auth.db;

      const org = await db.organization.findUnique({
        where: { id },
        include: { billing: true },
      });
      if (!org) {
        reply.code(404).send({ error: { code: "NOT_FOUND", message: "Org not found." } });
        return;
      }

      const planKey = org.plan.toLowerCase() as Plan;
      const quota = planQuota(planKey);

      // Invoices from billing events or provider
      const billingEvents = await db.billingEvent.findMany({
        where: { type: { in: ["invoice.paid", "invoice.payment_failed"] } },
        take: 10,
        orderBy: { processedAt: "desc" },
      });

      const invoices = billingEvents.map((evt) => {
        const raw = (evt.raw ?? {}) as Record<string, unknown>;
        return {
          id: evt.providerEventId,
          amountDue: Number(raw.amount_due ?? 0) / 100,
          currency: String(raw.currency ?? "usd"),
          status: evt.type === "invoice.paid" ? "paid" : "open",
          periodEnd: evt.processedAt.toISOString(),
        };
      });

      reply.send({
        plan: planKey,
        quota,
        billing: org.billing
          ? {
              provider: org.billing.provider,
              status: org.billing.status.toLowerCase(),
              currentPeriodEnd: org.billing.currentPeriodEnd?.toISOString() ?? null,
              cancelledAt: org.billing.cancelledAt?.toISOString() ?? null,
            }
          : {
              provider: "none",
              status: "active",
              currentPeriodEnd: null,
              cancelledAt: null,
            },
        invoices,
      });
    }
  );

  // POST /:id/billing/subscribe — Initiate subscription change/upgrade
  app.post(
    "/:id/billing/subscribe",
    {
      schema: {
        body: SubscribeRequestSchema,
        config: { capability: "billing.manage" },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { plan } = req.body as { plan: Plan };
      const db = app.auth.db;

      const org = await db.organization.findUnique({
        where: { id },
        include: { billing: true },
      });
      if (!org) {
        reply.code(404).send({ error: { code: "NOT_FOUND", message: "Org not found." } });
        return;
      }

      const targetDbPlan = plan.toUpperCase() as DbPlan;

      // Update or create org billing state
      const billing = await db.orgBilling.upsert({
        where: { orgId: id },
        create: {
          orgId: id,
          provider: "stripe",
          plan: targetDbPlan,
          status: BillingStatus.ACTIVE,
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
        update: {
          plan: targetDbPlan,
          status: BillingStatus.ACTIVE,
          cancelledAt: null,
        },
      });

      // Also update org plan directly
      await db.organization.update({
        where: { id },
        data: { plan: targetDbPlan },
      });

      await db.auditEvent.create({
        data: {
          orgId: id,
          actorId: req.user.userId ?? "system",
          action: "billing.subscription_started",
          targetType: "organization",
          targetId: id,
          meta: { plan, previousPlan: org.plan },
        },
      });

      reply.send({
        ok: true,
        plan,
        status: billing.status.toLowerCase(),
        checkoutUrl: null, // direct activation in dev / provider flow
      });
    }
  );

  // POST /:id/billing/cancel — Cancel subscription at period end
  app.post(
    "/:id/billing/cancel",
    {
      schema: {
        body: CancelSubscriptionRequestSchema,
        config: { capability: "billing.manage" },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { atPeriodEnd } = req.body as { atPeriodEnd: boolean };
      const db = app.auth.db;

      const org = await db.organization.findUnique({
        where: { id },
        include: { billing: true },
      });
      if (!org) {
        reply.code(404).send({ error: { code: "NOT_FOUND", message: "Org not found." } });
        return;
      }

      if (org.billing) {
        await db.orgBilling.update({
          where: { orgId: id },
          data: {
            cancelledAt: new Date(),
            status: atPeriodEnd ? org.billing.status : BillingStatus.CANCELED,
            plan: atPeriodEnd ? org.billing.plan : DbPlan.FREE,
          },
        });

        if (!atPeriodEnd) {
          await db.organization.update({
            where: { id },
            data: { plan: DbPlan.FREE },
          });
        }
      }

      await db.auditEvent.create({
        data: {
          orgId: id,
          actorId: req.user.userId ?? "system",
          action: "billing.subscription_cancelled",
          targetType: "organization",
          targetId: id,
          meta: { atPeriodEnd },
        },
      });

      reply.send({
        ok: true,
        status: atPeriodEnd ? "cancelling_at_period_end" : "canceled",
      });
    }
  );
}
