// The security-suite vitest project (docs/SECURITY/SECURITY_TEST_PLAN.md
// "All security tests live in tests/security/").
//
// A dedicated project so the cross-app security specs (they import source
// from apps/api + apps/worker + packages/*) run as one gate. `root` is the
// monorepo root so the `tests/security/**` include pattern anchors there.
//
// The specs import source via relative paths (apps/api/src/…, the
// packages' src/…), which is how they run under the same pnpm install layout
// as each app's own test suite — third-party + workspace deps resolve up
// the directory tree to the owning package's node_modules. No aliases
// needed: Vite re-resolves a transitive import from the importing file's
// directory (the pnpm layout), exactly like `pnpm test` does per-app.
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
