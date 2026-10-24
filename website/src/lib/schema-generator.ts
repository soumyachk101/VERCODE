/**
 * VERCODE website — JSON-LD structured-data emitter (STRUCTURED_DATA.md §2).
 *
 * The single source of truth for every JSON-LD block on the site: no page
 * file writes JSON-LD by hand, it imports this module and inlines the
 * emitted array as <script type="application/ld+json">. The facts come
 * from site.ts (SITE_NAME, BASE_URL), and faq.ts (FAQ_ITEMS,
 * HOME_FAQ_IDS), so a FAQ edit flows into every block in one build.
 */
import { SITE_NAME, BASE_URL, PAGES } from "./site.js";
import { FAQ_ITEMS, HOME_FAQ_IDS } from "./faq.js";

/** A { name, url } breadcrumb entry (the visible trail the page renders). */
export interface BreadcrumbEntry {
  name: string;
  url: string;
}

/** An ItemList entry (docs topics, changelog releases, blog posts). */
export interface ListEntry {
  name: string;
  url: string;
  /** Optional; the docs hub carries a one-line description per topic. */
  description?: string;
}

/** The optional extra-data argument: content lists the caller has loaded. */
export interface GenerateSchemaExtras {
  /** The docs 9-topics list (the /docs hub's ItemList). */
  docsTopics?: { slug: string; title: string; description: string }[];
  /** The changelog latest-10 list (the /changelog index's ItemList). */
  changelogEntries?: { title: string; url: string }[];
  /** The published blog list (the /blog index's ItemList). */
  blogEntries?: { title: string; url: string }[];
}

/** One page's structured-data input. */
export interface PageDef {
  /** The absolute route, e.g. "/docs/quickstart". */
  route: string;
  isRoot?: boolean;
  /** The H1 / page heading. */
  title?: string;
  /** The meta description (the Article's `description` field). */
  metaDescription?: string;
  author?: string;
  datePublished?: string;
  dateModified?: string;
  tags?: string[];
  ogImage?: string;
  /** The visible breadcrumb trail; the generator turns it into a BreadcrumbList. */
  breadcrumbTrail?: BreadcrumbEntry[];
  /** Content-list data for the ItemList (docs 9 topics, changelog latest 10, blog published). */
  itemList?: { name: string; entries: ListEntry[] };
}

export type JsonLdBlock = Record<string, unknown>;

/** Absolute URL helper: root collapses to the bare origin. */
function absUrl(route: string): string {
  return route === "/" ? BASE_URL : `${BASE_URL}${route}`;
}

/** Absolute path helper: relative site paths get the BASE_URL prefix. */
function absPath(path: string): string {
  if (/^(https?:|mailto:)/.test(path)) return path;
  return absUrl(path);
}

// ---------------------------------------------------------------------------
// Node builders
// ---------------------------------------------------------------------------

/** Organization + WebSite (root only). */
function orgAndWebSite(): JsonLdBlock[] {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${BASE_URL}/#org`,
      name: SITE_NAME,
      url: BASE_URL,
      logo: `${BASE_URL}/assets/logo.svg`,
      description:
        "AI code review platform: deterministic static analysis plus task-routed model review, published back to the pull request.",
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${BASE_URL}/#website`,
      url: BASE_URL,
      name: SITE_NAME,
      publisher: { "@id": `${BASE_URL}/#org` },
    },
  ];
}

/** SoftwareApplication node (root and /features). */
function softwareApp(route: string): JsonLdBlock {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${BASE_URL}${route}#app`,
    name: SITE_NAME,
    url: absUrl(route),
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Web",
  };
}

