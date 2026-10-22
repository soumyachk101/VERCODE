// The org routes: POST /orgs, GET /orgs/:id, the members, the invitations
// (API_SPECIFICATION.md "Organizations", AUTHORIZATION.md §1 the capability
// matrix). Tenant + capability gated.

import type { FastifyInstance } from "fastify";
import { CreateOrgRequestSchema, CreateInvitationRequestSchema, ChangeRoleRequestSchema } from "@vercode/contracts";
import { Role, Prisma } from "@prisma/client";

export async function orgRoutes(app: FastifyInstance) {
  // A create org (the creator is the owner, AC-102). No tenancy (it's the
  // tenant root), but a session is required.
  app.post("/", { schema: { body: CreateOrgRequestSchema } }, async (req, reply) => {
    const { name } = req.body as { name: string };
    const userId = req.user.userId;
    if (!userId) {
      reply.code(401).send({ error: { code: "UNAUTHENTICATED", message: "No session." } });
      return;
    }
    const db = app.auth.db;

    // A slug from the name (a URL-safe, a reserved-words rejected, a
    // DATABASE_DESIGN.md §3 "slug: UK, URL-safe, reserved-words rejected").
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const RESERVED = new Set(["admin", "api", "web", "app", "org", "root", "system"]);
    if (!slug || RESERVED.has(slug) || slug.length < 2) {
      reply.code(422).send({ error: { code: "VALIDATION_ERROR", message: "Invalid org name." } });
      return;
    }

    const exists = await db.organization.findUnique({ where: { slug } });
    if (exists) {
      reply.code(409).send({ error: { code: "SLUG_TAKEN", message: "Org slug already in use." } });
      return;
    }

    // A create + the creator is the owner (a exactly-one-owner, the
    // partial-unique index backstop, SCHEMA_REFERENCE.md "the owner
    // uniqueness").
    const org = await db.organization.create({
      data: {
        slug,
        name,
        memberships: { create: { userId, role: Role.OWNER } },
      },
      include: { memberships: true },
    });

    await db.auditEvent.create({
      data: {
        orgId: org.id,
        actorId: userId,
        action: "org.created",
        targetType: "org",
        targetId: org.id,
      },
    });

    reply.code(201).send({ org: { id: org.id, slug: org.slug, name: org.name, plan: org.plan } });
  });

  // A GET /:id (the tenancy middleware resolves + 404s cross-org).
  app.get("/:id", { schema: { config: { capability: "read" } } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = app.auth.db;
    const org = await db.organization.findFirst({
      where: { id, status: { not: "DELETED" } },
      include: { memberships: true },
    });
    if (!org) {
      reply.code(404).send({ error: { code: "NOT_FOUND", message: "Org not found." } });
      return;
    }
    reply.send({
      org: {
        id: org.id,
        slug: org.slug,
        name: org.name,
        plan: org.plan,
        status: org.status,
        members: org.memberships.length,
      },
    });
  });

  // A GET /:id/members (the Team page, PAGE_SPECIFICATIONS §7).
  app.get("/:id/members", { schema: { config: { capability: "read" } } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const members = await app.auth.db.membership.findMany({
      where: { orgId: id },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    reply.send({
      members: members.map((m: { role: string; user: { id: string; email: string; name: string | null } }) => ({
        userId: m.user.id,
        email: m.user.email,
        name: m.user.name,
        role: m.role,
      })),
    });
  });

  // A POST /:id/invitations (an admin+, AC-103).
  app.post(
    "/:id/invitations",
    {
      schema: {
        body: CreateInvitationRequestSchema,
        config: { capability: "org.manage" },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { email, role } = req.body as { email: string; role: "admin" | "developer" | "viewer" };
      const db = app.auth.db;

      // A duplicate pending invite → 409 with the existing one (API_SPECIFICATION
      // §POST /orgs/:id/invitations "409 (duplicate pending invite → returns
      // the existing one)").
      const dup = await db.invitation.findFirst({
        where: { orgId: id, email: email.toLowerCase(), status: "PENDING" },
      });
      if (dup) {
        reply.code(409).send({ invitationId: dup.id, email: dup.email, status: "PENDING" });
        return;
      }

      // A 7-day expiry (AC-103 "invitations expire in 7 days").
      const token = globalThis.crypto.randomUUID();
      const tokenHash = app.auth.hashToken(token);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const invite = await db.invitation.create({
        data: {
          orgId: id,
          email: email.toLowerCase(),
          role: role.toUpperCase() as Role,
          tokenHash,
          expiresAt,
        },
      });

      await db.auditEvent.create({
        data: {
          orgId: id,
          actorId: req.user.userId ?? "",
          action: "org.invitation_sent",
          targetType: "invitation",
          targetId: invite.id,
          meta: { email, role },
        },
      });

      reply.code(201).send({
        invitationId: invite.id,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt,
      });
    }
  );

  // A PATCH /:id/members/:userId (a role change, an admin+, AC-104). The
  // owner-transfer is atomic (promote + demote in one txn, AUTHORIZATION §2
  // "two owner rows can never coexist, even transiently").
  app.patch(
    "/:id/members/:userId",
    {
      schema: {
        body: ChangeRoleRequestSchema,
        config: { capability: "org.manage" },
      },
    },
    async (req, reply) => {
      const { id, userId: targetUserId } = req.params as { id: string; userId: string };
      const { role } = req.body as { role: "owner" | "admin" | "developer" | "viewer" };
      const db = app.auth.db;

      const targetRole = role.toUpperCase() as Role;

      await db.$transaction(async (tx) => {
        if (targetRole === Role.OWNER) {
          // An atomic owner-transfer: demote the current owner + promote the
          // target in one txn (a exactly-one-owner invariant).
          const currentOwner = await tx.membership.findFirst({
            where: { orgId: id, role: Role.OWNER },
          });
          if (currentOwner && currentOwner.userId !== targetUserId) {
            await tx.membership.update({
              where: { id: currentOwner.id },
              data: { role: Role.ADMIN },
            });
          }
          await tx.membership.update({
            where: { orgId_userId: { orgId: id, userId: targetUserId } },
            data: { role: Role.OWNER },
          });
        } else {
          await tx.membership.update({
            where: { orgId_userId: { orgId: id, userId: targetUserId } },
            data: { role: targetRole },
          });
        }
      });

      await db.auditEvent.create({
        data: {
          orgId: id,
          actorId: req.user.userId ?? "",
          action: "org.role_changed",
          targetType: "membership",
          targetId: targetUserId,
          meta: { role: targetRole },
        },
      });

      reply.send({ ok: true, role: targetRole });
    }
  );

  // POST /:id/invitations/:token/accept — Accept invite
  app.post("/:id/invitations/:token/accept", async (req, reply) => {
    const { id, token } = req.params as { id: string; token: string };
    const userId = req.user.userId;
    if (!userId) {
      reply.code(401).send({ error: { code: "UNAUTHENTICATED", message: "No session." } });
      return;
    }
    const db = app.auth.db;
    const tokenHash = app.auth.hashToken(token);

    const invite = await db.invitation.findFirst({
      where: {
        orgId: id,
        OR: [{ tokenHash }, { id: token }],
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
    });

    if (!invite) {
      reply.code(404).send({ error: { code: "NOT_FOUND", message: "Invitation not found or expired." } });
      return;
    }

    await db.$transaction([
      db.membership.upsert({
        where: { orgId_userId: { orgId: id, userId } },
        create: { orgId: id, userId, role: invite.role },
        update: { role: invite.role },
      }),
      db.invitation.update({
        where: { id: invite.id },
        data: { status: "ACCEPTED" },
      }),
      db.auditEvent.create({
        data: {
          orgId: id,
          actorId: userId,
          action: "org.invitation_accepted",
          targetType: "membership",
          targetId: userId,
        },
      }),
    ]);

    reply.send({ ok: true, orgId: id, role: invite.role });
  });

  // DELETE /:id/members/:userId — Remove member from org (admin+)
  app.delete(
    "/:id/members/:userId",
    { schema: { config: { capability: "org.manage" } } },
    async (req, reply) => {
      const { id, userId: targetUserId } = req.params as { id: string; userId: string };
      const db = app.auth.db;

      const target = await db.membership.findFirst({
        where: { orgId: id, userId: targetUserId },
      });
      if (!target) {
        reply.code(404).send({ error: { code: "NOT_FOUND", message: "Member not found." } });
        return;
      }

      if (target.role === Role.OWNER) {
        reply.code(403).send({ error: { code: "FORBIDDEN", message: "Cannot remove the org owner." } });
        return;
      }

      await db.membership.delete({
        where: { id: target.id },
      });

      await db.auditEvent.create({
        data: {
          orgId: id,
          actorId: req.user.userId ?? "",
          action: "org.member_removed",
          targetType: "membership",
          targetId: targetUserId,
        },
      });

      reply.send({ ok: true });
    }
  );

  // A DELETE /:id (an owner-only, AC-104 "a org.delete is owner-only, a
  // soft-delete + a grace window, a retention §5").
  app.delete(
    "/:id",
    { schema: { config: { capability: "org.delete" } } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const db = app.auth.db;
      await db.organization.update({ where: { id }, data: { status: "DELETED" } });
      await db.auditEvent.create({
        data: {
          orgId: id,
          actorId: req.user.userId ?? "",
          action: "org.deleted",
          targetType: "org",
          targetId: id,
        },
      });
      reply.code(202).send({ ok: true, status: "DELETED" });
    }
  );
}

