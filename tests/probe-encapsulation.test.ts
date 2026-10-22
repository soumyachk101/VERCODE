import { describe, it, expect } from "vitest";
import Fastify from "fastify";

describe("encapsulation probe", () => {
  it("root-level plugin hooks + decorations vs root-registered routes", async () => {
    const app = Fastify({ logger: false });
    // Simulate the auth plugin registered at the root level
    app.register(async (inner) => {
      inner.decorate("authStub", { db: "mock-db" });
      inner.addHook("preHandler", async (req, reply) => {
        if (!(req as any).__hookRan) {
          (req as any).__hookRan = true;
          // Simulate: no session -> 401
          reply.code(401).send({ blocked: "no session" });
        }
      });
    });
    // Root-registered route (like registerRoutes does app.get directly)
    app.get("/orgs/:id/reviews", { schema: { config: { capability: "read" } } }, async (req, reply) => {
      reply.send({ reached: true, hookRan: !!(req as any).__hookRan, cfg: req.routeOptions.config });
    });
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/orgs/org-B/reviews" });
    console.log("STATUS:", res.statusCode, "BODY:", res.body);
  });

  it("same but route registered INSIDE the plugin scope", async () => {
    const app = Fastify({ logger: false });
    app.register(async (inner) => {
      inner.decorate("authStub", { db: "mock-db" });
      inner.addHook("preHandler", async (req, reply) => {
        if (!(req as any).__hookRan) {
          (req as any).__hookRan = true;
          reply.code(401).send({ blocked: "no session" });
        }
      });
      inner.get("/scoped/:id", { schema: { config: { capability: "read" } } }, async (req, reply) => {
        reply.send({ reached: true, hookRan: !!(req as any).__hookRan });
      });
    });
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/scoped/x" });
    console.log("SCOPED STATUS:", res.statusCode, "BODY:", res.body);
  });
});
