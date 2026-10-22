// The review routes: /orgs/:id/reviews, /orgs/:id/reviews/:jobId,
// /orgs/:id/reviews/:jobId/findings, /orgs/:id/findings/:findingId/actions,
// /orgs/:id/security, /orgs/:id/trends (API_SPECIFICATION.md "Reviews & findings").
// Tenant-scoped and capability-gated.

import type { FastifyInstance } from "fastify";
import {
  ListReviewsQuerySchema,
  ListFindingsQuerySchema,
  RecordFindingActionRequestSchema,
} from "@vercode/contracts";
import { ActionType, JobStatus, Severity, FindingCategory } from "@prisma/client";

export async function reviewRoutes(app: FastifyInstance) {
  // GET /:id/reviews — List review jobs for an organization
  app.get(
    "/:id/reviews",
    {
      schema: {
        querystring: ListReviewsQuerySchema,
        config: { capability: "read" },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const q = req.query as {
        status?: string;
        repoId?: string;
        prNumber?: number;
        since?: string;
        cursor?: string;
        limit?: number;
      };
      const db = app.auth.db;
      const limit = Math.min(Math.max(q.limit ?? 50, 1), 100);

      const where: Record<string, unknown> = {
        orgId: id,
      };

      if (q.status) {
        where.status = q.status.toUpperCase() as JobStatus;
      }
      if (q.repoId) {
        where.repoId = q.repoId;
      }
      if (q.prNumber !== undefined) {
        where.prNumber = Number(q.prNumber);
      }
      if (q.since) {
        where.createdAt = { gte: new Date(q.since) };
      }
      if (q.cursor) {
        where.id = { lt: q.cursor };
      }

      const jobs = await db.reviewJob.findMany({
        where,
        take: limit + 1,
        orderBy: { id: "desc" },
        include: {
          repo: { select: { id: true, fullName: true, defaultBranch: true } },
          _count: { select: { findings: true } },
        },
      });

      let nextCursor: string | null = null;
      if (jobs.length > limit) {
        const nextItem = jobs.pop();
        nextCursor = nextItem?.id ?? null;
      }

      reply.send({
        jobs: jobs.map((j) => ({
          id: j.id,
          orgId: j.orgId,
          repoId: j.repoId,
          repoName: j.repo?.fullName,
          prNumber: j.prNumber,
          commitSha: j.commitSha,
          status: j.status.toLowerCase(),
          skipReason: j.skipReason,
          error: j.error,
          model: j.model,
          promptVersion: j.promptVersion,
          inputTokens: j.inputTokens,
          outputTokens: j.outputTokens,
          estUsdCost: Number(j.estUsdCost),
          publishedGithubReviewId: j.publishedGithubReviewId,
          findingsCount: j._count.findings,
          createdAt: j.createdAt.toISOString(),
          finishedAt: j.finishedAt?.toISOString() ?? null,
        })),
        nextCursor,
      });
    }
  );

  // GET /:id/reviews/:jobId — Review job detail
  app.get(
    "/:id/reviews/:jobId",
    { schema: { config: { capability: "read" } } },
    async (req, reply) => {
      const { id, jobId } = req.params as { id: string; jobId: string };
      const db = app.auth.db;

      const job = await db.reviewJob.findFirst({
        where: { id: jobId, orgId: id },
        include: {
          repo: { select: { id: true, fullName: true, defaultBranch: true } },
          findings: {
            take: 100,
            orderBy: { createdAt: "asc" },
            include: { actions: true },
          },
        },
      });

      if (!job) {
        reply.code(404).send({ error: { code: "NOT_FOUND", message: "Review job not found." } });
        return;
      }

      reply.send({
        job: {
          id: job.id,
          orgId: job.orgId,
          repoId: job.repoId,
          repoName: job.repo?.fullName,
          prNumber: job.prNumber,
          commitSha: job.commitSha,
          status: job.status.toLowerCase(),
          skipReason: job.skipReason,
          error: job.error,
          model: job.model,
          promptVersion: job.promptVersion,
          inputTokens: job.inputTokens,
          outputTokens: job.outputTokens,
          estUsdCost: Number(job.estUsdCost),
          publishedGithubReviewId: job.publishedGithubReviewId,
          createdAt: job.createdAt.toISOString(),
          finishedAt: job.finishedAt?.toISOString() ?? null,
        },
        findings: job.findings.map((f) => ({
          id: f.id,
          jobId: f.jobId,
          source: f.source.toLowerCase().replace(/_/g, "-"),
          file: f.file,
          line: f.line,
          severity: f.severity.toLowerCase(),
          category: f.category.toLowerCase().replace(/_/g, "-"),
          title: f.title,
          description: f.description,
          suggestedFix: f.suggestedFix,
          confidence: Number(f.confidence),
          anchorStatus: f.anchorStatus.toLowerCase().replace(/_/g, "-"),
          payload: f.payload,
          actions: f.actions.map((a) => ({
            id: a.id,
            action: a.actionType.toLowerCase(),
            actorId: a.actorId,
            actedAt: a.actedAt.toISOString(),
          })),
        })),
      });
    }
  );

  // GET /:id/reviews/:jobId/findings — Findings for a job
  app.get(
    "/:id/reviews/:jobId/findings",
    {
      schema: {
        querystring: ListFindingsQuerySchema,
        config: { capability: "read" },
      },
    },
    async (req, reply) => {
      const { id, jobId } = req.params as { id: string; jobId: string };
      const q = req.query as {
        severity?: string;
        category?: string;
        source?: string;
        cursor?: string;
        limit?: number;
      };
      const db = app.auth.db;
      const limit = Math.min(Math.max(q.limit ?? 50, 1), 200);

      // Verify the job belongs to this tenant
      const job = await db.reviewJob.findFirst({
        where: { id: jobId, orgId: id },
        select: { id: true },
      });
      if (!job) {
        reply.code(404).send({ error: { code: "NOT_FOUND", message: "Review job not found." } });
        return;
      }

      const where: Record<string, unknown> = {
        jobId,
      };

      if (q.severity) {
        where.severity = q.severity.toUpperCase() as Severity;
      }
      if (q.category) {
        where.category = q.category.toUpperCase().replace(/-/g, "_") as FindingCategory;
      }
      if (q.source) {
        where.file = q.source;
      }
      if (q.cursor) {
        where.id = { gt: q.cursor };
      }

      const findings = await db.reviewFinding.findMany({
        where,
        take: limit + 1,
        orderBy: { id: "asc" },
        include: { actions: true },
      });

      let nextCursor: string | null = null;
      if (findings.length > limit) {
        const nextItem = findings.pop();
        nextCursor = nextItem?.id ?? null;
      }

      reply.send({
        findings: findings.map((f) => ({
          id: f.id,
          jobId: f.jobId,
          source: f.source.toLowerCase().replace(/_/g, "-"),
          file: f.file,
          line: f.line,
          severity: f.severity.toLowerCase(),
          category: f.category.toLowerCase().replace(/_/g, "-"),
          title: f.title,
          description: f.description,
          suggestedFix: f.suggestedFix,
          confidence: Number(f.confidence),
          anchorStatus: f.anchorStatus.toLowerCase().replace(/_/g, "-"),
          payload: f.payload,
          actions: f.actions.map((a) => ({
            id: a.id,
            action: a.actionType.toLowerCase(),
            actorId: a.actorId,
            actedAt: a.actedAt.toISOString(),
          })),
        })),
        nextCursor,
      });
    }
  );

  // POST /:id/findings/:findingId/actions — Record an action on a finding (accept/dismiss/fix)
  app.post(
    "/:id/findings/:findingId/actions",
    {
      schema: {
        body: RecordFindingActionRequestSchema,
        config: { capability: "reviews.write" },
      },
    },
    async (req, reply) => {
      const { id, findingId } = req.params as { id: string; findingId: string };
      const { action } = req.body as {
        action: "accepted" | "dismissed_reasonable" | "dismissed_unreasonable" | "fixed" | "ignored";
      };
      const db = app.auth.db;

      // Verify tenant scope through job relation
      const finding = await db.reviewFinding.findFirst({
        where: { id: findingId, job: { orgId: id } },
      });
      if (!finding) {
        reply.code(404).send({ error: { code: "NOT_FOUND", message: "Finding not found." } });
        return;
      }

      const actionType = action.toUpperCase() as ActionType;
      const record = await db.findingAction.create({
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
          actorId: req.user.userId ?? "system",
          action: "finding.actioned",
          targetType: "finding",
          targetId: findingId,
          meta: { action, actionId: record.id },
        },
      });

      reply.send({
        findingId,
        action,
        actedAt: record.actedAt.toISOString(),
      });
    }
  );

  // GET /:id/security — Security rollup (severity >= HIGH)
  app.get(
    "/:id/security",
    { schema: { config: { capability: "read" } } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const q = req.query as { since?: string; repoId?: string };
      const db = app.auth.db;

      const where: Record<string, unknown> = {
        job: { orgId: id },
        severity: { in: [Severity.HIGH, Severity.CRITICAL] },
      };

      if (q.since) {
        where.createdAt = { gte: new Date(q.since) };
      }
      if (q.repoId) {
        where.job = { orgId: id, repoId: q.repoId };
      }

      const findings = await db.reviewFinding.findMany({
        where,
        take: 200,
        orderBy: { createdAt: "desc" },
        include: {
          job: { select: { id: true, prNumber: true, commitSha: true, repo: { select: { fullName: true } } } },
          actions: { orderBy: { actedAt: "desc" }, take: 1 },
        },
      });

      const highCount = findings.filter((f) => f.severity === Severity.HIGH).length;
      const criticalCount = findings.filter((f) => f.severity === Severity.CRITICAL).length;
      const openCount = findings.filter(
        (f) => f.actions.length === 0 || f.actions[0]?.actionType === ActionType.ACCEPTED
      ).length;

      reply.send({
        summary: {
          total: findings.length,
          critical: criticalCount,
          high: highCount,
          open: openCount,
        },
        findings: findings.map((f) => ({
          id: f.id,
          jobId: f.jobId,
          repoName: f.job?.repo?.fullName,
          prNumber: f.job?.prNumber,
          commitSha: f.job?.commitSha,
          source: f.source.toLowerCase().replace(/_/g, "-"),
          file: f.file,
          line: f.line,
          severity: f.severity.toLowerCase(),
          category: f.category.toLowerCase().replace(/_/g, "-"),
          title: f.title,
          description: f.description,
          suggestedFix: f.suggestedFix,
          confidence: Number(f.confidence),
          status: f.actions[0]?.actionType.toLowerCase() ?? "open",
          createdAt: f.createdAt.toISOString(),
        })),
      });
    }
  );

  // GET /:id/trends — Finding-trend series (category/repo rollup)
  app.get(
    "/:id/trends",
    { schema: { config: { capability: "read" } } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const db = app.auth.db;

      // Group recent daily rollups
      const rollups = await db.usageDaily.findMany({
        where: { orgId: id },
        take: 90,
        orderBy: { day: "asc" },
      });

      // Also get raw finding counts by category
      const findingsByCategory = await db.reviewFinding.groupBy({
        by: ["category"],
        where: { job: { orgId: id } },
        _count: { id: true },
      });

      // Findings by severity
      const findingsBySeverity = await db.reviewFinding.groupBy({
        by: ["severity"],
        where: { job: { orgId: id } },
        _count: { id: true },
      });

      reply.send({
        series: rollups.map((r) => ({
          day: r.day,
          reviews: r.reviews,
          inputTokens: r.inputTokens,
          outputTokens: r.outputTokens,
          estUsdCost: Number(r.estUsdCost),
          findingCounts: r.findingCounts,
        })),
        byCategory: Object.fromEntries(
          findingsByCategory.map((c) => [c.category.toLowerCase().replace(/_/g, "-"), c._count.id])
        ),
        bySeverity: Object.fromEntries(
          findingsBySeverity.map((s) => [s.severity.toLowerCase(), s._count.id])
        ),
      });
    }
  );
}
