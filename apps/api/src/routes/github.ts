// The GitHub install routes + re-review (API_SPECIFICATION.md "GitHub").
// Handles install-state, install-url, disconnect, repos listing, and US-105 re-review.
//
// The "connect" trio (the settings "GitHub connection" section's actions,
// the user's connect + disconnect + active-repo-set): the GitHub App
// install flow has no server-side connect call — an admin clicks through
// to GitHub, installs the App on their account/org, and GitHub's webhook
// ingress (webhooks.ts, `installation` created) is what records the
// install + repos. So `connect` is a one-way intent route: it returns the
// same install URL as `/install-url` + writes an audit line, and leaves
// the actual record to the webhook (which already owns the install +
// repo rows). `disconnect` reuses the existing REMOVE + repo-disable +
// retention-purge logic inline. `PUT /github-repos` records which of the
// org's known repos are "active for review" — a per-org preference on
// org_settings, since the schema has no dedicated active-repo-set model.

import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
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

  // GET /:id/github/candidates — The P5 dashboard connect-card's pick list:
  // the ACTIVE install's known-but-disconnected repo rows (grantable repos
  // the admin can re-enable via `/connect`) + the install's own account
  // metadata. `connected` is true when an ACTIVE install exists — the card
  // switches from the "install the App" shape to the "connect another"
  // shape on that flag.
  app.get(
    "/:id/github/candidates",
    { schema: { config: { capability: "read" } } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const installs = await app.auth.db.githubInstall.findMany({
        where: { orgId: id, status: "ACTIVE" },
      });
      if (installs.length === 0) {
        reply.send({ connected: false, candidates: [] });
        return;
      }
      const installIds = installs.map((i) => i.id);
      const candidates = await app.auth.db.githubRepo.findMany({
        where: { orgId: id, installId: { in: installIds }, connected: false },
        orderBy: { fullName: "asc" },
      });
      const primary = installs[0];
      reply.send({
        connected: true,
        candidates: candidates.map((r) => ({
          fullName: r.fullName,
          url: `https://github.com/${r.fullName}`,
          defaultBranch: r.defaultBranch,
        })),
        install: {
          accountLogin: primary.accountLogin,
          accountType: primary.accountType,
          repositorySelection: primary.repositorySelection,
        },
      });
    }
  );

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

  // POST /:id/github/connect — "Connect GitHub" (the settings section's
  // primary action). The GitHub App install flow has no server-side
  // connect: an admin clicks through to GitHub, installs the App, and the
  // `installation` webhook is what records the install + repos. This route
  // is the intent step: it writes an audit line so the connect click is
  // traceable even when the webhook is slow or the admin abandons, and
  // returns the install URL.
  //
  // A `{ fullName }` body (the P5 dashboard connect-card variant) pins a
  // specific known repo row instead: a disconnected row under an ACTIVE
  // install is re-enabled (connected: true); an unknown name is a
  // NOT_FOUND (install the App first), an already-connected row is a
  // VALIDATION_ERROR. Both paths return `{ ok, fullName, installUrl }` so
  // the card's inline success/error handling works either way.
  app.post(
    "/:id/github/connect",
    { schema: { config: { capability: "integrations.manage" } } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = req.body as { fullName?: string };
      const installUrl = `https://github.com/apps/vercode/installations/new`;

      if (!body?.fullName) {
        // The bare connect click: intent only (the install is recorded by
        // GitHub's webhook once it lands).
        await app.auth.db.auditEvent.create({
          data: {
            orgId: id,
            actorId: req.user.userId ?? "",
            action: "github.connect_requested",
          },
        });
        reply.send({ ok: true, installUrl });
        return;
      }

      // The pinned-repo variant: re-enable a known, disconnected row.
      const fullName = String(body.fullName);
      const repo = await app.auth.db.githubRepo.findFirst({
        where: { orgId: id, fullName },
      });
      if (!repo) {
        reply
          .code(404)
          .send({
            error: {
              code: "NOT_FOUND",
              message: `No connected GitHub App install covers "${fullName}" for this org yet.`,
            },
          });
        return;
      }
      if (repo.connected) {
        reply
          .code(422)
          .send({
            error: {
              code: "VALIDATION_ERROR",
              message: `"${fullName}" is already connected.`,
            },
          });
        return;
      }
      await app.auth.db.githubRepo.update({
        where: { id: repo.id },
        data: { connected: true, disabledAt: null },
      });
      await app.auth.db.auditEvent.create({
        data: {
          orgId: id,
          actorId: req.user.userId ?? "",
          action: "github.repo_connected",
          targetType: "github_repo",
          targetId: repo.id,
          meta: { fullName },
        },
      });
      reply.send({ ok: true, fullName, installUrl });
    }
  );

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

  // GET /:id/github/repositories — The settings section's accessible-repos
  // list: the same data shape as `/repos` (which lists only
  // connected=true) but inclusive of disabled rows, so the UI can show a
  // single "known repos" list and mark which are currently active.
  //
  // Caveat: the active-repo-set itself is read from org_settings via the
  // settings route; this endpoint returns the superset, and the UI
  // intersects it with the settings value to render the "active" flags.
  app.get(
    "/:id/github/repositories",
    { schema: { config: { capability: "read" } } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const repos = await app.auth.db.githubRepo.findMany({
        where: { orgId: id },
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
    }
  );

  // PUT /:id/github-repos — Store the org's active-for-review repo set.
  // The active set lives on org_settings.activeReposForReview (a Json
  // array of github_repo row ids) — the schema has no dedicated
  // "active repos" model, so a per-org preference is the home for it.
  app.put(
    "/:id/github-repos",
    { schema: { config: { capability: "org.manage" } } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = req.body as { repoIds?: string[] };
      const repoIds = Array.isArray(body?.repoIds) ? body.repoIds.map(String) : [];

      // Only accept ids that actually belong to this org's repo table — a
      // stale or foreign id is dropped, not written.
      const validIds = repoIds.length === 0
        ? []
        : (await app.auth.db.githubRepo.findMany({
            where: { orgId: id, id: { in: repoIds } },
            select: { id: true },
          })).map((r) => r.id);

      await app.auth.db.orgSettings.upsert({
        where: { orgId: id },
        create: {
          orgId: id,
          activeReposForReview: validIds as unknown as Prisma.InputJsonValue,
          updatedBy: req.user.userId ?? "",
        },
        update: {
          activeReposForReview: validIds as unknown as Prisma.InputJsonValue,
          updatedBy: req.user.userId ?? "",
        },
      });

      await app.auth.db.auditEvent.create({
        data: {
          orgId: id,
          actorId: req.user.userId ?? "",
          action: "org.github_repos_updated",
          targetType: "settings",
          meta: { repoIds: validIds },
        },
      });

      reply.send({ ok: true, activeRepoIds: validIds });
    }
  );
}
