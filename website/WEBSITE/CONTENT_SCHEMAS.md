# VERCODE Website — Content Schemas

The Zod contract for the website's content store. Every item under `apps/website/content/` is a Markdown file with a front-matter block, validated at **build time** by a Zod schema in `packages/contracts` (the `CONTENT_STRATEGY.md`'s "no CMS, content changes are PRs" rule — an item that is malformed fails the `content/`-schema gate, `TECHNICAL_ARCHITECTURE.md §5`'s "a blog post that's malformed fails the build" line). The schemas here feed **two** consumers: the **MDX renderer** (the page's visible content) and the **JSON-LD + `llms.txt` + `/api/answer` generator** (`STRUCTURED_DATA.md §2`'s `schema-generator.ts`, the "single source of truth" — a fact changes in one file and propagates to the visible page, the JSON-LD, `llms.txt`, and the `/api/answer` route in one build).

> **The house rule:** the site's type, spacing, and layout are *not* content (`DESIGN_SYSTEM_AND_TYPOGRAPHY.md` owns those). This doc owns the *content directory model*, the *front-matter shapes*, the *content-type contracts*, the *machine-readable `PricingSource`/`ProductFact`* JSON records, the *publishing workflow*, and the *CI validation rules*.

## 1. The content model: `apps/website/content/`

