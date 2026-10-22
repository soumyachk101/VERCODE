// The reviews routes: GET /orgs/:id/reviews, GET /orgs/:id/reviews/:jobId,
// GET /orgs/:id/reviews/:jobId/findings, POST /orgs/:id/findings/:id/actions,
// GET /orgs/:id/security, GET /orgs/:id/trends (API_SPECIFICATION.md "Reviews & findings").
// Tenant-scoped and capability gated.

import type { FastifyInstance } from "fastify";
import { ActionType } from "@prisma/client";

export async function reviewRoutes(app: FastifyInstance) {
  const db = app.auth.db;

  // ---------------------------------------------------------------------------
  // GET /orgs/:id/reviews — List review jobs for an org
  // ---------------------------------------------------------------------------
  app.get("/:id/reviews", { schema: { config: { capability: "read" } } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const query = req.query as {
      status?: string;
      repoId?: string;
      prNumber?: string;
      since?: string;
      cursor?: string;
      limit?: string;
    };

    const where: Record<string, unknown> = { orgId: id };
    if (query.status) {
      where.status = query.status.toUpperCase();
    }
    if (query.repoId) {
      where.repoId = query.repoId;
    }
    if (query.prNumber) {
      where.prNumber = Number(query.prNumber);
    }
    if (query.since) {
      where.createdAt = { gte: new Date(query.since) };
    }

    const limit = Math.min(Number(query.limit) || 50, 100);

    const jobs = await db.reviewJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        repo: { select: { id: true, fullName: true } },
        _count: { select: { findings: true } },
      },
    });

    const total = await db.reviewJob.count({ where });

    reply.send({
      items: jobs.map((j) => ({
        id: j.id,
        repoId: j.repoId,
        repoName: j.repo?.fullName,
        prNumber: j.prNumber,
        commitSha: j.commitSha,
        status: j.status.toLowerCase(),
        skipReason: j.skipReason,
        error: j.error,
        createdAt: j.createdAt.toISOString(),
        finishedAt: j.finishedAt?.toISOString(),
        costUsd: Number(j.estUsdCost),
        inputTokens: j.inputTokens,
        outputTokens: j.outputTokens,
        findingsCount: j._count?.findings ?? 0,
      })),
      total,
      nextCursor: null,
    });
  });

  // ---------------------------------------------------------------------------
  // GET /orgs/:id/reviews/:jobId — Review job detail
  // ---------------------------------------------------------------------------
  app.get("/:id/reviews/:jobId", { schema: { config: { capability: "read" } } }, async (req, reply) => {
    const { id, jobId } = req.params as { id: string; jobId: string };

    const job = await db.reviewJob.findFirst({
      where: { id: jobId, orgId: id },
      include: {
        repo: { select: { id: true, fullName: true } },
        _count: { select: { findings: true } },
      },
    });

    if (!job) {
      reply.code(404).send({ error: { code: "NOT_FOUND", message: "Review job not found." } });
      return;
    }

    reply.send({
      id: job.id,
      repoId: job.repoId,
      repoName: job.repo?.fullName,
      prNumber: job.prNumber,
      commitSha: job.commitSha,
      status: job.status.toLowerCase(),
      skipReason: job.skipReason,
      error: job.error,
      createdAt: job.createdAt.toISOString(),
      finishedAt: job.finishedAt?.toISOString(),
      costUsd: Number(job.estUsdCost),
      inputTokens: job.inputTokens,
      outputTokens: job.outputTokens,
      findingsCount: job._count?.findings ?? 0,
      model: job.model,
      promptVersion: job.promptVersion,
      publishedGithubReviewId: job.publishedGithubReviewId,
    });
  });

  // ---------------------------------------------------------------------------
  // GET /orgs/:id/reviews/:jobId/findings — Findings for a review job
  // ---------------------------------------------------------------------------
  app.get("/:id/reviews/:jobId/findings", { schema: { config: { capability: "read" } } }, async (req, reply) => {
    const { id, jobId } = req.params as { id: string; jobId: string };
    const query = req.query as {
      severity?: string;
      category?: string;
      source?: string;
    };

    // Verify job belongs to this org
    const job = await db.reviewJob.findFirst({
      where: { id: jobId, orgId: id },
    });
    if (!job) {
      reply.code(404).send({ error: { code: "NOT_FOUND", message: "Review job not found." } });
      return;
    }

    const where: Record<string, unknown> = { jobId };
    if (query.severity) {
      where.severity = query.severity.toUpperCase();
    }
    if (query.category) {
      where.category = query.category.toUpperCase().replace(/-/g, "_");
    }

    const findings = await db.reviewFinding.findMany({
      where,
      orderBy: [{ severity: "desc" }, { line: "asc" }],
      include: {
        actions: { orderBy: { actedAt: "desc" }, take: 1 },
      },
    });

    reply.send({
      items: findings.map((f) => ({
        id: f.id,
        jobId: f.jobId,
        file: f.file,
        line: f.line,
        severity: f.severity.toLowerCase(),
        category: f.category.toLowerCase().replace(/_/g, "-"),
        title: f.title,
        description: f.description,
        suggestedFix: f.suggestedFix,
        confidence: Number(f.confidence),
        source: f.source.toLowerCase(),
        anchorStatus: f.anchorStatus.toLowerCase(),
        actioned: f.actions.length > 0,
        action: f.actions[0]?.actionType?.toLowerCase() ?? null,
        createdAt: f.createdAt.toISOString(),
      })),
      total: findings.length,
    });
  });

  // ---------------------------------------------------------------------------
  // POST /orgs/:id/findings/:findingId/actions — Record finding action
  // ---------------------------------------------------------------------------
  app.post(
    "/:id/findings/:findingId/actions",
    { schema: { config: { capability: "reviews.run" } } },
    async (req, reply) => {
      const { id, findingId } = req.params as { id: string; findingId: string };
      const body = req.body as { action: string };

      if (!body?.action) {
        reply.code(422).send({ error: { code: "VALIDATION_ERROR", message: "Action is required." } });
        return;
      }

      // Map action string to ActionType enum
      const actionMap: Record<string, ActionType> = {
        accepted: ActionType.ACCEPTED,
        dismissed_reasonable: ActionType.DISMISSED_REASONABLE,
        dismissed_unreasonable: ActionType.DISMISSED_UNREASONABLE,
        fixed: ActionType.FIXED,
        ignored: ActionType.IGNORED,
      };

      const normalizedAction = body.action.toLowerCase();
      const actionType = actionMap[normalizedAction];
      if (!actionType) {
        reply.code(422).send({
          error: {
            code: "VALIDATION_ERROR",
            message: `Invalid action. Supported: ${Object.keys(actionMap).join(", ")}`,
          },
        });
        return;
      }

      // Verify finding exists and belongs to this org
      const finding = await db.reviewFinding.findFirst({
        where: { id: findingId, job: { orgId: id } },
      });
      if (!finding) {
        reply.code(404).send({ error: { code: "NOT_FOUND", message: "Finding not found." } });
        return;
      }

      const action = await db.findingAction.create({
        data: {
          findingId,
          orgId: id,
          actorId: req.user.userId ?? null,
          actionType,
        },
      });

      await db.auditEvent.create({
        data: {
          orgId: id,
          actorId: req.user.userId ?? "",
          action: "finding.actioned",
          targetType: "finding",
          targetId: findingId,
          meta: { action: normalizedAction },
        },
      });

      reply.send({
        findingId,
        action: normalizedAction,
        actedAt: action.actedAt.toISOString(),
      });
    }
  );

  // ---------------------------------------------------------------------------
  // GET /orgs/:id/security — Security rollup
  // ---------------------------------------------------------------------------
  app.get("/:id/security", { schema: { config: { capability: "read" } } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const query = req.query as { since?: string };

    const sinceDate = query.since ? new Date(query.since) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const findings = await db.reviewFinding.findMany({
      where: {
        job: { orgId: id, createdAt: { gte: sinceDate } },
      },
      include: {
        actions: { take: 1 },
      },
    });

    const openCount: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    let totalActioned = 0;
    for (const f of findings) {
      if (f.actions.length > 0) {
        totalActioned++;
      } else {
        const s = f.severity.toLowerCase();
        if (openCount[s] !== undefined) {
          openCount[s]++;
        }
      }
    }

    reply.send({
      open: openCount,
      actionedRate: {
        current: findings.length > 0 ? Number((totalActioned / findings.length).toFixed(2)) : 1.0,
        windowDays: 30,
      },
      total: findings.length,
    });
  });

  // ---------------------------------------------------------------------------
  // GET /orgs/:id/trends — Finding-trend series
  // ---------------------------------------------------------------------------
  app.get("/:id/trends", { schema: { config: { capability: "read" } } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const query = req.query as { repoId?: string; range?: string };

    const days = query.range === "90d" ? 90 : 30;
    const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const where: Record<string, unknown> = {
      job: { orgId: id, createdAt: { gte: sinceDate } },
    };
    if (query.repoId) {
      (where.job as Record<string, unknown>).repoId = query.repoId;
    }

    const findings = await db.reviewFinding.findMany({
      where,
      select: { category: true, createdAt: true },
    });

    // Group by date (YYYY-MM-DD) and category
    const trendMap = new Map<string, number>();
    for (const f of findings) {
      const dateStr = f.createdAt.toISOString().slice(0, 10);
      const catStr = f.category.toLowerCase().replace(/_/g, "-");
      const key = `${dateStr}::${catStr}`;
      trendMap.set(key, (trendMap.get(key) ?? 0) + 1);
    }

    const series = Array.from(trendMap.entries()).map(([key, count]) => {
      const [date, category] = key.split("::");
      return { date, category, count };
    });

    reply.send({ series });
  });
}
