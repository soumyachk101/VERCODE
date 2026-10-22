// The health endpoints (NFR-23 "a liveness (process), a readiness (DB +
// Redis)").

import type { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";

export async function healthRoutes(app: FastifyInstance) {
  // A liveness (a the process is up).
  app.get("/healthz", async (_req, reply) => {
    reply.send({ ok: true, ts: new Date().toISOString() });
  });

  // A readiness (a the DB is reachable — a webhook route that can't reach the
  // queue is not ready, DEPLOYMENT.md §5 "the readiness probe").
  app.get("/readyz", async (_req, reply) => {
    try {
      const db = new PrismaClient();
      await db.$queryRaw`SELECT 1`;
      await db.$disconnect();
      reply.send({ ok: true, db: "up" });
    } catch {
      reply.code(503).send({ ok: false, db: "down" });
    }
  });
}
// test heartbeat Thu Oct 22 16:18:19 IST 2026