/** Three-step HowTo (root only): install, open a PR, read the review. */
function howTo(): JsonLdBlock {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "@id": `${BASE_URL}/#howto`,
    name: `Install ${SITE_NAME} and get your first review`,
    step: [
      {
        "@type": "HowToStep",
        position: 1,
        name: "Install the GitHub App",
        text: "Install the GitHub App on the target repository and authorize the five required scopes: contents:read, pull_requests:write, checks:write, metadata:read, issues:read.",
      },
      {
        "@type": "HowToStep",
        position: 2,
        name: "Open a pull request",
        text: "GitHub dispatches the webhook; the review job is verified and enqueued in under 300 ms. The queue, not the request, does the work.",
      },
      {
        "@type": "HowToStep",
        position: 3,
        name: "Read the review",
        text: "Static analysis runs first; the task-routed model stage runs on the bounded diff. A verdict and inline findings land on the pull request in under two minutes at p50.",
      },
    ],
  };
}

/** FAQPage node built from a slice of questions + answers. */
function faqPage(
  route: string,
  items: readonly { q: string; a: string }[],
): JsonLdBlock {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${BASE_URL}${route}#faq`,
    mainEntity: items.map((f, i) => ({
      "@type": "Question",
      "@id": `${BASE_URL}${route}#q${i + 1}`,
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

/** BreadcrumbList from the visible trail (WFR-104). */
function breadcrumb(
  route: string,
  trail: readonly BreadcrumbEntry[] | undefined,
  title?: string,
): JsonLdBlock | null {
  const entries =
    trail && trail.length > 0
      ? trail
      : [
          { name: SITE_NAME, url: "/" },
          { name: title ?? route, url: route },
        ];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "@id": `${BASE_URL}${route}#bc`,
    itemListElement: entries.map((e, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: e.name,
      item: absPath(e.url),
    })),
  };
}

/** Article node for /docs/<t> and /blog/<s> pages. */
function article(page: PageDef, label: string): JsonLdBlock {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${BASE_URL}${page.route}#article`,
    headline: label,
    description: page.metaDescription,
    url: absUrl(page.route),
    author: page.author
      ? { "@type": "Person", name: page.author }
      : { "@type": "Organization", name: SITE_NAME, url: BASE_URL },
    datePublished: page.datePublished,
    dateModified: page.dateModified ?? page.datePublished,
    mainEntityOfPage: { "@type": "WebPage", "@id": `${BASE_URL}${page.route}/` },
    image: page.ogImage ? absPath(page.ogImage) : undefined,
    keywords: page.tags,
    about: { "@id": `${BASE_URL}/#app` },
  };
}

/** CreativeWork node for /changelog/<d> (STRUCTURED_DATA.md §2's row 7). */
function creativeWork(page: PageDef, label: string): JsonLdBlock {
  return {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    "@id": `${BASE_URL}${page.route}#work`,
    name: label,
    url: absUrl(page.route),
    dateCreated: page.datePublished,
    dateModified: page.dateModified ?? page.datePublished,
    author: { "@type": "Organization", name: SITE_NAME, url: BASE_URL },
    about: { "@id": `${BASE_URL}/#app` },
  };
}

/** ItemList node (docs topics, changelog latest-10, blog published). */
function itemListNode(
  route: string,
  name: string,
  entries: readonly ListEntry[],
): JsonLdBlock {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${BASE_URL}${route}#list`,
    name,
    numberOfItems: entries.length,
    itemListElement: entries.map((e, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: e.name,
      url: absPath(e.url),
    })),
  };
}

