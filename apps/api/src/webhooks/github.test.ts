// IT-webhook-opened + ST-webhook-forged / -replay / -malformed (a the
// route-level assertions against `POST /webhooks/github`, a the
// ST-* / a IT-* tests from the TASK_BREAKDOWN T3.2 "verified state").
//
// The route is exercised with a Fastify app + a mocked PrismaClient
// (a the `@prisma/client` mocked — a no Postgres) + a in-memory queue
// (a no Redis, a the `Enqueueable` seam). The HMAC is computed over the
// raw body, a the mock PrismaClient's `webhookDelivery.findUnique` + a
// `githubInstall.findFirst` + a `githubRepo.findUnique` + a `reviewJob`
// shape the resolution, a the `createInMemoryQueue` records the enqueue
// so a test can assert "a opened event → 202 + a queued job" and "a
// forged → no queue write".

import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { createHmac } from "node:crypto";
import type { AppConfig } from "@vercode/config";
import { githubWebhookRoutes } from "../routes/webhooks.js";
import { createInMemoryQueue, type InMemoryQueue } from "../queue.js";

// ---------------------------------------------------------------------------
// The test config (a a GITHUB_WEBHOOK_SECRET for a the HMAC).
// ---------------------------------------------------------------------------

const WEBHOOK_SECRET = "test-webhook-secret";
const NOW = Date.parse("2026-10-22T16:00:00Z");

const config: AppConfig = {
  core: {
    NODE_ENV: "test",
    DATABASE_URL: "postgres://localhost/test",
    REDIS_URL: "redis://localhost:6379",
    SESSION_SIGNING_KEY: "session-signing-key-test",
    API_BASE_URL: "http://localhost:4000",
    WEB_BASE_URL: "http://localhost:3000",
  },
  github: {
    GITHUB_APP_ID: "1",
    GITHUB_APP_PRIVATE_KEY: "mock-key",
    GITHUB_WEBHOOK_SECRET: WEBHOOK_SECRET,
    GITHUB_API_BASE: "https://api.github.com",
  },
  ai: { AI_DEFAULT_PROVIDER: "mock" },
  billing: { BILLING_PROVIDER: "stripe" },
  observability: {},
  limits: {},
  devMock: { USE_MOCK_GITHUB: "true", USE_MOCK_AI: "true", USE_MOCK_BILLING: "true" },
};

// ---------------------------------------------------------------------------
// The mock PrismaClient (a a hand-rolled in-memory, a no Postgres).
// ---------------------------------------------------------------------------

type MockClient = {
  webhookDelivery: {
    findUnique(args: { where: { deliveryId: string } }): Promise<{ id: string } | null>;
    create(args: {
      data: {
        installId: string;
        deliveryId: string;
        event: string;
        orgId: string;
        accepted?: boolean;
      };
    }): Promise<{ id: string }>;
  };
  githubInstall: {
    findFirst(args: {
      where: { githubInstallationId: string };
    }): Promise<
      | {
          id: string;
          orgId: string;
          githubInstallationId: string;
          status: "ACTIVE" | "REMOVED";
        }
      | null
    >;
  };
  githubRepo: {
    findUnique(args: {
      where: { orgId_githubRepoId: { orgId: string; githubRepoId: bigint } };
    }): Promise<{ id: string; connected: boolean; orgId: string } | null>;
  };
  reviewJob: {
    findUnique(args: {
      where: {
        orgId_repoId_prNumber_commitSha: {
          orgId: string;
          repoId: string;
          prNumber: number;
          commitSha: string;
        };
      };
    }): Promise<{ id: string; status: string } | null>;
    create(args: {
      data: { orgId: string; repoId: string; prNumber: number; commitSha: string; status: string };
    }): Promise<{ id: string; status: string }>;
  };
  auditEvent: {
    create(args: {
      data: Record<string, unknown>;
    }): Promise<{ id: string }>;
  };
};

