// The tenancy + capability plugin (TENANT_ISOLATION.md §2, AUTHORIZATION.md):
// resolves the requested org + the user's role in it, and gates routes by
// capability. The 404-vs-403 split: a cross-tenant access → 404 (no
// existence oracle, AC-902); an in-tenant capability denial → 403.

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Prisma, PrismaClient } from "@prisma/client";
import type { Role } from "@prisma/client";

export interface TenantContext {
  orgId: string;
  role: Role;
  capabilities: Set<Capability>;
}

declare module "fastify" {
  interface FastifyRequest {
    tenant: TenantContext | null;
  }
  interface FastifyRequestOptions {
    capability?: Capability;
  }
}

export type Capability =
  | "org.manage"
  | "integrations.manage"
  | "rules.manage"
  | "reviews.run"
  | "read"
  | "audit.read"
  | "org.delete";

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
  return async (app: FastifyInstance) => {
    const db = new PrismaClient();

    // A preHandler that resolves the tenant for a `/orgs/:orgId/*` request.
    // The org id comes from the path (the `:orgId` param). A non-member → 404.
    app.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
      req.tenant = null;

      // Only tenant routes resolve a tenant (a `/orgs/:orgId/*`). The public +
      // the account routes don't.
      const orgId = req.params.orgId as string | undefined;
      if (!orgId) return;

      const userId = req.user.userId;
      if (!userId) {
        // A session is required for a tenant route (the authn preHandler ran
        // first; a no-session → 401 already handled). A no-user reaching here
        // is a 404 (a cross-tenant without a session is no access, no oracle).
        reply.code(404).send({ error: { code: "NOT_FOUND", message: "Org not found." } });
        return;
      }
        where: { orgId, userId },
      });
      const org = await db.organization.findFirst({
        where: { id: orgId, status: { not: "DELETED" } },
      });

      // A cross-tenant (a not-a-member, or a deleted/unknown org) → 404, NOT
      // 403 (no existence oracle, AC-902, TENANT_ISOLATION.md §2).
      if (!membership || !org) {
        await db.auditEvent.create({
          data: {
            orgId: userId ? orgId : undefined,
            actorId: userId,
            action: "access.denied_cross_tenant",
            meta: Prisma.jsonObjectToJson({ requested: req.routeConfig.url, role: "none" }),
          },
        });
        reply.code(404).send({ error: { code: "NOT_FOUND", message: "Org not found." } });
        return;
      }

      const role = membership.role;
      req.tenant = { orgId, role, capabilities: CAPS[role] };

      // The capability gate (AUTHORIZATION.md §3.1 "a route with no declared
      // capability is a bug — a lint rule flags it").
      const required = req.context.config.capability as Capability | undefined;
      if (required && !req.tenant.capabilities.has(required)) {
        await db.auditEvent.create({
          data: {
            orgId,
            actorId: userId,
            action: "access.denied_capability",
            meta: Prisma.jsonObjectToJson({ requested: required, role }),
          },
        });
        reply.code(403).send({
          error: { code: "FORBIDDEN", message: `Requires the ${required} capability.` },
        });
        return;
      }
    });

    app.decorate("tenant", { db });
  };
}

declare module "fastify" {
  interface FastifyInstance {
    tenant: { db: PrismaClient };
  }
}
