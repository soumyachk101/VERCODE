import { defineWorkspace } from "vitest/config";

// Root vitest workspace: picks up every package/app's vitest config as they
// come into existence (M1+). A package that has no test files yet is simply
// not a project — no empty test suites.
export default defineWorkspace([
  "packages/*/vitest.config.ts",
  "apps/*/vitest.config.ts",
]);
