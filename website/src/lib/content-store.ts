/**
 * VERCODE website — the content-store reader.
 *
 * A build-time read of apps/website/content/ (the CONTENT_SCHEMAS.md
 * "a repo directory, not a service" model): a Node fs walk of the .md
 * files, front-matter parsed by the shared parser in markdown.ts (no
 * yaml dependency — the strict Zod gate in CI is the schema check, this
 * is the reader). Used by the SSG pages (changelog, blog) only; the
 * static export bakes it in, no Node APIs at runtime.
 *
 * The JSON-file helper below (loadFacts) uses a direct JSON
 * import, not fs: a static import is tree-shaken into the build, needs
 * no path resolution at runtime, and keeps the data statically
 * analyzable. A caller (e.g. the llms.txt builder) does not need to
 * care where the bytes came from.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
// NOTE: markdown.tsx now lives as markdown.tsx in this workspace; the
// .js extension is the NodeNext-style import specifier — it resolves to
// the .tsx file because tsconfig's moduleResolution: "bundler" strips it.
import { parseFrontMatter, type FrontMatter } from "./markdown.js";
import factsJsonRaw from "../../content/facts/product-facts.json";

// parseFrontMatter returns { front, body } under the pure-string markdown.ts
// contract; the alias keeps the content-store's internal names stable.


// ---------------------------------------------------------------------------
// The content types (the CONTENT_SCHEMAS.md front-matter contracts, as
// TypeScript — the strict Zod gate is the CI check, this is the SSG read)
// ---------------------------------------------------------------------------

/** The ChangelogEntry front-matter (CONTENT_SCHEMAS.md CS-03). */
export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  summary: string;
  author: string;
  sections: string[];
  status: string;
  body: string;
}

/** The BlogPost front-matter (CONTENT_SCHEMAS.md CS-02). */
export interface BlogPost {
  title: string;
  description: string;
  date: string;
  updated?: string;
  author: string;
  tags: string[];
  status: string;
  ogImage: string;
  slug: string;
  body: string;
}

/** A typed content front matter (CONTENT_SCHEMAS.md's BaseFrontMatter). */
export interface ContentFront {
  title: string;
  description: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  /** ISO date; falls back to `date`. */
  updated?: string;
  author?: string;
  status: string;
  tags?: string[];
  group?: string;
  ogImage?: string;
  canonical?: string;
}

export interface ContentItem {
  /** Path relative to the content root, e.g. "blog/2026-01-05-foo.md". */
  path: string;
  /** The route slug, e.g. "2026-01-05-foo". */
  slug: string;
  front: ContentFront;
  /** The markdown body (front matter removed). */
  body: string;
}

/** A docs topic's typed entry (CONTENT_SCHEMAS.md CS-04's DocPage). */
export interface DocPage extends ContentItem {
  front: ContentFront & { group: string };
}

export interface FaqMdItem extends ContentItem {
  front: ContentFront & { group: string };
}

export interface Fact {
  id: string;
  label: string;
  value: string;
  unit: string;
  sentence: string;
  source: string;
  asOf: string;
}

export interface FactGroup {
  heading: string;
  facts: Fact[];
}

export interface FactsJSON {
  asOf: string;
  groups: FactGroup[];
}

// ---------------------------------------------------------------------------
// The readers
// ---------------------------------------------------------------------------

function mdFiles(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => join(dir, f));
  } catch {
    return [];
  }
}

function toStrArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string" && v.length > 0) return [v];
  return [];
}

/**
 * Read every content/changelog/*.md, sorted by date descending
 * (reverse-chronological; the /changelog feed's order).
 */
export function readChangelog(): ChangelogEntry[] {
  const dir = join(process.cwd(), "content", "changelog");
  const entries: ChangelogEntry[] = mdFiles(dir).map((f) => {
    const { front, body } = parseFrontMatter(readFileSync(f, "utf8"));
    return {
      version: String(front.version ?? "0.0.0"),
      date: String(
        front.date ?? f.split(sep).pop()?.replace(".md", ""),
      ),
      title: String(front.title ?? f),
      summary: String(front.summary ?? ""),
      author: String(front.author ?? "the VERCODE team"),
      sections: toStrArray(front.sections),
      status: String(front.status ?? "published"),
      body,
    };
  });
  // Reverse-chronological: newest first (the feed's order).
  entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return entries;
}

/**
 * Read every content/blog/*.md (all statuses; the page filters).
 * The slug is the filename without .md.
 */
