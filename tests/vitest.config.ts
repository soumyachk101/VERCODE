// The standalone security-suite project (docs/SECURITY/SECURITY_TEST_PLAN.md
// "All security tests live in tests/security/").
//
// A dedicated vitest project so `pnpm test` (the workspace) picks up
// tests/security/* without the suites being glued to a single app's tsconfig
// rootDir (the security specs import across apps/api + apps/worker +
// packages/*, so they run in their own project). The M8 full-suite agent
// folds these into tests/e2e + tests/integration; this project stays.
//
// The specs import the *source* files of the monorepo (the app factories,
// the job handler, the engine) — no build step, no live Postgres/Redis/GitHub:
// everything is exercised through the mocked seams the apps already ship
// (apps/api/src/webhooks.test.ts's mockPrisma, apps/worker's in-memory DbClient).
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@vercode/security",
    include: ["tests/security/**/*.test.ts"],
    exclude: ["**/node_modules/**"],
    environment: "node",
    root: "..",
  },
});
