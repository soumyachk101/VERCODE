// The security-suite vitest project (docs/SECURITY/SECURITY_TEST_PLAN.md
// "All security tests live in tests/security/").
//
// A dedicated project so the cross-app security specs (they import source
// from apps/api + apps/worker + packages/*, so they can't live inside a
// single app's tsconfig rootDir) run as one gate. `root` is the monorepo
// root so the `tests/security/**` include pattern anchors there.
//
// Module resolution: pnpm keeps each workspace package's deps inside
// apps/* / packages/* node_modules (not hoisted to the repo root), so the
// specs' third-party imports (fastify, @prisma/client, …) resolve from the
// app that owns them. The `resolve.alias` + `server.deps` wiring below
// makes vite resolve those from the owning app's node_modules, exactly the
// way apps/api's and apps/worker's own test runs do.
//
// The M8 full-suite agent folds tests/security into the full suite; this
// project exists so `pnpm test` runs the security gate today.

import { defineConfig } from "vitest/config";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "..");
const apiDir = path.join(repoRoot, "apps", "api");
const workerDir = path.join(repoRoot, "apps", "worker");

// A map of the packages the specs import → the app that owns them (where
// pnpm installed them). `fastify`/`@prisma/client`/the github+config
// packages live under apps/api; the worker's seam imports live under
// apps/worker. The aliased node_modules dirs let vite's resolver find them.
export default defineConfig({
  resolve: {
    alias: {
      // A the api's deps (fastify, @prisma/client, the api's own source
      // imports the specs pull in transitively).
      fastify: path.join(apiDir, "node_modules", "fastify"),
      "@prisma/client": path.join(apiDir, "node_modules", "@prisma", "client"),
    },
  },
  test: {
    name: "@vercode/security",
    root: repoRoot,
    include: ["tests/security/**/*.test.ts"],
    exclude: ["**/node_modules/**"],
    environment: "node",
    // A let vite load the aliased packages (they're ESM/CJS mixed; the
    // `server.deps` config makes vitest inline the app-owned deps so the
    // module graph resolves as if running from the owning app).
    server: {
      deps: {
        inline: [
          /apps\/api\/node_modules/,
          /apps\/worker\/node_modules/,
        ],
      },
    },
  },
});