export function readBlog(): BlogPost[] {
  const dir = join(process.cwd(), "content", "blog");
  const posts: BlogPost[] = mdFiles(dir).map((f) => {
    const { front, body } = parseFrontMatter(readFileSync(f, "utf8"));
    return {
      title: String(front.title ?? f),
      description: String(front.description ?? ""),
      date: String(front.date ?? f.replace(".md", "")),
      updated:
        typeof front.updated === "string" ? front.updated : undefined,
      author: String(front.author ?? "the VERCODE team"),
      tags: toStrArray(front.tags),
      status: String(front.status ?? "draft"),
      ogImage: String(front.ogImage ?? "/og.png"),
      slug: f.split(sep).pop()!.replace(".md", ""),
      body,
    };
  });
  // Newest first (the /blog list's order).
  posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return posts;
}

/**
 * WFR-305: a draft item is never rendered and never in the sitemap.
 * The published-only filter the /blog page + the generateStaticParams
 * both use (a draft blog item does not appear anywhere on the site).
 */
export function publishedPosts(posts: readonly BlogPost[]): BlogPost[] {
  return posts.filter((p) => p.status === "published");
}

/**
 * ~200 wpm reading time (the /blog index's "N min read").
 * Rounds up a minimum of 1 minute.
 */
export function readingTime(body: string, wpm = 200): number {
  const words = body.trim().split(/\s+/).length;
  return Math.max(1, Math.ceil(words / wpm));
}

// ---------------------------------------------------------------------------
// The generic content-collection reader (getAllContent: blog, docs,
// changelog, faq, legal) + the JSON-file re-export helpers.
// ---------------------------------------------------------------------------

function strField(fm: FrontMatter, key: string): string | undefined {
  const v = fm[key];
  return typeof v === "string" ? v : undefined;
}

function tagsField(fm: FrontMatter, key: string): string[] | undefined {
  const v = fm[key];
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.length) return [v];
  return undefined;
}

/** Read + parse one markdown file into a ContentItem. */
function readItem(file: string): ContentItem {
  const raw = readFileSync(file, "utf8");
  const { front, body } = parseFrontMatter(raw);
  const fm = front;
  return {
    path: relative(join(process.cwd(), "content"), file)
      .split(sep)
      .join("/"),
    slug: file.split(sep).pop()!.replace(/\.md$/, ""),
    front: {
      title: strField(fm, "title") ?? "",
      description: strField(fm, "description") ?? "",
      date: strField(fm, "date") ?? "",
      updated: strField(fm, "updated"),
      author: strField(fm, "author"),
      status: strField(fm, "status") ?? "published",
      tags: tagsField(fm, "tags"),
      group: strField(fm, "group"),
      ogImage: strField(fm, "ogImage"),
      canonical: strField(fm, "canonical"),
    },
    body,
  };
}

/** Read every .md under content/<kind>/ (a missing directory → []). */
function readDir(kind: string): ContentItem[] {
  const dir = join(process.cwd(), "content", kind);
  return mdFiles(dir).map(readItem);
}

export interface AllContent {
  blog: ContentItem[];
  docs: ContentItem[];
  changelog: ContentItem[];
  faq: FaqMdItem[];
  legal: ContentItem[];
}

/**
 * Load every content collection. Items are sorted newest-first by date,
 * then by slug (stable, deterministic output for the static export).
 * A directory that does not exist yet returns an empty array.
 */
export function getAllContent(): AllContent {
  const byDateDesc = (a: ContentItem, b: ContentItem): number => {
    const d = (b.front.date ?? "").localeCompare(a.front.date ?? "");
    return d !== 0 ? d : a.slug.localeCompare(b.slug);
  };

  const blog = readDir("blog").sort(byDateDesc);
  const docs = readDir("docs").sort((a, b) => a.slug.localeCompare(b.slug));
  const changelog = readDir("changelog").sort(byDateDesc);
  const legal = readDir("legal").sort((a, b) => a.slug.localeCompare(b.slug));

  const faq: FaqMdItem[] = readDir("faq")
    .map((item) => ({
      ...item,
      front: { ...item.front, group: item.front.group ?? "General" },
    }))
    .sort(byDateDesc);

  return { blog, docs, changelog, faq, legal };
}

/** Only the published items of a collection (WFR-305). */
export function publishedItems(items: readonly ContentItem[]): ContentItem[] {
  return items.filter((i) => i.front.status === "published");
}

/**
 * The docs-collection reader (CONTENT_SCHEMAS.md CS-04's DocPage contract):
 * read every content/docs/*.md in slug order.
 */
export function readDocs(): DocPage[] {
  return readDir("docs")
    .map((item) => ({
      ...item,
      front: { ...item.front, group: item.front.group ?? "reference" },
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/** The published docs only (WFR-305: a draft topic is not rendered). */
export function publishedDocs(docs: readonly DocPage[]): DocPage[] {
  return docs.filter((d) => d.front.status === "published");
}

/** The product facts JSON, typed. */
export function loadFacts(): FactsJSON {
  return factsJsonRaw as FactsJSON;
}
