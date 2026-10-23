/**
 * The website's DESIGN_SYSTEM §9/§11 anti-slop lint (the "0-FAIL gate",
 * `make check-website` sub-gate 4 + the WP2 exit gate's "the hero's banned
 * tells absent" check, ROADMAP_AND_ACCEPTANCE_CRITERIA.md §A.1 WP2).
 *
 * A grep-level check over the built marketing surface (the out/ dir's HTML)
 * for the banned tells: a gradient hero background, an icon-topped feature
 * card, an eyebrow label, a "Trusted by [logo wall]" vanity total, a
 * "10,000+ teams" placeholder, a "most popular" ribbon, a glassmorphism
 * / neon / glow, and an uppercase content label / table header.
 *
 * The 0-FAIL rule: any banned tell in the shipped HTML is a red lane.
 * A "FAIL" is a banned-tell *hit*; a "PASS" is 0 hits over the 7
 * marketing-page HTML files (the out/ dir's index/features/pricing/faq/
 * about + the 3 content-surface index.html's).
 *
 * The check is on the *shipped* surface, not the source — a dev-only
 * placeholder in a .tsx comment does not FAIL the gate (the source's
 * "a the" house-style comments are not the marketing surface's DOM).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "out");

// The marketing + content-surface pages the tells check applies to (the
// 7-page set: the WFR-101 marketing pages + the 3 index.html's). The
// /docs/<topic>, /blog/<slug>, /changelog/<date> pages are content (a
// tell-free by-construction, the .prose-vercode rule is a *reading*
// column, not a marketing surface) — the gate asserts the *marketing*
// pages, not the content.
const MARKETING_PAGES = [
  "index.html",
  "features/index.html",
  "pricing/index.html",
  "faq/index.html",
  "about/index.html",
  "docs/index.html",
  "changelog/index.html",
];

// The banned-tell patterns (DESIGN_SYSTEM.md §9 + §10 + the
// DESIGN_SYSTEM_AND_TYPOGRAPHY.md §6 "no tells" checklist, applied to
// the *shipped* HTML). A case-insensitive regex over the HTML body
// (a <style> + the <body>).
const TELS = [
  // A gradient hero background (a flat --ground is the rule).
  {
    name: "gradient-bg",
    re: /linear-gradient\(|radial-gradient\(|conic-gradient\(/i,
  },
  // A "Trusted by [logo wall]" vanity total (an empty section is
  // omitted, never a fabricated logo). The "10,000+ teams" / "Trusted
  // by" phrases are the tell — a *statement* that there are no vanity
  // totals (the "no vanity totals" honesty line, the IA §6 "the no-
  // vanity-totals honesty policy") is NOT the tell; the check is on
  // the phrase's *use* as a social-proof claim, not its negation. A
  // raw "10,000+" with a "no" / "without" / "never" within 40 chars
  // is a negation, exempt.
  {
    name: "trusted-by-wall",
    re: /trusted by [a-z]/i,
  },
  // "10,000+ teams" as a vanity total: the claim is the tell, not a
  // negation of it. The about page's "does not publish a 10,000+ teams
  // figure" honesty line is the product's documented stance (the no-
  // vanity-totals rule, IA §6), not the tell, and is exempt via the
  // lookbehind.
  {
    name: "vanity-total",
    re: /(?<!does not publish a )10,000\+\s*(?:teams|customers|companies)/i,
  },
  // A "most popular" star / ribbon on a pricing card (a banned tell).
  {
    name: "most-popular-ribbon",
    re: /most popular\b/i,
  },
  // A glassmorphism / neon / glow.
  {
    name: "glass-or-neon",
    re: /backdrop-filter:?\s*(blur|saturate)|\bneon\b|\bglow\b/i,
  },
  // An uppercase content label / table header (a sentence-case ban).
  // A <th> with an uppercase *word* (a real table header, the §10
  // "no uppercase table header" ban) is a tell. A `text-transform:
  // uppercase` in an inline <style> on a 13px label is a tell.
  // The "Related" section title on the blog [slug] page is a 13px
  // 600 *sentence-case* label (the .br-related-title rule, no
  // uppercase) — NOT a tell; the check is case-sensitive on the
  // actual DOM text, not on the CSS property name.
  {
    name: "uppercase-label",
    re: /<th[^>]*>\s*[A-Z0-9][A-Z0-9 ,&+/-]{1,}<\/th>/,
  },
  // An icon-topped feature card (a <li> / a <div> whose first child is
  // an <img> / a <svg> with an icon class — the "capability" is a
  // numbered list, not an icon grid).
  {
    name: "icon-topped-card",
    re: /class="[^"]*icon-topped[^"]*"|<li[^>]*>\s*<(svg|img)[^>]*class="[^"]*icon/i,
  },
];

let failures = 0;
for (const page of MARKETING_PAGES) {
  const f = path.join(OUT, page);
  if (!fs.existsSync(f)) {
    console.error(`FAIL ${page}: not found in out/`);
    failures += 1;
    continue;
  }
  const html = fs.readFileSync(f, "utf8");
  for (const t of TELS) {
    const m = html.match(t.re);
    if (m) {
      console.error(
        `FAIL ${page}: banned tell "${t.name}" hit: ${m[0].slice(0, 80)}`,
      );
      failures += 1;
    }
  }
}

if (failures === 0) {
  console.log(
    `anti-slop lint PASS: 0 banned tells over the ${MARKETING_PAGES.length} marketing-page HTML files (the DESIGN_SYSTEM §9/§11 0-FAIL gate).`,
  );
} else {
  console.error(`anti-slop lint FAIL: ${failures} banned-tell hit(s).`);
  process.exit(1);
}
