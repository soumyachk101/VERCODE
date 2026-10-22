// The GitHub install routes (a stub for M2; the full GitHub App integration is
// M3). M2 provides the install-state surface; M3 fills in the App auth + the
// webhook verify + the diff fetch + the publish (INTEGRATION_DESIGN.md §1).

import type { FastifyInstance } from "fastify";

export async function githubRoutes(app: FastifyInstance) {
  // The install state (a FR-502 "repository connections").
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

  // A generate-the-install-URL (a FR-201 "the install URL is generated
  // server-side; the browser only follows it", INTEGRATION_DESIGN §1.2 "the
  // installation credentials are never exposed to the browser").
  app.post(
    "/:id/github/install-url",
    { schema: { config: { capability: "integrations.manage" } } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const config = app.auth.config;
      // The App's marketplace install URL (a GitHub-hosted, a pre-scoped).
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

  // A disconnect (a FR-208 "the install removal handling", a a content-purge
  // schedule, a AC-204).
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
        // A content-purge schedule (a retention_jobs row, a DATA_RETENTION §4
        // "an install-removal immediately evicts the org's diff cache").
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
