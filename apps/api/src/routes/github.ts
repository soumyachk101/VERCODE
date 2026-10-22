// The GitHub install routes + re-review (API_SPECIFICATION.md "GitHub").
// Handles install-state, install-url, disconnect, repos listing, and US-105 re-review.

import type { FastifyInstance } from "fastify";
import type { Enqueueable } from "../queue.js";

export async function githubRoutes(app: FastifyInstance, queue?: Enqueueable) {
  // The install state (FR-502 "repository connections").
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
          fullName: r.fullName,
          githubRepoId: r.githubRepoId.toString(),
          connected: r.connected,
        })),
      })),
    });
  });

  // GET /:id/github/repos — Connected repositories list
  app.get("/:id/github/repos", { schema: { config: { capability: "read" } } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const repos = await app.auth.db.githubRepo.findMany({
      where: { orgId: id, connected: true },
    });
    reply.send({
      repos: repos.map((r) => ({
        id: r.id,
        fullName: r.fullName,
        name: r.fullName.split("/")[1] ?? r.fullName,
        url: `https://github.com/${r.fullName}`,
        connected: r.connected,
      })),
    });
  });

  // POST /:id/github/review — Re-review request (US-105, P1 must-have)
  app.post(
    "/:id/github/review",
    { schema: { config: { capability: "reviews.run" } } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = req.body as { prNumber: number; commitSha: string; repoId?: string };

      if (!body?.prNumber || !body?.commitSha) {
        reply.code(422).send({ error: { code: "VALIDATION_ERROR", message: "prNumber and commitSha are required." } });
        return;
      }

      const db = app.auth.db;
      let repo = null;
      if (body.repoId) {
        repo = await db.githubRepo.findFirst({ where: { id: body.repoId, orgId: id, connected: true } });
      } else {
        repo = await db.githubRepo.findFirst({ where: { orgId: id, connected: true } });
      }

      if (!repo) {
        reply.code(404).send({ error: { code: "NOT_FOUND", message: "No connected repository found for this org." } });
        return;
      }

      // Check in-flight (409 if identical job is already queued or running)
      const existing = await db.reviewJob.findFirst({
        where: {
          orgId: id,
          repoId: repo.id,
          prNumber: Number(body.prNumber),
          commitSha: body.commitSha,
        },
      });

      if (existing && (existing.status === "QUEUED" || existing.status === "RUNNING")) {
        reply.code(409).send({
          jobId: existing.id,
          status: existing.status.toLowerCase(),
          message: "A review job is already in-flight for this commit.",
        });
        return;
      }

      const job = await db.reviewJob.upsert({
        where: {
          orgId_repoId_prNumber_commitSha: {
            orgId: id,
            repoId: repo.id,
            prNumber: Number(body.prNumber),
            commitSha: body.commitSha,
          },
        },
        create: {
          orgId: id,
          repoId: repo.id,
          prNumber: Number(body.prNumber),
          commitSha: body.commitSha,
          status: "QUEUED",
        },
        update: {
          status: "QUEUED",
          error: null,
          skipReason: null,
        },
      });

      if (queue) {
        await queue.enqueue({
          jobId: job.id,
          orgId: id,
          repoId: repo.id,
          prNumber: Number(body.prNumber),
          commitSha: body.commitSha,
        });
      }

      await db.auditEvent.create({
        data: {
          orgId: id,
          actorId: req.user.userId ?? "",
          action: "github.re_review_requested",
          targetType: "review_job",
          targetId: job.id,
          meta: { prNumber: body.prNumber, commitSha: body.commitSha },
        },
      });

      reply.code(202).send({ jobId: job.id, status: "queued" });
    }
  );

  // POST /:id/github/install-url
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

  // POST /:id/github/disconnect
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
}
