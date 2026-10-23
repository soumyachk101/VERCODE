// The account routes: /me, PATCH /me, GET /me/sessions (AUTHENTICATION.md §5,
// API_SPECIFICATION.md "Auth & account"). Session-required.

import type { FastifyInstance } from "fastify";
import argon2 from "argon2";
import { z } from "zod";
import { SESSION_COOKIE } from "../plugins/auth.js";

const UpdateAccountSchema = z.object({
  name: z.string().min(1).optional(),
  currentPassword: z.string().min(1).optional(),
  newPassword: z.string().min(8).optional(),
});

export async function accountRoutes(app: FastifyInstance) {
  // GET /me — Current user profile and org memberships
  app.get("/", async (req, reply) => {
    const db = app.auth.db;
    const userId = req.user.userId ?? "";
    if (!userId) {
      reply.code(401).send({ error: { code: "UNAUTHENTICATED", message: "No session." } });
      return;
    }
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      reply.code(404).send({ error: { code: "NOT_FOUND", message: "User not found." } });
      return;
    }
    const orgs = await db.organization.findMany({
      where: { memberships: { some: { userId } }, status: { not: "DELETED" } },
      include: { memberships: { where: { userId }, select: { role: true, orgId: true } } },
    });
    reply.send({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified,
        githubConnected: user.githubProviderToken != null,
        githubHandle: user.githubHandle,
      },
      orgs: orgs.map((o) => ({ id: o.id, name: o.name, slug: o.slug, role: o.memberships[0]?.role })),
    });
  });

  // PATCH /me — Update profile name and/or password
  app.patch(
    "/",
    { schema: { body: UpdateAccountSchema } },
    async (req, reply) => {
      const db = app.auth.db;
      const userId = req.user.userId ?? "";
      if (!userId) {
        reply.code(401).send({ error: { code: "UNAUTHENTICATED", message: "No session." } });
        return;
      }

      const body = req.body as z.infer<typeof UpdateAccountSchema>;
      const user = await db.user.findUnique({ where: { id: userId } });
      if (!user) {
        reply.code(404).send({ error: { code: "NOT_FOUND", message: "User not found." } });
        return;
      }

      const updateData: { name?: string; passwordHash?: string } = {};

      if (body.name !== undefined) {
        updateData.name = body.name;
      }

      if (body.newPassword) {
        if (!body.currentPassword) {
          reply.code(400).send({
            error: { code: "PASSWORD_REQUIRED", message: "Current password is required to set a new password." },
          });
          return;
        }

        const valid = await argon2.verify(user.passwordHash, body.currentPassword);
        if (!valid) {
          reply.code(401).send({
            error: { code: "UNAUTHENTICATED", message: "Current password does not match." },
          });
          return;
        }

        updateData.passwordHash = await argon2.hash(body.newPassword, {
          memoryCost: 65536,
          timeCost: 3,
          parallelism: 4,
        });
      }

      const updated = await db.user.update({
        where: { id: userId },
        data: updateData,
      });

      await db.auditEvent.create({
        data: {
          actorId: userId,
          action: "account.updated",
          targetType: "user",
          targetId: userId,
          meta: { passwordChanged: !!body.newPassword, nameChanged: body.name !== undefined },
        },
      });

      reply.send({
        user: { id: updated.id, email: updated.email, name: updated.name },
      });
    }
  );

  // GET /me/sessions — List active sessions
  app.get("/sessions", async (req, reply) => {
    const db = app.auth.db;
    const userId = req.user.userId ?? "";
    if (!userId) {
      reply.code(401).send({ error: { code: "UNAUTHENTICATED", message: "No session." } });
      return;
    }
    const currentToken = req.cookies[SESSION_COOKIE];
    const currentTokenHash = currentToken ? app.auth.hashToken(currentToken) : null;

    const rows = await db.session.findMany({
      where: { userId, expiresAt: { gt: new Date() }, revokedAt: null },
      select: { id: true, userAgent: true, sourceIp: true, createdAt: true, expiresAt: true, tokenHash: true },
      orderBy: { createdAt: "desc" },
    });
    const sessions = rows.map((s) => ({
      id: s.id,
      device: s.userAgent ?? "Web session",
      ip: s.sourceIp ?? "127.0.0.1",
      lastActiveAt: s.createdAt.toISOString(),
      current: currentTokenHash ? s.tokenHash === currentTokenHash : false,
    }));
    reply.send({ sessions });
  });
}
