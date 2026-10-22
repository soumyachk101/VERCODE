// The audit routes: GET /orgs/:id/audit (API_SPECIFICATION.md "Audit").
// Admin-gated route for querying append-only audit trail.

import type { FastifyInstance } from "fastify";
import { ListAuditQuerySchema, type ListAuditQuery } from "@vercode/contracts";

export async function auditRoutes(app: FastifyInstance) {
  app.get(
    "/:id/audit",
    {
      schema: {
        querystring: ListAuditQuerySchema,
        config: { capability: "audit.read" },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const q = req.query as ListAuditQuery;
      const db = app.auth.db;
      const limit = Math.min(Math.max(q.limit ?? 50, 1), 200);

      const where: Record<string, unknown> = {
        orgId: id,
      };

      if (q.action) {
        where.action = q.action;
      }
      if (q.actorId) {
        where.actorId = q.actorId;
      }
      if (q.targetType) {
        where.targetType = q.targetType;
      }
      if (q.since) {
        where.createdAt = { gte: new Date(q.since) };
      }
      if (q.cursor) {
        where.id = { lt: q.cursor };
      }

      const events = await db.auditEvent.findMany({
        where,
        take: limit + 1,
        orderBy: { id: "desc" },
        include: {
          actor: { select: { id: true, email: true, name: true } },
        },
      });

      let nextCursor: string | null = null;
      if (events.length > limit) {
        const nextItem = events.pop();
        nextCursor = nextItem?.id ?? null;
      }

      reply.send({
        events: events.map((e) => ({
          id: e.id,
          orgId: e.orgId,
          action: e.action,
          actorId: e.actorId,
          actor: e.actor
            ? { id: e.actor.id, email: e.actor.email, name: e.actor.name }
            : { id: e.actorId, email: null, name: "System / Ingress" },
          targetType: e.targetType,
          targetId: e.targetId,
          sourceIp: e.sourceIp,
          meta: e.meta,
          createdAt: e.createdAt.toISOString(),
        })),
        nextCursor,
      });
    }
  );
}
