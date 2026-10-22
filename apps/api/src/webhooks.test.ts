// M3's T3.1–T3.3 route-level assertions (TASK_BREAKDOWN's M3 "verified
// state"): the `POST /webhooks/github` + `POST /webhooks/billing` routes,
// exercised on a real Fastify app + the routes' raw-body parser + a mocked
// Prisma surface (an in-memory fake, no Postgres) + an in-memory queue (no
// Redis, the `Enqueueable` seam from `queue.ts`). No network, no DB, no
// queue — the test asserts the *behavior*:
//
// GitHub (`POST /webhooks/github`):
// - ST-webhook-forged: a forged/missing signature → 401 WEBHOOK_REJECTED +
//   a NO queue write + an audit row (THREAT_MODEL T-01 "a forged event
//   fails layer 1").
// - ST-webhook-replay: a seen delivery id → 200 no-op (the pipeline does
//   NOT re-run, NFR-06 / IT-idempotency).
// - a malformed body (a signature over a valid body, a the shape fails the
//   event schema) → 422 WEBHOOK_MALFORMED + a not enqueued + audited
//   (ST-webhook-malformed).
// - a `pull_request` opened event → 202 + a review_jobs row + a enqueued
//   job (IT-webhook-opened; the payload is ONLY the `jobId` pointer +
//   correlation, a NFR-04 "no LLM / no diff fetch on the ingress path").
//
// Billing (`POST /webhooks/billing`):
// - a forged / unsigned event → 401 BILLING_REJECTED + a org_billing
//   UNCHANGED (ST-billing-forged, AC-403 "a client-claim is inert").
// - a re-delivered event (a the same provider event id) → 200 no-op (a
//   ST-billing-replay / IT-payment-03 "a replay is a no-op, the plan state
//   is not double-moved").

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
import { githubWebhookRoutes } from "./routes/webhooks.js";
import { billingWebhookRoutes } from "./routes/billing-webhook.js";
import { createInMemoryQueue, type InMemoryQueue } from "./queue.js";

// ---------------------------------------------------------------------------
// The test config (a GITHUB_WEBHOOK_SECRET for the HMAC + a
// STRIPE_WEBHOOK_SECRET + the mock-billing flag).
// ---------------------------------------------------------------------------

const GITHUB_SECRET = "test-github-webhook-secret";
const STRIPE_SECRET = "test-stripe-webhook-secret";

