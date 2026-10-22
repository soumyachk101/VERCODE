import { defineWorkspace } from "vitest/config";

// Root vitest workspace: picks up every package/app's vitest config as they
// come into existence (M1+). A package that has no test files yet is simply
// not a project — no empty test suites.
export default defineWorkspace([
  "packages/*/vitest.config.ts",
  "apps/*/vitest.config.ts",
  // The security suite (docs/SECURITY/SECURITY_TEST_PLAN.md "all security
  // tests live in tests/security/") — a dedicated project so the cross-app
  // specs have their own tsconfig root.
  "tests/vitest.config.ts",
]);
