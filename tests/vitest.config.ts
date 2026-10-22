// The security-suite vitest project (docs/SECURITY/SECURITY_TEST_PLAN.md
// "All security tests live in tests/security/").
//
// A dedicated project so the cross-app security specs (they import source
// from apps/api + apps/worker + packages/*) run as one gate. `root` is the
// monorepo root so the `tests/security/**` include pattern anchors there.
//
// Module resolution: pnpm keeps each workspace package's deps inside
// apps/* / packages/* node_modules (not hoisted to the repo root), and
// tests/security/ has no node_modules of its own. The specs' *direct*
// imports (fastify, @prisma/client, the @vercode/* workspace packages) are
// aliased below to where pnpm actually installed / defined them; every
// transitive import (from the source files the specs pull in) resolves the
// normal way, up the tree to the owning package's node_modules.
//
// The M8 full-suite agent folds tests/security into the full suite; this
// project exists so `pnpm test` runs the security gate today.

import { defineConfig } from "vitest/config";
import path from "node:path";
import fs from "node:fs";

const repoRoot = path.resolve(__dirname, "..");
const apiNM = path.join(repoRoot, "apps", "api", "node_modules");
const pkg = (name: string) => path.join(repoRoot, "packages", name, "src", "index.ts");

// A bare-package alias that points at the *exact* installed copy under the
// api's node_modules (pnpm's symlink into the .pnpm store). A `readdir`
// would not be needed — the app dir's node_modules is a real dir of symlinks.
const nm = (name: string) => path.join(apiNM, name);

export default defineConfig({
  resolve: {
    alias: [
      { find: /^fastify$/, replacement: nm("fastify") },
      { find: /^@prisma\/client$/, replacement: nm("@prisma/client") },
      { find: /^zod$/, replacement: nm("zod") },
      { find: /^@vercode\/config$/, replacement: pkg("config") },
      { find: /^@vercode\/contracts$/, replacement: pkg("contracts") },
      { find: /^@vercode\/database$/, replacement: pkg("database") },
      { find: /^@vercode\/github$/, replacement: pkg("github") },
      { find: /^@vercode\/diff-engine$/, replacement: pkg("diff-engine") },
      { find: /^@vercode\/static-analysis$/, replacement: pkg("static-analysis") },
      { find: /^@vercode\/ai-providers$/, replacement: pkg("ai-providers") },
      { find: /^@vercode\/review-engine$/, replacement: pkg("review-engine") },
      { find: /^@vercode\/policy-engine$/, replacement: pkg("policy-engine") },
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
        // A inline the app-owned deps (so the module graph resolves as if
        // running from the owning app's node_modules).
        inline: [
          /apps\/api\/node_modules/,
          /apps\/worker\/node_modules/,
          /packages\/[^/]+\/node_modules/,
        ],
      },
    },
  },
});
