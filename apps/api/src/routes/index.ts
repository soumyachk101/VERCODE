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

export function registerRoutes(app: FastifyInstance, config: AppConfig) {
  app.register(healthRoutes, { prefix: "/health" });
  app.register(authRoutes, { prefix: "/auth" });
  app.register(accountRoutes, { prefix: "/me" });
  app.register(orgRoutes, { prefix: "/orgs" });
  app.register(githubRoutes, { prefix: "/orgs" });
}