function testConfig(): AppConfig {
  return {
    core: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      REDIS_URL: "redis://localhost:6379",
      SESSION_SIGNING_KEY: "a-test-session-signing-key-000000000000000000",
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
      STRIPE_WEBHOOK_SECRET: STRIPE_SECRET,
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
// The mocked Prisma surface (a in-memory fake, a no Postgres). A test builds
// the exact rows the route touches + inspects the writes the route makes.
// ---------------------------------------------------------------------------

interface Seed {
  org?: Organization;
  install?: GithubInstall;
  repo?: GithubRepo;
  jobs?: ReviewJob[];
  delivery?: WebhookDelivery;
  billingRow?: OrgBilling;
  billingEvent?: BillingEvent;
}

export function mockPrisma(seed: Seed = {}) {
  const audits: AuditEvent[] = [];
  const retentionJobs: RetentionJob[] = [];
  const billingEvents: BillingEvent[] = [seed.billingEvent as BillingEvent];
  const orgBillings: OrgBilling[] = [seed.billingRow as OrgBilling];
  const jobs: ReviewJob[] = [...(seed.jobs ?? [])];
  const installs: GithubInstall[] = [seed.install as GithubInstall];
  const repos: GithubRepo[] = [seed.repo as GithubRepo];
  const deliveries: WebhookDelivery[] = [seed.delivery as WebhookDelivery];
  const orgs: Organization[] = [seed.org as Organization];

  const state = { audits, retentionJobs, billingEvents, orgBillings, jobs, installs, repos, deliveries, orgs };

  const auditEvent = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row = {
        id: `audit-${state.audits.length + 1}`,
        createdAt: new Date(),
        ...data,
      } as AuditEvent;
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
    findUnique: async ({ where }: { where: { provider_providerEventId: { provider: string; providerEventId: string } } }) =>
      state.billingEvents.find(
        (b) => b.provider === where.provider_providerEventId.provider && b.providerEventId === where.provider_providerEventId.providerEventId
      ) ?? null,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row = {
        id: `billing-event-${state.billingEvents.length + 1}`,
        processedAt: new Date(),
        ...data,
      } as unknown as BillingEvent;
      state.billingEvents.push(row);
      return row;
    },
    findMany: async () => state.billingEvents,
  };

  const orgBilling = {
    findFirst: async ({ where }: { where: Record<string, unknown> }) =>
      state.orgBillings.find((b) => b.provider === (where.provider as string) && b.providerCustomerId === (where.providerCustomerId as string)) ?? null,
    update: async ({ where, data }: { where: { orgId: string }; data: Record<string, unknown> }) => {
      const row = state.orgBillings.find((b) => b.orgId === where.orgId);
      if (!row) throw new Error("billing row not found");
      Object.assign(row, data);
      return row;
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
// The Fastify app builder (a the real routes + a the auth-plugin decorates,
// a no network). a Each test builds a fresh app + a fresh mocked DB + a fresh
// in-memory queue.
// ---------------------------------------------------------------------------

async function buildGithubApp(seed: Seed = {}) {
  const { db, state } = mockPrisma(seed);
  const queue: InMemoryQueue = createInMemoryQueue();
  const config = testConfig();

  const app = Fastify({ logger: false });
  // The auth plugin decorates `app.auth` (the billing route reads
  // `app.auth.db`). A minimal stand-in with the db + a no-op config.
  app.decorate("auth", { db, config, hashToken: () => "", argon2: undefined, newSessionToken: () => "" } as unknown as {
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

async function buildBillingApp(seed: Seed = {}) {
  const { db, state } = mockPrisma(seed);
  const config = testConfig();
  const app = Fastify({ logger: false });
  app.decorate("auth", { db, config, hashToken: () => "", argon2: undefined, newSessionToken: () => "" } as unknown as {
    db: PrismaClient;
    config: AppConfig;
    hashToken: (t: string) => string;
    argon2: typeof import("argon2");
    newSessionToken: () => string;
  });
  app.register(async (a: FastifyInstance) => {
    await billingWebhookRoutes(a, config);
  }, { prefix: "/webhooks" });
  await app.ready();
  return { app, db, state, config };
}

// The GitHub event helpers.
function sign(body: string, secret: string = GITHUB_SECRET): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

const PR_SHA = "a".repeat(40);
const PR_SHA2 = "b".repeat(40);

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

// The seed rows the opened-event test needs.
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
// The GitHub route tests (a ST-webhook-forged / -replay / -malformed + a
// IT-webhook-opened, a the TASK_BREAKDOWN M3 "verified state").
// ---------------------------------------------------------------------------

describe("POST /webhooks/github (M3 T3.2)", () => {
  let app: FastifyInstance;
  let queue: InMemoryQueue;
  let state: Awaited<ReturnType<typeof buildGithubApp>>["state"];
  let db: PrismaClient;
  let seed: Record<string, unknown> = {};

  beforeEach(async () => {
    seed = {};
    ({ app, db, queue, state } = await buildGithubApp(seed));
  });

  it("ST-webhook-forged: a forged signature → 401 + a no queue write + a audit row", async () => {
    seed = { delivery: { id: "delivery-row-1", deliveryId: "delivery-1", event: "pull_request", orgId: "org-1", installId: "install-1" } };
    const { app: appF, queue: queueF, state: stF } = await buildGithubApp(seed);
    const body = prBody();
    const raw = JSON.stringify(body);
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/github",
      headers: { ...prHeaders(body, { "x-hub-delivery": "delivery-1" }), "x-hub-signature-256": sign(raw, "an-attacker-secret") },
      payload: raw,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("WEBHOOK_REJECTED");
    // A NO queue write (a the rejection happens before the enqueue).
    expect(queueF.enqueued.length).toBe(0);
    // A the audit row (a the "a forged-webhook attempt is investigable").
    expect(stF.audits.some((a) => a.action === "webhook.rejected")).toBe(true);
  });

  it("a stale timestamp → 401 + a audit (a ST-webhook-stale, a layer 2)", async () => {
    seed = { delivery: { id: "delivery-row-1", deliveryId: "delivery-1", event: "pull_request", orgId: "org-1", installId: "install-1" } };
    const { app: appS, queue: queueS, state: stS } = await buildGithubApp(seed);
    const body = prBody();
    const raw = JSON.stringify(body);
    const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const res = await appS.inject({
      method: "POST",
      url: "/webhooks/github",
      headers: { ...prHeaders(body, { "x-hub-delivery": "delivery-1" }), "x-hub-timestamp": stale, "x-hub-signature-256": sign(raw) },
      payload: raw,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("WEBHOOK_REJECTED");
    expect(queueS.enqueued.length).toBe(0);
    expect(stS.audits.some((a) => a.action === "webhook.rejected")).toBe(true);
  });

  it("ST-webhook-replay: a seen delivery id → 200 no-op (a the pipeline does NOT re-run)", async () => {
    // A a seed delivery row for the delivery id (a the replay-dedup key,
    // a NFR-06).
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
    const res = await rebuilt.app.inject({
      method: "POST",
      url: "/webhooks/github",
      headers: prHeaders(prBody(), { "x-hub-delivery": "delivery-1" }),
      payload: JSON.stringify(prBody()),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().replay).toBe(true);
    // A NO queue write (a the replay does NOT re-run the pipeline).
    expect(rebuilt.queue.enqueued.length).toBe(0);
  });

  it("a malformed body (a a valid signature, a a shape fail) → 422 + a not enqueued", async () => {
    seed = { delivery: { id: "delivery-row-1", deliveryId: "delivery-malformed", event: "pull_request", orgId: "org-1", installId: "install-1" } };
    const { app: appM, queue: queueM, state: stM } = await buildGithubApp(seed);
    // A a body that passes the signature check (a a valid signature over
    // the body) but fails the `pull_request` schema (a the required
    // `pull_request.head.sha` is missing). a The "a verified but malformed"
    // case (a the signature proves origin, a the schema proves shape).
    const malformed = { action: "opened", number: 42, repository: { id: 1, full_name: "acme/app" }, installation: { id: 99 } };
    const raw = JSON.stringify(malformed);
    const res = await appM.inject({
      method: "POST",
      url: "/webhooks/github",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sign(raw),
        "x-hub-delivery": "delivery-malformed",
        "x-hub-timestamp": new Date().toISOString(),
        "x-github-event": "pull_request",
      },
      payload: raw,
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("WEBHOOK_MALFORMED");
    expect(queueM.enqueued.length).toBe(0);
    expect(stM.audits.some((a) => a.action === "webhook.malformed")).toBe(true);
  });

  it("a opened event → 202 + a review_jobs row + a enqueued pointer payload", async () => {
    const seed = openedSeed();
    const rebuilt = await buildGithubApp(seed);
    const body = prBody();
    const raw = JSON.stringify(body);
    const res = await rebuilt.app.inject({
      method: "POST",
      url: "/webhooks/github",
      headers: prHeaders(body),
      payload: raw,
    });
    expect(res.statusCode).toBe(202);
    const json = res.json();
    expect(json.jobId).toBeDefined();
    expect(json.enqueued).toBe(true);

    // A a review_jobs row was created (a the commit-SHA idempotency key).
    const job = rebuilt.state.jobs.find((j) => j.id === json.jobId);
    expect(job).toBeDefined();
    expect(job?.commitSha).toBe(PR_SHA);
    expect(job?.prNumber).toBe(42);
    expect(job?.status).toBe("QUEUED");

    // A the enqueued payload is ONLY the pointer + a correlation (a no diff,
    // a no findings, a no authz material — a NFR-04 + a SERVICE_BOUNDARIES
    // "a job payload is a pointer, not an authority").
    expect(rebuilt.queue.enqueued.length).toBe(1);
    const p = rebuilt.queue.enqueued[0].payload;
    expect(p.jobId).toBe(json.jobId);
    expect(p.orgId).toBe("org-1");
    expect(p.repoId).toBe("repo-1");
    expect(p.prNumber).toBe(42);
    expect(p.commitSha).toBe(PR_SHA);
    // A no secret / no LLM material in the payload.
    expect(Object.keys(p).sort()).toEqual(["commitSha", "jobId", "orgId", "prNumber", "repoId"]);
    void db;
    void state;
  });

  it("a re-push to a SUCCEEDED job's SHA → 200 no-op + a audit (a IT-idempotency-01, a ADR-007)", async () => {
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
    // A NO new job row + a NO enqueue (a the same-SHA is a no-op).
    expect(rebuilt.state.jobs.length).toBe(1);
    expect(rebuilt.queue.enqueued.length).toBe(0);
    expect(rebuilt.state.audits.some((a) => a.action === "webhook.dedup_same_sha")).toBe(true);
  });

  it("an unknown install (a a verified event we never recorded) → 404 + a audit", async () => {
    // A a PR event for an installation we have no row for (a the "no
    // existence oracle" — a 404, a not a 200, a the sender can notice).
    seed = { delivery: { id: "delivery-row-1", deliveryId: "delivery-unknown", event: "pull_request", orgId: "org-1", installId: "install-1" } };
    const { app: appU, queue: queueU, state: stU } = await buildGithubApp(seed);
    const body = prBody({ installation: { id: 555 } });
    const res = await appU.inject({
      method: "POST",
      url: "/webhooks/github",
      headers: prHeaders(body, { "x-hub-delivery": "delivery-unknown" }),
      payload: JSON.stringify(body),
    });
    expect(res.statusCode).toBe(404);
    expect(queueU.enqueued.length).toBe(0);
    expect(stU.audits.some((a) => a.action === "webhook.unknown_install")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The installation routing (a M3's T3.3 "a the install flow + a the install
// removal").
// ---------------------------------------------------------------------------

describe("POST /webhooks/github installation events (M3 T3.3)", () => {
  it("a installation.deleted → a REMOVED install + a disconnected repos + a retention_jobs row (a AC-204)", async () => {
    const seed = openedSeed();
    const seedDelivery = { delivery: { id: "delivery-row-1", deliveryId: "delivery-install-deleted", event: "installation", orgId: "org-1", installId: "install-1" } };
    const { app: app_, state: st } = await buildGithubApp({ ...seed, ...seedDelivery, jobs: [] });
    const evt = {
      action: "deleted",
      installation: {
        id: 99,
        account: { type: "Organization", login: "acme" },
      },
    };
    const raw = JSON.stringify(evt);
    const res = await app_.inject({
      method: "POST",
      url: "/webhooks/github",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sign(raw),
        "x-hub-delivery": "delivery-install-deleted",
        "x-hub-timestamp": new Date().toISOString(),
        "x-github-event": "installation",
      },
      payload: raw,
    });
    expect(res.statusCode).toBe(202);
    // A the install row → a REMOVED (a the AC-204 "a the install row is
    // marked inactive").
    const install = st.installs.find((i) => i.id === "install-1");
    expect(install?.status).toBe("REMOVED");
    expect(install?.removedAt).toBeInstanceOf(Date);
    // A the repos → a disconnected (a "a repos flag disconnected").
    const repo = st.repos.find((r) => r.id === "repo-1");
    expect(repo?.connected).toBe(false);
    expect(repo?.disabledAt).toBeInstanceOf(Date);
    // A a retention_jobs row (a "a repo content scheduled for purge", a
    // AC-204 + a DATA_RETENTION §4).
    expect(st.retentionJobs.some((rj) => rj.kind === "install_content_purge")).toBe(true);
    expect(st.audits.some((a) => a.action === "github.install_removed")).toBe(true);
  });

  it("a installation_repositories.added → a the repo upsert", async () => {
    const seed = openedSeed();
    const seedDelivery = { delivery: { id: "delivery-row-1", deliveryId: "delivery-install-repos", event: "installation_repositories", orgId: "org-1", installId: "install-1" } };
    const { app: app_, state: st } = await buildGithubApp({ ...seed, ...seedDelivery });
    const evt = {
      action: "added",
      installation: {
        id: 99,
        account: { type: "Organization", login: "acme" },
      },
      repositories_added: [
        { id: 778, full_name: "acme/other", default_branch: "main" },
      ],
    };
    const raw = JSON.stringify(evt);
    const res = await app_.inject({
      method: "POST",
      url: "/webhooks/github",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sign(raw),
        "x-hub-delivery": "delivery-install-repos",
        "x-hub-timestamp": new Date().toISOString(),
        "x-github-event": "installation_repositories",
      },
      payload: raw,
    });
    expect(res.statusCode).toBe(202);
    expect(st.repos.some((r) => r.githubRepoId === BigInt(778) && r.connected === true)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The billing route tests (a ST-billing-forged / -replay, a AC-403).
// ---------------------------------------------------------------------------

describe("POST /webhooks/billing (M3 T3.3)", () => {
  function billingSignature(rawBody: string, secret: string = STRIPE_SECRET): string {
    // A the Stripe `Stripe-Signature` shape: a `t=<unix>,v1=<hex hmac>`.
    const v1 = createHmac("sha256", secret).update(rawBody).digest("hex");
    return `t=${Math.floor(Date.now() / 1000)},v1=${v1}`;
  }

  it("a forged / unsigned billing event → 401 + a org_billing UNCHANGED (a ST-billing-forged, a AC-403)", async () => {
    const billingRow: OrgBilling = {
      orgId: "org-1",
      provider: "stripe",
      providerCustomerId: "cus_123",
      providerSubscriptionId: "sub_1",
      plan: "free",
      status: "TRIALING",
      currentPeriodEnd: null,
      cancelledAt: null,
      updatedAt: new Date(),
    } as unknown as OrgBilling;
    const { app, state } = await buildBillingApp({ billingRow });
    const body = {
      id: "evt_forged",
      type: "invoice.paid",
      data: { object: { customer: "cus_123" } },
    };
    const raw = JSON.stringify(body);
    // A a missing signature header (a the forged / unsigned case).
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/billing",
      headers: { "content-type": "application/json" },
      payload: raw,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("BILLING_REJECTED");
    // A the org_billing state is UNCHANGED (a the client-claim / a the
    // forged-event is inert, a AC-403 "a client-claim is inert").
    expect(state.orgBillings[0].status).toBe("TRIALING");
    // A a the audit row (a the "a forged event is rejected + a audited").
    expect(state.audits.some((a) => a.action === "billing.rejected")).toBe(true);
    // A NO receipt row (a a rejection is not a valid event).
    expect(state.billingEvents.length).toBe(0);
  });

  it("a verified event moves the org_billing state (a IT-payment-01, a AC-403)", async () => {
    const billingRow: OrgBilling = {
      orgId: "org-1",
      provider: "stripe",
      providerCustomerId: "cus_123",
      providerSubscriptionId: "sub_1",
      plan: "free",
      status: "TRIALING",
      currentPeriodEnd: null,
      cancelledAt: null,
      updatedAt: new Date(),
    } as unknown as OrgBilling;
    const { app, state } = await buildBillingApp({ billingRow });
    const body = {
      id: "evt_paid",
      type: "invoice.paid",
      data: { object: { customer: "cus_123" } },
    };
    const raw = JSON.stringify(body);
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/billing",
      headers: { "content-type": "application/json", "stripe-signature": billingSignature(raw) },
      payload: raw,
    });
    expect(res.statusCode).toBe(200);
    // A the state moved to ACTIVE (a the §4 mapping: a invoice.paid → a
    // ACTIVE).
    expect(state.orgBillings[0].status).toBe("ACTIVE");
    // A a the receipt row (a the idempotency key).
    expect(state.billingEvents.some((b) => b.providerEventId === "evt_paid")).toBe(true);
  });

  it("a re-delivered event (a the same event id) → 200 no-op (a ST-billing-replay / a IT-payment-03, a a the plan state is not double-moved)", async () => {
    const billingRow: OrgBilling = {
      orgId: "org-1",
      provider: "stripe",
      providerCustomerId: "cus_123",
      providerSubscriptionId: "sub_1",
      plan: "free",
      status: "TRIALING",
      currentPeriodEnd: null,
      cancelledAt: null,
      updatedAt: new Date(),
    } as unknown as OrgBilling;
    const existing: BillingEvent = {
      id: "be-1",
      provider: "stripe",
      providerEventId: "evt_replay",
      type: "invoice.paid",
      processedAt: new Date(),
    } as unknown as BillingEvent;
    const { app, state } = await buildBillingApp({ billingRow, billingEvent: existing });
    const body = {
      id: "evt_replay",
      type: "invoice.paid",
      data: { object: { customer: "cus_123" } },
    };
    const raw = JSON.stringify(body);
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/billing",
      headers: { "content-type": "application/json", "stripe-signature": billingSignature(raw) },
      payload: raw,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().replay).toBe(true);
    // A the state is NOT double-moved (a the idempotency row was already
    // there, a the event was already processed).
    expect(state.orgBillings[0].status).toBe("TRIALING");
    // A NO second receipt row (a the UK makes a replay a no-op).
    expect(state.billingEvents.length).toBe(1);
  });

  it("a client-supplied plan claim (a no verified event) is INERT (a AC-403, a THREAT_MODEL T-14)", async () => {
    // A the "a client claim of 'I'm on Team' is inert" is structural: a
    // the ONLY state-mover is a the verified webhook (a this test asserts a
    // a forged event + a a client-claim field in the body do NOT change
    // a the plan).
    const billingRow: OrgBilling = {
      orgId: "org-1",
      provider: "stripe",
      providerCustomerId: "cus_123",
      providerSubscriptionId: "sub_1",
      plan: "team",
      status: "ACTIVE",
      currentPeriodEnd: null,
      cancelledAt: null,
      updatedAt: new Date(),
    } as unknown as OrgBilling;
    const { app, state } = await buildBillingApp({ billingRow });
    const body = {
      id: "evt_claim",
      type: "invoice.paid",
      plan: "enterprise", // a a client-supplied plan claim (a INERT).
      data: { object: { customer: "cus_123" } },
    };
    const raw = JSON.stringify(body);
    // A a forged signature (a a no verified event) → a a reject, a the
    // state UNCHANGED.
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/billing",
      headers: { "content-type": "application/json", "stripe-signature": billingSignature(raw, "wrong-secret") },
      payload: raw,
    });
    expect(res.statusCode).toBe(401);
    expect(state.orgBillings[0].status).toBe("ACTIVE");
    expect(state.orgBillings[0].plan).toBe("team");
  });
});
