// /docs (INFORMATION_ARCHITECTURE_AND_PAGES.md §3.5): "How do I get my
// first review?" The docs hub — the H1 + a 2-sentence orientation + the
// quickstart card (the first thing, the SUCCESS_METRICS activation KPI)
// + the 9-topic index in the 4 groups (get-started / configure /
// reference / legal-security).
//
// The 9-topic index is loaded from the content store at build time
// (the CONTENT_SCHEMAS.md §1 "a repo dir, not a service" model; the
// read runs once in the static export). The ItemList JSON-LD
// (STRUCTURED_DATA.md §1's /docs row) is emitted from the same
// published set, so the visible index and the schema can't drift.
import type { Metadata } from "next";
import {
  readDocs,
  publishedDocs,
  type DocPage,
} from "@/lib/content-store.js";
import { generateSchemaFor } from "@/lib/schema-generator.js";
import { JsonLd } from "@/components/JsonLd.js";
import { SITE_NAME } from "@/lib/site.js";

// The doc's group enum (CONTENT_SCHEMAS.md CS-04's DocsGroup — the
// front matter's `group` field, one of the 4; a missing/unknown group
// reads as "reference", readDocs' fallback).
type DocsGroup = "get-started" | "configure" | "reference" | "legal-security";

function groupOf(doc: DocPage): DocsGroup {
  const g = doc.front.group;
  return g === "get-started" || g === "configure" || g === "legal-security"
    ? g
    : "reference";
}

// 120–158 chars (WFR-102's meta description band; the on-page gate).
const DOC_META_DESCRIPTION =
  "The docs hub: nine topics in four groups. Install the App, read the API contract, tune custom rules, the security rollup, providers, plans, quotas, retention.";

export const metadata: Metadata = {
  title: `Docs — ${SITE_NAME}`,
  description: DOC_META_DESCRIPTION,
};

// The published docs, in slug order (readDocs sorts by slug; a WFR-305
// filter drops any draft/archived item, so the index only shows topics a
// /docs/<topic> route will actually render).
const docs = publishedDocs(readDocs());

// The ItemList's entries (the STRUCTURED_DATA.md §1 /docs row: an
// ItemList of the 9 topics). The schema-generator's /docs case pushes
// this when extra.docsTopics is supplied.
const schemaBlocks = generateSchemaFor(
  {
    route: "/docs",
    title: "Documentation",
    metaDescription: DOC_META_DESCRIPTION,
  },
  {
    docsTopics: docs.map((d) => ({
      slug: d.slug,
      title: d.front.title,
      description: d.front.description,
    })),
  },
);

// The 4 group labels, in IA §3.5's order (the /docs hub's grouping rule).
const GROUPS: readonly { id: DocsGroup; label: string }[] = [
  { id: "get-started", label: "Get started" },
  { id: "configure", label: "Configure" },
  { id: "reference", label: "Reference" },
  { id: "legal-security", label: "Legal & security" },
];

export default function DocsIndexPage() {
  const docsByGroup = GROUPS.map((g) => ({
    ...g,
    docs: docs.filter((d) => groupOf(d) === g.id),
  }));

  return (
    <main>
      <JsonLd blocks={schemaBlocks} />

      <div className="mx-auto max-w-2xl px-5 pt-14">
        <h1 className="text-[40px] font-bold tracking-tight text-[var(--text)]">
          Documentation
        </h1>
        <p className="mt-4 text-[16px] leading-[1.6] text-[var(--muted)]">
          Each topic answers one question: how to install, how to configure,
          what each number means. The numbers are the literal ones from the
          source docs; every topic links to the two or three most-adjacent
          ones, so there is no dead-end page.
        </p>
      </div>

      {/* The quickstart card — the first thing (IA §3.5's quickstart-first
          rule; the SUCCESS_METRICS activation KPI's "a first review
          within 10 minutes of install" is the card's body). */}
      <div className="mx-auto max-w-2xl px-5 pt-8">
        <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-6">
          <h2 className="text-[20px] font-semibold text-[var(--text)]">
            Get your first review in 10 minutes
          </h2>
          <p className="mt-2 text-[16px] leading-[1.6] text-[var(--muted)]">
            Install the GitHub App on one repo, open a pull request, and the
            verdict lands as a summary comment plus inline findings. No
            configuration is required between the install and the first
            review.
          </p>
          <p className="mt-3">
            <a
              href="/docs/quickstart/"
              className="text-[16px] font-medium text-[var(--accent)] underline underline-offset-2"
            >
              Start here
            </a>
          </p>
        </div>
      </div>

      {/* The 9-topic index in the 4 groups (IA §3.5's grouping rule).
          Each entry is a <a> showing the doc's H1 + its 1-line
          description from the front matter (the CONTENT_SCHEMAS.md CS-04
          contract); the anchor text is the doc's noun phrase, per the
          SEO_AEO_GEO.md §2 "descriptive anchors" rule. */}
      <div className="mx-auto max-w-2xl px-5 py-12">
        <dl>
          {docsByGroup
            .filter((g) => g.docs.length > 0)
            .map((g) => (
              <div key={g.id} className="mb-8">
                <dt className="text-[13px] font-semibold text-[var(--faint)]">
                  {g.label}
                </dt>
                <div className="mt-3 space-y-5">
                  {g.docs.map((d) => (
                    <dd key={d.slug}>
                      <a
                        href={`/docs/${d.slug}/`}
                        className="text-[16px] font-semibold text-[var(--accent)] underline underline-offset-2"
                      >
                        {d.front.title}
                      </a>
                      <p className="mt-1 text-[16px] leading-[1.5] text-[var(--muted)]">
                        {d.front.description}
                      </p>
                    </dd>
                  ))}
                </div>
              </div>
            ))}
        </dl>
      </div>
    </main>
  );
}
