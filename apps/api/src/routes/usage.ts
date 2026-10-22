// The usage routes: GET /orgs/:id/usage (API_SPECIFICATION.md "Usage & billing").
// Returns monthly usage aggregates, token spend, and quota capacity.

import type { FastifyInstance } from "fastify";
import { planQuota, type Plan } from "@vercode/contracts";

export async function usageRoutes(app: FastifyInstance) {
  const db = app.auth.db;

  app.get("/:id/usage", { schema: { config: { capability: "read" } } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const query = req.query as { range?: string; by?: string };

    const org = await db.organization.findUnique({
      where: { id },
    });
    if (!org) {
      reply.code(404).send({ error: { code: "NOT_FOUND", message: "Org not found." } });
      return;
    }

    const range = query.range ?? "30d";
    const days = range === "12mo" ? 365 : range === "90d" ? 90 : 30;
    const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Fetch daily aggregates if available
    const dailyRows = await db.usageDaily.findMany({
      where: {
        orgId: id,
        day: { gte: sinceDate.toISOString().slice(0, 10) },
      },
      orderBy: { day: "asc" },
    });

    // Also aggregate from usageEvent
    const currentMonth = new Date().toISOString().slice(0, 7);
    const monthTotals = await db.usageEvent.aggregate({
      where: { orgId: id, month: currentMonth },
      _sum: { reviewCount: true, inputTokens: true, outputTokens: true, estUsdCost: true },
    });

    const reviewsUsed = Number(monthTotals._sum?.reviewCount ?? 0);
    const inputTokens = Number(monthTotals._sum?.inputTokens ?? 0);
    const outputTokens = Number(monthTotals._sum?.outputTokens ?? 0);
    const estUsd = Number(monthTotals._sum?.estUsdCost ?? 0);

    const quota = planQuota(org.plan.toLowerCase() as Plan);
    const reviewLimit = quota.reviewsPerMonth;
    const percentUsed = Math.min(100, Math.round((reviewsUsed / reviewLimit) * 100));

    reply.send({
      series: dailyRows.map((d) => ({
        day: d.day,
        reviews: d.reviews,
        inputTokens: d.inputTokens,
        outputTokens: d.outputTokens,
        estUsdCost: Number(d.estUsdCost),
        findingCounts: d.findingCounts,
      })),
      totals: {
        reviews: reviewsUsed,
        inputTokens,
        outputTokens,
        estUsd,
        bySeverity: {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
        },
      },
      quota: {
        used: reviewsUsed,
        limit: reviewLimit,
        percentUsed,
      },
    });
  });
}
