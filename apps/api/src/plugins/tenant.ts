// The tenancy + capability plugin (TENANT_ISOLATION.md §2, AUTHORIZATION.md):
// resolves the requested org + the user's role in it, and gates routes by
// capability. The 404-vs-403 split: a cross-tenant access → 404 (no
// existence oracle, AC-902); an in-tenant capability denial → 403.

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Prisma, PrismaClient } from "@prisma/client";
import type { Role } from "@prisma/client";

export type Capability =
  | "org.manage"
  | "integrations.manage"
  | "rules.manage"
  | "reviews.run"
  | "read"
  | "audit.read"
  | "org.delete";

export interface TenantContext {
  orgId: string;
  role: Role;
  capabilities: Set<Capability>;
}

declare module "fastify" {
  interface FastifyRequest {
    tenant: TenantContext | null;
  }
}

// The role → capability matrix (AUTHORIZATION.md §1, PRD §6). The server is
// the enforcement point; the UI only hides (never enforces).
const CAPS: Record<Role, Set<Capability>> = {
  OWNER: new Set([
    "org.manage",
    "integrations.manage",
    "rules.manage",
    "reviews.run",
    "read",
    "audit.read",
    "org.delete",
  ]),
  ADMIN: new Set([
    "org.manage",
    "integrations.manage",
    "rules.manage",
    "reviews.run",
    "read",
    "audit.read",
  ]),
  DEVELOPER: new Set(["rules.manage", "reviews.run", "read"]),
  VIEWER: new Set(["read"]),
};

export function buildTenantPlugin() {
  const plugin = async (app: FastifyInstance) => {
    const db = new PrismaClient();

    // A preHandler that resolves the tenant for a `/orgs/:id/*` request.
    // The org id comes from the `:id` path param. A non-member → 404.
    app.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
      req.tenant = null;

      const params = req.params as Record<string, unknown>;
      const orgId = (params.orgId ?? params.id) as string | undefined;
      if (!orgId) return;

      // The auth plugin decorates req.user in its own preHandler; if it has
      // not run yet (the test seam), req.user is undefined. The tenant gate
      // only fires when the user is known; an unauthenticated request is
      // handled by the auth plugin (401) and never reaches here.
      const user = (req as unknown as { user?: { userId?: string | null } }).user;
      const userId = user?.userId;
      if (!userId) {
        reply.code(404).send({ error: { code: "NOT_FOUND", message: "Org not found." } });
        return;
      }

      const membership = await db.membership.findFirst({ where: { orgId, userId } });
      const org = await db.organization.findFirst({
        where: { id: orgId, status: { not: "DELETED" } },
      });

      // A cross-tenant (a not-a-member, or a deleted/unknown org) → 404, NOT
      // 403 (no existence oracle, AC-902, TENANT_ISOLATION.md §2).
      if (!membership || !org) {
        await db.auditEvent
          .create({
            data: {
              orgId,
              actorId: userId,
              action: "access.denied_cross_tenant",
              meta: { requested: req.url, role: "none" } as unknown as Prisma.InputJsonValue,
            },
          })
          .catch(() => {
            /* an audit write failure is not a request failure */
          });
        reply.code(404).send({ error: { code: "NOT_FOUND", message: "Org not found." } });
        return;
      }

      const role = membership.role;
      req.tenant = { orgId, role, capabilities: CAPS[role] };

      // The capability gate (AUTHORIZATION.md §3.1 "a route with no declared
      // capability is a bug — a lint rule flags it"). The capability is
      // declared on the route's `config` option; the app's routes ALSO
      // declare it under `schema.config` (the shape the route builders use),
      // so both are read — a route that declares it in only one place still
      // gets gated (a "the gate is dormant" defect is a security defect).
      const routeConfig = req.routeOptions.config as
        | { capability?: Capability }
        | undefined;
      const schemaConfig = (
        req.routeOptions.schema as { config?: { capability?: Capability } } | undefined
      )?.config;
      const required = routeConfig?.capability ?? schemaConfig?.capability;
      if (required && !req.tenant.capabilities.has(required)) {
        await db.auditEvent
          .create({
            data: {
              orgId,
              actorId: userId,
              action: "access.denied_capability",
              meta: { requested: required, role } as unknown as Prisma.InputJsonValue,
            },
          })
          .catch(() => {
            /* an audit write failure is not a request failure */
          });
        reply.code(403).send({
          error: { code: "FORBIDDEN", message: `Requires the ${required} capability.` },
        });
        return;
      }
    });

    app.decorate("tenant", { db });
  };
  (plugin as any)[Symbol.for("skip-override")] = true;
  return plugin;
}

declare module "fastify" {
  interface FastifyInstance {
    tenant: { db: PrismaClient };
  }
}
