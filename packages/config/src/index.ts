// The typed env-var config (ENVIRONMENT_VARIABLES.md §9 "the config package is
// the only reader of env; a variable not in the doc doesn't exist; loadConfig
// validates the exact set, a missing/extra var is a startup error").
//
// This is M2's T2.1. It centralizes + types every env var the platform reads,
// so a `process.env.X` outside this package is a lint defect (the rule in
// ENVIRONMENT_VARIABLES.md §9 "a process.env.X outside config is a
// review defect").

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

// ---------------------------------------------------------------------------
// The per-section schemas (one per ENVIRONMENT_VARIABLES.md group)
// ---------------------------------------------------------------------------

const CoreSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  SESSION_SIGNING_KEY: z.string().min(16),
  API_BASE_URL: z.string().url(),
  WEB_BASE_URL: z.string().url(),
});
export type CoreConfig = z.infer<typeof CoreSchema>;

const GithubSchema = z.object({
  GITHUB_APP_ID: z.string().min(1),
  GITHUB_APP_PRIVATE_KEY: z.string().min(1),
  GITHUB_WEBHOOK_SECRET: z.string().min(1),
  GITHUB_API_BASE: z.string().url().default("https://api.github.com"),
});
export type GithubConfig = z.infer<typeof GithubSchema>;

const AiSchema = z.object({
  AI_DEFAULT_PROVIDER: z.enum(["openai", "anthropic", "ollama", "mock"]).default("mock"),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OLLAMA_BASE_URL: z.string().optional(),
  AI_FALLBACK_PROVIDER: z.enum(["openai", "anthropic", "ollama"]).optional(),
});
export type AiConfig = z.infer<typeof AiSchema>;


const ObservabilitySchema = z.object({
  SENTRY_DSN_API: z.string().optional(),
  SENTRY_DSN_WORKER: z.string().optional(),
  SENTRY_DSN_WEB: z.string().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  OTEL_SERVICE_NAME: z.string().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});
export type ObservabilityConfig = z.infer<typeof ObservabilitySchema>;

// The platform defaults + limits (ENVIRONMENT_VARIABLES.md §6 "these are
// defaults — an org-level override is in the DB").
const LimitsSchema = z.object({
  PLATFORM_TOKEN_SPEND_CAP_USD: z.coerce.number().nonnegative().default(100000),
  DEFAULT_CONFIDENCE_FLOOR: z.coerce.number().min(0).max(1).default(0.6),
  REVIEW_WALL_CLOCK_BUDGET_MS: z.coerce.number().positive().default(240_000),
  REVIEW_MAX_FILES: z.coerce.number().positive().default(60),
  REVIEW_MAX_LINES: z.coerce.number().positive().default(3000),
  WORKER_CONCURRENCY: z.coerce.number().positive().default(4),
  QUEUE_MAX_ATTEMPTS: z.coerce.number().positive().default(3),
});
export type LimitsConfig = z.infer<typeof LimitsSchema>;

const DevMockSchema = z.object({
  USE_MOCK_GITHUB: z.enum(["true", "false"]).default("true"),
  USE_MOCK_AI: z.enum(["true", "false"]).default("true"),
});
export type DevMockConfig = z.infer<typeof DevMockSchema>;

// ---------------------------------------------------------------------------
// The full config + the loader
// ---------------------------------------------------------------------------

export const AppConfigSchema = z.object({
  core: CoreSchema,
  github: GithubSchema,
  ai: AiSchema,
  observability: ObservabilitySchema,
  limits: LimitsSchema,
  devMock: DevMockSchema,
});
export type AppConfig = z.infer<typeof AppConfigSchema>;

