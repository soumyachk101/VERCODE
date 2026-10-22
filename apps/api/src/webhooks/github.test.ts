// IT-webhook-opened + ST-webhook-forged / -replay / -stale / -malformed
// (a the route-level assertions against `POST /webhooks/github`, a the
// TASK_BREAKDOWN T3.2 "verified state" tests).
//
// The route is exercised on a real Fastify app + a the route's content-type
// parser (a the raw-body + a the HMAC source of truth) + a mocked Prisma
// surface (a an in-memory fake, a no Postgres) + a in-memory queue (a no
// Redis, a the `Enqueueable` seam from `queue.ts`). A no network, a no DB:
// a the test asserts the *behavior* (a a forged → 401 + a no queue write +
// a audit row; a a replay → 200 no-op; a a malformed → 422; a a opened →
// 202 + a review_jobs row + a the enqueued pointer payload).

import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { createHmac } from "node:crypto";
import type { AppConfig } from "@vercode/config";
import type { PrismaClient } from "@prisma/client";
import { githubWebhookRoutes } from "../routes/webhooks.js";
import { createInMemoryQueue, type InMemoryQueue } from "../queue.js";

// ---------------------------------------------------------------------------
// The test config (a a GITHUB_WEBHOOK_SECRET for a the HMAC).
// ---------------------------------------------------------------------------

const WEBHOOK_SECRET = "test-webhook-secret";

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

// A the timestamp must be *within 5 min of the real clock* (a the
// `verifyGitHubWebhook` timestamp window, a layer 2). A a `new Date().
// toISOString()` is always in-window; a a 10-min-old ISO is always
// out-of-window (a the stale test).
const NOW_ISO = () => new Date().toISOString();
const STALE_ISO = () => new Date(Date.now() - 10 * 60 * 1000).toISOString();

// ---------------------------------------------------------------------------
// The in-memory Prisma fake (a the surface the route reads).
// ---------------------------------------------------------------------------

interface DbSeed {
  /** A the seen delivery ids (a the replay-dedup rows, a layer 3). */
  seenDeliveries?: string[];
  /** A the `github_installs` rows the install lookup resolves. */
  installs?: Array<{
    id: string;
    orgId: string;
    githubInstallationId: string;
    status: "ACTIVE" | "REMOVED";
  }>;
  /** A the `github_repos` rows the repo lookup resolves. */
  repos?: Array<{ id: string; orgId: string; githubRepoId: number; connected: boolean }>;
  /** A the `review_jobs` rows the idempotency lookup resolves. */
  jobs?: Array<{
    id: string;
    orgId: string;
    repoId: string;
    prNumber: number;
    commitSha: string;
    status: string;
  }>;
}

function makeDb(seed: DbSeed = {}): {
  db: PrismaClient;
  auditRows: Record<string, unknown>[];
  receipts: Record<string, unknown>[];
  createdJobs: Record<string, unknown>[];
} {
  const auditRows: Record<string, unknown>[] = [];
  const receipts: Record<string, unknown>[] = [];
  const createdJobs: Record<string, unknown>[] = [];

  const findInstall = (githubInstallationId: string) =>
    (seed.installs ?? []).find((i) => i.githubInstallationId === githubInstallationId) ?? null;
  const findRepo = (orgId: string, githubRepoId: bigint) =>
    (seed.repos ?? []).find((r) => r.orgId === orgId && BigInt(r.githubRepoId) === githubRepoId) ?? null;
  const findJob = (orgId: string, repoId: string, prNumber: number, commitSha: string) =>
    (seed.jobs ?? []).find(
      (j) => j.orgId === orgId && j.repoId === repoId && j.prNumber === prNumber && j.commitSha === commitSha
    );
  const deliverySeen = (deliveryId: string) => (seed.seenDeliveries ?? []).includes(deliveryId);

  const db = {
    webhookDelivery: {
      async findUnique(args: { where: { deliveryId: string } }) {
        return deliverySeen(args.where.deliveryId) ? { id: "delivery-row" } : null;
      },
      async create(args: { data: Record<string, unknown> }) {
        receipts.push(args.data);
        return { id: "delivery-row" };
      },
    },
    githubInstall: {
      async findFirst(args: { where: { githubInstallationId: string } }) {
        return findInstall(args.where.githubInstallationId);
      },
    },
    githubRepo: {
      async findUnique(args: { where: { orgId_githubRepoId: { orgId: string; githubRepoId: bigint } } }) {
        return findRepo(args.where.orgId_githubRepoId.orgId, args.where.orgId_githubRepoId.githubRepoId);
      },
    },
    reviewJob: {
      async findUnique(args: {
        where: {
          orgId_repoId_prNumber_commitSha: {
            orgId: string;
            repoId: string;
            prNumber: number;
            commitSha: string;
          };
        };
      }) {
        return (
          findJob(
            args.where.orgId_repoId_prNumber_commitSha.orgId,
            args.where.orgId_repoId_prNumber_commitSha.repoId,
            args.where.orgId_repoId_prNumber_commitSha.prNumber,
            args.where.orgId_repoId_prNumber_commitSha.commitSha
          ) ?? null
        );
      },
      async create(args: { data: Record<string, unknown> }) {
        const id = `job-${createdJobs.length + 1}`;
        createdJobs.push({ id, ...args.data });
        return { id, ...args.data };
      },
    },
    auditEvent: {
      async create(args: { data: Record<string, unknown> }) {
        auditRows.push(args.data);
        return { id: "audit" };
      },
    },
  } as unknown as PrismaClient;

  return { db, auditRows, receipts, createdJobs };
}