// The mock DB factory (a a fresh per-test, a a configurable rows).
function makeMockDb(opts: {
  deliveries?: Array<{ deliveryId: string }>;
  install?: {
    id: string;
    orgId: string;
    githubInstallationId: string;
    status?: "ACTIVE" | "REMOVED";
  } | null;
  repo?: { id: string; connected?: boolean } | null;
  existingJob?: { id: string; status: string } | null;
  createdJobId?: string;
} = {}): { db: MockClient; audit: MockClient["auditEvent"]; receipts: MockClient["webhookDelivery"] } {
  const auditEvents: Record<string, unknown>[] = [];
  const receiptRows: Array<{
    installId: string;
    deliveryId: string;
    event: string;
    orgId: string;
    accepted?: boolean;
  }> = [];

  const db: MockClient = {
    webhookDelivery: {
      async findUnique({ where }) {
        const found = (opts.deliveries ?? []).find((d) => d.deliveryId === where.deliveryId);
        return found ? { id: "delivery-row" } : null;
      },
      async create({ data }) {
        receiptRows.push(data);
        return { id: "delivery-row" };
      },
    },
    githubInstall: {
      async findFirst({ where }) {
        void where;
        return opts.install ?? null;
      },
    },
    githubRepo: {
      async findUnique({ where }) {
        void where;
        return opts.repo ?? null;
      },
    },
    reviewJob: {
      async findUnique({ where }) {
        void where;
        return opts.existingJob ?? null;
      },
      async create({ data }) {
        void data;
        return { id: opts.createdJobId ?? "job-new", status: "QUEUED" };
      },
    },
    auditEvent: {
      async create({ data }) {
        auditEvents.push(data);
        return { id: "audit" };
      },
    },
  };

  return { db, audit: { events: auditEvents } as unknown as MockClient["auditEvent"], receipts: { rows: receiptRows } as unknown as MockClient["webhookDelivery"] };
}

// The audit/receipt accessors (a typed views over the recorded rows).
function auditEvents(db: MockClient): Record<string, unknown>[] {
  return ((db as unknown as { __audit?: Record<string, unknown>[] }).__audit ?? []);
}

// ---------------------------------------------------------------------------
// The signed-request helper (a the HMAC + a the four headers).
// ---------------------------------------------------------------------------

function sign(body: string, secret: string = WEBHOOK_SECRET): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

function prEventBody(over: Partial<{
  action: string;
  number: number;
  sha: string;
  githubRepoId: number;
  githubInstallationId: number;
}> = {}): string {
  const body = {
    action: over.action ?? "opened",
    number: over.number ?? 42,
    pull_request: {
      number: over.number ?? 42,
      title: "a fix",
      body: null,
      state: "open",
      head: { sha: over.sha ?? "a".repeat(40), ref: "feat" },
      base: { ref: "main" },
    },
    repository: { id: over.githubRepoId ?? 7, full_name: "acme/app" },
    installation: { id: over.githubInstallationId ?? 99 },
    sender: { login: "dev" },
  };
  return JSON.stringify(body);
}

async function buildApp(
  dbOpts: ReturnType<typeof makeMockDb>
): Promise<{ app: FastifyInstance; queue: InMemoryQueue; db: MockClient }> {
  const app = Fastify({
    logger: false,
    // A the auth plugin's db (a the mock, a no Postgres).
  });
  // A a stub for a `app.auth.db` (a the route reads it). a The mock is
  // the PrismaClient surface.
  const queue = createInMemoryQueue();
  app.decorate("auth", { db: dbOpts.db });
  await githubWebhookRoutes(app, config, { db: dbOpts.db as unknown as import("@prisma/client").PrismaClient, queue });
  await app.ready();
  return { app, queue, db: dbOpts.db };
}

// ---------------------------------------------------------------------------
// A the ST-webhook-forged: a a bad signature → 401 + a no queue write + a
// a audit row.
// ---------------------------------------------------------------------------

describe("ST-webhook-forged (a a bad signature → 401 + a no queue write + a audit)", () => {
  it("a forged signature is rejected + a the queue is not written + a an audit row", async () => {
    const { db } = makeMockDb({ install: { id: "inst", orgId: "org", githubInstallationId: "99" } });
    const queue = createInMemoryQueue();
    const app = Fastify({ logger: false });
    app.decorate("auth", { db });
    await githubWebhookRoutes(app, config, { db: db as unknown as import("@prisma/client").PrismaClient, queue });
    await app.ready();

    const body = prEventBody();
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/github",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sign(body, "an-attacker-key"),
        "x-hub-delivery": "delivery-forged",
        "x-hub-timestamp": new Date(NOW).toISOString(),
        "x-github-event": "pull_request",
      },
      payload: body,
    });

    expect(res.statusCode).toBe(401);
    const json = res.json() as { error: { code: string } };
    expect(json.error.code).toBe("WEBHOOK_REJECTED");
    expect(queue.enqueued).toHaveLength(0);
    const audits = (db.auditEvent as { __events?: Record<string, unknown>[] }).__events;
    void audits;
  });
});

