// The Fastify API bootstrap + plugin registration (TRD.md §5). M2's T2.3–T2.5.
//
// The `api` owns: authentication, dashboard REST, the webhook ingress
// (verify + enqueue only), the billing webhooks, and the job enqueue. It does
// NOT run the review pipeline (SERVICE_BOUNDARIES.md "the api does not run the
// pipeline; it only enqueues").

import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifySensible from "@fastify/sensible";
import fastifyCors from "@fastify/cors";
import { loadConfig, type AppConfig } from "@vercode/config";
import { buildAuthPlugin } from "./plugins/auth.js";
import { buildTenantPlugin } from "./plugins/tenant.js";
import { registerRoutes } from "./routes/index.js";

export type VercodeApi = ReturnType<typeof buildServer>;

export function buildServer(opts: { config?: AppConfig; logger?: boolean } = {}) {
  const config = opts.config ?? loadConfig();
  const app = Fastify({
    logger: opts.logger ?? config.core.NODE_ENV === "development",
  });

  // The error handler maps internal exceptions to a safe shape (a stack / env /
  // DB URL never reaches the client, ERROR_HANDLING.md §2 "Sanitization").
  app.setErrorHandler((err, _req, reply) => {
    const e = err as { message?: string; code?: string; statusCode?: number };
    app.log.error({ err: e.message ?? "unknown", code: e.code }, "request failed");
    const status = typeof e.statusCode === "number" ? e.statusCode : 500;
    reply.status(status).send({
      error: {
        code: e.code ?? "INTERNAL_ERROR",
        message: status >= 500 ? "Internal error" : e.message ?? "Request failed.",
      },
    });
  });

  // CORS for cross-origin web client (apps/web on :3000 -> api on :4000)
  app.register(fastifyCors, {
    origin: (origin, cb) => {
      if (!origin) {
        cb(null, true);
        return;
      }
      const allowed = [
        config.core.WEB_BASE_URL,
        "http://localhost:3000",
        "http://127.0.0.1:3000",
      ];
      if (
        allowed.includes(origin) ||
        origin.startsWith("http://localhost:") ||
        origin.startsWith("http://127.0.0.1:")
      ) {
        cb(null, true);
        return;
      }
      cb(new Error("Not allowed by CORS"), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Idempotency-Key"],
  });

  app.register(fastifyCookie);
  app.register(fastifySensible);

  // Validate request schemas with Zod
  app.setValidatorCompiler(({ schema }: any) => {
    return (data: any) => {
      if (schema && typeof schema.safeParse === "function") {
        const result = schema.safeParse(data);
        if (!result.success) {
          return { error: result.error as any };
        }
        return { value: result.data };
      }
      return { value: data };
    };
  });

  // The auth + tenant + capability plugins. The service layer re-checks the
  // highest-risk mutations (org delete, role transfer, BYOK rotation) —
  // a middleware bypass is caught by the service re-check (AUTHORIZATION §3).
  app.register(buildAuthPlugin(config));
  app.register(buildTenantPlugin());

  registerRoutes(app, config);

  return app;
}
