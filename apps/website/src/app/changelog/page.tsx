/**
 * /changelog — the reverse-chronological feed (INFORMATION_ARCHITECTURE_AND_PAGES.md §3.6).
 *
 * H1 + a 1-sentence orientation + the feed, newest first. Each entry is an
 * <article>: a <time datetime> 13px hsl(var(--faint)) line, a semver mono chip,
 * a 17px/600 title, the 16px 1-sentence summary, and the sections as a 13px
 * group-label + <ul> of bullets.
 *
 * An ItemList JSON-LD of the latest 10 releases (STRUCTURED_DATA.md §3.9's
 * shape, WFR-302 — each element a pointer to /changelog/<date>).
 *
 * The internal-link rule (IA §5): a changelog entry links to the docs for
 * each behavioral change. The bullet doc-paths are backtick-quoted
 * repo-relative paths, so each bullet renders with its docs/ path linkified
 * to the canonical /docs/ equivalent where sensible (a manual link, not
 * auto-linked — the path → route map is the entry's own, kept here).
 */
import {
  readChangelog,
  type ChangelogEntry,
} from "@/lib/content-store.js";
import { generateSchemaFor, type ListEntry } from "@/lib/schema-generator.js";
import { JsonLd } from "@/components/JsonLd.js";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Changelog — dated releases",
  description:
    "Every release in order, oldest at the bottom: the feature added, the behavior changed, and the date, so a reader can jump to the version a team actually runs.",
};

/** The SSG param source for the /changelog/<date> detail pages. */
export function generateStaticParams(): { date: string }[] {
  return readChangelog()
    .filter((e) => e.status === "published")
    .map((e) => ({ date: e.date }));
}

/** Split a body into its "## Section" groups; the bullets are the items.
 *  The author's `<!-- U-item -->` comment inside the body is stripped
 *  (it is an internal note, not rendered content). */
