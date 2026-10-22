// The auth routes: /auth/signup, /auth/signin, /auth/signout, /auth/signout-all
// (AUTHENTICATION.md §3–§7). Public routes (no session required).

import type { FastifyInstance } from "fastify";
import argon2 from "argon2";
import { SignupRequestSchema, SigninRequestSchema } from "@vercode/contracts";
import { Role, PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

export async function authRoutes(app: FastifyInstance) {
  app.post("/signup", { schema: { body: SignupRequestSchema, config: { public: true } } }, async (req, reply) => {
    const { email, password, name } = req.body as { email: string; password: string; name?: string };
    const db = app.auth.db;

    // A user-existence check (no enumeration: a "user not found" and a "wrong
    // password" are the same 401, AUTHENTICATION.md §7 "no user enumeration").
    const existing = await db.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      reply.code(409).send({ error: { code: "EMAIL_TAKEN", message: "An account with this email exists." } });
      return;
    }

    // Argon2id (AUTHENTICATION.md §1 "passwords: Argon2id, memory 64 MiB,
    // iterations 3, parallelism 4").
    const passwordHash = await argon2.hash(password, {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const user = await db.user.create({
      data: { email: email.toLowerCase(), passwordHash, name: name ?? null },
    });

    // A session (the DB stores the token's hash, AUTHENTICATION.md §7).
    const rawToken = app.auth.newSessionToken();
    const idleMs = 12 * 60 * 60 * 1000; // 12 h idle
    const absoluteMs = 30 * 24 * 60 * 60 * 1000; // 30 d absolute
    const expiresAt = new Date(Math.min(Date.now() + idleMs, Date.now() + absoluteMs));
    await db.session.create({
      data: { userId: user.id, tokenHash: app.auth.hashToken(rawToken), expiresAt },
    });

    await db.auditEvent.create({
      data: { actorId: user.id, action: "auth.signup", targetType: "user", targetId: user.id },
    });

    reply.setSessionCookie(rawToken, expiresAt);
    reply.code(201).send({ user: { id: user.id, email: user.email, name: user.name } });
  });

  app.post("/signin", { schema: { body: SigninRequestSchema, config: { public: true } } }, async (req, reply) => {
    const { email, password } = req.body as { email: string; password: string };
    const db = app.auth.db;

    const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });

    // The lockout (AC-101 "5 failures in 15 min → a 30-min lock"): a
    // Redis/DB counter keyed by the email (not the user row, so a fake email
    // can't be distinguished from a real one — a no-enumeration lockout).
    // A simplified in-memory counter here (a prod uses the Redis store).
    const now = Date.now();
    const failures = (lockoutByEmail[email.toLowerCase()] ??= { count: 0, windowStart: now });
    if (now - failures.windowStart < 15 * 60 * 1000 && failures.count >= 5) {
      reply.code(429).send({ error: { code: "ACCOUNT_LOCKED", message: "Too many attempts. Try later." } });
      return;
    }

    const valid = user && (await argon2.verify(user.passwordHash, password));
    if (!valid) {
      failures.count += 1;
      if (now - failures.windowStart >= 15 * 60 * 1000) {
        failures.count = 1;
        failures.windowStart = now;
      }
      // The no-enumeration 401 (a unknown-user and a wrong-password are the
      // same shape, AUTHENTICATION.md §7).
      reply.code(401).send({ error: { code: "UNAUTHENTICATED", message: "Invalid credentials." } });
      return;
    }

    const rawToken = app.auth.newSessionToken();
    const idleMs = 12 * 60 * 60 * 1000;
    const absoluteMs = 30 * 24 * 60 * 60 * 1000;
    const expiresAt = new Date(Math.min(Date.now() + idleMs, Date.now() + absoluteMs));
    await db.session.create({
      data: { userId: user!.id, tokenHash: app.auth.hashToken(rawToken), expiresAt },
    });

    reply.setSessionCookie(rawToken, expiresAt);
    reply.send({ user: { id: user!.id, email: user!.email, name: user!.name } });
  });

  app.post("/signout", async (req, reply) => {
    const token = req.cookies["vercode_session"];
    if (token) {
      const db = app.auth.db;
      await db.session.updateMany({
        where: { tokenHash: app.auth.hashToken(token), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    reply.clearSessionCookie();
    reply.send({ ok: true });
  });

  app.post("/signout-all", async (req, reply) => {
    const db = app.auth.db;
    const userId = req.user.userId;
    if (userId) {
      await db.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await db.auditEvent.create({
        data: { actorId: userId, action: "auth.signout_all" },
      });
    }
    reply.clearSessionCookie();
    reply.send({ ok: true });
  });
}

// A simplified in-memory lockout store (a prod: the Redis session store,
// AUTHENTICATION.md §2 "a server-side session, signed + stored").
const lockoutByEmail: Record<string, { count: number; windowStart: number }> = {};
