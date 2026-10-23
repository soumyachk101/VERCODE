/**
 * /blog/<slug> — the article page (INFORMATION_ARCHITECTURE_AND_PAGES.md §3.7).
 *
 * A WFR-305 filter: only `status === "published"` articles are generated
 * (a draft item is never rendered and never in the sitemap). The render:
 * a <time>-stamped 13px var(--faint) byline line ("Published <date> ·
 * N min read · the VERCODE team"), a 32px/600 H1, a 16px var(--muted)
 * dek, the body via renderMarkdownToReact into a 720px (45rem) reading
 * column with a right-rail TOC (when a post has more than 3 sections),
 * an end-of-article "Related" block (the ≥ 1 docs link rule, IA §5), and
 * the Article JSON-LD (STRUCTURED_DATA.md §3.7's shape).
 *
 * The React-node markdown renderer (renderMarkdownToReact) lives in
 * src/lib/markdown.tsx — no external dependency (the static export
 * carries no markdown lib; the string-HTML variant renderMarkdown is the
 * sibling's docs pages' job).
 */
import { notFound } from "next/navigation";
import {
  readBlog,
  publishedPosts,
  readingTime,
} from "@/lib/content-store.js";
import { renderMarkdownToReact } from "@/lib/markdown.js";
import { generateSchemaFor } from "@/lib/schema-generator.js";
import { JsonLd } from "@/components/JsonLd.js";

export function generateStaticParams(): { slug: string }[] {
  // WFR-305: published articles only (a draft is never generated).
  return publishedPosts(readBlog()).map((p) => ({ slug: p.slug }));
}

/** A post's ## / ### headings, in document order (the right-rail TOC's
 *  input, and the "> 3 sections" TOC-showing rule). The id is a slug of
 *  the heading text — the same slug the renderer's heading ids carry,
 *  so the anchor jump works. */
function headingSections(body: string): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  for (const line of body.split("\n")) {
    if (line.startsWith("## ") || line.startsWith("### ")) {
      const label = line.replace(/^#{2,3} /, "").trim();
      out.push({
        id: label
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, "")
          .replace(/^-+|-+$/g, ""),
        label,
      });
    }
  }
  return out;
}

