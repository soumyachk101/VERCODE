// The route registration. Each route group is a plugin that gets the
// capability from the context (the tenant plugin reads it) + the `public`
// flag for the session-exempt routes.

import type { FastifyInstance } from "fastify";
import type { AppConfig } from "@vercode/config";
import { authRoutes } from "./auth.js";
import { accountRoutes } from "./account.js";
import { orgRoutes } from "./orgs.js";
import { githubRoutes } from "./github.js";
import { healthRoutes } from "./health.js";

import { githubWebhookRoutes } from "./webhooks.js";
import { billingWebhookRoutes } from "../webhooks/billing.js";
import { BullQueue, type Enqueueable } from "../queue.js";

export function registerRoutes(app: FastifyInstance, config: AppConfig) {
  app.register(healthRoutes, { prefix: "/health" });
  app.register(authRoutes, { prefix: "/auth" });
  app.register(accountRoutes, { prefix: "/me" });
  app.register(orgRoutes, { prefix: "/orgs" });
  app.register(githubRoutes, { prefix: "/orgs" });

  // A the webhook ingress (a the public, a signature-verified, a
  // idempotent entry points; a WEBHOOK_SPECIFICATION §3 "a the two public,
  // a non-session ingress routes"). A the GitHub queue is a a BullQueue
  // (a ioredis + a bullmq; a it degrades to a no-op when a the REDIS_URL
  // is unreachable in the dev-stack, a so the ingress stays up). A the
  // test injects a in-memory queue via a the `queue` opt.
  const queue: Enqueueable = new BullQueue({
    name: "review-queue",
    redisUrl: config.core.REDIS_URL,
    logger: { warn: (m: string) => app.log?.warn?.(m) ?? console.warn(m) },
  });
  app.register(async (a) => {
    await githubWebhookRoutes(a, config, queue);
  }, { prefix: "/webhooks" });
  app.register(billingWebhookRoutes, { prefix: "/webhooks" });
}
