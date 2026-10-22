// tests/security/security-webhook.test.ts
//
// ST-webhook-forged / ST-webhook-replay (SECURITY_TEST_PLAN.md §1.1,
// THREAT_MODEL.md T-01 "Forged or replayed GitHub webhook" — the ingress
// integrity gate: a forged event fails layer 1 (HMAC), a captured event
// fails layer 2 (timestamp) or layer 3 (delivery dedup); every rejection is
// audit-logged).
//
// This spec drives the REAL @vercode/api route (`POST /webhooks/github`)
// through the app's app factory + a mocked Prisma surface (the
// `mockPrisma` pattern from apps/api/src/webhooks.test.ts) + the in-memory
// queue seam, then asserts:
//   - a wrong-key signature → 401 WEBHOOK_REJECTED + NO queue write + an
//     audit row (ST-webhook-forged);
//   - a replayed delivery (a seen `X-Hub-Delivery` id) → 200 no-op, the
//     pipeline does NOT re-run (ST-webhook-replay).
//
// The signatures are pre-computed inline against a committed TEST secret
// (NEVER a real secret — the `test-github-webhook-secret` constant below is
// the same value apps/api/src/webhooks.test.ts uses; `tests/fixtures/
// webhook-events/` is empty today, so the fixtures M8 will build are not
// depended on).

import { describe, it, expect, beforeEach } from "vitest";
import Fastify from "fastify";
import { createHmac } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "@vercode/config";
import type {
  PrismaClient,
  Prisma,
  GithubInstall,
  GithubRepo,
  Organization,
  ReviewJob,
  AuditEvent,
  WebhookDelivery,
  RetentionJob,
  BillingEvent,
  OrgBilling,
} from "@prisma/client";
import { githubWebhookRoutes } from "../../apps/api/src/routes/webhooks.js";
import { createInMemoryQueue, type InMemoryQueue } from "../../apps/api/src/queue.js";

// ---------------------------------------------------------------------------
// The committed TEST webhook secret (a NEVER a real secret; the same value
// the existing route test uses — `GITHUB_WEBHOOK_SECRET` in the test config).
// ---------------------------------------------------------------------------

const GITHUB_SECRET = "test-github-webhook-secret";

function testConfig(): AppConfig {
  return {
    core: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      REDIS_URL: "redis://localhost:6379",
      SESSION_SIGNING_KEY: "a-test-session-signing-key-0000000000000000",
      API_BASE_URL: "http://localhost:4000",
      WEB_BASE_URL: "http://localhost:3000",
    },
    github: {
      GITHUB_APP_ID: "123456",
      GITHUB_APP_PRIVATE_KEY: "test-private-key",
      GITHUB_WEBHOOK_SECRET: GITHUB_SECRET,
      GITHUB_API_BASE: "https://api.github.com",
    },
    ai: { AI_DEFAULT_PROVIDER: "mock" },
    billing: {
      BILLING_PROVIDER: "stripe",
      STRIPE_WEBHOOK_SECRET: "test-stripe-webhook-secret",
      BILLING_CURRENCY: "USD",
    },
    observability: { LOG_LEVEL: "info" },
    limits: {
      PLATFORM_TOKEN_SPEND_CAP_USD: 100000,
      DEFAULT_CONFIDENCE_FLOOR: 0.6,
      REVIEW_WALL_CLOCK_BUDGET_MS: 240000,
      REVIEW_MAX_FILES: 60,
      REVIEW_MAX_LINES: 3000,
      WORKER_CONCURRENCY: 4,
      QUEUE_MAX_ATTEMPTS: 3,
    },
    devMock: { USE_MOCK_GITHUB: "true", USE_MOCK_AI: "true", USE_MOCK_BILLING: "true" },
  };
}

// ---------------------------------------------------------------------------
// The mocked Prisma surface (re-used, trimmed to what the github route
// touches — the full `mockPrisma` lives in apps/api/src/webhooks.test.ts;
// this is the *security* subset so this spec is self-contained).
// ---------------------------------------------------------------------------

interface Seed {
  org?: Organization;
  install?: GithubInstall;
  repo?: GithubRepo;
  jobs?: ReviewJob[];
  delivery?: WebhookDelivery;
}