export default async function BlogArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // The WFR-305 filter, applied at render time too (a draft is not found).
  const post = publishedPosts(readBlog()).find((p) => p.slug === slug);
  if (!post) notFound();

  const minutes = readingTime(post.body);
  const sections = headingSections(post.body);
  const showToc = sections.length > 3;
  const blocks = generateSchemaFor({
    route: `/blog/${post.slug}`,
    title: post.title,
    metaDescription: post.description,
    author: post.author,
    datePublished: post.date,
    dateModified: post.updated ?? post.date,
    tags: post.tags,
    ogImage: post.ogImage,
    breadcrumbTrail: [
      { name: "Vercode", url: "/" },
      { name: "Blog", url: "/blog/" },
      { name: post.title, url: `/blog/${post.slug}/` },
    ],
  });

  // The "Related" end-of-article block — the IA §5 ≥ 1 docs link rule.
  // The post's own related links live in its Markdown; this is the
  // canonical per-tag jump set, so every article carries the path even
  // if the in-body links are reorganized.
  const relatedDocs = post.tags.includes("quotas")
    ? [
        {
          href: "/docs/quotas/",
          label: "The quotas docs — per-plan limits and the skip-with-notice rule",
        },
        {
          href: "/pricing/",
          label: "The pricing page — the four plans with their literal numbers",
        },
      ]
    : [
        {
          href: "/docs/rules/",
          label: "The rules docs — custom review rules and confidence floors",
        },
        {
          href: "/docs/security/",
          label: "The security docs — least-privilege scopes, encryption, retention",
        },
      ];
  const ctaHref = post.tags.includes("quotas") ? "/pricing/" : "/docs/rules/";
  const ctaLabel = post.tags.includes("quotas")
    ? "See the pricing page"
    : "Read the docs";

  return (
    <main
      style={{
        display: "grid",
        gridTemplateColumns: showToc ? "minmax(0,45rem) 11rem" : "minmax(0,45rem)",
        gap: "3rem",
        margin: "0 auto",
        padding: "4rem 1.5rem",
        maxWidth: "58rem",
        justifyContent: "center",
      }}
    >
      <style>{`
        .br { max-width: 45rem; }
        .br-bc { font-size: 13px; color: var(--faint); margin: 0 0 2rem; }
        .br-bc a { color: var(--faint); text-decoration: none; }
        .br-bc a:hover { color: var(--accent-ink); }
        .br-byline { font-size: 13px; color: var(--faint); margin: 0 0 1rem; }
        .br h1 { font-size: 32px; font-weight: 600; line-height: 1.2; margin: 0 0 0.75rem; }
        .br-dek { font-size: 16px; color: var(--muted); margin: 0 0 2.5rem; }
        .br h2 { font-size: 22px; font-weight: 600; margin: 2.5rem 0 0.75rem; scroll-margin-top: 4rem; }
        .br h3 { font-size: 17px; font-weight: 600; margin: 1.5rem 0 0.5rem; scroll-margin-top: 4rem; }
        .br p { font-size: 16px; line-height: 1.6; margin: 0 0 1rem; }
        .br li { font-size: 16px; margin-bottom: 0.375rem; }
        .br a { color: var(--accent-ink); }
        .br code { font-family: var(--font-mono); font-size: 0.85em; background: var(--raised); padding: 0.1em 0.35em; border-radius: var(--radius-chip); }
        .code-block { background: var(--raised); border: 1px solid var(--hard-border); border-radius: var(--radius-card); padding: 1rem; overflow-x: auto; font-family: var(--font-mono); font-size: 13px; line-height: 1.6; margin: 1.5rem 0; }
        .code-block code { background: none; padding: 0; font-size: inherit; }
        .br blockquote { margin: 1.5rem 0; padding: 0.5rem 1rem; border-left: 2px solid var(--accent-color); background: var(--accent-soft); color: var(--muted); }
        .br hr { display: none; }
        .br-related { margin-top: 3rem; padding-top: 1.5rem; font-size: 16px; color: var(--muted); }
        .br-related-title { font-size: 13px; font-weight: 600; letter-spacing: 0.05em; color: var(--faint); margin: 0 0 0.5rem; }
        .br-related ul { margin: 0 0 1rem; padding-left: 1.25rem; }
        .br-related a { color: var(--accent-ink); }
        .br-cta { font-size: 16px; margin-top: 1rem; }
        .br-cta a { color: var(--accent-ink); font-weight: 500; }
        .br-toc { font-size: 13px; }
        .br-toc-title { font-weight: 600; color: var(--muted); margin: 0 0 0.5rem; }
        .br-toc a { display: block; padding: 0.25rem 0; color: var(--faint); text-decoration: none; }
        .br-toc a:hover { color: var(--accent-ink); }
      `}</style>

      <article className="br prose-vercode">
        {/* The 3-level WFR-104 breadcrumb rendered visible: root → Blog → title. */}
        <p className="br-bc">
          <a href="/">Vercode</a> / <a href="/blog/">Blog</a> / {post.title}
        </p>

        {/* The 13px var(--faint) byline: a <time>-stamped
            "Published <date> · N min read · <author>". */}
        <p className="br-byline">
          Published <time dateTime={post.date}>{post.date}</time> ·{" "}
          {minutes} min read · {post.author}
        </p>

        <h1>{post.title}</h1>
        <p className="br-dek">{post.description}</p>

        {/* The body — a 720px (45rem) reading column, 1.6 line height.
            The shared React-node renderer (markdown.tsx's
            renderMarkdownToReact, the lib agent's module) into the
            .prose-vercode article styles. */}
        <div className="br-body">{renderMarkdownToReact(post.body)}</div>

        {/* The "Related" end-of-article block — the IA §5 ≥ 1 docs link
            rule; the in-body related links + the canonical jump set. */}
        <div className="br-related">
          <p className="br-related-title">Related</p>
          <ul>
            {relatedDocs.map((d) => (
              <li key={d.href}>
                <a href={d.href}>{d.label}</a>
              </li>
            ))}
          </ul>
          <p className="br-cta">
            <a href={ctaHref}>{ctaLabel}</a>
          </p>
        </div>

        <JsonLd blocks={blocks} />
      </article>

      {/* The right-rail TOC — only when the post has more than 3
          sections (the docs-page TOC rule, IA §3.5, applied to §3.7). */}
      {showToc && (
        <nav className="br-toc" aria-label="On this page">
          <p className="br-toc-title">On this page</p>
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`}>
              {s.label}
            </a>
          ))}
        </nav>
      )}
    </main>
  );
}