function sectionsOf(body: string): { name: string; items: string[] }[] {
  const clean = body.replace(/<!--[\s\S]*?-->/g, "");
  const sections: { name: string; items: string[] }[] = [];
  for (const block of clean.split(/\n(?=## )/)) {
    const m = block.match(/^## (.+)\n?([\s\S]*)$/);
    if (!m) continue;
    const name = m[1].trim();
    const items = m[2]
      .split("\n")
      .map((l) => l.replace(/^[-*] ?/, "").trim())
      .filter((l) => l.length > 0);
    sections.push({ name, items });
  }
  return sections;
}

/**
 * The §5 link rule, applied manually: a backtick-quoted docs/ path in a
 * bullet becomes a link to its canonical /docs/ equivalent where a
 * sensible target exists. The map is hand-maintained per the house rule
 * ("a manual link, the §5 rule") — no auto-linker.
 */
const DOCS_LINKS: Record<string, string> = {
  "docs/DOCUMENTATION_REVIEW.md": "/docs/",
  "docs/TECHNICAL/REVIEW_ENGINE_SPEC.md": "/docs/rules/",
  "docs/TECHNICAL/ERROR_HANDLING.md": "/docs/quotas/",
  "docs/BUSINESS/USAGE_QUOTAS.md": "/docs/quotas/",
  "docs/DESIGN/PAGE_SPECIFICATIONS.md": "/docs/quotas/",
  "docs/PRODUCT/PRD.md": "/docs/",
  "docs/TESTING/AI_EVALUATION.md": "/docs/rules/",
};

/** Render one bullet: backtick docs-paths linkify to /docs/ equivalents. */
function renderBullet(item: string): ReactNode {
  const parts: ReactNode[] = [];
  const re = /`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(item)) !== null) {
    if (m.index > last) parts.push(item.slice(last, m.index));
    const path = m[1];
    const target = DOCS_LINKS[path];
    if (target) {
      parts.push(
        <a key={k++} href={target}>
          {path}
        </a>,
      );
    } else {
      parts.push(
        <code key={k++} className="mono">
          {path}
        </code>,
      );
    }
    last = m.index + m[0].length;
  }
  parts.push(item.slice(last));
  return parts;
}

export default function ChangelogIndexPage() {
  // Newest first (the feed's order; the WFR-305 published filter).
  const entries: ChangelogEntry[] = readChangelog().filter(
    (e) => e.status === "published",
  );
  const list: ListEntry[] = entries.slice(0, 10).map((e) => ({
    name: `v${e.version} — ${e.title}`,
    url: `/changelog/${e.date}/`,
  }));
  const blocks = generateSchemaFor({
    route: "/changelog",
    itemList: { name: "VERCODE changelog", entries: list },
  });

  return (
    <main className="reading-col" style={{ margin: "0 auto", padding: "4rem 1.5rem" }}>
      <style>{`
        .cl-bc { font-size: 13px; color: hsl(var(--faint)); margin: 0 0 2rem; }
        .cl-orient { font-size: 16px; color: hsl(var(--muted)); margin: 0 0 3rem; max-width: 40rem; }
        .cl article { padding: 1.75rem 0; }
        .cl-meta { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem; }
        .cl-time { font-size: 13px; color: hsl(var(--faint)); }
        .cl-chip { font-family: var(--font-mono); font-size: 12px; padding: 2px 8px; border: 1px solid var(--hard-border); border-radius: var(--radius-chip); color: hsl(var(--muted)); }
        .cl-title { font-size: 17px; font-weight: 600; margin: 0 0 0.375rem; }
        .cl-title a { color: var(--text); text-decoration: none; }
        .cl-title a:hover { color: var(--accent-ink); }
        .cl-summary { font-size: 15px; color: hsl(var(--muted)); margin: 0 0 1rem; line-height: 1.5; }
        .cl-sec { font-size: 13px; font-weight: 600; letter-spacing: 0.05em; color: hsl(var(--faint)); margin: 0 0 0.375rem; }
        .cl ul { margin: 0; padding-left: 1.25rem; font-size: 16px; color: var(--text); line-height: 1.5; }
        .cl li { margin-bottom: 0.375rem; }
        .cl li a { color: var(--accent-ink); }
        .cl li code { font-family: var(--font-mono); font-size: 0.85em; background: var(--raised); padding: 0.1em 0.35em; border-radius: var(--radius-chip); }
        .cl-docs { margin-top: 3rem; padding-top: 1.5rem; font-size: 16px; color: hsl(var(--muted)); }
        .cl-docs a { color: var(--accent-ink); }
      `}</style>

      <JsonLd blocks={blocks} />

      {/* The visible breadcrumb — "Changelog" only (13px hsl(var(--faint))). */}
      <p className="cl-bc">Changelog</p>
      <h1 style={{ fontSize: 32, fontWeight: 600, margin: "0 0 0.5rem" }}>
        Changelog
      </h1>
      <p className="cl-orient">
        Every release in order, newest at the top, oldest at the bottom — the
        version, the date, and what changed, so a team can jump to the version
        they actually run.
      </p>

      <div className="cl">
        {entries.map((e) => (
          <article key={e.date}>
            <div className="cl-meta">
              <time dateTime={e.date} className="cl-time">{e.date}</time>
              <span className="cl-chip">v{e.version}</span>
            </div>
            <h2 className="cl-title">
              <a href={`/changelog/${e.date}/`}>{e.title}</a>
            </h2>
            <p className="cl-summary">{e.summary}</p>
            {sectionsOf(e.body).map((s) =>
              s.items.length > 0 ? (
                <div key={s.name}>
                  <p className="cl-sec">{s.name}</p>
                  <ul>
                    {s.items.map((item, ix) => (
                      <li key={ix}>{renderBullet(item)}</li>
                    ))}
                  </ul>
                </div>
              ) : null,
            )}
          </article>
        ))}
      </div>

      {/* IA §5's internal-link rule, made explicit at the feed level: the
          bullets above linkify the docs/ paths to their /docs/ equivalents,
          and this line is the canonical jump set for the two entries. */}
      <p className="cl-docs">
        The docs behind these releases: the{" "}
        <a href="/docs/rules/">rules and pipeline docs</a> and the{" "}
        <a href="/docs/quotas/">quota docs</a>.
      </p>
    </main>
  );
}