export function mockPrismaForSecurity(seed: Seed = {}) {
  const audits: AuditEvent[] = [];
  const retentionJobs: RetentionJob[] = [];
  const jobs: ReviewJob[] = [...(seed.jobs ?? [])];
  const installs: GithubInstall[] = seed.install ? [seed.install] : [];
  const repos: GithubRepo[] = seed.repo ? [seed.repo] : [];
  const deliveries: WebhookDelivery[] = seed.delivery ? [seed.delivery] : [];
  const orgs: Organization[] = seed.org ? [seed.org] : [];

  const state = { audits, retentionJobs, jobs, installs, repos, deliveries, orgs };

  const auditEvent = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: `audit-${state.audits.length + 1}`, createdAt: new Date(), ...data } as AuditEvent;
      state.audits.push(row);
      return row;
    },
    findMany: async () => state.audits,
  };

  const webhookDelivery = {
    findUnique: async ({ where }: { where: { deliveryId: string } }) =>
      state.deliveries.find((d) => d.deliveryId === where.deliveryId) ?? null,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row = {
        id: `delivery-${state.deliveries.length + 1}`,
        receivedAt: new Date(),
        accepted: true,
        ...data,
      } as unknown as WebhookDelivery;
      state.deliveries.push(row);
      return row;
    },
  };

  const githubInstall = {
    findFirst: async ({ where }: { where: Record<string, unknown> }) =>
      state.installs.find((i) => i.githubInstallationId === String(where.githubInstallationId)) ?? null,
    upsert: async ({ where, update, create }: { where: Record<string, unknown>; update: Record<string, unknown>; create: Record<string, unknown> }) => {
      const key = where.orgId_githubInstallationId as { orgId: string; githubInstallationId: string };
      const found = state.installs.find(
        (i) => i.orgId === key.orgId && i.githubInstallationId === key.githubInstallationId
      );
      if (found) {
        Object.assign(found, update);
        return found;
      }
      const row = {
        id: `install-${state.installs.length + 1}`,
        status: "ACTIVE",
        createdAt: new Date(),
        ...create,
      } as unknown as GithubInstall;
      state.installs.push(row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = state.installs.find((i) => i.id === where.id);
      if (!row) throw new Error("install not found");
      Object.assign(row, data);
      return row;
    },
  };

  const githubRepo = {
    findUnique: async ({ where }: { where: { orgId_githubRepoId: { orgId: string; githubRepoId: bigint } } }) =>
      state.repos.find(
        (r) => r.orgId === where.orgId_githubRepoId.orgId && r.githubRepoId === where.orgId_githubRepoId.githubRepoId
      ) ?? null,
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      for (const r of state.repos) {
        const matchInstall = where.installId && r.installId === where.installId;
        const matchRepoId = where.githubRepoId && r.githubRepoId === (where.githubRepoId as bigint);
        if (matchInstall || matchRepoId) Object.assign(r, data);
      }
      return { count: 0 };
    },
    upsert: async ({ where, update, create }: { where: Record<string, unknown>; update: Record<string, unknown>; create: Record<string, unknown> }) => {
      const key = where.orgId_githubRepoId as { orgId: string; githubRepoId: bigint };
      const found = state.repos.find((r) => r.orgId === key.orgId && r.githubRepoId === key.githubRepoId);
      if (found) {
        Object.assign(found, update);
        return found;
      }
      const row = {
        id: `repo-${state.repos.length + 1}`,
        connected: true,
        createdAt: new Date(),
        ...create,
      } as unknown as GithubRepo;
      state.repos.push(row);
      return row;
    },
  };

  const organization = {
    findFirst: async ({ where }: { where: Record<string, unknown> }) => {
      if ("slug" in where) {
        return state.orgs.find((o) => o.slug === (where.slug as string)) ?? null;
      }
      return state.orgs.find((o) => o.id === (where.id as string)) ?? null;
    },
  };

  const reviewJob = {
    findUnique: async ({ where }: { where: { orgId_repoId_prNumber_commitSha: { orgId: string; repoId: string; prNumber: number; commitSha: string } } }) =>
      state.jobs.find(
        (j) =>
          j.orgId === where.orgId_repoId_prNumber_commitSha.orgId &&
          j.repoId === where.orgId_repoId_prNumber_commitSha.repoId &&
          j.prNumber === where.orgId_repoId_prNumber_commitSha.prNumber &&
          j.commitSha === where.orgId_repoId_prNumber_commitSha.commitSha
      ) ?? null,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row = {
        id: `job-${state.jobs.length + 1}`,
        status: "QUEUED",
        inputTokens: 0,
        outputTokens: 0,
        estUsdCost: 0,
        createdAt: new Date(),
        ...data,
      } as unknown as ReviewJob;
      state.jobs.push(row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = state.jobs.find((j) => j.id === where.id);
      if (!row) throw new Error("job not found");
      Object.assign(row, data);
      return row;
    },
  };

  const retentionJob = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row = {
        id: `retention-${state.retentionJobs.length + 1}`,
        status: "PENDING",
        runAt: new Date(),
        ...data,
      } as unknown as RetentionJob;
      state.retentionJobs.push(row);
      return row;
    },
    findMany: async () => state.retentionJobs,
  };

  const billingEvent = {
    findUnique: async () => null,
    create: async ({ data }: { data: Record<string, unknown> }) => data,
    findMany: async () => [],
  };

  const orgBilling = {
    findFirst: async () => null,
    update: async (_args: unknown) => {
      throw new Error("billing row not found");
    },
  };

  const prismaMock = {
    auditEvent,
    webhookDelivery,
    githubInstall,
    githubRepo,
    organization,
    reviewJob,
    retentionJob,
    billingEvent,
    orgBilling,
  } as unknown as PrismaClient;

  return { db: prismaMock, state };
}

