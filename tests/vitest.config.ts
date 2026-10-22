// The security-suite vitest project (docs/SECURITY/SECURITY_TEST_PLAN.md
// "All security tests live in tests/security/").
//
// A dedicated project so the cross-app security specs (they import source
// from apps/api + apps/worker + packages/*) run as one gate. `root` is the
// monorepo root so the `tests/security/**` include pattern anchors there.
//
// Module resolution: pnpm keeps each workspace package's deps inside
// apps/* / packages/* node_modules (not hoisted to the repo root), so the
// specs' third-party + workspace imports resolve from the owning package's
// node_modules. The `resolve.alias` below points vite at the owning
// package's source / installed module (exactly the way each app's own test
// run resolves it), so the specs run without needing a hoisted root layout.
//
// The M8 full-suite agent folds tests/security into the full suite; this
// project exists so `pnpm test` runs the security gate today.

import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiNM = path.join(repoRoot, "apps", "api", "node_modules");

// The spec's direct imports, aliased to where pnpm actually installed them.
// Workspace packages → their source entry (the monorepo's `main` points at
// ./src/index.ts); third-party → the owning app's node_modules.
export default defineConfig({
  resolve: {
    alias: [
      { find: "fastify", replacement: path.join(apiNM, "fastify") },
      { find: "@prisma/client", replacement: path.join(apiNM, "@prisma", "client") },
      { find: "@fastify/cookie", replacement: path.join(apiNM, "@fastify", "cookie") },
      { find: "@fastify/sensible", replacement: path.join(apiNM, "@fastify", "sensible") },
      { find: "argon2", replacement: path.join(apiNM, "argon2") },
      { find: "ioredis", replacement: path.join(apiNM, "ioredis") },
      { find: "bullmq", replacement: path.join(apiNM, "bullmq") },
      // A the spec imports these workspace packages directly.
      { find: "@vercode/config", replacement: path.join(repoRoot, "packages", "config", "src", "index.ts") },
      { find: "@vercode/contracts", replacement: path.join(repoRoot, "packages", "contracts", "src", "index.ts") },
      { find: "@vercode/database", replacement: path.join(repoRoot, "packages", "database", "src", "index.ts") },
      { find: "@vercode/github", replacement: path.join(repoRoot, "packages", "github", "src", "index.ts") },
      { find: "@vercode/diff-engine", replacement: path.join(repoRoot, "packages", "diff-engine", "src", "index.ts") },
      { find: "@vercode/static-analysis", replacement: path.join(repoRoot, "packages", "static-analysis", "src", "index.ts") },
      { find: "@vercode/ai-providers", replacement: path.join(repoRoot, "packages", "ai-providers", "src", "index.ts") },
      { find: "@vercode/review-engine", replacement: path.join(repoRoot, "packages", "review-engine", "src", "index.ts") },
      { find: "@vercode/policy-engine", replacement: path.join(repoRoot, "packages", "policy-engine", "src", "index.ts") },
      // A zod is shared across packages; point at the api's copy.
      { find: "zod", replacement: path.join(apiNM, "zod") },
    ],
  },
  test: {
    name: "@vercode/security",
    root: repoRoot,
    include: ["tests/security/**/*.test.ts"],
    exclude: ["**/node_modules/**"],
    environment: "node",
    server: {
      deps: {
        // A inline the app-owned deps so the module graph resolves as if
        // running from the owning app's node_modules.
        inline: [
          /apps\/api\/node_modules/,
          /apps\/worker\/node_modules/,
          /packages\/[^/]+\/node_modules/,
        ],
      },
    },
  },
});
