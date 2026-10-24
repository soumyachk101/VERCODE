/**
 * VERCODE website — the machine-readable surfaces: llms.txt, llms-full.txt,
 * sitemap.xml, robots.txt (WFR-103, WFR-401, SEO_AEO_GEO.md §1.3 + §4).
 *
 * The facts come from content/facts/product-facts.json (the single fact
 * source); the routes come from lib/site.ts's PAGES list. Nothing here is
 * hand-written prose, so a doc edit flows into every file.
 *
 * This module is build-time only (it reads the content store for the
 * sitemap's published-content entries) — it is imported from route
 * handlers, never from a client component.
 */
import { BASE_URL, SITE_NAME, TAGLINE, PAGES } from "./site.js";
import {
  getAllContent,
  publishedItems,
  type ContentItem,
} from "./content-store.js";
import factsJson from "../../content/facts/product-facts.json";

interface Fact {
  id: string;
  label: string;
  value: string;
  unit: string;
  sentence: string;
  source: string;
  asOf: string;
}

interface FactGroup {
  heading: string;
  facts: Fact[];
}

const FACTS: { asOf: string; groups: FactGroup[] } = factsJson as {
  asOf: string;
  groups: FactGroup[];
};

/** Absolute URL for a site route. */
function absUrl(route: string): string {
  return route === "/" ? BASE_URL : `${BASE_URL}${route}`;
}

// ---------------------------------------------------------------------------
// llms.txt
// ---------------------------------------------------------------------------

/**
 * The minimal machine-readable index: product name, tagline, the fact-group
 * headings with the top fact sentence per group, and links to the canonical
 * pages. The order mirrors the page (hero → CTA).
 */
export function buildLlmsTxt(): string {
  const lines: string[] = [];
  lines.push(`# ${SITE_NAME}`);
  lines.push("");
  lines.push(`> ${TAGLINE}`);
  lines.push("");

  for (const group of FACTS.groups) {
    lines.push(`## ${group.heading}`);
    const top = group.facts[0];
    if (top) lines.push(`- ${top.sentence}`);
    lines.push("");
  }

  lines.push("## Where to read more");
  for (const page of PAGES) {
    lines.push(`- ${page.title}: ${absUrl(page.route)}`);
  }
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// llms-full.txt
// ---------------------------------------------------------------------------

/**
 * The full fact set: every fact's complete sentence, grouped under its
 * heading, plus a "# URLs" section listing the canonical PAGES list.
 */
export function buildLlmsFullTxt(): string {
  const lines: string[] = [];
  lines.push(`# ${SITE_NAME}`);
  lines.push("");
  lines.push(`> ${TAGLINE}`);
  lines.push("");

  for (const group of FACTS.groups) {
    lines.push(`## ${group.heading}`);
    for (const fact of group.facts) {
      lines.push(`- ${fact.sentence}`);
    }
    lines.push("");
  }

  lines.push("# URLs");
  for (const page of PAGES) {
    lines.push(`- ${page.title}: ${absUrl(page.route)}`);
  }
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// sitemap.xml
// ---------------------------------------------------------------------------

/** The honest per-surface changefreq (SEO_AEO_GEO.md §1.3's table). */
function changefreqFor(route: string): string {
  if (route.startsWith("/docs")) return "daily";
  if (route.startsWith("/blog")) return "monthly";
  if (route.startsWith("/changelog")) return "weekly";
  if (route === "/faq" || route.startsWith("/legal/")) return "monthly";
  return "weekly";
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** The route of a content item, given its collection. */
function contentRoute(kind: string, item: ContentItem): string {
  return kind === "blog"
    ? `/blog/${item.slug}`
    : kind === "changelog"
      ? `/changelog/${item.slug}`
      : kind === "docs"
        ? `/docs/${item.slug}`
        : `/legal/${item.slug}`;
}

/**
 * Build sitemap.xml from the PAGES route list + every published content item.
 *
 * `content` is optional so callers that only need the marketing-page routes
 * (or that have already loaded the content store) can skip the disk read;
 * the SSG generator passes the loaded store in.
 *
 * The PAGES list is the source of truth for the route set; a mismatch with
 * the actual app/ directories is caught by the build-time count assertion in
 * the website test lane, not here.
 */
export function buildSitemapXml(
  lastmod: string,
  content?: ReturnType<typeof getAllContent>,
): string {
  const urls: { loc: string; changefreq: string; lastmod: string }[] = [];
  const seen = new Set<string>();

  for (const page of PAGES) {
    if (seen.has(page.route)) continue;
    seen.add(page.route);
    urls.push({
      loc: absUrl(page.route),
      changefreq: changefreqFor(page.route),
      lastmod,
    });
  }

  if (!content) {
    try {
      content = getAllContent();
    } catch {
      content = { blog: [], docs: [], changelog: [], faq: [], legal: [] };
    }
  }

  const collections: [keyof typeof content, string][] = [
    ["blog", "blog"],
    ["docs", "docs"],
    ["changelog", "changelog"],
    ["legal", "legal"],
  ];

  for (const [key, kind] of collections) {
    for (const item of publishedItems(content[key])) {
      const route = contentRoute(kind, item);
      if (seen.has(route)) continue;
      seen.add(route);
      urls.push({
        loc: absUrl(route),
        changefreq: changefreqFor(route),
        lastmod: item.front.updated ?? item.front.date ?? lastmod,
      });
    }
  }

  const body = urls
    .map(
      (u) =>
        `  <url>\n    <loc>${esc(u.loc)}</loc>\n    <lastmod>${esc(u.lastmod)}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n  </url>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

// ---------------------------------------------------------------------------
// robots.txt
// ---------------------------------------------------------------------------

/** Allow-all robots.txt with the sitemap pointer and the raw-source block. */
export function buildRobotsTxt(): string {
  return [
    "User-agent: *",
    "Allow: /",
    `Sitemap: ${BASE_URL}/sitemap.xml`,
    "Disallow: /docs/source",
    "",
  ].join("\n");
}
