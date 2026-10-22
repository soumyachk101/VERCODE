// The audit log routes: GET /orgs/:id/audit (API_SPECIFICATION.md "Audit").
// Read-only compliance audit trail for org activities.

import type { FastifyInstance } from "fastify";

export async function auditRoutes(app: FastifyInstance) {
  const db = app.auth.db;

  app.get("/:id/audit", { schema: { config: { capability: "audit.read" } } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const query = req.query as {
      action?: string;
      actorId?: string;
      targetType?: string;
      since?: string;
      cursor?: string;
      limit?: string;
    };

    const where: Record<string, unknown> = { orgId: id };
    if (query.action) {
      where.action = query.action;
    }
    if (query.actorId) {
      where.actorId = query.actorId;
    }
    if (query.targetType) {
      where.targetType = query.targetType;
    }
    if (query.since) {
      where.createdAt = { gte: new Date(query.since) };
    }

    const limit = Math.min(Number(query.limit) || 50, 200);

    const events = await db.auditEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        actor: { select: { id: true, name: true, email: true } },
      },
    });

    const total = await db.auditEvent.count({ where });

    reply.send({
      items: events.map((e) => ({
        id: e.id,
        orgId: e.orgId,
        action: e.action,
        actorId: e.actorId,
        actorName: e.actor?.name ?? e.actor?.email ?? "System",
        targetType: e.targetType,
        targetId: e.targetId,
        meta: e.meta,
        createdAt: e.createdAt.toISOString(),
      })),
      total,
      nextCursor: null,
    });
  });
}
