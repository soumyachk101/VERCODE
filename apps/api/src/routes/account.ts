// The account routes: /me, PATCH /me, GET /me/sessions (AUTHENTICATION.md §5,
// API_SPECIFICATION.md "Auth & account"). Session-required.

import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";

export async function accountRoutes(app: FastifyInstance) {
  app.get("/", async (req, reply) => {
    const db = app.auth.db;
    const userId = req.user.userId;
    if (!userId) {
      reply.code(401).send({ error: { code: "UNAUTHENTICATED", message: "No session." } });
      return;
    }
    const user = await db.user.findUnique({ where: { id: userId } });
    const orgs = await db.organization.findMany({
      where: { memberships: { some: { userId } }, status: { not: "DELETED" } },
      include: { memberships: { where: { userId }, select: { role: true, orgId: true } } },
    });
    reply.send({
      user: { id: user!.id, email: user!.email, name: user!.name },
      orgs: orgs.map((o) => ({ id: o.id, name: o.name, slug: o.slug, role: o.memberships[0]?.role })),
    });
  });

  app.get("/sessions", async (req, reply) => {
    const db = app.auth.db;
    const userId = req.user.userId;
    const sessions = await db.session.findMany({
      where: { userId, revokedAt: Prisma.DbNull, expiresAt: { gt: new Date() } },
      select: { id: true, userAgent: true, sourceIp: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: "desc" },
    });
    reply.send({ sessions });
  });
}