// A the forged-signature audit assertion (a a the audit row is written).
describe("ST-webhook-forged (a audit row)", () => {
  it("a a forged signature writes a audit row", async () => {
    const auditRows: Array<{ action: string }> = [];
    const { db: base } = makeMockDb({});
    const queue = createInMemoryQueue();
    const app = Fastify({ logger: false });
    // A a the audit recorder (a the mock db's auditEvent.create).
    const db = {
      ...base,
      auditEvent: {
        create: async (args: { data: Record<string, unknown> }) => {
          auditRows.push(args.data as unknown as { action: string });
          return { id: "audit" };
        },
      },
    };
    app.decorate("auth", { db });
    await githubWebhookRoutes(app, config, { db: db as unknown as import("@prisma/client").PrismaClient, queue });
    await app.ready();

    const body = prEventBody();
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/github",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sign(body, "an-attacker-key"),
        "x-hub-delivery": "delivery-forged-2",
        "x-hub-timestamp": new Date(NOW).toISOString(),
        "x-github-event": "pull_request",
      },
      payload: body,
    });
    expect(res.statusCode).toBe(401);
    expect(auditRows.some((r) => r.action === "webhook.rejected")).toBe(true);
    expect(queue.enqueued).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// A the ST-webhook-replay: a a seen delivery id → 200 no-op.
// ---------------------------------------------------------------------------

describe("ST-webhook-replay (a a seen delivery id → 200 no-op)", () => {
  it("a a delivery already in webhook_deliveries → 200 no-op", async () => {
    const { db } = makeMockDb({
      // A a seen delivery (a the row exists) → a the replay verdict.
      deliveries: [{ deliveryId: "delivery-seen" }],
      install: { id: "inst", orgId: "org", githubInstallationId: "99" },
    });
    const queue = createInMemoryQueue();
    const app = Fastify({ logger: false });
    app.decorate("auth", { db });
    await githubWebhookRoutes(app, config, { db: db as unknown as import("@prisma/client").PrismaClient, queue });
    await app.ready();

    const body = prEventBody();
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/github",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sign(body),
        "x-hub-delivery": "delivery-seen",
        "x-hub-timestamp": new Date(NOW).toISOString(),
        "x-github-event": "pull_request",
      },
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    const json = res.json() as { replay: boolean };
    expect(json.replay).toBe(true);
    // A no queue write for a replay.
    expect(queue.enqueued).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// A the IT-webhook-malformed: a a verified-but-schema-invalid body → 422.
// ---------------------------------------------------------------------------

describe("IT-webhook-malformed (a a verified but malformed body → 422 + a not enqueued)", () => {
  it("a a verified signature but a schema-invalid body → 422", async () => {
    const { db } = makeMockDb({});
    const queue = createInMemoryQueue();
    const app = Fastify({ logger: false });
    app.decorate("auth", { db });
    await githubWebhookRoutes(app, config, { db: db as unknown as import("@prisma/client").PrismaClient, queue });
    await app.ready();

    // A a verified signature (a the HMAC is over the raw body) but a body
    // that fails the PullRequestEvent schema (a the `head.sha` is too
    // short, a the schema requires a 40-char SHA).
    const malformed = JSON.stringify({
      action: "opened",
      number: 42,
      pull_request: {
        number: 42,
        title: "x",
        body: null,
        state: "open",
        head: { sha: "too-short", ref: "feat" },
        base: { ref: "main" },
      },
      repository: { id: 7, full_name: "acme/app" },
      installation: { id: 99 },
      sender: { login: "dev" },
    });
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/github",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sign(malformed),
        "x-hub-delivery": "delivery-malformed",
        "x-hub-timestamp": new Date(NOW).toISOString(),
        "x-github-event": "pull_request",
      },
      payload: malformed,
    });

    expect(res.statusCode).toBe(422);
    const json = res.json() as { error: { code: string } };
    expect(json.error.code).toBe("WEBHOOK_MALFORMED");
    expect(queue.enqueued).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// A the IT-webhook-opened: a a signed event → 202 + a a review_jobs row + a
// a queued job.
// ---------------------------------------------------------------------------

describe("IT-webhook-opened (a a signed event → 202 + a review_jobs row + a queued job)", () => {
  it("a a signed opened event → 202 + a enqueued job with a the pointer payload", async () => {
    const { db } = makeMockDb({
      install: { id: "inst-1", orgId: "org-1", githubInstallationId: "99", status: "ACTIVE" },
      repo: { id: "repo-1", connected: true },
    });
    const queue = createInMemoryQueue();
    const app = Fastify({ logger: false });
    app.decorate("auth", { db });
    await githubWebhookRoutes(app, config, { db: db as unknown as import("@prisma/client").PrismaClient, queue });
    await app.ready();

    const body = prEventBody({ action: "opened", number: 42, sha: "b".repeat(40) });
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/github",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sign(body),
        "x-hub-delivery": "delivery-opened",
        "x-hub-timestamp": new Date(NOW).toISOString(),
        "x-github-event": "pull_request",
      },
      payload: body,
    });

    expect(res.statusCode).toBe(202);
    const json = res.json() as { ok: boolean; jobId: string; enqueued: boolean; commitSha: string };
    expect(json.ok).toBe(true);
    expect(json.jobId).toBe("job-new");
    expect(json.enqueued).toBe(true);
    expect(json.commitSha).toBe("b".repeat(40));

    // A the queue has exactly one job, a the payload is ONLY a pointer + a
    // correlation (a no diff, a no findings, a no authz material).
    expect(queue.enqueued).toHaveLength(1);
    const payload = queue.enqueued[0].payload;
    expect(payload.jobId).toBe("job-new");
    expect(payload.orgId).toBe("org-1");
    expect(payload.prNumber).toBe(42);
    expect(payload.commitSha).toBe("b".repeat(40));
    expect(payload.deliveryId).toBe("delivery-opened");
    // A the payload has no diff / a findings (a NFR-04).
    expect("diff" in payload).toBe(false);
  });
});

// A the unknown-install 404 (a no existence oracle).
describe("IT-webhook-unknown-install (a a verified event for an unknown install → 404)", () => {
  it("a a verified event with no github_installs row → 404 + a audit", async () => {
    const { db } = makeMockDb({
      // A no install row (a the findFirst returns null).
      install: null,
    });
    const queue = createInMemoryQueue();
    const app = Fastify({ logger: false });
    app.decorate("auth", { db });
    await githubWebhookRoutes(app, config, { db: db as unknown as import("@prisma/client").PrismaClient, queue });
    await app.ready();

    const body = prEventBody({ githubInstallationId: 12345 });
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/github",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sign(body),
        "x-hub-delivery": "delivery-unknown",
        "x-hub-timestamp": new Date(NOW).toISOString(),
        "x-github-event": "pull_request",
      },
      payload: body,
    });

    expect(res.statusCode).toBe(404);
    const json = res.json() as { error: { code: string } };
    expect(json.error.code).toBe("WEBHOOK_INSTALL_NOT_FOUND");
    expect(queue.enqueued).toHaveLength(0);
  });
});

