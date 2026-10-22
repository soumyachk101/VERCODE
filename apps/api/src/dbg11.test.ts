import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { createHmac } from "node:crypto";
import type { AppConfig } from "@vercode/config";
import type { PrismaClient } from "@prisma/client";
import { githubWebhookRoutes } from "./routes/webhooks.js";
import { createInMemoryQueue } from "./queue.js";
import { mockPrisma } from "./webhooks.test.js";

describe("dbg11", () => {
  it("minimal mock, opened event with fresh delivery", async () => {
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
    const { db, state } = mockPrisma({
      org: { id: "org-1", slug: "acme", name: "Acme", status: "ACTIVE" } as never,
      install: { id: "install-1", orgId: "org-1", githubInstallationId: "99", accountType: "O", accountLogin: "acme", status: "ACTIVE" } as never,
      repo: { id: "repo-1", orgId: "org-1", installId: "install-1", githubRepoId: BigInt(777), fullName: "acme/app", defaultBranch: "main", connected: true } as never,
    });
    const queue = createInMemoryQueue();
    const app = Fastify({ logger: false });
    app.decorate("auth", {} as never);
    app.register(async (a) => { githubWebhookRoutes(a, config, { db, queue }); }, { prefix: "/webhooks" });
    await app.ready();
    const body = { action: "opened", number: 42, pull_request: { number: 42, title: "t", body: null, state: "open", head: { sha: "a".repeat(40), ref: "f" }, base: { ref: "m" } }, repository: { id: 777, full_name: "acme/app" }, installation: { id: 99 }, sender: { login: "d" } };
    const raw = JSON.stringify(body);
    const res = await app.inject({
      method: "POST", url: "/webhooks/github",
      headers: { "content-type": "application/json", "x-hub-signature-256": sign(raw), "x-hub-delivery": "fresh-1", "x-hub-timestamp": new Date().toISOString(), "x-github-event": "pull_request" },
      payload: raw,
    });
    console.log("DBG11", res.statusCode, res.body);
  });
});
