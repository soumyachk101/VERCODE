// The route registration. Each route group is a plugin that gets the
// capability from the context (the tenant plugin reads it) + the `public`
// flag for the session-exempt routes.
//
// Routes are mounted both at root and with the `/api/v1` prefix per
// docs/API/API_SPECIFICATION.md so that both the web dashboard client
// (`apps/web/src/lib/api.ts`) and existing integration tests work seamlessly.

import type { FastifyInstance } from "fastify";
import type { AppConfig } from "@vercode/config";
import { authRoutes } from "./auth.js";
import { accountRoutes } from "./account.js";
import { orgRoutes } from "./orgs.js";
import { githubRoutes } from "./github.js";
import { reposRoutes } from "./repos.js";
import { healthRoutes } from "./health.js";
import { githubWebhookRoutes } from "./webhooks.js";
import { reviewRoutes } from "./reviews.js";
import { usageRoutes } from "./usage.js";
import { settingsRoutes } from "./settings.js";
import { auditRoutes } from "./audit.js";
import { BullQueue, type Enqueueable } from "../queue.js";

export function registerRoutes(app: FastifyInstance, config: AppConfig) {
  // The BullQueue — it degrades to a no-op enqueue + a warning when the
  // REDIS_URL is unreachable (NFR-04 "a queue outage must not 5xx the ingress");
  // the durable review_jobs row is the source of truth (BACKUP_RESTORE §1).
  const queue: Enqueueable = new BullQueue({
    name: "review-queue",
    redisUrl: config.core.REDIS_URL,
    logger: { warn: (m: string) => (app.log ? app.log.warn(m) : console.warn(m)) },
  });

  const registerAppRoutes = (router: FastifyInstance) => {
    router.register(healthRoutes, { prefix: "/health" });
    router.register(authRoutes, { prefix: "/auth" });
    router.register(accountRoutes, { prefix: "/me" });
    router.register(orgRoutes, { prefix: "/orgs" });
    router.register(async (inst) => {
      await githubRoutes(inst, queue);
    }, { prefix: "/orgs" });
    router.register(async (inst) => {
      await reposRoutes(inst);
    }, { prefix: "/orgs" });
    router.register(reviewRoutes, { prefix: "/orgs" });
    router.register(usageRoutes, { prefix: "/orgs" });
    router.register(settingsRoutes, { prefix: "/orgs" });
    router.register(auditRoutes, { prefix: "/orgs" });
  };

  // Mount at root (for tests and direct callers)
  registerAppRoutes(app);

  // Mount under /api/v1 (for web dashboard & standard API spec)
  app.register(async (v1) => {
    registerAppRoutes(v1);
  }, { prefix: "/api/v1" });

  // The webhook ingress (the two public, non-session routes, WEBHOOK_SPECIFICATION §3).
  const githubWebhooksPlugin = async (a: FastifyInstance) => {
    githubWebhookRoutes(a, config, { db: a.auth.db, queue });
  };
  app.register(githubWebhooksPlugin, { prefix: "/webhooks" });
  app.register(githubWebhooksPlugin, { prefix: "/api/v1/webhooks" });
}
