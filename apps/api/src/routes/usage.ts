// The usage routes: GET /orgs/:id/usage (API_SPECIFICATION.md "Usage & billing").
// Returns aggregated usage series, totals, and monthly plan quota consumption.

import type { FastifyInstance } from "fastify";
import { UsageRangeSchema, planQuota, type Plan } from "@vercode/contracts";
import { z } from "zod";

const QuerySchema = z.object({
  range: UsageRangeSchema.default("30d"),
  by: z.enum(["provider", "severity", "repo"]).optional(),
});

export async function usageRoutes(app: FastifyInstance) {
  app.get(
    "/:id/usage",
    {
      schema: {
        querystring: QuerySchema,
        config: { capability: "read" },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const q = req.query as { range?: "30d" | "90d" | "12mo"; by?: string };
      const range = q.range ?? "30d";
      const db = app.auth.db;

      // Verify org exists
      const org = await db.organization.findUnique({
        where: { id },
        select: { id: true, plan: true },
      });
      if (!org) {
        reply.code(404).send({ error: { code: "NOT_FOUND", message: "Org not found." } });
        return;
      }

      // Calculate days back
      const days = range === "12mo" ? 365 : range === "90d" ? 90 : 30;
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - days);
      const sinceDay = sinceDate.toISOString().slice(0, 10);

      // 1. Daily rollups from usage_daily
      const dailyRows = await db.usageDaily.findMany({
        where: {
          orgId: id,
          day: { gte: sinceDay },
        },
        orderBy: { day: "asc" },
      });

      // 2. Aggregate totals
      let totalReviews = 0;
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalEstUsd = 0;
      const bySeverity: Record<string, number> = {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0,
      };

      for (const row of dailyRows) {
        totalReviews += row.reviews;
        totalInputTokens += row.inputTokens;
        totalOutputTokens += row.outputTokens;
        totalEstUsd += Number(row.estUsdCost);

        if (row.findingCounts && typeof row.findingCounts === "object") {
          for (const [sev, cnt] of Object.entries(row.findingCounts as Record<string, number>)) {
            const key = sev.toLowerCase();
            bySeverity[key] = (bySeverity[key] ?? 0) + Number(cnt || 0);
          }
        }
      }

      // 3. Current month quota calculation
      const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
      const monthlyUsage = await db.usageEvent.aggregate({
        where: { orgId: id, month: currentMonth },
        _sum: { reviewCount: true, estUsdCost: true, inputTokens: true, outputTokens: true },
      });

      const currentPlan = org.plan.toLowerCase() as Plan;
      const quotaConfig = planQuota(currentPlan);

      const reviewsUsed = Number(monthlyUsage._sum.reviewCount ?? 0);
      const reviewsLimit = quotaConfig.reviewsPerMonth;
      const percentUsed = reviewsLimit > 0 ? Math.min(100, Math.round((reviewsUsed / reviewsLimit) * 100)) : 0;

      const spendUsed = Number(monthlyUsage._sum.estUsdCost ?? 0);
      const spendLimit = quotaConfig.tokenSpendCapMonthlyUsd;
      const spendPercentUsed = spendLimit > 0 ? Math.min(100, Math.round((spendUsed / spendLimit) * 100)) : 0;

      reply.send({
        series: dailyRows.map((r) => ({
          day: r.day,
          reviews: r.reviews,
          inputTokens: r.inputTokens,
          outputTokens: r.outputTokens,
          estUsdCost: Number(r.estUsdCost),
          findingCounts: r.findingCounts,
        })),
        totals: {
          reviews: totalReviews,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          estUsd: Math.round(totalEstUsd * 100) / 100,
          bySeverity,
        },
        quota: {
          plan: currentPlan,
          used: reviewsUsed,
          limit: reviewsLimit,
          percentUsed,
          tokenSpendUsd: spendUsed,
          tokenSpendLimitUsd: spendLimit,
          spendPercentUsed,
        },
      });
    }
  );
}