// ---------------------------------------------------------------------------
// The app builder — the REAL github route + a minimal auth-plugin stand-in
// (the route reads `app.auth.db`).
// ---------------------------------------------------------------------------

async function buildGithubApp(seed: Seed = {}) {
  const { db, state } = mockPrismaForSecurity(seed);
  const queue: InMemoryQueue = createInMemoryQueue();
  const config = testConfig();

  const app = Fastify({ logger: false });
  app.decorate("auth", {
    db,
    config,
    hashToken: () => "",
    argon2: undefined,
    newSessionToken: () => "",
  } as unknown as {
    db: PrismaClient;
    config: AppConfig;
    hashToken: (t: string) => string;
    argon2: typeof import("argon2");
    newSessionToken: () => string;
  });
  app.register(async (a: FastifyInstance) => {
    githubWebhookRoutes(a, config, { db, queue });
  }, { prefix: "/webhooks" });
  await app.ready();
  return { app, db, queue, state, config };
}

// ---------------------------------------------------------------------------
// The GitHub event helpers
// ---------------------------------------------------------------------------

function sign(body: string, secret: string = GITHUB_SECRET): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

const PR_SHA = "a".repeat(40);

function prBody(over: Record<string, unknown> = {}) {
  return {
    action: "opened",
    number: 42,
    pull_request: {
      number: 42,
      title: "a fix",
      body: null,
      state: "open",
      head: { sha: PR_SHA, ref: "feat" },
      base: { ref: "main" },
    },
    repository: { id: 777, full_name: "acme/app" },
    installation: { id: 99 },
    sender: { login: "dev" },
    ...over,
  };
}

function prHeaders(body: unknown, over: Record<string, string> = {}) {
  const raw = JSON.stringify(body);
  return {
    "content-type": "application/json",
    "x-hub-signature-256": sign(raw),
    "x-hub-delivery": over["x-hub-delivery"] ?? "delivery-1",
    "x-hub-timestamp": over["x-hub-timestamp"] ?? new Date().toISOString(),
    "x-github-event": "pull_request",
  };
}

function openedSeed() {
  const org = { id: "org-1", slug: "acme", name: "Acme", status: "ACTIVE" } as unknown as Organization;
  const install = {
    id: "install-1",
    orgId: "org-1",
    githubInstallationId: "99",
    accountType: "Organization",
    accountLogin: "acme",
    status: "ACTIVE",
  } as unknown as GithubInstall;
  const repo = {
    id: "repo-1",
    orgId: "org-1",
    installId: "install-1",
    githubRepoId: BigInt(777),
    fullName: "acme/app",
    defaultBranch: "main",
    connected: true,
  } as unknown as GithubRepo;
  return { org, install, repo };
}

// ---------------------------------------------------------------------------
// The tests
// ---------------------------------------------------------------------------