// ---------------------------------------------------------------------------
// The signed-event helper (a the HMAC over the raw body + a the four
// webhook headers).
// ---------------------------------------------------------------------------

function sign(body: string, secret: string = WEBHOOK_SECRET): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

// A a a valid `pull_request` body (a a the PullRequestEvent schema, a a
// 40-char SHA).
function prEventBody(over: {
  action?: string;
  number?: number;
  sha?: string;
  githubRepoId?: number;
  githubInstallationId?: number;
} = {}): string {
  const action = over.action ?? "opened";
  const number = over.number ?? 42;
  return JSON.stringify({
    action,
    number,
    pull_request: {
      number,
      title: "a fix",
      body: null,
      state: "open",
      head: { sha: over.sha ?? "a".repeat(40), ref: "feat" },
      base: { ref: "main" },
    },
    repository: { id: over.githubRepoId ?? 7, full_name: "acme/app" },
    installation: { id: over.githubInstallationId ?? 99 },
    sender: { login: "dev" },
  });
}

async function postWebhook(
  app: FastifyInstance,
  opts: {
    body: string;
    signature: string;
    deliveryId: string;
    timestamp?: string;
    event?: string;
  }
) {
  return app.inject({
    method: "POST",
    url: "/github",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": opts.signature,
      "x-hub-delivery": opts.deliveryId,
      "x-hub-timestamp": opts.timestamp ?? NOW_ISO(),
      "x-github-event": opts.event ?? "pull_request",
    },
    payload: opts.body,
  });
}

import type { FastifyInstance } from "fastify";

async function buildApp(seed: DbSeed, queue: InMemoryQueue) {
  const { db } = makeDb(seed);
  const app = Fastify({ logger: false });
  app.decorate("auth", { db });
  await githubWebhookRoutes(app, config, { db, queue });
  return app;
}

// ---------------------------------------------------------------------------
// A the ST-webhook-forged: a a forged signature → 401 + a no queue write +
// a a audit row.
// ---------------------------------------------------------------------------

