// The security-suite vitest project (docs/SECURITY/SECURITY_TEST_PLAN.md
// "All security tests live in tests/security/").
//
// A dedicated project so the cross-app security specs (they import source
// from apps/api + apps/worker + packages/*) run as one gate. `root` is the
// monorepo root so the `tests/security/**` include pattern anchors there.
//
// Module resolution: pnpm keeps each workspace package's deps inside
// apps/* / packages/* node_modules (not hoisted to the repo root). The specs
// import *source* files (apps/api/src/…, packages/…/src/index.ts) via
// relative paths, so Vite's dependency crawler re-resolves every transitive
// `@vercode/*` + third-party import from the importing source file's dir —
// which reaches the owning package's node_modules (the pnpm layout). No
// aliases are needed for that: the specs' *own* direct imports are the only
// ones Vite would otherwise resolve from tests/security's dir (which has no
// node_modules), so they're aliased here to the owning package's source /
// installed module — exactly the way each app's own test run resolves them.
//
// The M8 full-suite agent folds tests/security into the full suite; this
// project exists so `pnpm test` runs the security gate today.

import { defineConfig } from "vitest/config";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "..");
const apiNM = path.join(repoRoot, "apps", "api", "node_modules");
const pkg = (name: string) => path.join(repoRoot, "packages", name, "src", "index.ts");

// The spec's direct imports, aliased to where pnpm actually resolves them.
export default defineConfig({
  resolve: {
    alias: [
      { find: "fastify", replacement: path.join(apiNM, "fastify") },
      { find: "@prisma/client", replacement: path.join(apiNM, "@prisma", "client") },
      { find: "zod", replacement: path.join(apiNM, "zod") },
      { find: "@vercode/config", replacement: pkg("config") },
      { find: "@vercode/contracts", replacement: pkg("contracts") },
      { find: "@vercode/database", replacement: pkg("database") },
      { find: "@vercode/github", replacement: pkg("github") },
      { find: "@vercode/diff-engine", replacement: pkg("diff-engine") },
      { find: "@vercode/static-analysis", replacement: pkg("static-analysis") },
      { find: "@vercode/ai-providers", replacement: pkg("ai-providers") },
      { find: "@vercode/review-engine", replacement: pkg("review-engine") },
      { find: "@vercode/policy-engine", replacement: pkg("policy-engine") },
    ],
  },
  test: {
    name: "@vercode/security",
    root: repoRoot,
    include: ["tests/security/**/*.test.ts"],
    exclude: ["**/node_modules/**"],
    environment: "node",
  },
});
