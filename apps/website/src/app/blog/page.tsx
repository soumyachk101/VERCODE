/**
 * /blog — the article index (INFORMATION_ARCHITECTURE_AND_PAGES.md §3.7).
 *
 * H1 "Notes on the pipeline" + a 1-sentence orientation + the article
 * list: a <time>-stamped 13px var(--faint) date, a 17px/600 title, a
 * 15px var(--muted) dek (the description field), a 13px tag row, and a
 * "N min read" computed at build time (~200 wpm from the word count).
 *
 * An ItemList JSON-LD of the published articles (STRUCTURED_DATA.md
 * §3.9's shape; last-10, `name` = the headline, `item` = the
 * /blog/<slug> URL).
 *
 * The filter (WFR-305): `status === "published"` only — a draft item is
 * never rendered at a public route and never appears in the sitemap.
 * generateStaticParams + the render filter both use publishedPosts().
 */
import {
  readBlog,
  publishedPosts,
  readingTime,
  type BlogPost,
} from "@/lib/content-store.js";
import { generateSchemaFor, type ListEntry } from "@/lib/schema-generator.js";
import { JsonLd } from "@/components/JsonLd.js";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blog — engineering notes",
  description:
    "Notes from the work: a routing change, a dedup fix, a confidence-floor tune. Each post cites the requirement it satisfies and the commit that carries it.",
};

/** The SSG param source for the /blog/<slug> detail pages (published only —
 *  the WFR-305 draft filter). */
export function generateStaticParams(): { slug: string }[] {
  return publishedPosts(readBlog()).map((p) => ({ slug: p.slug }));
}

export default function BlogIndexPage() {
  // The WFR-305 rule, applied at render time too: a draft is never
  // rendered — publishedPosts() is the single filter both paths use.
  const posts: BlogPost[] = publishedPosts(readBlog());
  const list: ListEntry[] = posts.slice(0, 10).map((p) => ({
    name: p.title,
    url: `/blog/${p.slug}/`,
  }));
  const blocks = generateSchemaFor({
    route: "/blog",
    itemList: { name: "VERCODE blog", entries: list },
  });

  return (
    <main className="reading-col" style={{ margin: "0 auto", padding: "4rem 1.5rem" }}>
      <style>{`
        .bl-bc { font-size: 13px; color: var(--faint); margin: 0 0 2rem; }
        .bl-orient { font-size: 16px; color: var(--muted); margin: 0 0 3rem; max-width: 40rem; }
        .bl article { padding: 1.75rem 0; border-top: 1px solid var(--rule); }
        .bl-meta { font-size: 13px; color: var(--faint); display: flex; gap: 0.75rem; margin-bottom: 0.375rem; flex-wrap: wrap; }
        .bl-meta time { font-variant-numeric: tabular-nums; }
        .bl-title { font-size: 17px; font-weight: 600; margin: 0 0 0.375rem; }
        .bl-title a { color: var(--text); text-decoration: none; }
        .bl-title a:hover { color: var(--accent-ink); }
        .bl-dek { font-size: 15px; color: var(--muted); margin: 0 0 0.5rem; line-height: 1.5; }
        .bl-tags { font-size: 13px; color: var(--faint); margin: 0; }
        .bl-tags span + span::before { content: " · "; }
      `}</style>

      <JsonLd blocks={blocks} />

      {/* The visible breadcrumb — "Blog" only (13px var(--faint)). */}
      <p className="bl-bc">Blog</p>
      <h1 style={{ fontSize: 32, fontWeight: 600, margin: "0 0 0.5rem" }}>
        Notes on the pipeline
      </h1>
      <p className="bl-orient">
        One claim each, supported with a measured figure and the product
        decision that carries it — the engineering notes behind how the review
        works, and why it works that way.
      </p>

      <div className="bl">
        {posts.map((p) => {
          // The reading time is computed at build time from the word count
          // (~200 wpm, a minimum of 1 minute — readingTime() in content-store).
          const mins = readingTime(p.body);
          return (
            <article key={p.slug}>
              <div className="bl-meta">
                <time dateTime={p.date}>{p.date}</time>
                <span>{mins} min read</span>
              </div>
              <h2 className="bl-title">
                <a href={`/blog/${p.slug}/`}>{p.title}</a>
              </h2>
              <p className="bl-dek">{p.description}</p>
              <p className="bl-tags">
                {p.tags.map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </p>
            </article>
          );
        })}
      </div>
    </main>
  );
}