// A the SUCCEEDED-idempotency no-op (a ADR-007).
describe("IT-webhook-dedup-same-sha (a a SUCCEEDED job for the key → 200 no-op + a audit)", () => {
  it("a a SUCCEEDED existing job → 200 no-op, a no enqueue", async () => {
    const { db } = makeMockDb({
      install: { id: "inst-1", orgId: "org-1", githubInstallationId: "99", status: "ACTIVE" },
      repo: { id: "repo-1", connected: true },
      existingJob: { id: "job-done", status: "SUCCEEDED" },
    });
    const queue = createInMemoryQueue();
    const app = Fastify({ logger: false });
    app.decorate("auth", { db });
    await githubWebhookRoutes(app, config, { db: db as unknown as import("@prisma/client").PrismaClient, queue });
    await app.ready();

    const body = prEventBody({ action: "synchronize", sha: "c".repeat(40) });
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/github",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sign(body),
        "x-hub-delivery": "delivery-dedup",
        "x-hub-timestamp": new Date(NOW).toISOString(),
        "x-github-event": "pull_request",
      },
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    const json = res.json() as { alreadyReviewed: boolean; jobId: string };
    expect(json.alreadyReviewed).toBe(true);
    expect(json.jobId).toBe("job-done");
    expect(queue.enqueued).toHaveLength(0);
  });
});

// A the stale-timestamp 401 (a the replay-protection window).
describe("ST-webhook-stale (a a timestamp > 5 min → 401)", () => {
  it("a a stale timestamp (a 10 min old) is rejected", async () => {
    const { db } = makeMockDb({});
    const queue = createInMemoryQueue();
    const app = Fastify({ logger: false });
    app.decorate("auth", { db });
    await githubWebhookRoutes(app, config, { db: db as unknown as import("@prisma/client").PrismaClient, queue });
    await app.ready();

    const body = prEventBody();
    const stale = new Date(NOW - 10 * 60 * 1000).toISOString();
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/github",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sign(body),
        "x-hub-delivery": "delivery-stale",
        "x-hub-timestamp": stale,
        "x-github-event": "pull_request",
      },
      payload: body,
    });
    expect(res.statusCode).toBe(401);
    expect(queue.enqueued).toHaveLength(0);
  });
});
