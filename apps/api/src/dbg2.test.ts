import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { createHmac } from "node:crypto";
import type { AppConfig } from "@vercode/config";
import type { PrismaClient, WebhookDelivery, GithubInstall, GithubRepo, Organization, ReviewJob, AuditEvent, RetentionJob, BillingEvent, OrgBilling } from "@prisma/client";
import { githubWebhookRoutes } from "./routes/webhooks.js";
import { createInMemoryQueue } from "./queue.js";

function mockPrisma(seed: { org?: Organization; install?: GithubInstall; repo?: GithubRepo; jobs?: ReviewJob[]; delivery?: WebhookDelivery }) {
  const audits: AuditEvent[] = [];
  const state = { audits };
  const deliveries: WebhookDelivery[] = [seed.delivery as WebhookDelivery];
  const prismaMock = {
    webhookDelivery: {
      findUnique: async ({ where }: { where: { deliveryId: string } }) =>
        deliveries.find((d) => d.deliveryId === where.deliveryId) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `d-${deliveries.length+1}`, receivedAt: new Date(), accepted: true, ...data } as unknown as WebhookDelivery;
        deliveries.push(row);
        return row;
      },
    },
    auditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `a-${audits.length+1}`, createdAt: new Date(), ...data } as unknown as AuditEvent;
        audits.push(row);
        return row;
      },
    },
    githubInstall: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        (seed.install && seed.install.githubInstallationId === String(where.githubInstallationId) ? seed.install : null),
    },
    githubRepo: {
      findUnique: async ({ where }: { where: { orgId_githubRepoId: { orgId: string; githubRepoId: bigint } } }) =>
        (seed.repo && seed.repo.orgId === where.orgId_githubRepoId.orgId && seed.repo.githubRepoId === where.orgId_githubRepoId.githubRepoId ? seed.repo : null),
    },
    organization: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        (seed.org && seed.org.id === where.id ? seed.org : null),
    },
    reviewJob: {
      findUnique: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "job-1", ...data }) as unknown as ReviewJob,
      update: async () => ({}),
    },
  } as unknown as PrismaClient;
  return { db: prismaMock, state };
}

describe("dbg2", () => {
  it("reproduces the full-test buildGithubApp for forged", async () => {
    const GITHUB_SECRET = "test-github-webhook-secret";
    const sign = (body: string, secret = GITHUB_SECRET) => "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
    const config: AppConfig = {
      core: { NODE_ENV: "test", DATABASE_URL: "postgresql://t", REDIS_URL: "redis://t", SESSION_SIGNING_KEY: "k".repeat(20), API_BASE_URL: "http://x", WEB_BASE_URL: "http://x" },
      github: { GITHUB_APP_ID: "1", GITHUB_APP_PRIVATE_KEY: "k", GITHUB_WEBHOOK_SECRET: GITHUB_SECRET, GITHUB_API_BASE: "https://api.github.com" },
      ai: { AI_DEFAULT_PROVIDER: "mock" },
      billing: { BILLING_PROVIDER: "stripe", BILLING_CURRENCY: "USD", STRIPE_WEBHOOK_SECRET: "s" },
      observability: { LOG_LEVEL: "info" },
      limits: { PLATFORM_TOKEN_SPEND_CAP_USD: 1, DEFAULT_CONFIDENCE_FLOOR: 0.6, REVIEW_WALL_CLOCK_BUDGET_MS: 100, REVIEW_MAX_FILES: 1, REVIEW_MAX_LINES: 1, WORKER_CONCURRENCY: 1, QUEUE_MAX_ATTEMPTS: 1 },
      devMock: { USE_MOCK_GITHUB: "true", USE_MOCK_AI: "true", USE_MOCK_BILLING: "true" },
    };
    const { db } = mockPrisma({});
    const queue = createInMemoryQueue();
    const app = Fastify({ logger: false });
    app.decorate("auth", {} as never);
    app.register(async (a) => { githubWebhookRoutes(a, config, { db, queue }); }, { prefix: "/webhooks" });
    await app.ready();
    const body = { action: "opened", number: 42, pull_request: { number: 42, title: "t", body: null, state: "open", head: { sha: "a".repeat(40), ref: "f" }, base: { ref: "m" } }, repository: { id: 1, full_name: "a/b" }, installation: { id: 1 }, sender: { login: "d" } };
    const raw = JSON.stringify(body);
    const res = await app.inject({
      method: "POST", url: "/webhooks/github",
      headers: { "content-type": "application/json", "x-hub-signature-256": sign(raw, "attacker"), "x-hub-delivery": "d1", "x-hub-timestamp": new Date().toISOString(), "x-github-event": "pull_request" },
      payload: raw,
    });
    console.log("DBG2 STATUS", res.statusCode, "BODY", res.body); throw new Error("x");
    expect(res.statusCode).toBe(401);
  });
});