describe("ST-webhook-forged: a forged / wrong-key signature (T-01 layer 1)", () => {
  let app: FastifyInstance;
  let queue: InMemoryQueue;
  let state: Awaited<ReturnType<typeof buildGithubApp>>["state"];

  beforeEach(async () => {
    ({ app, queue, state } = await buildGithubApp());
  });

  it("a wrong-key signature → 401 WEBHOOK_REJECTED + NO queue write + an audit row", async () => {
    const body = prBody();
    const raw = JSON.stringify(body);
    // A the HMAC is computed with an attacker's secret (a layer-1 reject).
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/github",
      headers: {
        ...prHeaders(body, { "x-hub-delivery": "delivery-forged" }),
        "x-hub-signature-256": sign(raw, "an-attacker-secret"),
      },
      payload: raw,
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("WEBHOOK_REJECTED");
    // A NO queue write (a the rejection happens BEFORE the enqueue).
    expect(queue.enqueued.length).toBe(0);
    // No durable job row was created either (a the forged event enqueued
    // nothing — T-01 "a forged event fails layer 1").
    expect(state.jobs.length).toBe(0);
    // A the audit row (a forged-webhook attempt is investigable).
    expect(state.audits.some((a) => a.action === "webhook.rejected")).toBe(true);
  });

  it("a missing signature → 401 + no queue write + an audit row", async () => {
    const body = prBody();
    const raw = JSON.stringify(body);
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/github",
      headers: {
        "content-type": "application/json",
        // A no x-hub-signature-256 header (a the forged / unsigned case).
        "x-hub-delivery": "delivery-unsigned",
        "x-hub-timestamp": new Date().toISOString(),
        "x-github-event": "pull_request",
      },
      payload: raw,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("WEBHOOK_REJECTED");
    expect(queue.enqueued.length).toBe(0);
    expect(state.audits.some((a) => a.action === "webhook.rejected")).toBe(true);
  });
});

describe("ST-webhook-replay: a replayed delivery (T-01 layer 3, NFR-06)", () => {
  it("a seen delivery id → 200 no-op + NO queue write (a the pipeline does NOT re-run)", async () => {
    // A the delivery row is pre-seeded (a the replay-dedup key is already in
    // `webhook_deliveries`). A valid signature + a fresh timestamp, but the
    // delivery id was already recorded.
    const seed = openedSeed();
    const rebuilt = await buildGithubApp({
      ...seed,
      delivery: {
        id: "delivery-row-1",
        deliveryId: "delivery-1",
        event: "pull_request",
        orgId: "org-1",
        installId: "install-1",
      } as unknown as WebhookDelivery,
    });

    const body = prBody();
    const res = await rebuilt.app.inject({
      method: "POST",
      url: "/webhooks/github",
      headers: prHeaders(body, { "x-hub-delivery": "delivery-1" }),
      payload: JSON.stringify(body),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().replay).toBe(true);
    // A NO queue write (a the replay does NOT re-run the pipeline — NFR-06).
    expect(rebuilt.queue.enqueued.length).toBe(0);
    // No NEW job row (a the replay is a no-op; the receipt already exists).
    expect(rebuilt.state.jobs.length).toBe(0);
    // A the audit row (a replay is logged).
    expect(rebuilt.state.audits.some((a) => a.action === "webhook.replay")).toBe(true);
  });

  it("a replay of a SUCCEEDED same-SHA event → 200 dedup no-op (a IT-idempotency-01)", async () => {
    // A the commit-SHA idempotency: a re-push to a SUCCEEDED job's SHA → 200
    // no-op + audit (a the same-SHA is a no-op even without a delivery-dedup).
    const seed = openedSeed();
    const succeeded: ReviewJob = {
      id: "job-existing",
      orgId: "org-1",
      repoId: "repo-1",
      prNumber: 42,
      commitSha: PR_SHA,
      status: "SUCCEEDED",
    } as unknown as ReviewJob;
    const rebuilt = await buildGithubApp({ ...seed, jobs: [succeeded] });

    const body = prBody();
    const res = await rebuilt.app.inject({
      method: "POST",
      url: "/webhooks/github",
      headers: prHeaders(body, { "x-hub-delivery": "delivery-same-sha" }),
      payload: JSON.stringify(body),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().dedup).toBe(true);
    expect(res.json().jobId).toBe("job-existing");
    expect(rebuilt.queue.enqueued.length).toBe(0);
  });
});