/** Resolve a PAGES route to its PAGES title, or the raw route. */
function titleForRoute(route: string): string {
  return PAGES.find((p) => p.route === route)?.title ?? route;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Emit the full JSON-LD node array for a page.
 *
 * The node mix is keyed on the route (STRUCTURED_DATA.md §2's table):
 *  - "/"             → Organization + WebSite + SoftwareApplication + HowTo +
 *                      FAQPage (top-5 teaser, HOME_FAQ_IDS)
 *  - "/features"     → WebSite + SoftwareApplication
 *  - "/faq"          → WebSite + FAQPage (the full 16)
 *  - "/docs"         → WebSite + ItemList (8 topics, from page.itemList)
 *  - "/docs/<t>"     → WebSite + Article + BreadcrumbList
 *  - "/changelog"    → WebSite + ItemList (latest 10, from page.itemList)
 *  - "/changelog/<d>"→ WebSite + CreativeWork + BreadcrumbList
 *  - "/blog"         → WebSite + ItemList (published, from page.itemList)
 *  - "/blog/<s>"     → WebSite + Article + BreadcrumbList
 *  - everything else → WebSite (+ BreadcrumbList when a trail is supplied)
 *
 * Every node's @id/@url is an absolute URL (BASE_URL + route).
 */
export function generateSchemaFor(
  page: PageDef,
  extra: GenerateSchemaExtras = {},
  title?: string,
): JsonLdBlock[] {
  const r = page.route;
  const nodes: JsonLdBlock[] = [];
  const label = title ?? page.title ?? titleForRoute(r);

  // 1. Organization + WebSite (root only; other pages carry a stable WebSite
  //    stub under the same @id so cross-page references stay resolvable).
  if (page.isRoot === true || r === "/") {
    nodes.push(...orgAndWebSite());
  } else {
    nodes.push({
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${BASE_URL}/#website`,
      url: BASE_URL,
      name: SITE_NAME,
    });
  }

  // 2. SoftwareApplication (root + /features).
  if (r === "/" || r === "/features") nodes.push(softwareApp(r));

  // 3. HowTo (root only).
  if (r === "/" && page.isRoot === true) nodes.push(howTo());

  // 4. FAQPage — top-5 teaser on "/", the full 16 on "/faq".
  if (r === "/") {
    const slice = HOME_FAQ_IDS.map((i) => FAQ_ITEMS[i]).filter(
      (x): x is (typeof FAQ_ITEMS)[number] => x !== undefined,
    );
    nodes.push(faqPage(r, slice));
  } else if (r === "/faq") {
    nodes.push(faqPage(r, FAQ_ITEMS));
  }

  // 6. ItemList (docs, changelog, blog) — supplied by the caller's content,
  //    either through `page.itemList` or the `extra` slot (both shapes the
  //    app pages use; `page.itemList` wins when both are present).
  if (page.itemList) {
    nodes.push(itemListNode(r, page.itemList.name, page.itemList.entries));
  } else if (extra.docsTopics && r === "/docs") {
    nodes.push(
      itemListNode(
        r,
        "VERCODE documentation topics",
        extra.docsTopics.map((t) => ({
          name: t.title,
          url: `/docs/${t.slug}/`,
          description: t.description,
        })),
      ),
    );
  } else if (extra.changelogEntries && r === "/changelog") {
    nodes.push(
      itemListNode(
        r,
        "VERCODE changelog",
        extra.changelogEntries.map((e) => ({ name: e.title, url: e.url })),
      ),
    );
  } else if (extra.blogEntries && r === "/blog") {
    nodes.push(
      itemListNode(
        r,
        "VERCODE blog",
        extra.blogEntries.map((e) => ({ name: e.title, url: e.url })),
      ),
    );
  }

  // 7. Article + BreadcrumbList (docs sub-pages, blog posts).
  if (r.startsWith("/docs/") || r.startsWith("/blog/")) {
    nodes.push(article(page, label));
    const bc = breadcrumb(r, page.breadcrumbTrail, label);
    if (bc) nodes.push(bc);
  }

  // 8. CreativeWork + BreadcrumbList (changelog detail pages).
  if (r.startsWith("/changelog/")) {
    nodes.push(creativeWork(page, label));
    const bc = breadcrumb(r, page.breadcrumbTrail, label);
    if (bc) nodes.push(bc);
  }

  // 9. A BreadcrumbList on any other page that supplies an explicit trail.
  if (
    !r.startsWith("/docs/") &&
    !r.startsWith("/blog/") &&
    !r.startsWith("/changelog/") &&
    r !== "/" &&
    page.breadcrumbTrail &&
    page.breadcrumbTrail.length > 0
  ) {
    const bc = breadcrumb(r, page.breadcrumbTrail, label);
    if (bc) nodes.push(bc);
  }

  return nodes;
}
