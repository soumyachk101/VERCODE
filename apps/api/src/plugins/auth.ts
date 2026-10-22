// The authn plugin (AUTHENTICATION.md): a signed HTTP-only cookie session,
// backed by a server-side session store, with server-side revocation + a
// lockout on 5 failed sign-ins in 15 min (AC-101).
//
// The session is a random opaque token; the DB stores its *hash* (a DB leak
// doesn't yield usable sessions, AUTHENTICATION.md §7 "a DB leak does not
// yield usable session tokens"). The cookie is HttpOnly + Secure +
// SameSite=Lax.

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import type { AppConfig } from "@vercode/config";

export interface AuthContext {
  userId: string | null;
  userEmail: string | null;
}

declare module "fastify" {
  interface FastifyRequest {
    user: AuthContext;
  }
  interface FastifyReply {
    setSessionCookie(token: string, expiresAt: Date): void;
    clearSessionCookie(): void;
  }
}

export const SESSION_COOKIE = "vercode_session";

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function buildAuthPlugin(config: AppConfig) {
  return async (app: FastifyInstance) => {
    const db = new PrismaClient();

    // A global preHandler: resolve the session → the request.user. A route can
    // opt out with the `public` constraint.
    app.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
      req.user = { userId: null, userEmail: null };

      // The public routes (a sign-in, a sign-up, a verify-email) skip the
      // session check. The webhook routes are a separate (public + HMAC)
      // ingress (WEBHOOK_SPECIFICATION.md §1 "the two public, non-session
      // ingress routes").
      const isPublic = (req.routeConfig as { public?: boolean }).public === true;
      if (isPublic) {
        // Even public routes resolve the session (a "me" on a public page).
        const token = req.cookies[SESSION_COOKIE];
        if (token) {
          const row = await db.session.findUnique({
            where: { tokenHash: hashToken(token) },
          });
          if (row && !row.revokedAt && row.expiresAt.getTime() > Date.now()) {
            const user = await db.user.findUnique({ where: { id: row.userId } });
            if (user) {
              req.user = { userId: user.id, userEmail: user.email };
            }
          }
        }
        return;
      }

      // A non-public route: require a valid session.
      const token = req.cookies[SESSION_COOKIE];
      if (!token) {
        reply.code(401).send({ error: { code: "UNAUTHENTICATED", message: "No session." } });
        return;
      }
      const row = await db.session.findUnique({ where: { tokenHash: hashToken(token) } });
      if (!row || row.revokedAt || row.expiresAt.getTime() < Date.now()) {
        reply.code(401).send({ error: { code: "UNAUTHENTICATED", message: "Session expired or revoked." } });
        return;
      }
      const user = await db.user.findUnique({ where: { id: row.userId } });
      if (!user) {
        reply.code(401).send({ error: { code: "UNAUTHENTICATED", message: "Unknown user." } });
        return;
      }
      req.user = { userId: user.id, userEmail: user.email };
    });

    // The session cookie helpers (a set/clear with the correct flags).
    app.decorateReply("setSessionCookie", function (this: FastifyReply, rawToken: string, expiresAt: Date) {
      this.setCookie(SESSION_COOKIE, rawToken, {
        httpOnly: true,
        secure: config.core.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        expires: expiresAt,
      });
    });
    app.decorateReply("clearSessionCookie", function (this: FastifyReply) {
      this.clearCookie(SESSION_COOKIE, { path: "/" });
    });

    // Expose the session store to the auth routes (a create/lookup/rotate).
    app.decorate("auth", {
      db,
      hashToken,
      argon2,
      config,
      newSessionToken(): string {
        return randomBytes(32).toString("hex");
      },
    });
  };
}

declare module "fastify" {
  interface FastifyInstance {
    auth: {
      db: PrismaClient;
      hashToken(t: string): string;
      argon2: typeof argon2;
      config: AppConfig;
      newSessionToken(): string;
    };
  }
}
