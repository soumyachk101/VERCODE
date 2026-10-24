// apps/api/src/routes.test.ts
// Integration test suite verifying the dashboard REST API routes implement
// the complete specifications in docs/API/API_SPECIFICATION.md.
// Tests both root mounting (/orgs/...) and prefix mounting (/api/v1/orgs/...).

import { describe, it, expect, beforeEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import { reviewRoutes } from "./routes/reviews.js";
import { usageRoutes } from "./routes/usage.js";
import { settingsRoutes } from "./routes/settings.js";
import { auditRoutes } from "./routes/audit.js";
import { githubRoutes } from "./routes/github.js";
import { orgRoutes } from "./routes/orgs.js";
import { accountRoutes } from "./routes/account.js";
import { authRoutes } from "./routes/auth.js";
import { createInMemoryQueue } from "./queue.js";

function setupTestApp() {
  const app = Fastify({ logger: false });
  app.register(fastifyCookie);
  app.register(fastifyCors, {
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    credentials: true,
  });

  app.setValidatorCompiler(({ schema }: any) => {
    return (data: any) => {
      if (schema && typeof schema.safeParse === "function") {
        const result = schema.safeParse(data);
        if (!result.success) {
          return { error: result.error as any };
        }
        return { value: result.data };
      }
      return { value: data };
    };
  });

  // In-memory data store for testing
  const store = {
    orgs: [
      { id: "org-1", slug: "test-org", name: "Test Org", status: "ACTIVE", memberships: [{ role: "OWNER", userId: "user-1" }] },
    ],
    users: [
      { id: "user-1", email: "dev@vercode.test", name: "Test Dev", passwordHash: "argon2id$mock", emailVerified: true },
    ],
    jobs: [
      {
        id: "job-1",
        orgId: "org-1",
        repoId: "repo-1",
        prNumber: 42,
        commitSha: "sha123456",
        status: "SUCCEEDED",
        skipReason: null,
        error: null,
        model: "mock-model",
        promptVersion: "v1",
        inputTokens: 500,
        outputTokens: 200,
        estUsdCost: 0.05,
        publishedGithubReviewId: "gh-1",
        createdAt: new Date(),
        finishedAt: new Date(),
        repo: { id: "repo-1", fullName: "acme/repo", defaultBranch: "main" },
        _count: { findings: 2 },
      },
    ],
    findings: [
      {
        id: "find-1",
        jobId: "job-1",
        source: "AI_SECURITY",
        file: "src/auth.ts",
        line: 45,
        severity: "HIGH",
        category: "SECURITY",
        title: "SQL injection vulnerability",
        description: "Unsanitized user input interpolated into SQL query",
        suggestedFix: "Use parameterized query",
        confidence: 0.95,
        anchorStatus: "INLINE",
        payload: {},
        createdAt: new Date(),
        job: { id: "job-1", orgId: "org-1", prNumber: 42, commitSha: "sha123456", repo: { fullName: "acme/repo" } },
        actions: [],
      },
      {
        id: "find-2",
        jobId: "job-1",
        source: "ESLINT",
        file: "src/util.ts",
        line: 12,
        severity: "LOW",
        category: "LOGIC_BUG",
        title: "Unused variable",
        description: "Variable x is defined but never used",
        confidence: 0.8,
        anchorStatus: "INLINE",
        payload: {},
        createdAt: new Date(),
        job: { id: "job-1", orgId: "org-1", prNumber: 42, commitSha: "sha123456", repo: { fullName: "acme/repo" } },
        actions: [],
      },
    ],
    actions: [] as any[],
    audits: [] as any[],
    rules: [] as any[],
    byokKeys: [] as any[],
    oauthStates: [] as any[],
    repos: [
      { id: "repo-1", orgId: "org-1", fullName: "acme/repo", defaultBranch: "main", connected: true, githubRepoId: BigInt(123), install: { accountLogin: "acme", status: "ACTIVE" }, _count: { jobs: 1 }, createdAt: new Date() },
    ],
    settings: null as any,
    dailyUsage: [
      { id: "d-1", orgId: "org-1", day: new Date().toISOString().slice(0, 10), reviews: 5, inputTokens: 2500, outputTokens: 1000, estUsdCost: 0.25, findingCounts: { high: 1, low: 1 } },
    ],
  };

  const mockDb: any = {
    reviewJob: {
      findMany: async () => store.jobs,
      findFirst: async ({ where }: any) => {
        const found = store.jobs.find((j) => (where.id ? j.id === where.id : true) && (where.orgId ? j.orgId === where.orgId : true));
        if (found) {
          return {
            ...found,
            findings: store.findings.filter((f) => f.jobId === found.id),
          };
        }
        return null;
      },
      findUnique: async ({ where }: any) => {
        if (where.orgId_repoId_prNumber_commitSha) {
          const { orgId, repoId, prNumber, commitSha } = where.orgId_repoId_prNumber_commitSha;
          return store.jobs.find((j) => j.orgId === orgId && j.repoId === repoId && j.prNumber === prNumber && j.commitSha === commitSha) ?? null;
        }
        return store.jobs.find((j) => j.id === where.id) ?? null;
      },
      count: async () => store.jobs.length,
      create: async ({ data }: any) => {
        const j = { id: `job-${store.jobs.length + 1}`, ...data, createdAt: new Date(), repo: { fullName: "acme/repo" }, _count: { findings: 0 } };
        store.jobs.push(j);
        return j;
      },
      upsert: async ({ create }: any) => {
        const j = { id: `job-${store.jobs.length + 1}`, ...create, createdAt: new Date(), repo: { fullName: "acme/repo" }, _count: { findings: 0 } };
        store.jobs.push(j);
        return j;
      },
      update: async ({ where, data }: any) => {
        const j = store.jobs.find((item) => item.id === where.id);
        if (j) Object.assign(j, data);
        return j;
      },
    },
    reviewFinding: {
      findMany: async (q: any) => {
        if (q?.where?.severity?.in) {
          return store.findings.filter((f) => q.where.severity.in.includes(f.severity));
        }
        return store.findings;
      },
      findFirst: async ({ where }: any) => store.findings.find((f) => f.id === where.id) ?? null,
      groupBy: async ({ by }: any) => {
        if (by.includes("category")) {
          return [{ category: "SECURITY", _count: { id: 1 } }, { category: "LOGIC_BUG", _count: { id: 1 } }];
        }
        return [{ severity: "HIGH", _count: { id: 1 } }, { severity: "LOW", _count: { id: 1 } }];
      },
    },
    findingAction: {
      create: async ({ data }: any) => {
        const a = { id: `act-${store.actions.length + 1}`, actedAt: new Date(), ...data };
        store.actions.push(a);
        return a;
      },
    },
    auditEvent: {
      create: async ({ data }: any) => {
        const ev = { id: `aud-${store.audits.length + 1}`, createdAt: new Date(), ...data };
        store.audits.push(ev);
        return ev;
      },
      findMany: async () => store.audits,
      count: async () => store.audits.length,
    },
    organization: {
      findUnique: async ({ where }: any) => store.orgs.find((o) => o.id === where.id) ?? null,
      findFirst: async ({ where }: any) => store.orgs.find((o) => o.id === where.id) ?? null,
      findMany: async () => store.orgs,
      update: async ({ where, data }: any) => {
        const org = store.orgs.find((o) => o.id === where.id);
        if (org) Object.assign(org, data);
        return org;
      },
    },
    user: {
      findUnique: async ({ where }: any) => store.users.find((u) => u.id === where.id) ?? null,
      update: async ({ where, data }: any) => {
        const u = store.users.find((user) => user.id === where.id);
        if (u) Object.assign(u, data);
        return u;
      },
    },
    usageDaily: {
      findMany: async () => store.dailyUsage,
    },
    usageEvent: {
      aggregate: async () => ({
        _sum: { reviewCount: 5, estUsdCost: 0.25, inputTokens: 2500, outputTokens: 1000 },
      }),
    },
    orgSettings: {
      findUnique: async () => store.settings,
      upsert: async ({ create, update }: any) => {
        store.settings = {
          id: "set-1",
          orgId: "org-1",
          confidenceFloor: 0.8,
          maxFiles: 80,
          maxLines: 4000,
          provider: "anthropic",
          tokenSpendCapMonthly: 100,
          updatedAt: new Date(),
          ...update,
        };
        return store.settings;
      },
    },
    repoRule: {
      findMany: async () => store.rules,
      findFirst: async () => store.rules[0] ?? null,
      create: async ({ data }: any) => {
        const r = { id: `rule-${store.rules.length + 1}`, version: 1, createdAt: new Date(), ...data };
        store.rules.push(r);
        return r;
      },
    },
    bYOKKey: {
      findMany: async () => store.byokKeys,
      upsert: async ({ create }: any) => {
        const k = { id: "byok-1", ...create, createdAt: new Date() };
        store.byokKeys = [k];
        return k;
      },
      deleteMany: async () => {
        store.byokKeys = [];
      },
    },
    modelRoute: {
      findMany: async () => [],
    },
    githubRepo: {
      findMany: async () => store.repos,
      findFirst: async ({ where }: any) => store.repos.find((r) => r.orgId === where.orgId) ?? null,
    },
    githubInstall: {
      findMany: async () => [],
    },
    githubOAuthState: {
      create: async ({ data }: any) => {
        const s = { id: `ghs-${store.oauthStates.length + 1}`, ...data };
        store.oauthStates.push(s);
        return s;
      },
      findFirst: async ({ where }: any) =>
        store.oauthStates.find((s: any) => {
          if (where.token != null && s.token !== where.token) return false;
          if (where.userId != null && s.userId !== where.userId) return false;
          if (where.usedAt === null && s.usedAt != null) return false;
          if (where.expiresAt?.gt) {
            if (!(s.expiresAt instanceof Date && s.expiresAt.getTime() > where.expiresAt.gt.getTime())) return false;
          }
          return true;
        }) ?? null,
      update: async ({ where, data }: any) => {
        const s = store.oauthStates.find((x: any) => x.id === where.id);
        if (s) Object.assign(s, data);
        return s ?? null;
      },
    },
  };

  const queue = createInMemoryQueue();

  // Mock decorate
  app.decorate("auth", {
    db: mockDb,
    hashToken: (t: string) => `hash_${t}`,
    newSessionToken: () => "mock-token",
    config: {
      core: { WEB_BASE_URL: "http://localhost:3000" },
      github: { GITHUB_API_BASE: "https://api.github.com" },
    },
  } as any);

  // Mock user session on request
  app.addHook("onRequest", async (req) => {
    (req as any).user = { userId: "user-1", email: "dev@vercode.test" };
  });

  // Mount routes at both root and /api/v1
  const mountRoutes = (r: FastifyInstance) => {
    r.register(reviewRoutes, { prefix: "/orgs" });
    r.register(usageRoutes, { prefix: "/orgs" });
    r.register(settingsRoutes, { prefix: "/orgs" });
    r.register(auditRoutes, { prefix: "/orgs" });
    r.register(async (inst) => {
      await githubRoutes(inst, queue);
    }, { prefix: "/orgs" });
    r.register(orgRoutes, { prefix: "/orgs" });
    r.register(accountRoutes, { prefix: "/me" });
    r.register(authRoutes, { prefix: "/auth" });
  };

  mountRoutes(app);
  app.register(async (v1) => {
    mountRoutes(v1);
  }, { prefix: "/api/v1" });

  return { app, queue, store };
}

describe("Dashboard REST API Complete Route Specification", () => {
  let app: FastifyInstance;
  let queue: any;
  let store: any;

  beforeEach(() => {
    const setup = setupTestApp();
    app = setup.app;
    queue = setup.queue;
    store = setup.store;
  });

  describe("Reviews & Findings API", () => {
    it("GET /orgs/:id/reviews lists jobs", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/orgs/org-1/reviews",
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.items).toBeDefined();
      expect(body.items.length).toBe(1);
      expect(body.items[0].id).toBe("job-1");
    });

    it("GET /api/v1/orgs/:id/reviews works with prefix", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/orgs/org-1/reviews",
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.items[0].id).toBe("job-1");
    });

    it("GET /orgs/:id/reviews/:jobId returns job details and findings", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/orgs/org-1/reviews/job-1",
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBe("job-1");
      expect(body.status).toBe("succeeded");
      expect(body.findingsCount).toBe(2);
    });

    it("GET /orgs/:id/reviews/:jobId/findings returns findings list", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/orgs/org-1/reviews/job-1/findings",
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.items.length).toBe(2);
    });

    it("POST /orgs/:id/findings/:id/actions records finding action", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/orgs/org-1/findings/find-1/actions",
        payload: { action: "accepted" },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.findingId).toBe("find-1");
      expect(body.action).toBe("accepted");
      expect(store.audits.some((a: any) => a.action === "finding.actioned")).toBe(true);
    });

    it("GET /orgs/:id/security returns security summary", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/orgs/org-1/security",
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.total).toBeDefined();
    });

    it("GET /orgs/:id/trends returns time series", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/orgs/org-1/trends",
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.series).toBeDefined();
    });
  });

  describe("Usage API", () => {
    it("GET /orgs/:id/usage returns series and totals", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/orgs/org-1/usage?range=30d",
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.totals.reviews).toBe(5);
    });
  });

  describe("Settings & Rules API", () => {
    it("GET /orgs/:id/settings returns default or configured settings", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/orgs/org-1/settings",
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.confidenceFloor).toBe(0.6);
    });

    it("PATCH /orgs/:id/settings updates confidence floor and provider", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/orgs/org-1/settings",
        payload: { confidenceFloor: 0.8, provider: "anthropic" },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.confidenceFloor).toBe(0.8);
      expect(body.provider).toBe("anthropic");
    });

    it("GET /orgs/:id/rules and POST /orgs/:id/rules create versioned rules", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/orgs/org-1/rules",
        payload: { repoId: "repo-1", suppressCategories: ["assumption"] },
      });
      expect(createRes.statusCode).toBe(201);
      const created = JSON.parse(createRes.body);
      expect(created.id).toBeDefined();

      const listRes = await app.inject({
        method: "GET",
        url: "/orgs/org-1/rules",
      });
      expect(listRes.statusCode).toBe(200);
      const list = JSON.parse(listRes.body);
      expect(list.rules.length).toBe(1);
    });

    it("POST /orgs/:id/providers/byok stores and masks API key", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/orgs/org-1/providers/byok",
        payload: { provider: "openai", apiKey: "sk-proj-123456789abcdef" },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.provider).toBe("openai");
      expect(body.keyPrefix).toBeDefined();
    });
  });

  describe("Audit & GitHub API", () => {
    it("GET /orgs/:id/audit returns audit events", async () => {
      store.audits.push({
        id: "aud-test",
        orgId: "org-1",
        action: "org.created",
        actorId: "user-1",
        actor: { id: "user-1", email: "dev@vercode.test", name: "Test Dev" },
        createdAt: new Date(),
      });
      const res = await app.inject({
        method: "GET",
        url: "/orgs/org-1/audit",
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.items.length).toBeGreaterThan(0);
    });

    it("GET /orgs/:id/github/repos returns connected repositories", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/orgs/org-1/github/repos",
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.repos.length).toBe(1);
      expect(body.repos[0].fullName).toBe("acme/repo");
    });

    it("POST /orgs/:id/github/review triggers manual review (US-105)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/orgs/org-1/github/review",
        payload: {
          prNumber: 99,
          commitSha: "sha-fresh-commit",
        },
      });
      expect(res.statusCode).toBe(202);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("queued");
      expect(queue.enqueued.length).toBe(1);
      expect(queue.reviewJobs()[0].commitSha).toBe("sha-fresh-commit");
    });

    it("OPTIONS /api/v1/auth/me preflight returns Access-Control-Allow-Credentials: true", async () => {
      const res = await app.inject({
        method: "OPTIONS",
        url: "/api/v1/auth/me",
        headers: {
          origin: "http://localhost:3000",
          "access-control-request-method": "GET",
        },
      });
      expect(res.statusCode).toBe(204);
      expect(res.headers["access-control-allow-credentials"]).toBe("true");
      expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    });
  });

  describe("Per-user GitHub OAuth (the account page's GitHub block)", () => {
    it("GET /auth/github/start builds an authorize URL with a state token", async () => {
      const prevId = process.env.GITHUB_CLIENT_ID;
      const prevSecret = process.env.GITHUB_CLIENT_SECRET;
      process.env.GITHUB_CLIENT_ID = "test-client-id";
      process.env.GITHUB_CLIENT_SECRET = "test-client-secret";
      try {
        const res = await app.inject({
          method: "GET",
          url: "/auth/github/start",
        });
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.url).toMatch(/^https:\/\/github\.com\/login\/oauth\/authorize\?/);
        expect(body.url).toContain("client_id=test-client-id");
        expect(body.url).toContain("scope=user%3Aread");
        expect(body.state).toMatch(/^[0-9a-f]{64}$/);
        expect(store.oauthStates.length).toBe(1);
        expect(store.oauthStates[0].token).toBe(body.state);
        expect(store.oauthStates[0].userId).toBe("user-1");
      } finally {
        if (prevId) process.env.GITHUB_CLIENT_ID = prevId;
        else delete process.env.GITHUB_CLIENT_ID;
        if (prevSecret) process.env.GITHUB_CLIENT_SECRET = prevSecret;
        else delete process.env.GITHUB_CLIENT_SECRET;
      }
    });

    it("GET /auth/github/start with no GITHUB_CLIENT_ID returns 503 not-configured", async () => {
      const prevId = process.env.GITHUB_CLIENT_ID;
      delete process.env.GITHUB_CLIENT_ID;
      try {
        const res = await app.inject({
          method: "GET",
          url: "/auth/github/start",
        });
        expect(res.statusCode).toBe(503);
        const body = JSON.parse(res.body);
        expect(body.error.code).toBe("GITHUB_OAUTH_NOT_CONFIGURED");
        expect(store.oauthStates.length).toBe(0);
      } finally {
        if (prevId) process.env.GITHUB_CLIENT_ID = prevId;
      }
    });

    it("GET /me exposes githubConnected + githubHandle", async () => {
      store.users[0].githubProviderToken = "gh-oauth-token-abc";
      store.users[0].githubHandle = "testdev";
      const res = await app.inject({
        method: "GET",
        url: "/me",
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.user.githubConnected).toBe(true);
      expect(body.user.githubHandle).toBe("testdev");

      // A disconnect clears the token + the handle.
      const disc = await app.inject({
        method: "POST",
        url: "/auth/github/disconnect",
      });
      expect(disc.statusCode).toBe(200);
      expect(disc.body).toBe('{"ok":true}');
      expect(store.users[0].githubProviderToken).toBeNull();
      expect(store.users[0].githubHandle).toBeNull();

      const me2 = await app.inject({ method: "GET", url: "/me" });
      const body2 = JSON.parse(me2.body);
      expect(body2.user.githubConnected).toBe(false);
      expect(body2.user.githubHandle).toBeNull();
    });
  });
});
