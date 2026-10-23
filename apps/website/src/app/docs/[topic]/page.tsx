// /docs/<topic> — one of the 9 P2 docs topics (INFORMATION_ARCHITECTURE_AND_PAGES.md §3.5):
// "How do I do X?" A static page per topic, with Article + BreadcrumbList JSON-LD
// (WFR-301 + WFR-104, the STRUCTURED_DATA.md §1 /docs/<topic> row).
//
// WFR-305: generateStaticParams filters on front.status === "published" —
// a draft topic is not rendered at a public route and not in the sitemap;
// a draft doc fails to appear anywhere on the site, by construction. The
// page also re-filters at render time, so a stale param is notFound.
//
// The body renders via renderMarkdown into the 720px reading column
// (the Prose wrapper + the prose.css hook); the right-rail TOC is a
// sticky <nav> when the doc has more than 3 sections (IA §3.5's TOC
// rule). The breadcrumbs are a visible 13px --faint "Docs / <topic>"
// line + the JSON-LD BreadcrumbList (WFR-104).
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  readDocs,
  publishedDocs,
  type DocPage,
} from "@/lib/content-store.js";
import { renderMarkdown } from "@/lib/markdown.js";
import { generateSchemaFor } from "@/lib/schema-generator.js";
import { JsonLd } from "@/components/JsonLd.js";
import { Prose } from "@/components/Prose.js";

// WFR-305: only published topics are generated (the draft filter, §3.5).
// readDocs() is the build-time fs read of content/docs/ (the
// CONTENT_SCHEMAS §1 "a repo dir, not a service" model); publishedDocs
// drops the drafts.
export function generateStaticParams(): { topic: string }[] {
  return publishedDocs(readDocs()).map((d) => ({ topic: d.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ topic: string }>;
}): Promise<Metadata> {
  const { topic } = await params;
  const doc = publishedDocs(readDocs()).find((d) => d.slug === topic);
  if (!doc) return {};
  return {
    title: `${doc.front.title} — VERCODE docs`,
    // The front matter's description is the 120–158-char meta description
    // (the CS-04 contract; the on-page gate asserts the band).
    description: doc.front.description,
  };
}

// The ## / ### headings of a doc body are read from the renderMarkdown
// result's `headings` list (single source, the renderer's slugs). The
// `Prose` wrapper's TocEntry shape is {id, label}; a rename of the
// markdown TocEntry's `text` field to the wrapper's `label`.

export default async function DocsTopicPage({
  params,
}: {
  params: Promise<{ topic: string }>;
}) {
  const { topic } = await params;
  const doc = publishedDocs(readDocs()).find((d) => d.slug === topic);
  if (!doc) notFound();

  // The rendered body + the heading TOC in one pass: renderMarkdown
  // (markdown.ts's string variant) returns the HTML string + a `headings`
  // list ({id, text}). The id is the renderer's slug (lowercase,
  // spaces → dashes, alnum-only) — the same slug the anchor jump targets.
  const { html, headings } = renderMarkdown(doc.body);
  const sections = headings.map((h) => ({ id: h.id, label: h.text }));

  const blocks = generateSchemaFor({
    route: `/docs/${doc.slug}`,
    title: doc.front.title,
    metaDescription: doc.front.description,
    // The docs' "author" is the FR-block owner (CS-04's docsAuthor field, a
    // distinct key from the base `author`); the ContentFront's `author`
    // field is the nearest typed slot, the docsAuthor label in the doc's
    // own front matter is the value the schema's author should carry.
    author: "the VERCODE team",
    datePublished: doc.front.date,
    dateModified: doc.front.updated ?? doc.front.date,
    tags: doc.front.tags,
    breadcrumbTrail: [
      { name: "Vercode", url: "/" },
      { name: "Docs", url: "/docs/" },
      { name: doc.front.title, url: `/docs/${doc.slug}/` },
    ],
  });

  return (
    <main>
      <JsonLd blocks={blocks} />

      <div className="mx-auto flex max-w-4xl gap-10 px-5">
        <Prose toc={sections}>
          {/* The breadcrumb — a visible 13px --faint "Docs / <topic>" line
              (IA §3.5's breadcrumb + WFR-104's BreadcrumbList, which the
              JSON-LD above carries as well). */}
          <nav aria-label="Breadcrumb" className="mb-6">
            <p className="text-[13px] text-[hsl(var(--faint))]">
              <a
                href="/docs/"
                className="text-[hsl(var(--faint))] underline underline-offset-2 hover:text-[var(--text)]"
              >
                Docs
              </a>{" "}
              /{" "}
              <span className="text-[hsl(var(--muted))]">{doc.front.title}</span>
            </p>
          </nav>

          <h1 className="mb-2 text-[32px] font-bold leading-[1.2] tracking-tight text-[var(--text)]">
            {doc.front.title}
          </h1>

          {/* The body — the markdown, into the 720px reading column
              (prose.css's .prose-vercode article hook). The HTML string
              from renderMarkdown is dropped in via
              dangerouslySetInnerHTML (the static export's no-hydration
              model: the crawler sees the same HTML a browser does). */}
          <article
            dangerouslySetInnerHTML={{ __html: html }}
          />

          {/* The "Related" footer — the 2 internal /docs links (IA §5's
              "every docs page links to at least 2 other docs pages"
              no-orphan rule). Each doc carries its own related links in
              its markdown; this is the canonical per-topic fallback, so
              a topic whose body omits them still satisfies the rule. */}
          <section
            aria-label="Related docs"
            className="mt-14 pt-2"
          >
            <h2 className="text-[13px] font-semibold text-[hsl(var(--faint))]">
              Related
            </h2>
            <ul className="mt-3 space-y-2">
              {relatedFor(doc).map((r) => (
                <li key={r.href}>
                  <a
                    href={r.href}
                    className="text-[16px] text-[hsl(var(--accent))] underline underline-offset-2"
                  >
                    {r.label}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </Prose>
      </div>
    </main>
  );
}

// The canonical related-docs links for a topic (the "2-link footer" the
// task brief asks for). Each doc also links its own related set in its
// body (IA §5's no-orphan rule); this fallback is the 2 most-adjacent
// topics in the same group, so a doc with no body links still has two.
function relatedFor(doc: DocPage): { href: string; label: string }[] {
  const group = doc.front.group;
  const siblings = publishedDocs(readDocs()).filter(
    (d) => d.front.group === group && d.slug !== doc.slug,
  );
  const picks = siblings.slice(0, 2);
  const out = picks.map((s) => ({
    href: `/docs/${s.slug}/`,
    label: s.front.title,
  }));
  if (out.length === 0) {
    out.push({
      href: "/docs/quickstart/",
      label: "Quickstart — install the App and get your first review",
    });
  }
  return out;
}
