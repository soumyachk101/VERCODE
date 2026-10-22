// The GitHub integration routes (API_SPECIFICATION.md "GitHub").
// Install state, repos list, connect/disconnect, and manual review triggers (US-105).

import type { FastifyInstance } from "fastify";
import type { Enqueueable } from "../queue.js";
import { z } from "zod";

const ReReviewBodySchema = z.object({
  repoId: z.string().optional(),
  repoFullName: z.string().optional(),
  prNumber: z.number().int().positive(),
  commitSha: z.string().min(4),
});

export async function githubRoutes(app: FastifyInstance, queue?: Enqueueable) {
  // GET /:id/github — The install state
  app.get("/:id/github", { schema: { config: { capability: "read" } } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const installs = await app.auth.db.githubInstall.findMany({
      where: { orgId: id },
      include: { repos: { where: { connected: true } } },
    });
    reply.send({
      installs: installs.map((i) => ({
        id: i.id,
        githubInstallationId: i.githubInstallationId,
        status: i.status,
        accountLogin: i.accountLogin,
        repos: i.repos.map((r) => ({
          id: r.id,
          fullName: r.fullName,
          githubRepoId: r.githubRepoId.toString(),
          connected: r.connected,
          defaultBranch: r.defaultBranch,
        })),
      })),
    });
  });

  // GET /:id/github/repos — Connected repositories list
  app.get(
    "/:id/github/repos",
    { schema: { config: { capability: "read" } } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const repos = await app.auth.db.githubRepo.findMany({
        where: { orgId: id, connected: true },
        include: {
          install: { select: { accountLogin: true, status: true } },
          _count: { select: { jobs: true } },
        },
        orderBy: { fullName: "asc" },
      });

      reply.send({
        repos: repos.map((r) => ({
          id: r.id,
          fullName: r.fullName,
          githubRepoId: r.githubRepoId.toString(),
          defaultBranch: r.defaultBranch,
          connected: r.connected,
          accountLogin: r.install.accountLogin,
          reviewCount: r._count.jobs,
          createdAt: r.createdAt.toISOString(),
        })),
      });
    }
  );

  // POST /:id/github/install-url — Generate the App install URL (server-side)
  app.post(
    "/:id/github/install-url",
    { schema: { config: { capability: "integrations.manage" } } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const url = `https://github.com/apps/vercode/installations/new`;
      await app.auth.db.auditEvent.create({
        data: {
          orgId: id,
          actorId: req.user.userId ?? "",
          action: "github.install_url_requested",
        },
      });
      reply.send({ installUrl: url });
    }
  );

  // POST /:id/github/disconnect — Disconnect GitHub installation
  app.post(
    "/:id/github/disconnect",
    { schema: { config: { capability: "integrations.manage" } } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const db = app.auth.db;
      const installs = await db.githubInstall.findMany({ where: { orgId: id, status: "ACTIVE" } });
      for (const install of installs) {
        await db.githubInstall.update({
          where: { id: install.id },
          data: { status: "REMOVED", removedAt: new Date() },
        });
        await db.githubRepo.updateMany({
          where: { installId: install.id },
          data: { connected: false, disabledAt: new Date() },
        });
        await db.retentionJob.create({
          data: {
            orgId: id,
            kind: "repo_content_purge",
            target: install.id,
            runAt: new Date(),
          },
        });
      }
      await db.auditEvent.create({
        data: {
          orgId: id,
          actorId: req.user.userId ?? "",
          action: "github.disconnect",
        },
      });
      reply.send({ ok: true });
    }
  );

  // POST /:id/github/review — Re-review an open PR (US-105)
  app.post(
    "/:id/github/review",
    {
      schema: {
        body: ReReviewBodySchema,
        config: { capability: "reviews.write" },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = req.body as z.infer<typeof ReReviewBodySchema>;
      const db = app.auth.db;

      // Resolve the repo
      const repo = await db.githubRepo.findFirst({
        where: {
          orgId: id,
          connected: true,
          ...(body.repoId ? { id: body.repoId } : {}),
          ...(body.repoFullName ? { fullName: body.repoFullName } : {}),
        },
      });

      if (!repo) {
        reply.code(404).send({
          error: { code: "NOT_FOUND", message: "Connected repository not found in org." },
        });
        return;
      }

      // Check commit-SHA idempotency
      const existing = await db.reviewJob.findUnique({
        where: {
          orgId_repoId_prNumber_commitSha: {
            orgId: id,
            repoId: repo.id,
            prNumber: body.prNumber,
            commitSha: body.commitSha,
          },
        },
      });

      if (existing) {
        if (existing.status === "QUEUED" || existing.status === "RUNNING") {
          reply.code(409).send({
            error: {
              code: "JOB_IN_FLIGHT",
              message: "An identical review job is already in flight for this commit SHA.",
            },
            jobId: existing.id,
            status: existing.status.toLowerCase(),
          });
          return;
        }

        // If succeeded, or failed/partial/skipped, we re-run
        await db.reviewJob.update({
          where: { id: existing.id },
          data: { status: "QUEUED", skipReason: null, error: null },
        });

        if (queue) {
          await queue.enqueue({
            jobId: existing.id,
            orgId: id,
            repoId: repo.id,
            prNumber: body.prNumber,
            commitSha: body.commitSha,
          });
        }

        reply.code(202).send({
          jobId: existing.id,
          status: "queued",
        });
        return;
      }

      // Create new review_jobs row
      const job = await db.reviewJob.create({
        data: {
          orgId: id,
          repoId: repo.id,
          prNumber: body.prNumber,
          commitSha: body.commitSha,
          status: "QUEUED",
        },
      });

      if (queue) {
        await queue.enqueue({
          jobId: job.id,
          orgId: id,
          repoId: repo.id,
          prNumber: body.prNumber,
          commitSha: body.commitSha,
        });
      }

      await db.auditEvent.create({
        data: {
          orgId: id,
          actorId: req.user.userId ?? "system",
          action: "review.triggered_manually",
          targetType: "review_job",
          targetId: job.id,
          meta: { prNumber: body.prNumber, commitSha: body.commitSha },
        },
      });

      reply.code(202).send({
        jobId: job.id,
        status: "queued",
      });
    }
  );
}