describe("ST-webhook-forged (a a forged signature → 401 + a no queue write + a audit row)", () => {
  it("a wrong-key signature → 401 WEBHOOK_REJECTED + a NO queue write", async () => {
    const queue = createInMemoryQueue();
    const app = await buildApp(
      { installs: [{ id: "inst", orgId: "org", githubInstallationId: "99", status: "ACTIVE" }] },
      queue
    );
    const body = prEventBody();

    const res = await postWebhook(app, {
      body,
      signature: sign(body, "an-attacker-key"),
      deliveryId: "delivery-forged",
    });

    expect(res.statusCode).toBe(401);
    expect((res.json() as { error: { code: string } }).error.code).toBe("WEBHOOK_REJECTED");
    expect(queue.enqueued).toHaveLength(0);
  });

  it("a a forged signature writes a `webhook.rejected` audit row", async () => {
    const queue = createInMemoryQueue();
    const seed = {
      installs: [{ id: "inst", orgId: "org", githubInstallationId: "99", status: "ACTIVE" as const }],
    };
    const { db, auditRows } = makeDb(seed);
    const app = Fastify({ logger: false });
    app.decorate("auth", { db });
    await githubWebhookRoutes(app, config, { db, queue });

    const body = prEventBody();
    const res = await postWebhook(app, {
      body,
      signature: sign(body, "an-attacker-key"),
      deliveryId: "delivery-forged-audit",
    });

    expect(res.statusCode).toBe(401);
    expect(queue.enqueued).toHaveLength(0);
    expect(auditRows.some((r) => r.action === "webhook.rejected")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// A the ST-webhook-replay: a a seen delivery id → 200 no-op.
// ---------------------------------------------------------------------------

describe("ST-webhook-replay (a a seen delivery id → 200 no-op, a the pipeline does not re-run)", () => {
  it("a a delivery id already in webhook_deliveries → 200 replay no-op + a no queue write", async () => {
    const queue = createInMemoryQueue();
    const app = await buildApp(
      {
        seenDeliveries: ["delivery-seen"],
        installs: [{ id: "inst", orgId: "org", githubInstallationId: "99", status: "ACTIVE" }],
      },
      queue
    );
    const body = prEventBody();

    const res = await postWebhook(app, {
      body,
      signature: sign(body),
      deliveryId: "delivery-seen",
    });

    expect(res.statusCode).toBe(200);
    expect((res.json() as { replay: boolean }).replay).toBe(true);
    expect(queue.enqueued).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// A the IT-webhook-malformed: a a verified-but-schema-invalid body → 422.
// ---------------------------------------------------------------------------

describe("IT-webhook-malformed (a a verified signature + a schema-invalid body → 422 + a not enqueued)", () => {
  it("a a verified signature but a schema-failing body → 422 WEBHOOK_MALFORMED + a no queue write", async () => {
    const queue = createInMemoryQueue();
    const app = await buildApp(
      { installs: [{ id: "inst", orgId: "org", githubInstallationId: "99", status: "ACTIVE" }] },
      queue
    );
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

    const res = await postWebhook(app, {
      body: malformed,
      signature: sign(malformed),
      deliveryId: "delivery-malformed",
    });

    expect(res.statusCode).toBe(422);
    expect((res.json() as { error: { code: string } }).error.code).toBe("WEBHOOK_MALFORMED");
    expect(queue.enqueued).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// A the IT-webhook-opened: a a signed event → 202 + a review_jobs row + a
// a queued job.
// ---------------------------------------------------------------------------

describe("IT-webhook-opened (a a signed opened event → 202 + a review_jobs row + a enqueued job)", () => {
  it("a a signed opened event → 202 + a a review_jobs row + a an enqueued pointer payload", async () => {
    const queue = createInMemoryQueue();
    const app = await buildApp(
      {
        installs: [{ id: "inst-1", orgId: "org-1", githubInstallationId: "99", status: "ACTIVE" }],
        repos: [{ id: "repo-1", orgId: "org-1", githubRepoId: 7, connected: true }],
      },
      queue
    );
    const body = prEventBody({ action: "opened", sha: "b".repeat(40) });

    const res = await postWebhook(app, {
      body,
      signature: sign(body),
      deliveryId: "delivery-opened",
    });

    expect(res.statusCode).toBe(202);
    const json = res.json() as { ok: boolean; jobId: string; enqueued: boolean; commitSha: string };
    expect(json.ok).toBe(true);
    expect(json.enqueued).toBe(true);
    expect(json.commitSha).toBe("b".repeat(40));

    // A the queue has exactly one job, a the payload is ONLY a pointer + a
    // correlation (a no diff, a no findings, a no authz material, a
    // NFR-04).
    expect(queue.enqueued).toHaveLength(1);
    const payload = queue.enqueued[0].payload;
    expect(payload.jobId).toBe(json.jobId);
    expect(payload.orgId).toBe("org-1");
    expect(payload.repoId).toBe("repo-1");
    expect(payload.prNumber).toBe(42);
    expect(payload.commitSha).toBe("b".repeat(40));
    expect(payload.deliveryId).toBe("delivery-opened");
    expect("diff" in payload).toBe(false);
  });

  it("a a SUCCEEDED existing job for the key → 200 no-op + a no enqueue (a ADR-007)", async () => {
    const queue = createInMemoryQueue();
    const app = await buildApp(
      {
        installs: [{ id: "inst-1", orgId: "org-1", githubInstallationId: "99", status: "ACTIVE" }],
        repos: [{ id: "repo-1", orgId: "org-1", githubRepoId: 7, connected: true }],
        jobs: [
          {
            id: "job-done",
            orgId: "org-1",
            repoId: "repo-1",
            prNumber: 42,
            commitSha: "c".repeat(40),
            status: "SUCCEEDED",
          },
        ],
      },
      queue
    );
    const body = prEventBody({ action: "synchronize", sha: "c".repeat(40) });

    const res = await postWebhook(app, {
      body,
      signature: sign(body),
      deliveryId: "delivery-dedup",
    });

    expect(res.statusCode).toBe(200);
    const json = res.json() as { alreadyReviewed: boolean; jobId: string };
    expect(json.alreadyReviewed).toBe(true);
    expect(json.jobId).toBe("job-done");
    expect(queue.enqueued).toHaveLength(0);
  });

  it("a a verified event for an unknown install → 404 (a no existence oracle)", async () => {
    const queue = createInMemoryQueue();
    const app = await buildApp({}, queue);
    const body = prEventBody({ githubInstallationId: 12345 });

    const res = await postWebhook(app, {
      body,
      signature: sign(body),
      deliveryId: "delivery-unknown",
    });

    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: { code: string } }).error.code).toBe("WEBHOOK_INSTALL_NOT_FOUND");
    expect(queue.enqueued).toHaveLength(0);
  });

  it("a a stale timestamp (> 5 min) → 401 (a the replay-protection window)", async () => {
    const queue = createInMemoryQueue();
    const app = await buildApp(
      { installs: [{ id: "inst", orgId: "org", githubInstallationId: "99", status: "ACTIVE" }] },
      queue
    );
    const body = prEventBody();

    const res = await postWebhook(app, {
      body,
      signature: sign(body),
      deliveryId: "delivery-stale",
      timestamp: STALE_ISO(),
    });

    expect(res.statusCode).toBe(401);
    expect(queue.enqueued).toHaveLength(0);
  });
});