The content store is a **repo directory**, not a service: `apps/website/content/` holds **Markdown + YAML front-matter**, organized **by the route group the content renders to** (`INFORMATION_ARCHITECTURE_AND_PAGES.md §1`'s route tree, 1:1). This is the `TECHNICAL_ARCHITECTURE.md §2`'s "a repo dir, not a separate service (U2)" decision; a *live* CMS is P3 (`PRD.md §8 U2`'s "a live CMS is P3 (a decision, `PRD.md §8 U6`, not an implementation)" line), and `WFR-304`'s "No CMS in MVP" scope line is enforced by the directory + the build-time schema gate below.

```
apps/website/content/
  blog/            ← BlogPost front-matter + Markdown   → /blog/<slug>        (WFR-303)
  changelog/       ← ChangelogEntry front-matter + Markdown → /changelog/<date> (WFR-302)
  docs/            ← DocPage front-matter + Markdown     → /docs/<topic>       (WFR-301, the 9 P2 topics)
  faq/             ← FaqItem front-matter + Markdown body (the answer)         → /faq + the /+ /pricing FAQPage blocks (WFR-204)
    pricing/       ← the 6-question pricing FAQ set (a separate FAQPage block, STRUCTURED_DATA.md §3.5)
  legal/           ← LegalPage front-matter + Markdown   → /legal/terms|privacy|security|dpa|status (WFR-406)
  pricing/
    pricing.json   ← the machine-readable PricingSource (the single source of truth; CS-05)
    pricing.md     ← a human-readable companion (a docs-adjacent artifact, never the source of record)
  facts/
    product-facts.json ← the ProductFact set (CS-06; consumed by /api/answer + llms.txt + llms-full.txt, WFR-401/402/403)
    narrative.md   ← authored narrative ProductFacts (the "what VERCODE does" / "is it open source" / "can I self-host" sections, SEO_AEO_GEO.md §4.1)
```

The **`pricing/` directory is the "PricingSource"** (`STRUCTURED_DATA.md §2.2`'s "a *zod*-validated `PricingJSON`" + `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.3`'s "the numbers on this page are **generated** from `content/pricing/`… a drift is structurally impossible, not just policed" rule) — the one *machine-readable* source that `/pricing`, the `Product`+`Offer` JSON-LD, `/api/answer`, `llms.txt`, and `llms-full.txt` all read from (the `WFR-402` "triple source" rule, `SEO_AEO_GEO.md §4.3`). It is not a *page* content type (no Markdown route renders it); it is a *data* artifact consumed at build time by the schema generator.

**The "PricingSource" vs. "PricingJSON" naming:** the sibling docs (`STRUCTURED_DATA.md §2.2`, `TECHNICAL_ARCHITECTURE.md §4.3`) cite this contract as `PricingJSON`; this doc's task spec calls it `PricingSource`. Both names refer to the **same** Zod schema — the Zod export name is `PricingSourceSchema`/`PricingSource` below (a deliberate rename for clarity: the type is *a source of truth*, not *a JSON file shape*). `STRUCTURED_DATA.md §2.2`'s "`PricingJSON`" citation is a *stale name* (a rename, not a schema change); the schema shape is unchanged, and no build output differs. *(Reported; the sibling doc is not fixed.)*

## 2. The Zod schema conventions (`packages/contracts`)

Front-matter schemas live in **one** module, `packages/contracts/src/content/` (a new dir in the existing `packages/contracts` package — the same package that already owns `plans.ts`, `USAGE_QUOTAS.md`'s "the single source of truth" module; `TECHNICAL_ARCHITECTURE.md §3`'s "a `zod` schema in `packages/contracts`" line, a **new** file, a deviation noted per `docs/TECHNICAL/REPOSITORY_STRUCTURE.md`'s "a `packages/contracts` is the single source of truth for finding/job/plan/webhook shapes. Every other package imports *from* it, never re-declares" rule + `CONTRIBUTING.md`'s "New shapes for… communication goes through `contracts`" convention):

```
packages/contracts/src/content/
  index.ts              ← re-exports every schema + type below (the single import surface, the plans.ts re-export pattern)
  front-matter.ts       ← StatusSchema + BaseFrontMatter + the per-type front-matter extensions (CS-01..CS-04, CS-07, CS-08)
  pricing-source.ts     ← PricingSourceSchema + ProductFactSchema + AnswerIntent (CS-05, CS-06)
```

The conventions, mirroring `plans.ts`'s own rules (`packages/contracts/src/plans.ts`'s header comment: "The API quota check, the worker pre-flight check, and the dashboard display all import from here. A hardcoded quota number anywhere else is a defect"):

- **One module, one import surface.** The website's build (`apps/website`'s `schema-generator.ts` + the `content/` loader), the `apps/api`'s `/api/answer` route, and the build-time `content/` schema gate **all import from `@vercode/contracts`** — the monorepo's "single source of truth" rule (`REPOSITORY_STRUCTURE.md`, `CONTRIBUTING.md`) applied to content shapes. No app re-declares a front-matter field; a website build + a `/api/answer` route + a CI gate that each hand-rolls a `title`/`description`/`status` type is a *duplicate*, a defect.
- **`.strict()` on every object schema.** A front-matter key that is *not* in the schema is a *failure*, not a silent pass-through (a "an unknown key is a typo" rule — a `draft` item with a `status` value of `drat` fails the build, not the deploy).
- **`url`-shaped fields are `z.string().url()`** — a canonical URL must be absolute (a `VERCODE_WEBSITE_BASE_URL`-prefixed, `TECHNICAL_ARCHITECTURE.md §6`).
- **Every exported type is a `z.infer<typeof X>`** — no `interface` re-declares the fields a Zod schema already validates (the `plans.ts` `PlanQuota` pattern: an `interface` is used only for a *record* with doc-comment semantics (`plans.ts`'s `PlanQuota`); a validated *shape* gets a `z.infer`).

### 2.1 The shared front-matter base (`CS-01`, `BaseFrontMatter`)

Every content item carries these fields (the `WFR-305`'s "a `front matter` shape defined by `CONTENT_SCHEMAS.md` (title, description, date, author, tags, status: draft\|published\|archived)" line):

```ts
// packages/contracts/src/content/front-matter.ts
import { z } from "zod";

export const StatusSchema = z.enum(["draft", "published", "archived"]);
export type Status = z.infer<typeof StatusSchema>;

export const BaseFrontMatter = z.object({
  /** The H1 of the rendered page. ≤ 60 chars for the `<title>` tag (WFR-102 + the SEO_AEO_GEO.md §2 on-page gate); the
   *  headline for an Article (blog) may be ≤ 110 chars (WFR-303) — the per-type extension narrows/reopens this. */
  title: z.string().min(1),
  /** The page's meta description. 120–158 chars (a `WFR-102` + a `SEO_AEO_GEO.md §2`'s on-page gate). */
  description: z.string().min(120).max(158),
  /** ISO-8601 date (YYYY-MM-DD). */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** ISO-8601 date; defaults to `date` when absent (a `lastmod`-is-honest rule, `CONTENT_STRATEGY.md §3`'s point 5). */
  updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** The `draft` / `published` / `archived` state. */
  status: StatusSchema,
  /** The author — a named person, a `/about` team member (`INFORMATION_ARCHITECTURE_AND_PAGES.md §3.8`'s "a named team (real people)" rule; a `Person` JSON-LD on `/about`). Optional at the base level; a blog/docs item *requires* it (the CS-02/CS-04 extensions). */
  author: z.string().min(1).optional(),
  /** Tags, for the blog index's topic row (`INFORMATION_ARCHITECTURE_AND_PAGES.md §3.7`) + the Article `keywords` JSON-LD field. */
  tags: z.array(z.string()).default([]),
  /** The per-item OG image (a 1200×630, a `WFR-303`/`WFR-404` + a `TECHNICAL_ARCHITECTURE.md §3`'s `@vercel/og` line). Optional at the base; a blog item *requires* it (CS-02). */
  ogImage: z.string().url().optional(),
  /** The canonical URL (a `WFR-102`'s "a canonical URL" line, absolute, `VERCODE_WEBSITE_BASE_URL`-prefixed, `TECHNICAL_ARCHITECTURE.md §6`). Optional at the base; a blog item *requires* it (CS-02). */
  canonical: z.string().url().optional(),
}).strict();
export type BaseFrontMatter = z.infer<typeof BaseFrontMatter>;
```

The **`draft`-item rule (`WFR-305`)**: an item with `status: draft` is **never** rendered at a public route and **never** appears in `sitemap.xml` (a `WFR-305`'s "`draft` items are not rendered at `/` nor included in `sitemap.xml`" line). The build's route generation and the sitemap generation both filter on `status === "published"`; a `draft` item fails to appear anywhere on the site, by construction (`ROADMAP_AND_ACCEPTANCE_CRITERIA.md`'s `W-AC-06`/`WT3.5`'s "a `UT` that a `draft` blog item does not appear in the generated `sitemap.xml`" verification).

An **`archived`** item is **rendered as a 410** (the `INFORMATION_ARCHITECTURE_AND_PAGES.md`/`SEO_AEO_GEO.md §1.5`'s "a soft-deleted doc is a 410, not a 404" rule) and its canonical URL stays resolvable — the page returns a 410 status, its JSON-LD is *omitted* from `sitemap.xml` but the URL itself keeps resolving for existing backlinks (a `CONTENT_STRATEGY.md §3`'s point 7, "a 410 is better than a 404 for SEO continuity").

### 2.2 The per-type front-matter index (`CS-02`..`CS-08`)

A **table of contents** for §3's per-type contract detail — the 6 per-type front-matter / data schemas and the module they live in (`packages/contracts/src/content/`, the §2's "one module, one import surface" rule):

| ID | The schema | The module | The file it validates |
| --- | --- | --- | --- |
| `CS-01` | `BaseFrontMatter` + `StatusSchema` | `front-matter.ts` | every `content/**/*.md`'s front-matter block (§2.1) |
| `CS-02` | `BlogPostFrontMatter` | `front-matter.ts` | `content/blog/<slug>.md` (§3's `CS-02` section) |
| `CS-03` | `ChangelogEntryFrontMatter` (+ `ChangelogSection`) | `front-matter.ts` | `content/changelog/<date>.md` (§3's `CS-03` section) |
| `CS-04` | `DocPageFrontMatter` (+ `DocsGroup`) | `front-matter.ts` | `content/docs/<topic>.md` (§3's `CS-04` section) |
| `CS-05` | `PricingSourceSchema` (+ `OfferSourceSchema`) | `pricing-source.ts` | `content/pricing/pricing.json` (a *data* file, not a Markdown front-matter block — a `pricing.json` JSON record, §3's `CS-05` section) |
| `CS-06` | `ProductFactSetSchema` (+ `ProductFactSchema`/`ProductFactGroupSchema`) | `pricing-source.ts` | `content/facts/product-facts.json` (a *data* file, §3's `CS-06` section) |
| `CS-07` | `FaqItemFrontMatter` (+ `FAQGroup`) | `front-matter.ts` | `content/faq/*.md` + `content/faq/pricing/*.md` (§3's `CS-07` section) |
| `CS-08` | `LegalPageFrontMatter` (+ `LegalPageType`) | `front-matter.ts` | `content/legal/<page>.md` (§3's `CS-08` section) |

§2.2 is the *index*; §3 is the *per-type* detail (the shape + the JSON-LD mapping + the drift rule, one `CS-##` section per type).

## 3. The per-type content contracts

Each content type below gets its **own** front-matter extension of `BaseFrontMatter`, a **`CS-##`** ID (matching this doc's own "ID-prefixed items like the repo does" convention, the `CONTENT_STRATEGY.md`/`ROADMAP_AND_ACCEPTANCE_CRITERIA.md` house style), the **file path** it lives at, and the **JSON-LD type** it feeds (`STRUCTURED_DATA.md §1`'s per-route type table, `WFR-102`).

### CS-02 — The blog (`/blog/<slug>`) — the `BlogPost` contract

`content/blog/<slug>.md`:

```ts
export const BlogPostFrontMatter = BaseFrontMatter.extend({
  /** The 1-sentence claim the article makes (`CONTENT_STRATEGY.md §2.3`'s 3-part test's part 1, "a claim"). */
  claim: z.string().min(1),
  /** The named author — a real person, a `/about` team member; a `Person` JSON-LD on `/about`, an `Article.author` `@id` reference (not an inline `Person`), `STRUCTURED_DATA.md §3.10`. */
  author: z.string().min(1),
  /** The per-slug OG image (a 1200×630, a `WFR-303` + a `WFR-404`'s "Per-page OG image for `/blog/<slug>` is the `image` field of `WFR-303`" line). */
  ogImage: z.string().url(),
  /** The canonical URL (a `WFR-102`'s "a canonical URL" line; the `Article.mainEntityOfPage`). */
  canonical: z.string().url(),
}).strict();
export type BlogPostFrontMatter = z.infer<typeof BlogPostFrontMatter>;
```

- **JSON-LD fed:** `Article` (+ `BreadcrumbList`, `WFR-104`) — `STRUCTURED_DATA.md §3.7`'s exact block: `headline` (the `title`, ≤ 110 chars, `WFR-303`), `image` (the `ogImage`), `author` (`Person` ref), `datePublished`/`dateModified` (the `date`/`updated`), `keywords` (the `tags`), `mainEntityOfPage` (the `canonical`).
- **The `/blog` index** is an `ItemList` of *published* articles (`status: published` filter, `WFR-305`), the last 10 (`STRUCTURED_DATA.md §3.9`'s shape).
- **The editorial bar** (`CONTENT_STRATEGY.md §2.3`'s 3-part test — a claim + evidence + a product angle; a post that fails is *rewritten, not published*): this is an *editorial* gate (a human review, §4's ownership table's "Blog" row + the AEO lane, `CONTENT_STRATEGY.md §4`), not a Zod gate — the Zod schema validates the *shape*, the 3-part test validates the *argument*.

### CS-03 — The changelog (`/changelog/<date>`) — the `ChangelogEntry` contract

`content/changelog/<date>.md` (one entry per release, `CONTENT_STRATEGY.md §2.2`'s cadence — "a release, not the PR"):

```ts
export const ChangelogSection = z.enum([
  "Added", "Changed", "Fixed", "Deprecated", "Removed", "Security",
]);
export type ChangelogSection = z.infer<typeof ChangelogSection>;

export const ChangelogEntryFrontMatter = BaseFrontMatter.extend({
  /** The release tag (the `version` a `RELEASE_CRITERIA`'s release lane cut, `CI_CD.md`'s release lane). */
  version: z.string().regex(/^\d+\.\d+\.\d+(-\w+)?$/),
  /** The Keep-a-Changelog sections this release contains (`CONTENT_STRATEGY.md §2.2`'s "Added / Changed / Fixed / Deprecated / Removed / Security" vocabulary). A `Deprecated` or a `Removed` section *requires* upgrade notes in the body (a `CONTENT_STRATEGY.md §2.2`'s "Upgrade notes are mandatory" line). */
  sections: z.array(ChangelogSection).min(1),
  /** The release engineer — a named person, the `CreativeWork.author` (a `Person` ref to the `/about` team). */
  author: z.string().min(1),
}).strict();
export type ChangelogEntryFrontMatter = z.infer<typeof ChangelogEntryFrontMatter>;
```

- **JSON-LD fed:** a per-entry `CreativeWork` (+ `BreadcrumbList`) on `/changelog/<date>` — `STRUCTURED_DATA.md §3.8`/`§1`'s "a `CreativeWork` (or a `Release` on a dedicated page)" line; **P2 uses `CreativeWork`**, a `Release`-flavoured sub-block is a P3 nicety (`PRD.md §6`'s out-of-scope list, `STRUCTURED_DATA.md §6`). The `/changelog` index's `ItemList` (the "the last 10", `WFR-302`) is generated from the `content/changelog/` directory's 10 newest entries, each item a `{ "@type": "ListItem", "position": N, "name": "<version> — <title>", "item": "<canonical URL>" }` (a `STRUCTURED_DATA.md §3.9`'s shape, the `version + title` front-matter fields, `WFR-302`'s "a human-readable summary" line).
- **The source-of-truth rule (`CONTENT_STRATEGY.md §2.2` + `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.6`'s "The source-of-truth rule"):** the changelog is a *curated, human* artifact — it is authored in `content/changelog/` with this front-matter. The dashboard's `docs/` are **not** auto-synced into the changelog (a "generated changelog" is a P3 idea, `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.6`'s "a generated changelog is a P3 idea" line). The `version` + `date` pair **must match** the actual git tag + its commit date — a `ChangelogEntry` whose `version`/`date` don't correspond to a real release is a *fictitious release* (a `CONTENT_STRATEGY.md §2.2`'s "a changelog describes *shipped, verified* behavior only" line, a `SAAS_LAUNCH_PLAN §5`'s "a measured gate" rule applied to copy) — this is a **human + CI** check (a tag-existence assert in the CI lane, §4.2 below), not a Zod-only check (Zod can't know the git history).

### CS-04 — The docs (`/docs/<topic>`) — the `DocPage` contract

`content/docs/<topic>.md` (one of the 9 P2 topics, `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.5`'s "9 P2 topics": quickstart, github-app, api, rules, security, providers, pricing, quotas, privacy):

```ts
export const DocsGroup = z.enum([
  "get-started",     // quickstart, github-app
  "configure",       // rules, security, providers
  "reference",       // api, pricing, quotas
  "legal-security",  // privacy
]);
export type DocsGroup = z.infer<typeof DocsGroup>;

export const DocPageFrontMatter = BaseFrontMatter.extend({
  /** The doc's FR-block owner — a named engineer who wrote the first draft (`CONTENT_STRATEGY.md §2.1`'s "a doc owner (the same person who owns the FUNCTIONAL_REQUIREMENTS.md FR block)"). Feeds the `Article.author` `@id` ref (a `Person`, `STRUCTURED_DATA.md §3.7`'s "the `docsAuthor` field" line). */
  docsAuthor: z.string().min(1),
  /** The FR ID(s) the doc explains (a `PRODUCT/FUNCTIONAL_REQUIREMENTS.md` reference; a `FR-201`..`FR-210` / `FR-504` / `FR-505` / `FR-506` / `FR-510` / `NFR-*` / `L-*` string) — the `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.2`'s "every feature carries its FR ID" traceability rule, applied to the *docs* surface (a doc page that teaches a procedure with no FR/NFR/L traceable source fails `CONTENT_STRATEGY.md §2.1`'s "every number is traceable to a doc in `docs/`" review gate). */
  frIds: z.array(z.string()).default([]),
  /** The doc's group, for the `/docs` hub's topic-index grouping (`INFORMATION_ARCHITECTURE_AND_PAGES.md §3.5`'s "grouped: Get started / Configure / Reference / Legal & security" line). */
  group: DocsGroup.default("reference"),
}).strict();
export type DocPageFrontMatter = z.infer<typeof DocPageFrontMatter>;
```

- **JSON-LD fed:** `Article` (+ `BreadcrumbList`) on `/docs/<topic>` — `STRUCTURED_DATA.md §3.7`/`§1`'s "a docs page carries `Article` + `BreadcrumbList` JSON-LD" line, with the `author` = the `docsAuthor` (a named `Person` ref to the `/about` team, the `CONTENT_STRATEGY.md §2.1`'s "a doc owner" line) and the `dateModified` = the last *material* docs change (a `lastmod`-is-honest rule, `CONTENT_STRATEGY.md §3`'s point 5: "a typo fix is not a lastmod bump"). The `BreadcrumbList` (`WFR-104`) is `["Vercode", "Docs", <title>]` (a `STRUCTURED_DATA.md §3.8`'s shape). The `/docs` hub's `ItemList` (`STRUCTURED_DATA.md §1`'s "a `/docs` index `ItemList` of the 9 P2 docs topics") is generated from the `content/docs/` directory's published entries, grouped by the `group` field.
- **The `docsAuthor` vs. the `author` base field:** a `DocPage` uses `docsAuthor` (a *distinct* field, not the `BaseFrontMatter.author`), because a doc page's "author" is the *FR-block owner* (an engineering role, not a named marketing-byline author) — `STRUCTURED_DATA.md §1`'s "the `author` (a `Person` — the doc owner, `CONTENT_SCHEMAS.md`'s `docsAuthor` field)" line. The `Person` JSON-LD it points at is still a `/about` team member (`INFORMATION_ARCHITECTURE_AND_PAGES.md §3.8`), just reached via the `docsAuthor` key.

### CS-05 — The pricing — the `PricingSource` contract (`content/pricing/pricing.json`)

`content/pricing/pricing.json` (the **machine-readable source of truth**; `WFR-203`'s "the plan ladder from `PRICING_STRATEGY.md`… with **exact quota numbers from `USAGE_QUOTAS.md`** verbatim" line + the `STRUCTURED_DATA.md §2.2`'s "the prices come from `apps/website/content/pricing/pricing.json`" line + the `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.3`'s consistency rule):

```ts
// packages/contracts/src/content/pricing-source.ts
import { z } from "zod";
import { PlanSchema } from "../plans.js"; // the same Plan enum — the USAGE_QUOTAS.md §2 single source of truth, one import surface

export const OfferSourceSchema = z.object({
  plan: PlanSchema,                     // "free" | "developer" | "team" | "enterprise" (plans.ts's PlanSchema, never a hand-typed string)
  /** The monthly price in USD. A string, not a number: "0", "49", "499", "negotiated", "PLACEHOLDER".
   *  (A string, because "negotiated" + "PLACEHOLDER" are non-numeric states the `PRICING_STRATEGY.md §7`'s
   *  "the exact price points are a market decision" deferral requires; a JSON number can't carry that.) */
  price: z.string().min(1),
  priceCurrency: z.string().length(3).default("USD"),
  /** A human-readable quota line (a verbatim `USAGE_QUOTAS.md §2` row, the "a literal number" rule — e.g.
   *  "500 reviews/month · 60 files/review · 3 concurrent · 90-day finding retention · 10 custom rules · the standard model tier").
   *  This string is the `Offer.description` (a `STRUCTURED_DATA.md §4.3`'s "the `Offer.description` is the quota line" rule) —
   *  it is GENERATED from `plans.ts`'s `*_QUOTA` record at build time, not hand-typed (see §4.2's drift check below). */
  quotaSummary: z.string().min(1),
  /** The plan's position line, for the card's subhead (a `PRICING_STRATEGY.md`'s "the structure" shape). */
  positioning: z.string().min(1),
}).strict();

export const PricingSourceSchema = z.object({
  /** ISO-8601 date (the "as of" of the prices, a `SEO_AEO_GEO.md §4.4`'s "a `asOf` is required on every fact" line). */
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** The 4 plans, in the `USAGE_QUOTAS.md §2` ladder order (`FREE → DEVELOPER → TEAM → ENTERPRISE`). */
  offers: z.array(OfferSourceSchema).length(4),
}).strict();
export type PricingSource = z.infer<typeof PricingSourceSchema>;
```

The `offers` are the 4 plans in the `USAGE_QUOTAS.md §2` ladder order. The `price` values: the **Free** plan is `"0"` (a `PRICING_STRATEGY.md`'s "a Free $0" line — the Free tier is a permanent $0 plan, `INFORMATION_ARCHITECTURE_AND_PAGES.md`'s "the Free tier is a real product, not a trial" rule), and the `Developer`/`Team`/`Enterprise` prices are **`PLACEHOLDER`** until the market-research + a willingness-to-pay decision lands (`PRICING_STRATEGY.md §7`'s "the structure is here, the numbers are a go-to-market decision" deferral). A `PLACEHOLDER` price *fails* a **production** deploy (a `RELEASE_CRITERIA`'s "a launch that's claimed without a measured metric" rule applied to pricing) — the production build rejects a non-numeric `price` on a `developer`/`team` plan; the dev build tolerates it (`STRUCTURED_DATA.md §6`'s "a `PLACEHOLDER` is a *one-line* edit in `pricing.json` at launch, not a *doc* change" line).

**The `quotaSummary` is generated from `plans.ts`, not hand-typed** — the `schema-generator.ts` reads the `PlanQuota` record for the plan (`packages/contracts/src/plans.ts`'s `FREE_QUOTA`/`DEVELOPER_QUOTA`/`TEAM_QUOTA`/`ENTERPRISE_QUOTA`) and formats it into the `USAGE_QUOTAS.md §2` row's shape (the "500 reviews/month · 60 files/review · 3 concurrent · 90-day finding retention · 10 custom rules · the standard model tier" line). This is the `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.3`'s "the numbers on this page are **generated** from `content/pricing/` (a JSON source of truth), never hand-typed" rule + the `USAGE_QUOTAS.md`'s `AC-401` "a hardcoded quota number elsewhere is a defect" line, applied to the website's pricing source.

**What the `PricingSource` feeds (the `WFR-402` "triple source" rule, `SEO_AEO_GEO.md §4.3`):** the `/pricing` page's 4 `Product`+`Offer` pairs (`STRUCTURED_DATA.md §3.4`), the `/pricing` page's 6-question `FAQPage` block, the `/` page's `SoftwareApplication` `offers` (`STRUCTURED_DATA.md §3.3`'s example), the `/api/answer`'s `pricing.*` intents (§5 below), and `llms.txt`/`llms-full.txt`'s "## Pricing" section — **all five** consumers read the **same** `PricingSourceSchema`-validated `pricing.json` + the **same** `plans.ts` `*_QUOTA` record, in **one** build; a pricing/quota change that's not in all five simultaneously is a *build failure*, not a "stale" state (`RELEASE_CRITERIA.md`'s docs-drift gate, §4.2 below).

### CS-06 — The `ProductFact` contract (`content/facts/product-facts.json` — the `/api/answer` + `llms.txt` backing)

The `ProductFact` is the **machine-readable fact record** that backs both the `llms.txt`/`llms-full.txt` surface and the `/api/answer` route (`STRUCTURED_DATA.md §4`'s "triple source" rule, `SEO_AEO_GEO.md §4`'s GEO section, `WFR-401`/`WFR-402`/`WFR-403`). It is a **JSON file** (`content/facts/product-facts.json`), *not* a Markdown item, because it is a *data* artifact, not a *page* — it is never rendered as a route, only serialized into `llms.txt`/`llms-full.txt` and returned by `/api/answer` (`TECHNICAL_ARCHITECTURE.md §4.2`'s "the GEO backing is a *deterministic* fact lookup" rule).

```ts
export const ProductFactSchema = z.object({
  /** A stable, camelCase fact id (the `ProductFact.id` the `/api/answer`'s intent enum keys on, e.g. "pricing.team.price", "quota.team.reviewsPerMonth", "faq.openSource", "confidenceFloor.default", "latency.p50"). */
  id: z.string().regex(/^[a-z][a-zA-Z0-9.]*$/),
  /** The human-readable label (the `ProductFact.label`). */
  label: z.string().min(1),
  /** The value. A string: "0", "50", "5000", "0.6", "standard+strong", "negotiated", "MIT-licensed". A numeric fact is the *literal* figure (a `SEO_AEO_GEO.md §4.5`'s "Named figures, not rounded ones" rule). */
  value: z.string().min(1),
  /** The unit, for a numeric fact ("reviews/month", "seconds", "USD/month", "days"). An empty string for a non-numeric fact (the `SEO_AEO_GEO.md §4.5`'s "a literal number with a unit" rule). */
  unit: z.string().default(""),
  /** The self-contained, quotable sentence (the "the fact is verbatim-quotable" rule, `SEO_AEO_GEO.md §4.5`'s point 1 + the `CONTENT_STRATEGY.md §1.1`'s "specificity" lever, at the schema level). */
  sentence: z.string().min(1),
  /** The canonical URL a human can check (the `ProductFact.source`, `SEO_AEO_GEO.md §4.4`'s "a fact without a human-checkable source is a claim, not a fact" line; a `VERCODE_WEBSITE_BASE_URL`-prefixed absolute URL). */
  source: z.string().url(),
  /** ISO-8601 date (the `ProductFact.asOf`, `SEO_AEO_GEO.md §4.4`'s "a fact without a date is a fact that will be wrong at some point and still be cited" line). */
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict();

export const ProductFactGroupSchema = z.object({
  /** The section heading in `llms.txt`/`llms-full.txt` ("Pricing", "Quotas and limits", "What VERCODE does", "Is VERCODE open source?", "Can I self-host VERCODE?", `SEO_AEO_GEO.md §4.1`'s `##` section order — "in the same order as the hero → CTA", `WFR-401`). */
  heading: z.string().min(1),
  /** The facts in that section, in the page's narrative order. */
  facts: z.array(ProductFactSchema).min(1),
}).strict();

export const ProductFactSetSchema = z.object({
  /** ISO-8601 date (the "last regenerated" of the fact set). */
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  groups: z.array(ProductFactGroupSchema).min(1),
}).strict();
export type ProductFact = z.infer<typeof ProductFactSchema>;
export type ProductFactSet = z.infer<typeof ProductFactSetSchema>;
```

**The `ProductFact`'s field names and the JSON-LD field names, reconciled** (the `SEO_AEO_GEO.md §4.5`'s "a claim about a *plan* is a claim about a *specific* plan" rule + the `STRUCTURED_DATA.md §4.3`'s "a `Product`+`Offer` with a *literal* `Offer.description` is the most LLM-quotable pricing artifact" line):

| `ProductFact` field | The JSON-LD equivalent | The rule |
| --- | --- | --- |
| `id` | — | a stable camelCase id; the `/api/answer`'s intent enum (`pricing.team.price`, `quota.free.reviewsPerMonth`, …, §5.1) is keyed on the `id` string |
| `label` | — | the `ProductFact.label` a human reads |
| `value` + `unit` | the `Offer.price` + `Offer.priceCurrency` (a `STRUCTURED_DATA.md §3.4`'s `Product`+`Offer` pair); the `SoftwareApplication.offers` (a `STRUCTURED_DATA.md §3.3`) | **the same number, not a paraphrase** — a `ProductFact.value` of `"5000"` for a `quota.team.reviewsPerMonth` fact **must equal** the `TEAM_QUOTA.reviewsPerMonth` in `packages/contracts/src/plans.ts` (the `USAGE_QUOTAS.md` single source of truth) and the `Offer.description`'s "5,000 reviews/month" string (the §4.2's check-4 "a `ProductFact` that says `500` when `TEAM_QUOTA.reviewsPerMonth` is `5000` is a **build failure**" drift check) |
| `sentence` | the `FAQPage.acceptedAnswer.text` (a `STRUCTURED_DATA.md §3.5`) + the `Product`/`Offer` `description` + the `llms.txt` bullet | **byte-equivalent** (the `WFR-204` FAQ byte-equivalence + the `STRUCTURED_DATA.md §4.2`'s "the JSON-LD text == the visible text" rule, automated by the CI's `triple-source` check, §4.2) |
| `source` | the `Product.url` / the `Offer.url` / the `Article.mainEntityOfPage` (a `STRUCTURED_DATA.md §3`) | a canonical URL, the `VERCODE_WEBSITE_BASE_URL`-prefixed (`TECHNICAL_ARCHITECTURE.md §6`) |
| `asOf` | — | the fact's freshness; the `Offer`'s `price` carries it implicitly (a `price` change **is** an `asOf` change, the `RELEASE_CRITERIA`'s "a measured, not a checkbox" rule applied to a *fact's* staleness) |

**The `PricingSource` → `ProductFact` feed (a `content/pricing/` + a `content/facts/` cross-check):** the `PricingSource` (§3's `CS-05` section) is a *superset* of the `pricing.*` `ProductFact` set (§3's `CS-06` section): every `pricing.<plan>.price` and every `quota.<plan>.<dimension>` `ProductFact` is **generated** from `pricing.json`'s `offers` + `plans.ts`'s `*_QUOTA` records at build time. A `ProductFact` for a pricing/quota fact that is **not** derived from those two sources is a *defect* (a hand-typed number in the fact set is the "a hardcoded quota number elsewhere is a defect" rule, `USAGE_QUOTAS.md`'s `AC-401`, applied to the website's `ProductFact` register).

The **narrative** `ProductFact`s (the "what VERCODE does" + the "is it open source" + the "can I self-host" facts, `SEO_AEO_GEO.md §4.1`'s `##` sections 4–6) are **authored** in `content/facts/narrative.md` (a Markdown file, a `CONTENT_STRATEGY.md`'s "a short declarative sentence, the numbers literal, no marketing adjectives" rule) and parsed into the `ProductFactSet` at build time — a `narrative.md` with a fact whose number is not traceable to a `docs/` doc fails the `CONTENT_STRATEGY.md §2.1`'s "every number is traceable to a doc in `docs/`" review gate (§4.2's CI lane + §5's human AEO pass, together).

### CS-07 — The FAQ (`/faq`) — the `FaqItem` contract

`content/faq/*.md` (one item per question, the ≥ 15-question set, `WFR-204`'s "lists ≥ 15 questions, each with `mainEntity` `Question` + `acceptedAnswer` in the `FAQPage` JSON-LD" line; the *canonical* question set is `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.4`'s 16-row table):

```ts
export const FAQGroup = z.enum([
  "getting-started",   // 4 questions (INFORMATION_ARCHITECTURE_AND_PAGES.md §3.4's group)
  "reviews-findings",  // 4
  "security-privacy",  // 4
  "billing-limits",    // 3 (the 6th "question" in the §3.4 table is a standalone "How do I export or delete my data?" — a 16-row table, not 15; `WFR-204`'s "≥ 15" is a *floor*, not a cap)
]);
export type FAQGroup = z.infer<typeof FAQGroup>;

export const FaqItemFrontMatter = BaseFrontMatter.extend({
  /** The question, verbatim. The `Question.name` in the FAQPage JSON-LD. */
  question: z.string().min(1),
  /** The group, for the `/faq` page's 4-group layout (a `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.4`'s "15+ questions in 4 groups: Getting started / Reviews & findings / Security & privacy / Billing & limits" line). */
  group: FAQGroup,
  /** The order within the group (a 1-indexed number, for the `/faq` page's + the top-5 teaser's (`INFORMATION_ARCHITECTURE_AND_PAGES.md §3.1`'s block 6) deterministic ordering). */
  order: z.number().int().positive(),
}).strict();
export type FaqItemFrontMatter = z.infer<typeof FaqItemFrontMatter>;
```

**The `WFR-204` byte-equivalence, made structural** (the task's "note the AEO constraint that the FAQ visible text must equal the JSON-LD text byte-for-byte"): the *visible* FAQ answer on `/faq` (and the top-5 teaser on `/`, `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.1`'s block 6, "the visible 5 are the same text as the full `/faq` answers") and the `FAQPage` JSON-LD's `acceptedAnswer.text` are **rendered from the same item's body**. The item's Markdown body *is* the answer (the `CONTENT_STRATEGY.md`'s "a FAQ item's body is the `Answer.text`" convention, `SEO_AEO_GEO.md §3.3`'s "the mechanism is a *shared source*, not a discipline" line). The `schema-generator.ts` (`STRUCTURED_DATA.md §2.3`) reads the item's parsed body (a "strip the HTML, keep the text" pass) and writes it verbatim into `acceptedAnswer.text`. **A mismatch is a build failure** (the `triple-source` check, `STRUCTURED_DATA.md §5.1`), not a human review — `CONTENT_STRATEGY.md §4`'s "Q5 schema match: The JSON-LD's text == the visible text (byte-equivalent for FAQ…)" check is *automated* by the generator + the CI's `ld-lint`/`triple-source` lane (§4.2), not by a human eyeball (`SEO_AEO_GEO.md §3.3`'s "an editor must internalize: **editing the visible FAQ text is not possible** — the text is edited in `content/faq/`, and it changes *both* surfaces").

**The 6-question pricing FAQ** (on `/pricing`, `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.3`'s block 4: which plan, what happens at the quota, can I BYOK, do you offer annual, what if I exceed the quota, can I self-host) is a **separate** item set (`content/faq/pricing/*.md`), a separate `FAQPage` block on the `/pricing` page (a `STRUCTURED_DATA.md §3.5`'s "a separate `content/faq/pricing.json` item set… a separate `FAQPage` block on the `/pricing` page (a `mainEntity` of 6), not a subset of the 15-question `/faq` set" line — note: the sibling doc's "pricing.json" here is a *naming carry-over*; this doc's §1 tree + this §'s `content/faq/pricing/*.md` (a *directory* of 6 Markdown items, not a single `.json` file) is the actual shape, a small sibling-doc imprecision, *reported, not fixed in the sibling*).

### CS-08 — The legal pages (`/legal/*`) — the `LegalPage` contract

`content/legal/<page>.md` (`INFORMATION_ARCHITECTURE_AND_PAGES.md §3.9`'s 5 routes: `terms`, `privacy`, `security`, `dpa`, `status`; `WFR-406`'s "a `/legal/` cluster: `terms`, `privacy`, `security` (a public trust page that *links* to `docs/SECURITY/SECURITY_ARCHITECTURE.md` in a simplified public form), `dpa`…, `status` (a link to the status page, a launch prereq)" line):

```ts
export const LegalPageType = z.enum(["terms", "privacy", "security", "dpa", "status"]);
export type LegalPageType = z.infer<typeof LegalPageType>;

export const LegalPageFrontMatter = BaseFrontMatter.extend({
  /** Which of the 5 `/legal/*` routes this item is. The `/legal` cluster is *fixed* (5 routes, `WFR-406`/`WFR-101`'s "No other public routes" line) — a new legal route is a *route-set* change (a `WFR-101` deviation), not a content change, so this enum is the guardrail. */
  type: LegalPageType,
  /** ISO-8601 date — the "last updated" date `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.9`'s "a 'last updated' date" + `SEO_AEO_GEO.md §2`'s on-page title-pattern's "<X> — Vercode" description's "the scope + the 'last updated' date" line. This is the *legal* page's own `lastmod` honesty rule (a `CONTENT_STRATEGY.md §3`'s point 5), separate from the `BaseFrontMatter.updated` (a *material* content change) — a legal page's `lastUpdated` is bumped on *every* re-issue (a terms change is a legal re-issue, not a "typo fix"), so it is a distinct, required, explicitly-bumped field, not the optional `updated`. */
  lastUpdated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict();
export type LegalPageFrontMatter = z.infer<typeof LegalPageFrontMatter>;
```

- **JSON-LD fed:** **only** a `BreadcrumbList` — `STRUCTURED_DATA.md §1`'s "`/legal/*` … No rich block; the legal pages are plain readable pages (`INFORMATION_ARCHITECTURE_AND_PAGES.md §3.9`), so the only structured data is the breadcrumb chain. A `WFR-402` 'triple source' fact check still applies: the `terms`/`privacy`/`security`/`dpa` pages *do* appear in `llms.txt` (a short one-line each) and `sitemap.xml`" line — a legal page has *no* `Article`/`FAQPage`/`Product` block (a legal text is not a "product fact"), but its *one-line* `llms.txt` entry + its `sitemap.xml` presence are the `WFR-402` triple-source check for legal pages specifically (a `llms.txt` line like "- Terms of Service: https://vercode.com/legal/terms", no *number* carried, just a *canonical URL*, a `SEO_AEO_GEO.md §4.1`'s "every bullet is a self-contained fact… and a URL" line).
- **The `/legal/status` carve-out (`WFR-406` + `PRD.md §8 U3`'s "a status page — a *link* to one is P2; the *page* is a separate service"):** the `status` `LegalPage` item's *body* is a thin link/embed of the external status service (a `VERCODE_…_STATUS_URL` env-var-driven URL, an `OPERATIONS/ENVIRONMENT_VARIABLES.md` decision, `U3`'s "leaning (a): an external link + a thin `/legal/status` page that embeds the external dashboard" line) — the item is still a `LegalPage` (a `type: "status"` front-matter + a `lastUpdated`), but its *content* is deliberately minimal (a link, not a prose document), and `ROADMAP_AND_ACCEPTANCE_CRITERIA.md`'s `W-AC-12`'s "`/legal/status` link-resolution test (the target external service URL is reachable, `E2E-web-status-link`)" verifies the *target*, not the item's body.

## 4. The publishing workflow + the CI validation rules

The `CONTENT_STRATEGY.md §5`'s "The publishing workflow (a single PR, two reviews, one CI): author → a `content/`-schema CI run (the build gate) → 2 peer reviews → the AEO lane → merge → the static site redeploys… **No out-of-band publishing** (no manual CMS edits; a P2 content change is a PR — the "no CMS" rule, `CONTENT_SCHEMAS.md`'s scope note)" rule, concretized:

```
author (a PR against content/…)
  →  CI: the `content/`-schema gate (a `RELEASE_CRITERIA.md` docs-drift gate, §4.2's 4 checks)   ← a `make check-website` sub-lane, `TECHNICAL_ARCHITECTURE.md §5`
  →  2 peer reviews (the CONTENT_STRATEGY.md §5 ownership table, below)
  →  the AEO lane (the automated Q1–Q5 check, `CONTENT_STRATEGY.md §4`'s table, a *human* editorial pass over a *machine*-assisted one — §4's 4 checks are machine; §4's Q1–Q4 "quotability" checks are a human AEO editorial pass that the CI *flags* but does not *judge* (a `CONTENT_STRATEGY.md §4`'s "a post that fails Q1–Q5 is rewritten, not published" line — Q5 is the one that's *automated* (byte-equivalence), Q1–Q4 are the *editorial* half)
  →  merge → a static re-deploy (`TECHNICAL_ARCHITECTURE.md §5`'s "the static site redeploys" line)
```

**The ownership table** (`CONTENT_STRATEGY.md §5`'s "The ownership & process" table, restated with the schema column made explicit):

| Surface | Author | Reviewer | The schema gate (this doc's `CS-##` ID) |
| --- | --- | --- | --- |
| Docs (`content/docs/`) | the feature's owner | the doc owner (FR block) + a peer | `CS-04` (`DocPageFrontMatter`) + an `frIds` traceability check (§4.2, check 4) |
| Changelog (`content/changelog/`) | the release engineer | the doc owner | `CS-03` (`ChangelogEntryFrontMatter`) + a *release* gate (the `CI_CD.md`'s release lane, a git-tag-existence assert, §4.2) |
| Blog (`content/blog/`) | any named author | 2 peers (one technical, one editing) | `CS-02` (`BlogPostFrontMatter`) + the `CONTENT_STRATEGY.md §2.3` 3-part test (a *human* editorial gate, not a Zod gate) |
| FAQ (`content/faq/` + `content/faq/pricing/`) | the doc owner | the product owner | `CS-07` (`FaqItemFrontMatter`) + the FAQ byte-equivalence (§4.2, check 3) |
| Pricing (`content/pricing/`) | the pricing owner (a `SAAS_LAUNCH_PLAN`'s GTM) | the doc owner + a peer | `CS-05` (`PricingSourceSchema`) + the pricing-drift check (§4.2, check 4) |
| Facts (`content/facts/`) | the SEO owner | the doc owner | `CS-06` (`ProductFactSetSchema`) + the `keywords.json`/intent-enum generation (§5) |
| Legal (`content/legal/`) | the legal/compliance owner | the doc owner + a peer | `CS-08` (`LegalPageFrontMatter`) |

### 4.1 The `draft` and the `archived` states, concretely

- **`draft`** — the item is *in* the repo, *not* in the site (a `WFR-305`'s "a `draft` is never rendered publicly, never in `sitemap.xml`" line). The item's route is *not* generated; the `sitemap.xml` and the `schema-generator.ts` both filter on `status === "published"`.
- **`archived`** — the item is *removed from the site's index* but the **canonical URL stays resolvable** as a 410 (`CONTENT_STRATEGY.md §3`'s point 7, "a 410 is better than a 404 for SEO continuity"). The build's route generation emits a 410 handler for the archived URL; the `sitemap.xml` excludes it.
- **The `archived` item's JSON-LD is omitted from the `sitemap.xml`** but **kept on the 410 page** (a 410 page that has no JSON-LD is a broken-cite page; a 410 page that *does* have the JSON-LD is a page that tells a crawler "this URL *was* a thing, it's gone now, here's the last-known metadata" — a `CONTENT_STRATEGY.md §3`'s point 7, restated as a build rule).

### 4.2 The 4 validation rules the `content/`-schema CI gate runs

The gate is `RELEASE_CRITERIA.md`'s **docs-drift** gate, **extended to the `content/` dir** — `TECHNICAL_ARCHITECTURE.md §5`'s "the *existing* 12 gates (`RELEASE_CRITERIA.md`) + one **new** website-specific lane (a `gate 14`, **new**, the CI lane convention… a **separate** merge gate… a single `check` target is `make check-website`" line + `TECHNICAL_ARCHITECTURE.md §1`'s "`content/` … validated by `packages/contracts` + a CI build-time gate (`RELEASE_CRITERIA.md`'s docs-drift gate, `gate 12`)".

> **Gate-number reconciliation (a stated discrepancy, not silently propagated):** `TECHNICAL_ARCHITECTURE.md` (§1 + §5) + `STRUCTURED_DATA.md` (§5.1) + `ROADMAP_AND_ACCEPTANCE_CRITERIA.md` (WT1.3, `W-AC-06`) all cite this as **`RELEASE_CRITERIA`'s "docs-drift" gate `12`**. The *actual* `docs/TESTING/RELEASE_CRITERIA.md`'s gate list numbers **`gate 11` = Docs drift** ("a docs-drift CI check (the traceability matrix, `TRACEABILITY_MATRIX.md`)") and **`gate 12` = Dependency / supply chain** (`pnpm audit` + a lockfile check). This is the *same* off-by-one already flagged in `DEPLOYMENT_AND_TESTING.md`'s own reconciliation note ("a `gate 12` / a `gate 11` off-by-one… a `gate 11` is the docs-drift gate, a `gate 12` is the supply-chain gate… **Reported here; the sibling doc is not fixed**"). **This doc cites the docs-drift gate as `gate 11` (the `RELEASE_CRITERIA.md`-correct number)** and does *not* propagate the `gate 12` typo into a *new* citation; the `gate 14` (a *new* website lane) number is unaffected either way and is cited as-is.

| # | Check | What it asserts | The failure it catches |
| --- | --- | --- | --- |
| 1 | **Zod parse** (every `content/**/*.{md,json}` front-matter + JSON body against the §2/§3 schemas, `CS-01`..`CS-08`) | a malformed front-matter key, a `status: "drat"` typo, a missing `title`/`description`/`status` on a `BlogPost`, a `pricing.json` with 3 `offers` instead of 4 | a "a blog post that's malformed fails the build" defect (`TECHNICAL_ARCHITECTURE.md §2`'s "a blog post that's malformed fails the build" line, `WFR-304`'s "validated against a `Contract` schema" line) — the `.strict()` rule (§2's conventions) makes this a *hard* parse failure, not a lint warning |
| 2 | **No orphans** (a `content/` item with no *reachable* route: a published item whose route isn't in the `sitemap.xml` route set, or a `sitemap.xml` URL with no matching `content/` item) | a "published" item that the site can't actually render (a missing route template), or a `sitemap.xml` URL that points at nothing | the `INFORMATION_ARCHITECTURE_AND_PAGES.md §5`'s "No orphan public page" rule + `SEO_AEO_GEO.md §5.2`'s weekly crawl job's step 4 "The reverse check (no orphan)" — a build-time version of the same rule (the *weekly* job catches a *production*-only orphan; the *build*-time check here catches the *authored*-item half) + a **`keywords.json`/intent-coverage sub-check** (a §5.2's `keywords.json` that names an intent not in the `AnswerIntent` enum, or an `AnswerIntent` with no `keywords.json` keyword, is an orphan/dead intent — the same "no orphan" rule, applied to the *intent* table, not just the *route* table; a dedicated "intent-coverage" sub-check under the `content/`-schema gate, §5.2's "a dedicated 'intent-coverage' sub-check" line) |
| 3 | **FAQ byte-equivalence** (`CS-07`'s `WFR-204` rule, §3's "The `WFR-204` byte-equivalence, made structural" block) | a visible FAQ answer that drifts from the `FAQPage` `acceptedAnswer.text` (e.g. an editor "tweaks" the visible text without editing `content/faq/`, or vice versa — the two are *supposed* to be the same string, so a drift is only ever an *introduction* of a second hand-typed copy, which is the exact "a two-source quota is a drift vector" defect, `USAGE_QUOTAS.md §6`'s rule, applied to FAQ text) | the `triple-source` check, `STRUCTURED_DATA.md §5.1`'s "a custom `triple-source` check… Greps the built HTML for the `FAQPage` `acceptedAnswer.text`… asserts each is a *substring* of the HTML" line |
| 4 | **Pricing-drift check** (`CS-05`/`CS-06`'s §3 "a `PricingSource` → `ProductFact` feed" cross-check) | a `ProductFact` (a `content/facts/product-facts.json` record, or a hand-typed number anywhere on `/pricing`/`/faq`/`/docs/pricing`/`llms.txt`) that **doesn't equal** the `PricingSourceSchema`-validated `pricing.json` + the `plans.ts` `*_QUOTA` constant | the `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.3`'s "a pricing change in *one* file updates *everywhere* — a drift is structurally impossible, not just policed" line + `ROADMAP_AND_ACCEPTANCE_CRITERIA.md`'s `W-AC-03`/`WT2.2`'s "a pricing-drift test (the page number == the `content/pricing/` source, byte-equal… a structural drift-impossibility)" line + `USAGE_QUOTAS.md`'s `AC-401` "a hardcoded quota number elsewhere is a defect" rule, applied to the website's pricing/fact surfaces |

**The gate is a *separate* merge gate** (the `website` deployable's own gate, `OPERATIONS/CI_CD.md`'s lane convention — the *app* lanes + the *website* lanes are **independent** CI runs, a `make check-website` target, `TECHNICAL_ARCHITECTURE.md §5`): a red `content/`-schema gate holds the *website* deploy, not the *app* deploy (the two surfaces are decoupled deployables, `TECHNICAL_ARCHITECTURE.md §1`'s "a separate app lets the website **fail independently**" line).

**The "a measured gate" for a pricing change (a `CS-05` change):** a pricing change is a **one-file edit** (`content/pricing/pricing.json`'s the `offers` array, a `RELEASE_CRITERIA`'s "a `plans.ts` edit + a migration" pattern, `USAGE_QUOTAS.md §6`'s "a quota change is a `plans.ts` change + a migration" line) that flows to `Product`+`Offer` JSON-LD, the visible `/pricing` page, `/api/answer`, `llms.txt`, and `llms-full.txt` in **one build**. The `RELEASE_CRITERIA.md` docs-drift gate (§4.2's check 4, `gate 11` per the reconciliation note above) is the gate that asserts the consistency. A `PLACEHOLDER` price that reaches a **production** deploy is a `RELEASE_CRITERIA.md` gate-13-style "a live external suite that's blocked (no credentials) is marked blocked, not claimed" posture applied to pricing — a production deploy with a `PLACEHOLDER` price is a *blocked*, not a *claimed*, deploy (`STRUCTURED_DATA.md §6`'s "a `PLACEHOLDER` is a *one-line* edit in `pricing.json` at launch, not a *doc* change" line).

## 5. The `ProductFact` + `/api/answer` contract (the `WFR-403` endpoint, `WFR-402`'s backing)

The `/api/answer` endpoint (`SEO_AEO_GEO.md §4.4`) is a **deterministic fact lookup** on the existing Fastify app (`TECHNICAL_ARCHITECTURE.md §1`'s `api` row, `ADR-0xx-3`'s "a new route on the *existing* `apps/api` (not a new service)" line) — **not** a runtime LLM (a `TECHNICAL_ARCHITECTURE.md §4.2`'s "No LLM at runtime (the GEO backing is a *deterministic* fact lookup, the `SEO_AEO_GEO.md §4` 'the fact is not generated, it's looked up' rule)"). Its query language is a **small Zod enum of intents** + a **bounded keyword match** (`TECHNICAL_ARCHITECTURE.md §4.2`'s "a `contracts`-validated query language (a small Zod enum + a bounded keyword match)" line) — this enum is **another** `packages/contracts` export (the §2's "One module, one import surface" rule: the `apps/api` route imports `AnswerIntent` from the *same* module the website build uses, never a re-declaration).

### 5.1 The intent enum (the `AnswerIntent` contract, `CS-06`'s feed)

```ts
// packages/contracts/src/content/pricing-source.ts (a sibling export, the §2's "one module" rule)
export const AnswerIntent = z.enum([
  "pricing.free.price",
  "pricing.developer.price",
  "pricing.team.price",
  "pricing.enterprise.price",
  "pricing.planComparison",
  "quota.free.reviewsPerMonth",
  "quota.developer.reviewsPerMonth",
  "quota.team.reviewsPerMonth",
  "quota.team.filesPerReview",
  "quota.team.concurrentReviews",
  "latency.p50",
  "latency.p95",
  "faq.openSource",
  "faq.selfHosted",
  "faq.sourceStorage",
  "faq.models",
  "faq.byok",
  "pipeline.deterministic",
  "confidenceFloor.default",
]);
export type AnswerIntent = z.infer<typeof AnswerIntent>;
```

Each intent maps to a `ProductFact.id` (a `pricing.team.price` → the `pricing.team.price` fact, a `quota.team.reviewsPerMonth` → the `quota.team.reviewsPerMonth` fact, a `faq.openSource` → the `openSource` narrative fact, …, `SEO_AEO_GEO.md §4.4`'s exact example-response shape). An intent that is **not** in this enum is *not* answered — it returns the 404 body, `generated: false` (a `SEO_AEO_GEO.md §4.4`'s "An endpoint that answers *everything* is a hallucination surface" line + the "a `404` is a legitimate, non-error answer… 'I don't have that fact' is the correct answer for an un-enumerated question" line).

### 5.2 The keyword match (the bounded query language) + the `keywords.json`/intent cross-check

The endpoint's `q` parameter is matched against a **bounded keyword table** (a `content/facts/keywords.json`, a `{ "intent": string[], … }` map), *not* against a LLM. The match is:

- an exact or a case-insensitive substring match on the `q` (e.g. `"what's the team plan price"` → `"team plan price"` is a substring of a keyword for `pricing.team.price` → the intent is `pricing.team.price`, a `SEO_AEO_GEO.md §4.4`'s exact example).
- a single intent is returned for a single `q` (an ambiguous `q` that matches two intents is a **404**, not a guess — the same "a hallucination surface" rule).

The `keywords.json` is **generated** from the `ProductFactSet` + the `AnswerIntent` enum at build time (a `ProductFact.label` is the *primary* keyword, and a small hand-curated synonym list is the *secondary* ones). The `keywords.json` is a **CI-asserted** artifact — a `keywords.json` that names an intent that is **not** in the `AnswerIntent` enum fails the build (a §4.2-style "no orphans" check, applied to *intent* coverage: a keyword with no enum entry is an orphan keyword, an intent with no keyword is a dead intent — both fail §4.2's check-1 "Zod parse" + a dedicated "intent-coverage" sub-check under the same `content/`-schema gate).

### 5.3 The OpenAPI contract change (`/api/answer` + `/api/track`)

The `/api/answer` route is a **contract change** (a new route on the existing Fastify app, `TECHNICAL_ARCHITECTURE.md §1`'s `api` row, `ADR-0xx-3`'s "decided **yes** (the minimal surface)" line). `docs/API/OPENAPI.yaml` gets **one new** `GET /api/answer` path (a `TECHNICAL_ARCHITECTURE.md §1`'s "a **contract change** (the OpenAPI drift, `RELEASE_CRITERIA` gate-11) — the route is added to `docs/API/OPENAPI.yaml` first" line, the *gate-11 = docs-drift/OpenAPI* number, consistent with §4.2's gate-number reconciliation note — an OpenAPI contract change is a *docs-drift-class* check under `gate 11`, `DEPLOYMENT_AND_TESTING.md`'s "gate 11… extended" line). The `RELEASE_CRITERIA.md` gate-11 docs-drift check (a "every FR whose behavior changed has updated docs *in the same PR*" line, `TRACEABILITY_MATRIX.md`'s own "the *drift gate*" framing) applies to the *new route's* docs — the `docs/API/API_SPECIFICATION.md`'s new section.

The `/api/track` beacon route (`PRD.md WFR-504`'s "one first-party, cookieless beacon on `/signin` success") is a **new** `POST /api/track` on the same Fastify app (a `TECHNICAL_ARCHITECTURE.md §4.2`'s "a `?src=web-{page}` beacon → a first-party cookieless `POST /api/track`… A 204 response, no cookie, no PII" line + a `DEPLOYMENT_AND_TESTING.md`'s beacon-lane "a cookieless-ness check" line). It is a 204 response, no cookie, no PII (`docs/SECURITY/PRIVACY.md`'s DPDP posture). The beacon is **not** a content schema (a `WFR-504`'s "one beacon" line) — it is an *API* route, not a `content/` item, and it is *out of scope* for this doc (a `DEPLOYMENT_AND_TESTING.md`'s "ST-public-* / ST-beacon-*" check owns it, not the `content/`-schema gate).

## 6. Traceability (schema → WFR → JSON-LD type → CI check)

The `TRACEABILITY_MATRIX.md`'s "a *row* = a FR → a component → a test → a doc" convention, applied to the website's content schemas: a `CS-##` row below = a schema → the `WFR-*` it satisfies → the JSON-LD type(s) it feeds (`STRUCTURED_DATA.md §1`'s table) → the CI check that validates it (§4.2's gate + `DEPLOYMENT_AND_TESTING.md`'s named test IDs, the `UT-web-*`/`E2E-web-*` convention, `ROADMAP_AND_ACCEPTANCE_CRITERIA.md`'s Part B).

| Schema (a `CS-##`, `packages/contracts/src/content/…`) | The `WFR-*` it satisfies | The JSON-LD type(s) it feeds (`STRUCTURED_DATA.md`) | The CI check that validates it |
| --- | --- | --- | --- |
| **`CS-01` `BaseFrontMatter`** (+ `StatusSchema`, `front-matter.ts`) | `WFR-305` ("Every published content item has a `front matter` shape… (title, description, date, author, tags, status: draft\|published\|archived)") | none directly (a shared base, not a per-route block) — the base fields *feed into* every row below's JSON-LD | §4.2's check 1 (a Zod parse, a `.strict()` unknown-key failure) + `ROADMAP_AND_ACCEPTANCE_CRITERIA.md`'s `W-AC-06`/`W-AC-07`/`W-AC-08`'s front-matter-validation `UT-web-*` tests + a `WFR-102` "a unique `<title>` ≤ 60 chars + a unique meta description 120–158 chars" check (the `description` field's `120–158` bound is *enforced* by this schema, not by a separate lint — `STRUCTURED_DATA.md §5.3`'s "a `PageDef.title` > 60 chars is a build-time `zod` rejection" line, a `WFR-102` + `WFR-305` joint rule) |
| **`CS-02` `BlogPostFrontMatter`** (`front-matter.ts`) | `WFR-303` ("each `/blog/<slug>` is an `Article` with `author` (`Person`), `datePublished`, `dateModified`, `headline` (≤ 110 chars), `image` (an OG 1200×630)") + `WFR-404` ("Per-page OG image for `/blog/<slug>` is the `image` field of `WFR-303`") | `Article` + `BreadcrumbList` (`STRUCTURED_DATA.md §3.7`/`§1`'s `/blog/<slug>` row) | §4.2's check 1 (Zod parse) + `W-AC-08`'s "an OG-image presence test on every `/blog/<slug>` (`UT-web-og-blog`)" + the `WFR-104` BreadcrumbList-on-every-`/blog/*` check (`UT-web-breadcrumb`) + `DEPLOYMENT_AND_TESTING.md`'s "unit: schema-generator output… for `/pricing`… assert the JSON-LD numbers match the `content/` source byte-for-byte" pattern, applied to a blog `Article` (the `title`/`description`/`date`/`tags` → `headline`/`description`/`datePublished`/`keywords` mapping is asserted by the same `schema-generator` unit test) |
| **`CS-03` `ChangelogEntryFrontMatter`** (+ `ChangelogSection`, `front-matter.ts`) | `WFR-302` ("each entry is a `CreativeWork` (or a `Release` on a dedicated page) with date + author + a human-readable summary. The feed uses an `ItemList` JSON-LD listing the latest 10") | `CreativeWork` (P2; a `Release` sub-block is P3, `STRUCTURED_DATA.md §6`'s "a P3 nicety" line) + `BreadcrumbList` + the `/changelog` index's `ItemList` (`STRUCTURED_DATA.md §3.8`/`§3.9`/`§1`'s `/changelog` row) | §4.2's check 1 (Zod parse) + `W-AC-07`'s "an `ItemList` schema check (latest-10 listing, `UT-web-changelog-itemlist`); a `ChangelogEntry` front-matter validation (a `date`+`version`+`sections` contract, `UT-web-changelog-frontmatter`)" + a **git-tag-existence assert** (a `CS-03`-specific check, §3's "a `ChangelogEntry` whose `version`/`date` don't correspond to a real release is a *fictitious release*" line — a *new*, named CI check under the `content/`-schema gate, not yet in `ROADMAP_AND_ACCEPTANCE_CRITERIA.md`'s `W-AC-07` list — a **gap this doc names**, the "a `CS-##` with no test is an incomplete feature" rule, `TRACEABILITY_MATRIX.md §1`'s "a *FR* without a test = an incomplete feature" line, applied here as "a *schema's* load-bearing rule without a test = an incomplete gate", §6's closing note below) |
| **`CS-04` `DocPageFrontMatter`** (+ `DocsGroup`, `front-matter.ts`) | `WFR-301` ("each `/docs/<topic>` is a static page… `Article` JSON-LD + `BreadcrumbList`") + `WFR-304` ("Content (blog/changelog/docs) is authored as Markdown… validated against a `Contract` schema… No CMS") + `WFR-104` ("Breadcrumb JSON-LD on every page `/docs/*`…") | `Article` + `BreadcrumbList` (`STRUCTURED_DATA.md §3.7`/`§1`'s `/docs/<topic>` row) | §4.2's check 1 (Zod parse) + `W-AC-06`'s "a `content/` schema gate (a `RELEASE_CRITERIA` docs-drift gate extended to `content/`, `UT-web-content-schema`)" + a `UT-web-docs-9` "a `sitemap.xml` + `ld-lint` green on the 9 topics" + a **`frIds` traceability check** (a `CS-04`-specific check, §3's "a doc page that teaches a procedure with no FR/NFR/L traceable source fails `CONTENT_STRATEGY.md §2.1`'s 'every number is traceable to a doc' review gate" line — a *human* AEO/editorial pass (§4's workflow) **plus** a machine-checkable `frIds` non-emptiness + a `frIds`-resolves-to-a-real-`FR-*`/`NFR-*`/`L-*` ID cross-check against `docs/PRODUCT/FUNCTIONAL_REQUIREMENTS.md` + `docs/IMPLEMENTATION/KNOWN_LIMITATIONS.md`'s ID sets, a §4.2 check-4 sub-check, **newly named here**, not yet in `W-AC-06`'s test list — a second **gap this doc names**) |
| **`CS-05` `PricingSourceSchema`** (+ `OfferSourceSchema`, `pricing-source.ts`) | `WFR-203` ("`/pricing` renders the plan ladder from `PRICING_STRATEGY.md`… with **exact quota numbers from `USAGE_QUOTAS.md`** verbatim; each plan is a `Product` + `Offer` JSON-LD pair") + `WFR-402` (the "triple source" rule — this is *the* single source those three places read from) | `Product` + `Offer` (×4 plans) + the `/` `SoftwareApplication`'s `offers` + `FAQPage` (the pricing FAQ) (`STRUCTURED_DATA.md §3.4`/`§1`'s `/pricing` row) | §4.2's check 1 (Zod parse) + **check 4 (the pricing-drift check)** + `W-AC-03`'s "a pricing-drift test (the page number == the `content/pricing/` source, byte-equal — a structural drift-impossibility, `UT-web-pricing-drift`); a `schema-dts` check on the `Product`+`Offer` pairs (`UT-web-offer-schema`)" + a **`PLACEHOLDER`-fails-production check** (a `CS-05`-specific check, §4.2's "a `PLACEHOLDER` price that reaches a production deploy… is a *blocked*, not a *claimed*, deploy" line, a §4.2 gate sub-check, **newly named here**, not yet in `W-AC-03`'s test list — a third **gap this doc names**) |
| **`CS-06` `ProductFactSetSchema`** (+ `ProductFactSchema`/`ProductFactGroupSchema`, `pricing-source.ts`) | `WFR-401` ("A top-level `llms.txt`… lists, in plain markdown, the key product facts… **in the same order as the hero → CTA**") + `WFR-402` ("Every `WFR-401` fact is also present in the visible page text + JSON-LD") + `WFR-403` ("A `/api/answer` JSON endpoint… returns the product's structured answers to a bounded query language") | `SoftwareApplication`/`Product`/`Offer` `description`s (the "same number, not a paraphrase" mapping, §3's `CS-06` section's "The `ProductFact`'s field names and the JSON-LD field names, reconciled" table) + the `llms.txt`/`llms-full.txt` "##" sections (a *non*-JSON-LD surface, `SEO_AEO_GEO.md §4.1`/`§4.2`) + the `/api/answer` response's `facts` array (`SEO_AEO_GEO.md §4.4`) | §4.2's check 1 (Zod parse) + **check 4 (the pricing-drift / `ProductFact`-vs-`plans.ts`-`pricing.json` cross-check)** + `W-AC-09`'s "a build-time `llms.txt` emission + a triple-source byte-consistency test (`UT-web-triple-source`); a `U6`-lean scope check (a minimal `/llms.txt` + a `/llms-full.txt` concatenation, `UT-web-llms-scope`)" + `W-AC-10`'s "a vitest unit over the bounded query language (`UT-web-answer`); a `Fastify` schema-validity check; the `RELEASE_CRITERIA` gate-11 OpenAPI-diff gate" |
| **`CS-07` `FaqItemFrontMatter`** (+ `FAQGroup`, `front-matter.ts`) | `WFR-204` ("`/faq` lists ≥ 15 questions… each with `mainEntity` `Question` + `acceptedAnswer` in the `FAQPage` JSON-LD; the visible answer text **matches the JSON-LD text byte-for-byte**") + `WFR-202` (the `/` page's "FAQ (top 5, `FAQPage` schema)" teaser, `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.1`'s block 6) | `FAQPage` + `BreadcrumbList` (`STRUCTURED_DATA.md §3.5`/`§1`'s `/faq` row; the `/` teaser + the `/pricing` 6-question set are *separate* `FAQPage` blocks from the *same* `content/faq/` source, `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.1`'s block 6 + `§3.3`'s block 4) | §4.2's check 1 (Zod parse) + **check 3 (the FAQ byte-equivalence)** + `W-AC-04`'s "a byte-equivalence test over all canonical questions (`UT-web-faq-byte`, the 16-question set from `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.4`) + a `FAQPage` schema check (`UT-web-faq-schema`)" + `W-AC-03`'s "a `FAQPage` byte-equivalence re-check on the pricing FAQ (`UT-web-faq-pricing`)" |
| **`CS-08` `LegalPageFrontMatter`** (+ `LegalPageType`, `front-matter.ts`) | `WFR-406` ("A `/legal/` cluster: `terms`, `privacy`, `security`…, `dpa`…, `status`…") + `WFR-305` (a legal page's front-matter is a `CS-08` item, so the `draft`/`published`/`archived` lifecycle + the "no draft in `sitemap.xml`" rule applies *to legal pages too*, not just blog/docs/changelog/FAQ — a `WFR-305`'s "Every published **content item**" wording covers the legal surface, §6's closing note's "a `WFR-305` scoping gap" line) | **only** `BreadcrumbList` (`STRUCTURED_DATA.md §1`'s "`/legal/*` … No rich block… so the only structured data is the breadcrumb chain" line) + a one-line `llms.txt` entry each + a `sitemap.xml` entry (the `WFR-402` triple-source check, `STRUCTURED_DATA.md §1`'s "A `WFR-402` 'triple source' fact check still applies: the `terms`/`privacy`/`security`/`dpa` pages *do* appear in `llms.txt`… and `sitemap.xml`" line) | §4.2's check 1 (Zod parse) + `W-AC-12`'s "a status + canonical check on each of the 5 legal pages (`UT-web-legal`); a `/legal/status` link-resolution test (the target external service URL is reachable, `E2E-web-status-link`)" + the `/legal` pages' `BreadcrumbList`-on-every-`/legal/*` check (a `WFR-104` extension to `/legal/*` — `STRUCTURED_DATA.md §1`'s "`/legal/*` … the only structured data is the breadcrumb chain" implies the breadcrumb is *present*, so `WFR-104`'s "every page `/docs/*`, `/changelog/*`, `/blog/*`" is *read* as "every *content* page", a §6's "a `WFR-104` scoping note" below) |

**The three named gaps (a `CS-##` rule with no test yet, `TRACEABILITY_MATRIX.md §1`'s "a *FR* without a test = an incomplete feature" rule, applied to *schemas*):**
1. **`CS-03`'s git-tag-existence assert** (a `ChangelogEntry`'s `version`+`date` must correspond to a real release tag) — named in §3, not yet in `W-AC-07`'s test list; add a `UT-web-changelog-tag-exists` under the `content/`-schema gate.
2. **`CS-04`'s `frIds` ID-resolves check** (a `DocPage`'s `frIds` must resolve to a real `FR-*`/`NFR-*`/`L-*` ID in `docs/PRODUCT/FUNCTIONAL_REQUIREMENTS.md` + `docs/IMPLEMENTATION/KNOWN_LIMITATIONS.md`) — named in §3, not yet in `W-AC-06`'s test list; add a `UT-web-docs-frids-resolve` under the `content/`-schema gate.
3. **`CS-05`'s `PLACEHOLDER`-fails-production check** (a `price` of `"PLACEHOLDER"`/`"negotiated"` (a non-numeric, non-`"0"` value) is *tolerated* in a dev build, *rejected* in a production build) — named in §4.2, not yet in `W-AC-03`'s test list; add a `UT-web-pricing-placeholder` (a build-time, env-gated check: a `NODE_ENV === "production"` build asserts every non-Free `price` is a numeric string, a Free `price` is exactly `"0"`) under the `content/`-schema gate.

**The two `WFR` scoping notes (stated, not silently propagated, the "a deviation is a deviation" honest rule, `TECHNICAL_ARCHITECTURE.md`'s own "anything not in this file is a deviation" framing, applied to `WFR` scoping):**
- **`WFR-305`'s "no CMS, content changes are PRs" scope is *content* (`blog`/`docs`/`changelog`/`faq`/`pricing`/`facts`), not the *legal* surface** — a legal page's *change* (a `terms` re-issue) is a *legal* decision, not a *content* decision; this doc (a `CS-08` row) still gates a legal page's *front-matter* (a `title`/`description`/`status`/`lastUpdated` shape) under the same `content/`-schema gate (§4.2's check 1), because a legal page's *body* is not schema-gated content (a legal text is not a "product fact", `CS-08`'s "a legal page has *no* `Article`/`FAQPage`/`Product` block" line) — a legal body change is a *legal-review* gate (a `RELEASE_CRITERIA`-class decision, out of scope for the `content/`-schema gate), not a `CS-##`-gated content change. This is a **scoping clarification** the task's own "§1's 'plus a `pricing/` machine-readable source of truth'" + `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.9`'s "a legal page is a plain readable page" line both imply but don't state explicitly; stated here.
- **`WFR-104`'s "Breadcrumb JSON-LD on every page `/docs/*`, `/changelog/*`, `/blog/*`" does *not* name `/legal/*`** — but `STRUCTURED_DATA.md §1`'s "`/legal/*` … the only structured data is the breadcrumb chain" line *implies* a `BreadcrumbList` on `/legal/*` too. This is a **`WFR-104` scoping gap** (a route set the `WFR` doesn't name but the JSON-LD table assumes) — a §6 note, not a `CS-##` schema fix; a `/legal/*` breadcrumb is *generated* from a `CS-08` item's `type` field (a `BreadcrumbList` of `["Vercode", "Legal", <type>]`), so a `CS-08` schema *needs* no new field to feed it — the breadcrumb is generated from the *route itself* (the `type` enum value, a `WFR-101`'s fixed 5-route `/legal` set, not a per-item front-matter field). No schema change; a `WFR-104` *interpretation* gap, stated.

## 7. What this doc deliberately does *not* decide

- **The exact price values** — a `PLACEHOLDER` until the market-research + a willingness-to-pay decision (`PRICING_STRATEGY.md §7`'s "the exact price points are a market decision" deferral). The *quota* values are the real numbers from `packages/contracts/src/plans.ts` (a `USAGE_QUOTAS.md`'s single source of truth); the *price* values are the go-to-market decision (`STRUCTURED_DATA.md §6`'s "a `PLACEHOLDER` is a *one-line* edit in `pricing.json` at launch, not a *doc* change" line).
- **The `ProductReview` JSON-LD** — a `PRD.md`'s "a `W5`" row names a `ProductReview` as a *future* schema (a "a user-generated review" artifact, P3); P2 is *product-authored* facts only (`STRUCTURED_DATA.md §6`'s "a `Release`-flavoured sub-block … is a P3 nicety" + "a `Review`/`ProductReview` block — a *future* schema" line).
- **The `Release`-flavoured changelog JSON-LD** — a P3 nicety (a `WFR-302`'s "a `CreativeWork` (or a `Release` on a dedicated page)" deferral; P2 uses `CreativeWork`, `STRUCTURED_DATA.md §1`'s `/changelog/<date>` row's "a `Release`-flavoured sub-block is a P3 nicety" line).
- **The live "current plan pricing" on `/pricing`** — a P3 (a "a decision", `TECHNICAL_ARCHITECTURE.md §4.3`'s "a live 'current plan pricing' on `/pricing` (if pricing ever changes without a deploy) is P3" line). P2 pricing is a build-time `PricingSource` value, not a runtime fetch (`TECHNICAL_ARCHITECTURE.md §4.3`'s "the website **does not read the app's Postgres** in P2… the `apps/api`'s `/api/answer` reads the *same* file at build time" line).
- **The `Content-Collections` (Astro) alternative** — the `PRD.md §8 U2`'s "the `content/` + Next.js `next-mdx`" lean, a `TECHNICAL_ARCHITECTURE.md §2`'s "a *live* CMS is P3 (a **decision**, `PRD.md §8 U6`, not an implementation)" line — the `content/` dir is a *repo dir*, not a *service*, and the `packages/contracts` Zod validation is the *only* content-gate in P2.
- **The exact `ADR-0xx` number** (a `packages/contracts/src/content/`'s "a *new* contracts file" is `ADR-0xx-2`, a "open, `U2`, leaning **yes**" line, `TECHNICAL_ARCHITECTURE.md §7`'s "the next `ADR-0xx` numbers… are assigned *at resolution time*" line) — this doc's §2's "a new dir in the existing `packages/contracts` package" is the *implementation* of `U2`'s lean; the *recording* of `U2` as a resolved ADR is an `UNRESOLVED_DECISIONS.md`-tracked item, not this doc's scope.

## 8. Cross-reference audit (a stated reconciliation, not silently propagated)

The sibling docs (`STRUCTURED_DATA.md`, `TECHNICAL_ARCHITECTURE.md`, `SEO_AEO_GEO.md`, `ROADMAP_AND_ACCEPTANCE_CRITERIA.md`) cite *this* doc as already written. **The three inconsistencies found in the siblings' cross-references into this doc, all *reported, not fixed in the siblings* (the task's "report, don't fix them in sibling docs — only fix them in your new file where they affect your content" rule), and all *fixed or noted in this doc's own citations* above where they affect *this* doc's content:**

| # | The sibling doc's citation | The inconsistency | This doc's fix (where it affects *this* doc's content) |
| --- | --- | --- | --- |
| 1 | `TECHNICAL_ARCHITECTURE.md §1`'s "`content/`… validated by… a CI build-time gate (`RELEASE_CRITERIA.md`'s docs-drift gate, `gate 12`)"; `§5`'s "the *existing* 12 gates"; `STRUCTURED_DATA.md §5.1`'s "a mismatch is a `RELEASE_CRITERIA gate 12` docs-drift failure"; `ROADMAP_AND_ACCEPTANCE_CRITERIA.md`'s `WT1.3`'s "the `RELEASE_CRITERIA gate-12` docs-drift gate extended to `content/`" | **A `gate 11`/`gate 12` off-by-one:** `docs/TESTING/RELEASE_CRITERIA.md`'s actual gate list numbers `gate 11` = Docs drift, `gate 12` = Dependency / supply chain. The siblings' "gate 12 = docs-drift" citation is one number off. `DEPLOYMENT_AND_TESTING.md` *already* reconciled this exact off-by-one ("a `gate 12` / a `gate 11` off-by-one… **Reported here; the sibling doc is not fixed**") | §4.2's gate-number reconciliation note: **this doc cites the docs-drift gate as `gate 11`** (the `RELEASE_CRITERIA.md`-correct number) throughout, and *notes* the siblings' `gate 12` typo inline, without propagating it into a new citation. The `gate 14` (a *new* website lane) number is unaffected either way and is cited as-is |
| 2 | `STRUCTURED_DATA.md §2.2`'s "a *zod*-validated `PricingJSON` in `packages/contracts`, `CONTENT_SCHEMAS.md §3`"; `§4.1`'s "a `ProductFact` JSON contract (`CONTENT_SCHEMAS.md §3`)"; `§5.1`'s "a `PageDef.title` > 60 chars is a build-time `zod` rejection, `CONTENT_SCHEMAS.md §1`'s front-matter schema" | **Two mismatches:** (a) a **name** mismatch — the siblings cite this contract as `PricingJSON`; this doc's task spec calls it `PricingSource` (§1's note, a deliberate rename: the Zod export name is `PricingSourceSchema`/`PricingSource`, not a schema-shape change). (b) a **section-number** mismatch — `§1`'s citation (a "front-matter schema" *is* §2's "The Zod schema conventions" in this doc, a `§1` vs. `§2` mismatch, *not* a `§3` mismatch) and the "a `zod`-validated `PricingJSON`… `CONTENT_SCHEMAS.md §3`" + "a `ProductFact` JSON contract (`CONTENT_SCHEMAS.md §3`)" citations point at **§3** — which *is* "The per-type content contracts" in this doc, so the *section number* is actually **correct** (a `PricingSourceSchema` *definition* is in §3's `CS-05` section, a `ProductFactSchema` *definition* is in §3's `CS-06` section — both live *inside* §3, not §2). The only real mismatch is the **name** (`PricingJSON` → `PricingSource`) + a `§1` vs. `§2` off-by-one on the "front-matter schema" citation | §1's "PricingSource vs. PricingJSON naming" note (a rename, not a schema change) + §5.3's "the `OpenAPI.yaml`'s `gate 11` docs-drift-class check" line (a *correct* `gate 11` citation, consistent with #1's reconciliation) + §7's "a `PricingSource`" (not a `PricingJSON`) consistently throughout. A `§1` citation into *this* doc by a sibling is a *stale section number* (a `§2` is the correct one, "The Zod schema conventions") — *reported*, not fixed in `STRUCTURED_DATA.md` |
| 3 | `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.4`'s "The canonical question set (drafted here, finalized in `CONTENT_SCHEMAS.md`)" — a 16-row table, not the 15 `WFR-204` *floor* | **A "≥ 15" vs. 16-question-set mismatch** (a `WFR-204`'s "lists ≥ 15 questions" is a *floor*; `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.4`'s table is a *16*-row set: 4+4+4+3+1, the 16th being "How do I export or delete my data?" — a *separate* 16th question outside the 4-group "15+" framing). This is a *sibling-doc-internal* inconsistency (a `WFR-204` "≥ 15" vs. a 16-row canonical set), *not* a `CONTENT_SCHEMAS.md` bug — a `CS-07` `FaqItem` schema *can* encode 16 items fine (a `z.array`/a per-file front-matter, no `length(15)` constraint, deliberately *not* fixed — a `FaqItem` schema *never* hard-codes a question *count*, only a `question`/`group`/`order`/`status` shape) | *No schema-side fix needed* (a `CS-07` schema deliberately has *no* `length()` constraint on the question set — a count is a *content* fact, not a *schema* fact). *Reported only*: the "≥ 15" (`WFR-204`) vs. "16" (`INFORMATION_ARCHITECTURE_AND_PAGES.md §3.4`) mismatch is a *sibling-doc* wording issue, not a `CS-07` schema defect; `STRUCTURED_DATA.md §5.3`'s "a 15-question FAQ has a 15-item `mainEntity`" line + `ROADMAP_AND_ACCEPTANCE_CRITERIA.md`'s "a byte-equivalence test over all 16 canonical questions" line are *themselves* one-off-by-one off the `WFR-204` "≥ 15" floor (a 16-question set trivially satisfies "≥ 15") — a *sibling-doc* inconsistency, *reported, not fixed in the siblings*; this doc's `CS-07` row (§6) cites the "16-question set" (`ROADMAP_AND_ACCEPTANCE_CRITERIA.md`'s `W-AC-04`'s own "the 16-question set from `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.4`" line) as the *actual* count, not the "≥ 15" floor, to avoid propagating *either* number as a hard constraint |

> **The audit's standing rule:** a `CONTENT_SCHEMAS.md` citation that's *wrong* in a sibling is **reported** (a `DEPLOYMENT_AND_TESTING.md`-style "reported, not fixed in the sibling" note, §1/§4.2/§5.3/§6 above), and **fixed only in this doc's own citations** where the *fix changes this doc's content* (a gate-number, a rename, a section-number, a question-count) — a sibling doc is *never* edited from this task ("Do not touch anything else").
