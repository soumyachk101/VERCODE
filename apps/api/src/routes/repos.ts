// Additive repo-connect endpoints (P5's scope): the dashboard "connect a
// repository" flow. Reuses the existing install model (P6 owns
// `github.ts`) — a connected repo row is the source of truth; these routes
// never duplicate install handling.

// GET /:id/github/candidates — the repos an ACTIVE install can add. The
// webhook ingress (P6) writes a `githubRepo` row on every repo the install
// grants access to (the install's `repository_selection` = "all" / "only").
// This endpoint surfaces rows the org has not connected yet, so the UI's
// "connect another repository" card offers a real pick list rather than a
// blind name entry.
//
// POST /:id/github/connect — connect a specific repo by fullName. The row
// must already exist (the webhook ingress created it on install) — this
// endpoint only re-enables it (`connected: true`), which is the "copy token
// / install" fallback when the candidate list is empty (the install's
// selection was "only" and the target repo's row was disconnected earlier).

import type { FastifyInstance } from "fastify";

export async function reposRoutes(app: FastifyInstance) {
  // GET /:id/github/candidates — repos the connected user can add.
  app.get(
    "/:id/github/candidates",
    { schema: { config: { capability: "read" } } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const db = app.auth.db;

      const install = await db.githubInstall.findFirst({
        where: { orgId: id, status: "ACTIVE" },
        include: { repos: true },
      });

      // No ACTIVE install → the connect flow has no candidates (the user
      // must install the App first; the dashboard shows the install URL).
      if (!install) {
        reply.send({ connected: false, candidates: [] });
        return;
      }

      const candidates = install.repos
        .filter((r) => !r.connected)
        .map((r) => ({
          fullName: r.fullName,
          url: `https://github.com/${r.fullName}`,
          defaultBranch: r.defaultBranch,
        }));

      reply.send({
        connected: true,
        install: {
          accountLogin: install.accountLogin,
          accountType: install.accountType,
          repositorySelection: install.repositorySelection,
        },
        candidates,
      });
    },
  );

  // POST /:id/github/connect — connect a repo by fullName. The webhook
  // ingress creates the row on install; this endpoint re-enables it.
  app.post(
    "/:id/github/connect",
    { schema: { config: { capability: "integrations.manage" } } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = req.body as { fullName?: string };
      if (!body?.fullName) {
        reply.code(422).send({
          error: { code: "VALIDATION_ERROR", message: "fullName is required." },
        });
        return;
      }

      const db = app.auth.db;
      const fullName = String(body.fullName);

      // The row must already exist (created by the install webhook) — we
      // never invent a githubRepoId. A missing row → 404 with a clear
      // message the UI can surface.
      const row = await db.githubRepo.findFirst({
        where: { orgId: id, fullName },
      });
      if (!row) {
        reply.code(404).send({
          error: {
            code: "NOT_FOUND",
            message: "Repository not in this org's connected install — add it on GitHub first.",
          },
        });
        return;
      }

      await db.githubRepo.update({
        where: { id: row.id },
        data: { connected: true, disabledAt: null },
      });

      await db.auditEvent.create({
        data: {
          orgId: id,
          actorId: req.user.userId ?? "",
          action: "github.repo_connected",
          targetType: "github_repo",
          targetId: row.id,
          meta: { fullName },
        },
      });

      reply.send({ ok: true, fullName });
    },
  );
}
