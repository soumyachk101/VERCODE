// The security-suite vitest project (docs/SECURITY/SECURITY_TEST_PLAN.md
// "All security tests live in tests/security/").
//
// A dedicated project so the cross-app security specs (they import source
// from apps/api + apps/worker + packages/*, so they can't live inside a
// single app's tsconfig rootDir) run as one gate. `root` is the monorepo
// root so the `tests/security/**` include pattern anchors there; third-party
// + workspace imports resolve up the directory tree to the repo root's
// node_modules (the pnpm layout) — exactly as the apps' own test runs do.
//
// The M8 full-suite agent folds tests/security into the full suite; this
// project exists so `pnpm test` runs the security gate today.

import { defineConfig } from "vitest/config";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "..");

export default defineConfig({
  test: {
    name: "@vercode/security",
    root: repoRoot,
    include: ["tests/security/**/*.test.ts"],
    exclude: ["**/node_modules/**"],
    environment: "node",
  },
});
