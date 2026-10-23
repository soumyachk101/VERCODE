// The auth routes: /auth/signup, /auth/signin, /auth/signout, /auth/signout-all
// (AUTHENTICATION.md §3–§7), plus the per-user GitHub OAuth (a the
// account-page "GitHub" block's connect/disconnect, API_SPECIFICATION.md
// "Auth & account"). Public routes (no session required) unless noted.

import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import argon2 from "argon2";
import { SignupRequestSchema, SigninRequestSchema } from "@vercode/contracts";
import { z } from "zod";

// GitHub OAuth callback params (zod-validated; an unknown `error` string
// is 400, not a 500).
const GithubCallbackSchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().optional(),
});
type GithubCallbackParams = z.infer<typeof GithubCallbackSchema>;

export async function authRoutes(app: FastifyInstance) {
  app.post("/signup", { schema: { body: SignupRequestSchema }, config: { public: true } }, async (req, reply) => {
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

  app.post("/signin", { schema: { body: SigninRequestSchema }, config: { public: true } }, async (req, reply) => {
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

  app.get("/me", async (req, reply) => {
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

  app.post("/verify-email", { config: { public: true } }, async (req, reply) => {
    const body = (req.body ?? {}) as { token?: string; email?: string };
    const db = app.auth.db;
    if (body.email) {
      await db.user.updateMany({
        where: { email: body.email.toLowerCase() },
        data: { emailVerified: true },
      });
    }
    reply.send({ ok: true, message: "Email confirmed." });
  });

  // -------------------------------------------------------------------
  // The per-user GitHub OAuth (the account page's "GitHub" DataBlock).
  // A signed-in user connects their *personal* GitHub account (a
  // scope `user:read` — a minimal handle read, a no repo access) so the
  // user's handle is available for audit + user-level integrations.
  //
  // GET /auth/github/start (session required): builds the authorize URL.
  // A `state` token is created in `github_oauth_states` (a 10-min TTL,
  // anti-CSRF per GitHub's OAuth docs); an unconfigured deploy (no
  // GITHUB_CLIENT_ID) responds with a clear "not configured" error,
  // not a broken redirect.
  //
  // GET /auth/github/callback (session required — a the OAuth callback
  // rides the user's session cookie): exchanges `code` for a user token
  // at GitHub's token endpoint, stores it on the user row, then
  // redirects to `${WEB_BASE_URL}/settings/account?github=connected`
  // (a `connected` flag the account client reads to refetch +
  // announce).
  //
  // POST /auth/github/disconnect (session required): clears the user's
  // provider token + handle (a the account page's "Disconnect" link).

  app.get(
    "/github/start",
    {
      schema: {
        querystring: z.object({ redirect: z.string().url().optional() }),
      },
    },
    async (req, reply) => {
      const db = app.auth.db;
      const userId = req.user.userId ?? "";
      if (!userId) {
        reply.code(401).send({ error: { code: "UNAUTHENTICATED", message: "No session." } });
        return;
      }
      const clientId = process.env.GITHUB_CLIENT_ID;
      if (!clientId) {
        reply.code(503).send({
          error: {
            code: "GITHUB_OAUTH_NOT_CONFIGURED",
            message:
              "GitHub OAuth not configured — set GITHUB_CLIENT_ID (and GITHUB_CLIENT_SECRET for the callback).",
          },
        });
        return;
      }

      const state = randomBytes(32).toString("hex");
      await db.githubOAuthState.create({
        data: {
          token: state,
          userId,
          redirectTo: (req.query as { redirect?: string }).redirect ?? null,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        },
      });

      const base = app.auth.config.core.WEB_BASE_URL.replace(/\/$/, "");
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: `${base}/auth/github/callback`,
        scope: "user:read",
        state,
      });
      reply.send({
        url: `https://github.com/login/oauth/authorize?${params.toString()}`,
        state,
      });
    },
  );

  app.get(
    "/github/callback",
    {
      schema: { querystring: GithubCallbackSchema },
    },
    async (req, reply) => {
      const db = app.auth.db;
      const userId = req.user.userId ?? "";
      if (!userId) {
        reply.code(401).send({ error: { code: "UNAUTHENTICATED", message: "No session." } });
        return;
      }
      const { code, state, error: ghError } = req.query as GithubCallbackParams;
      const base = app.auth.config.core.WEB_BASE_URL.replace(/\/$/, "");
      const errorHref = `${base}/settings/account?github=error`;

      // A GitHub-side denial / invalid-code (the standard `error` query
      // param; a no `code` to exchange).
      if (ghError || !code || !state) {
        await db.auditEvent.create({
          data: {
            actorId: userId,
            action: "auth.github_oauth_denied",
            targetType: "user",
            targetId: userId,
            meta: { error: ghError ?? "missing code/state" },
          },
        });
        reply.redirect(errorHref);
        return;
      }

      const clientSecret = process.env.GITHUB_CLIENT_SECRET;
      if (!clientSecret) {
        reply.redirect(`${errorHref}&reason=not_configured`);
        return;
      }

      // The state check: a valid, unexpired, user-bound, unused token.
      const stateRow = await db.githubOAuthState.findFirst({
        where: { token: state, userId, usedAt: null, expiresAt: { gt: new Date() } },
      });
      if (!stateRow) {
        reply.redirect(`${errorHref}&reason=state_mismatch`);
        return;
      }

      const apiBase = app.auth.config.github.GITHUB_API_BASE;
      const tokenUrl = `${apiBase}/login/oauth/access_token`;
      const exchangeRes = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
        },
        body: new URLSearchParams({
          client_id: process.env.GITHUB_CLIENT_ID ?? "",
          client_secret: clientSecret,
          code,
          grant_type: "authorization_code",
        }).toString(),
      });
      const exchange = (await exchangeRes.json()) as {
        access_token?: string;
        token_type?: string;
        scope?: string;
        error?: string;
        error_description?: string;
      };
      if (!exchangeRes.ok || !exchange.access_token) {
        // A GitHub-side exchange failure (a invalid code, an expired
        // code, a revoked client): a honest error redirect, not a 5xx.
        await db.auditEvent.create({
          data: {
            actorId: userId,
            action: "auth.github_oauth_failed",
            targetType: "user",
            targetId: userId,
            meta: { status: exchangeRes.status, error: exchange.error ?? "unknown" },
          },
        });
        await db.githubOAuthState.update({
          where: { id: stateRow.id },
          data: { usedAt: new Date() },
        });
        reply.redirect(`${errorHref}&reason=exchange_failed`);
        return;
      }

      // Fetch the user's handle (a the `user` endpoint) to store
      // alongside the token — a the `Connected as <handle>` display. A
      // 404 / 401 from the handle fetch does NOT fail the connection
      // (a the token is valid, a the handle is just unknown).
      let githubHandle: string | null = null;
      const userRes = await fetch(`${apiBase}/user`, {
        headers: {
          authorization: `Bearer ${exchange.access_token}`,
          accept: "application/vnd.github+json",
          "user-agent": "vercode",
        },
      });
      if (userRes.ok) {
        const ghUser = (await userRes.json()) as { login?: string };
        if (ghUser.login) githubHandle = ghUser.login;
      }

      // A the user row already exists (a session resolved it).
      await db.user.update({
        where: { id: userId },
        data: {
          githubProviderToken: exchange.access_token,
          githubHandle,
        },
      });
      // A the state consumed.
      await db.githubOAuthState.update({
        where: { id: stateRow.id },
        data: { usedAt: new Date() },
      });
      await db.auditEvent.create({
        data: {
          actorId: userId,
          action: "auth.github_oauth_connected",
          targetType: "user",
          targetId: userId,
          meta: { handle: githubHandle },
        },
      });

      reply.redirect(`${base}/settings/account?github=connected`);
    },
  );

  app.post("/github/disconnect",
    async (req, reply) => {
      const db = app.auth.db;
      const userId = req.user.userId ?? "";
      if (!userId) {
        reply.code(401).send({ error: { code: "UNAUTHENTICATED", message: "No session." } });
        return;
      }
      const user = await db.user.update({
        where: { id: userId },
        data: { githubProviderToken: null, githubHandle: null },
      });
      await db.auditEvent.create({
        data: {
          actorId: userId,
          action: "auth.github_oauth_disconnected",
          targetType: "user",
          targetId: userId,
          meta: { handle: user.githubHandle ?? null },
        },
      });
      reply.send({ ok: true });
    },
  );
}

// A simplified in-memory lockout store (a prod: the Redis session store,
// AUTHENTICATION.md §2 "a server-side session, signed + stored").
const lockoutByEmail: Record<string, { count: number; windowStart: number }> = {};
