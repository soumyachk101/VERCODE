// The billing management routes: GET /orgs/:id/billing, POST /orgs/:id/billing/subscribe,
// POST /orgs/:id/billing/cancel (API_SPECIFICATION.md "Usage & billing").

import type { FastifyInstance } from "fastify";
import { Plan, BillingStatus } from "@prisma/client";

export async function billingRoutes(app: FastifyInstance) {
  const db = app.auth.db;

  // ---------------------------------------------------------------------------
  // GET /orgs/:id/billing — Org billing status & plan
  // ---------------------------------------------------------------------------
  app.get("/:id/billing", { schema: { config: { capability: "read" } } }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const org = await db.organization.findUnique({
      where: { id },
      include: { billing: true },
    });

    if (!org) {
      reply.code(404).send({ error: { code: "NOT_FOUND", message: "Org not found." } });
      return;
    }

    reply.send({
      plan: org.plan.toLowerCase(),
      status: org.billing?.status ? org.billing.status.toLowerCase() : "active",
      provider: org.billing?.provider ?? "stripe",
      currentPeriodEnd: org.billing?.currentPeriodEnd?.toISOString() ?? null,
      renewalAt: org.billing?.currentPeriodEnd?.toISOString() ?? null,
      invoices: [],
    });
  });

  // ---------------------------------------------------------------------------
  // POST /orgs/:id/billing/subscribe — Upgrade / change plan
  // ---------------------------------------------------------------------------
  app.post(
    "/:id/billing/subscribe",
    { schema: { config: { capability: "org.manage" } } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = req.body as { plan: string };

      if (!body?.plan) {
        reply.code(422).send({ error: { code: "VALIDATION_ERROR", message: "Plan is required." } });
        return;
      }

      const planKey = body.plan.toUpperCase() as Plan;
      if (!Object.values(Plan).includes(planKey)) {
        reply.code(422).send({ error: { code: "VALIDATION_ERROR", message: "Invalid plan name." } });
        return;
      }

      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await db.organization.update({
        where: { id },
        data: { plan: planKey },
      });

      await db.orgBilling.upsert({
        where: { orgId: id },
        create: {
          orgId: id,
          provider: "stripe",
          plan: planKey,
          status: BillingStatus.ACTIVE,
          currentPeriodEnd: periodEnd,
        },
        update: {
          plan: planKey,
          status: BillingStatus.ACTIVE,
          currentPeriodEnd: periodEnd,
        },
      });

      await db.auditEvent.create({
        data: {
          orgId: id,
          actorId: req.user.userId ?? "",
          action: "billing.subscription_started",
          targetType: "org",
          targetId: id,
          meta: { plan: body.plan.toLowerCase() },
        },
      });

      reply.send({ ok: true, plan: body.plan.toLowerCase(), status: "active" });
    }
  );

  // ---------------------------------------------------------------------------
  // POST /orgs/:id/billing/cancel — Cancel subscription
  // ---------------------------------------------------------------------------
  app.post(
    "/:id/billing/cancel",
    { schema: { config: { capability: "org.manage" } } },
    async (req, reply) => {
      const { id } = req.params as { id: string };

      await db.orgBilling.upsert({
        where: { orgId: id },
        create: {
          orgId: id,
          provider: "stripe",
          plan: Plan.FREE,
          status: BillingStatus.CANCELED,
          cancelledAt: new Date(),
        },
        update: {
          status: BillingStatus.CANCELED,
          cancelledAt: new Date(),
        },
      });

      await db.auditEvent.create({
        data: {
          orgId: id,
          actorId: req.user.userId ?? "",
          action: "billing.subscription_cancelled",
          targetType: "org",
          targetId: id,
        },
      });

      reply.send({ ok: true, status: "canceled" });
    }
  );
}
