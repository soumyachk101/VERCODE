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
import { billingWebhookRoutes } from "./billing-webhook.js";
import { BullQueue, type Enqueueable } from "../queue.js";

export function registerRoutes(app: FastifyInstance, config: AppConfig) {
  app.register(healthRoutes, { prefix: "/health" });
  app.register(authRoutes, { prefix: "/auth" });
  app.register(accountRoutes, { prefix: "/me" });
  app.register(orgRoutes, { prefix: "/orgs" });
  app.register(githubRoutes, { prefix: "/orgs" });

  // The webhook ingress (the two public, non-session routes,
  // WEBHOOK_SPECIFICATION §3). The GitHub route gets the BullQueue — it
  // degrades to a no-op enqueue + a warning when the REDIS_URL is
  // unreachable (the dev-stack rule, NFR-04 "a queue outage must not 5xx
  // the ingress"); the durable review_jobs row is the source of truth
  // (the worker's re-drain picks it up, BACKUP_RESTORE §1).
  const queue: Enqueueable = new BullQueue({
    name: "review-queue",
    redisUrl: config.core.REDIS_URL,
    logger: { warn: (m: string) => (app.log ? app.log.warn(m) : console.warn(m)) },
  });
  const githubWebhooksPlugin = async (a: FastifyInstance) => {
    githubWebhookRoutes(a, config, { db: a.auth.db, queue });
  };
  app.register(githubWebhooksPlugin, { prefix: "/webhooks" });
  const billingWebhooksPlugin = async (a: FastifyInstance) => {
    await billingWebhookRoutes(a, config);
  };
  app.register(billingWebhooksPlugin, { prefix: "/webhooks" });
}
