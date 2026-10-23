/**
 * Emission of the static SEO assets (WFR-103 + WFR-401): sitemap.xml,
 * robots.txt, llms.txt, llms-full.txt.
 *
 * A `next build` for `output: "export"` copies `public/` verbatim — the
 * files below are emitted into `public/` and the static export picks them
 * up. The `public/` files are the checked-in copy (a hand-edit is caught
 * by the drift test in tests/website.test.ts).
 *
 * Run: node scripts/generate-static-assets.mjs   (from apps/website/)
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");

// The lib modules are TS; run the emitter via tsx (a devDep in the repo
// root — the `tsx --tsconfig tests/tsconfig.json` pattern, `Makefile`'s
// `benchmark` target). The generated .mjs file lives next to the lib so
// the relative import resolves.
writeFileSync(
  path.join(ROOT, "scripts", "_emit.mts"),
  `import { buildLlmsTxt, buildLlmsFullTxt, buildSitemapXml, buildRobotsTxt } from "../src/lib/llms.js";
import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
fs.writeFileSync(path.join(root, "public", "llms.txt"), buildLlmsTxt());
fs.writeFileSync(path.join(root, "public", "llms-full.txt"), buildLlmsFullTxt());
fs.writeFileSync(path.join(root, "public", "sitemap.xml"), buildSitemapXml("2026-10-23"));
fs.writeFileSync(path.join(root, "public", "robots.txt"), buildRobotsTxt());
console.log("emitted public/sitemap.xml + robots.txt + llms.txt + llms-full.txt");
`,
);

try {
  execSync(
    `npx tsx --tsconfig tsconfig.json scripts/_emit.mts`,
    { cwd: ROOT, stdio: "inherit" },
  );
} finally {
  // Remove the transient emitter (the .mts is a build artifact, not a
  // checked-in source).
  try {
    writeFileSync; // no-op, keep the import used
  } catch {
    /* ignore */
  }
  execSync(`rm -f scripts/_emit.mts`, { cwd: ROOT });
}
