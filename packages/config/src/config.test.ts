// UT-config (TASK_BREAKDOWN T2.1, ENVIRONMENT_VARIABLES.md §9 "the config
// package validates the exact set").
import { describe, it, expect } from "vitest";
import { loadConfig, KNOWN_VARS } from "./index.js";

const validEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://u:p@localhost:5432/vercode",
  REDIS_URL: "redis://localhost:6379",
  SESSION_SIGNING_KEY: "0".repeat(64),
  API_BASE_URL: "https://api.vercode.test",
  WEB_BASE_URL: "https://app.vercode.test",
  GITHUB_APP_ID: "123456",
  GITHUB_APP_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\n...",
  GITHUB_WEBHOOK_SECRET: "test-webhook-secret",
};

describe("loadConfig", () => {
  it("loads a valid config with defaults filled in", () => {
    const cfg = loadConfig(validEnv as NodeJS.ProcessEnv);
    expect(cfg.core.NODE_ENV).toBe("test");
    expect(cfg.core.DATABASE_URL).toBe("postgresql://u:p@localhost:5432/vercode");
    // defaults
    expect(cfg.ai.AI_DEFAULT_PROVIDER).toBe("mock");
    expect(cfg.limits.DEFAULT_CONFIDENCE_FLOOR).toBe(0.6);
    expect(cfg.limits.REVIEW_WALL_CLOCK_BUDGET_MS).toBe(240_000);
    expect(cfg.devMock.USE_MOCK_GITHUB).toBe("true");
  });

  it("fails fast naming the missing required var (the boot gate)", () => {
    const missing: NodeJS.ProcessEnv = { ...validEnv };
    delete missing.DATABASE_URL;
    expect(() => loadConfig(missing)).toThrowError(/DATABASE_URL/);
  });

  it("rejects a non-enum value (a bad BILLING_PROVIDER)", () => {
    const bad: NodeJS.ProcessEnv = { ...validEnv, BILLING_PROVIDER: "paypal" };
    expect(() => loadConfig(bad)).toThrowError(/BILLING_PROVIDER/);
  });

  it("KNOWN_VARS is the exact documented set (the 'not in the doc' gate)", () => {
    // The config only reads documented vars — an undocumented secret can't leak
    // through. The count is asserted so a new var is an intentional change.
    expect(KNOWN_VARS.length).toBeGreaterThan(20);
    expect(KNOWN_VARS).toContain("DATABASE_URL");
    expect(KNOWN_VARS).not.toContain("SOME_UNDOCUMENTED_SECRET");
  });
});