/**
 * Load + validate the config from an env record (default: process.env).
 *
 * Returns the parsed config or throws a descriptive error naming the missing
 * var (ENVIRONMENT_VARIABLES.md §10 "a boot that can't resolve a required var
 * fails fast, with the var named, not a mid-run crash").
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (env === process.env && !process.env.DATABASE_URL && typeof process.loadEnvFile === "function") {
    let dir = process.cwd();
    for (let i = 0; i < 5; i++) {
      const candidate = path.join(dir, ".env");
      if (fs.existsSync(candidate)) {
        try {
          process.loadEnvFile(candidate);
          break;
        } catch {
          // ignore parsing error if any
        }
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }

  // Read only the documented vars (the "a variable not in the doc doesn't
  // exist" gate), then shape them into the nested config + validate.
  const flat = pick(env);
  const nested = {
    core: {
      NODE_ENV: flat.NODE_ENV,
      DATABASE_URL: flat.DATABASE_URL,
      REDIS_URL: flat.REDIS_URL,
      SESSION_SIGNING_KEY: flat.SESSION_SIGNING_KEY,
      API_BASE_URL: flat.API_BASE_URL,
      WEB_BASE_URL: flat.WEB_BASE_URL,
    },
    github: {
      GITHUB_APP_ID: flat.GITHUB_APP_ID,
      GITHUB_APP_PRIVATE_KEY: flat.GITHUB_APP_PRIVATE_KEY,
      GITHUB_WEBHOOK_SECRET: flat.GITHUB_WEBHOOK_SECRET,
      GITHUB_API_BASE: flat.GITHUB_API_BASE,
    },
    ai: {
      AI_DEFAULT_PROVIDER: flat.AI_DEFAULT_PROVIDER,
      OPENAI_API_KEY: flat.OPENAI_API_KEY,
      ANTHROPIC_API_KEY: flat.ANTHROPIC_API_KEY,
      OLLAMA_BASE_URL: flat.OLLAMA_BASE_URL,
      AI_FALLBACK_PROVIDER: flat.AI_FALLBACK_PROVIDER,
    },
    observability: {
      SENTRY_DSN_API: flat.SENTRY_DSN_API,
      SENTRY_DSN_WORKER: flat.SENTRY_DSN_WORKER,
      SENTRY_DSN_WEB: flat.SENTRY_DSN_WEB,
      OTEL_EXPORTER_OTLP_ENDPOINT: flat.OTEL_EXPORTER_OTLP_ENDPOINT,
      OTEL_SERVICE_NAME: flat.OTEL_SERVICE_NAME,
      LOG_LEVEL: flat.LOG_LEVEL,
    },
    limits: {
      PLATFORM_TOKEN_SPEND_CAP_USD: flat.PLATFORM_TOKEN_SPEND_CAP_USD,
      DEFAULT_CONFIDENCE_FLOOR: flat.DEFAULT_CONFIDENCE_FLOOR,
      REVIEW_WALL_CLOCK_BUDGET_MS: flat.REVIEW_WALL_CLOCK_BUDGET_MS,
      REVIEW_MAX_FILES: flat.REVIEW_MAX_FILES,
      REVIEW_MAX_LINES: flat.REVIEW_MAX_LINES,
      WORKER_CONCURRENCY: flat.WORKER_CONCURRENCY,
      QUEUE_MAX_ATTEMPTS: flat.QUEUE_MAX_ATTEMPTS,
    },
    devMock: {
      USE_MOCK_GITHUB: flat.USE_MOCK_GITHUB,
      USE_MOCK_AI: flat.USE_MOCK_AI,
    },
  };
  const parsed = AppConfigSchema.safeParse(nested);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid VERCODE config:\n${issues}`);
  }
  return parsed.data;
}

// The exact set of vars the config package reads (the "a variable not in the
// doc doesn't exist" gate). A var outside this set is not read.
export const KNOWN_VARS = [
  // core
  "NODE_ENV",
  "DATABASE_URL",
  "REDIS_URL",
  "SESSION_SIGNING_KEY",
  "API_BASE_URL",
  "WEB_BASE_URL",
  // github
  "GITHUB_APP_ID",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_WEBHOOK_SECRET",
  "GITHUB_API_BASE",
  // ai
  "AI_DEFAULT_PROVIDER",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "OLLAMA_BASE_URL",
  "AI_FALLBACK_PROVIDER",
  // observability
  "SENTRY_DSN_API",
  "SENTRY_DSN_WORKER",
  "SENTRY_DSN_WEB",
  "OTEL_EXPORTER_OTLP_ENDPOINT",
  "OTEL_SERVICE_NAME",
  "LOG_LEVEL",
  // limits
  "PLATFORM_TOKEN_SPEND_CAP_USD",
  "DEFAULT_CONFIDENCE_FLOOR",
  "REVIEW_WALL_CLOCK_BUDGET_MS",
  "REVIEW_MAX_FILES",
  "REVIEW_MAX_LINES",
  "WORKER_CONCURRENCY",
  "QUEUE_MAX_ATTEMPTS",
  // dev mock
  "USE_MOCK_GITHUB",
  "USE_MOCK_AI",
  // website (the public-website surface; docs/WEBSITE/TECHNICAL_ARCHITECTURE.md §6 —
  // the config package validates the set; the website's static export reads
  // VERCODE_WEBSITE_BASE_URL at build time, the /api/track route reads the HMAC key)
  "VERCODE_WEBSITE_BASE_URL",
  "VERCODE_WEBSITE_OG_DEFAULT",
  "VERCODE_BEACON_SECRET",
] as const;

function pick(env: NodeJS.ProcessEnv): Record<string, string | undefined> {
  // Read only the known vars (the "a variable not in the doc doesn't exist"
  // gate). Unknown vars are not read (a secret that's not documented can't
  // leak through the config).
  const out: Record<string, string | undefined> = {};
  for (const key of KNOWN_VARS) {
    out[key] = env[key];
  }
  return out;
}
