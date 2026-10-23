# VERCODE Website — Structured Data (JSON-LD)

The JSON-LD contract for the website. `WFR-102` says every page has one JSON-LD block; this doc is the per-route type table, the generator architecture, the exact example blocks, and the validation lane. The *why* (why byte-equivalence matters for LLM citation) lives in `SEO_AEO_GEO.md §3`; the *route set* is `INFORMATION_ARCHITECTURE_AND_PAGES.md §1`; the *content types* (front-matter shapes) are `CONTENT_SCHEMAS.md`.

> **The rule:** no JSON-LD is hand-written in a page file. A single `schema-generator.ts` (`apps/website/src/lib/`, referenced as "the single source of truth" in `TECHNICAL_ARCHITECTURE.md §4.1`) emits every `WFR-102` block from page data + the `content/pricing/` JSON. A pricing change in one file updates `Product`+`Offer`+`FAQPage`+`/api/answer`+`llms.txt` in one build; a drift is structurally impossible, not just policed (`INFORMATION_ARCHITECTURE_AND_PAGES.md §3.3`'s consistency rule).

## 1. The per-route type table

| Route | JSON-LD types carried | Notes |
| --- | --- | --- |
| `/` | `Organization` + `WebSite` + `SoftwareApplication` + `HowTo` + `FAQPage` + `BreadcrumbList` | `WebSite` on the root carries `hasPart` listing the top-level routes; `HowTo` is the "how it works" 3-step; `FAQPage` is the top-5 teaser (the full 15 live on `/faq`); `BreadcrumbList` is `["Vercode", "Home"]`. |
| `/features` | `SoftwareApplication` + `WebSite` + `BreadcrumbList` | One `SoftwareApplication` block; the 4 pillars are `hasPart` on the app block (a `CreativeWork` per pillar is over-scope in P2 — the pillars are a numbered narrative, not a product feature list, `DESIGN_SYSTEM_AND_TYPOGRAPHY.md §2`'s "no icon-topped feature cards"). |
| `/pricing` | `SoftwareApplication` + `Product`+`Offer` (× 4 plans) + `FAQPage` + `BreadcrumbList` | Each of the 4 plans is a separate `Product`+`Offer` pair, generated from `content/pricing/pricing.json` (`WFR-203`). The 6-question pricing FAQ carries `FAQPage`. |
| `/faq` | `FAQPage` + `BreadcrumbList` | ≥ 15 questions; each `mainEntity` `Question` + `acceptedAnswer` `Answer`; the visible answer text **matches the JSON-LD text byte-for-byte** (`WFR-204`; `SEO_AEO_GEO.md §3`'s Q5 check). |
| `/docs` | `ItemList` + `BreadcrumbList` | An `ItemList` of the 9 P2 docs topics (`INFORMATION_ARCHITECTURE_AND_PAGES.md §3.5`'s quickstart/github-app/api/rules/security/providers/pricing/quotas/privacy/security list) with `itemListElement` `@id` refs to each `/docs/<topic>` page. |
| `/docs/<topic>` | `Article` + `BreadcrumbList` | `Article` with `headline` (the H1), `description` (meta description), `dateModified`, `author` (a `Person` — the doc owner, `CONTENT_SCHEMAS.md`'s `docsAuthor` field), `mainEntityOfPage`, `about` (the product, a `SoftwareApplication` `@id` reference). `BreadcrumbList` is `["Vercode", "Docs", <topic>]`. |
| `/changelog` | `ItemList` + `BreadcrumbList` | An `ItemList` listing the **last 10** releases (`WFR-302`), each element is a `@type: "CreativeWork"` stub with `@id` pointing to `/changelog/<date>`. |
| `/changelog/<date>` | `CreativeWork` + `BreadcrumbList` | `CreativeWork` with `name` (version + title), `dateCreated` (the ISO date), `author` (the release engineer's `Person`), `about` (`SoftwareApplication` ref), `@id` (the canonical URL). `WFR-302` says "a `CreativeWork` (or `Release` on a dedicated page)" — P2 uses `CreativeWork`; a `Release`-flavoured sub-block is a P3 nicety (`PRD.md §6` out-of-scope list, a richer release schema). |
| `/blog` | `ItemList` + `BreadcrumbList` | An `ItemList` of published articles (`WFR-305`'s `status: published` filter), each element a `@id` ref to `/blog/<slug>`. |
| `/blog/<slug>` | `Article` + `BreadcrumbList` | `Article` with `headline` (≤ 110 chars, `WFR-303`), `image` (the per-slug OG 1200×630), `author` (`Person`), `datePublished`, `dateModified`, `keywords` (tags), `mainEntityOfPage`, `about` (`SoftwareApplication` ref). `BreadcrumbList` is `["Vercode", "Blog", <headline>]`. |
| `/about` | `Organization` + `Person` (× N named team members) + `WebSite` + `BreadcrumbList` | The `Organization` block here carries `sameAs` (GitHub repo, the status page) and the named `Person` array for the real team (the "no John Doe" rule, `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.8`). |
| `/legal/*` | `BreadcrumbList` | No rich block; the legal pages are plain readable pages (`INFORMATION_ARCHITECTURE_AND_PAGES.md §3.9`), so the only structured data is the breadcrumb chain. A `WFR-402` "triple source" fact check still applies: the `terms`/`privacy`/`security`/`dpa` pages *do* appear in `llms.txt` (a short one-line each) and `sitemap.xml`. |
| `/404` | none | An on-domain 404 (`WFR-105`); no structured data; the page must be crawlable (HTTP 404, not a soft-200) so that a crawler records it correctly. |
| `/500` | none | An apology + a status link + a retry button; no structured data. |
| `robots.txt` | — | Not a page; a crawler policy file (a `WFR-103` spec; see `SEO_AEO_GEO.md §1` for the exact content). |
| `sitemap.xml` | — | Not a page; a URL index (a `WFR-103` spec). |
| `llms.txt` / `llms-full.txt` | — | Not a page; the LLM fact index (a `WFR-401` + `PRD.md §8 U6` spec; see `SEO_AEO_GEO.md §4`). |

**The `hasPart` rule:** `hasPart` is used on the *root* `WebSite` block (`/`) only, to list the top-level route `@id`s. A `hasPart` on a `Product` block is *not* used in P2 (the 4 plans are 4 separate `Product` blocks, not one `Product` with 4 `hasPart` children — a single `Product` would confuse an LLM that asks "what is VERCODE Team plan pricing" because the `Offer` is nested). `hasPart` on `HowTo` is also *not* used (the 3 steps are `step` array items, the schema-correct location).

## 2. The generator architecture

### 2.1 The single `schema-generator.ts`

The generator is a single function, pinned in `TECHNICAL_ARCHITECTURE.md §4.1`:

```ts
// apps/website/src/lib/schema-generator.ts
// The single source of truth for every WFR-102 JSON-LD block.
// No page file writes JSON-LD by hand; it imports this module.

import { type PlanQuota, ALL_PLANS, planQuota } from "@vercode/contracts";
import { PricingJSON } from "@vercode/website-pricing"; // the content/pricing/pricing.json, zod-validated at build

export interface PageDef {
  route: string;             // "/docs/quickstart"
  title: string;             // the H1 (≤ 60 chars for the <title> tag; the headline for Article may be ≤ 110)
  metaDescription: string;  // 120–158 chars
  author?: { name: string; email?: string }; // a Person, for /docs/<topic>, /blog/<slug>
  datePublished?: string;    // ISO, for /blog/<slug>
  dateModified?: string;     // ISO, for /blog/<slug> + /docs/<topic>
  tags?: string[];           // for /blog/<slug> keywords
  ogImage?: string;          // the per-slug 1200×630 for /blog/<slug>
  breadcrumbTrail: { name: string; url: string }[]; // the BreadcrumbList items
  isRoot?: boolean;          // true only for "/" — the WebSite block is only emitted on the root
}

// The single dispatch.
// Emits a JSON-LD array for the route; the page component inlines the array
// as <script type="application/ld+json">{ JSON.stringify(blocks) }</script>
// in the <head>. Multiple blocks in one array are valid JSON-LD.
export function generateSchemaFor(page: PageDef): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = [];

  if (page.isRoot) blocks.push(webSiteBlock());       // the WebSite block, root only
  blocks.push(organizationBlock());                  // the Organization block, every page

  if (page.route === "/") {
    blocks.push(softwareApplicationBlock());          // the product, on / + /features
    blocks.push(howItWorksBlock());                   // the 3-step HowTo, on / only
    blocks.push(faqTeaserBlock());                    // the top-5 FAQPage, on / only
  }
  if (page.route === "/features") blocks.push(softwareApplicationBlock());

  if (page.route === "/pricing") {
    for (const plan of ALL_PLANS) blocks.push(productOfferPair(plan, page));
    blocks.push(pricingFaqBlock());
  }
  if (page.route === "/faq") blocks.push(faqFullBlock()); // the full 15

  if (page.route.startsWith("/docs")) {
    blocks.push(articleBlock(page));                  // Article, not a "doc" type
  }
  if (page.route.startsWith("/blog/") && page.route !== "/blog") {
    blocks.push(articleBlock(page));
  }
  if (page.route === "/changelog") blocks.push(changelogItemListBlock());
  if (page.route.startsWith("/changelog/")) blocks.push(changelogCreativeWorkBlock(page));
  if (page.route === "/blog") blocks.push(blogItemListBlock());

  if (page.breadcrumbTrail.length > 0) blocks.push(breadcrumbBlock(page.breadcrumbTrail));

  return blocks;
}
```

### 2.2 The pricing source

`Product`+`Offer` pairs are generated from **two** inputs, cross-checked at build time (a mismatch is a `RELEASE_CRITERIA gate 12` docs-drift failure):

1. **The quotas** come from `packages/contracts/src/plans.ts` (`FREE_QUOTA`, `DEVELOPER_QUOTA`, `TEAM_QUOTA`, `ENTERPRISE_QUOTA`, the `USAGE_QUOTAS.md` single source of truth, `AC-401` — a hardcoded quota number elsewhere is a defect the build catches).
2. **The prices** come from `apps/website/content/pricing/pricing.json` (a *new* file, a *zod*-validated `PricingJSON` in `packages/contracts`, `CONTENT_SCHEMAS.md §2.5`). The price values in `PRICING_STRATEGY.md §7` are a **market-research + a willingness-to-pay decision, not a fixed number** ("the structure is here, the numbers are a go-to-market decision") — so `pricing.json` holds the *current* number, and the doc holds the *shape* (the `PRICING_STRATEGY.md` principle + the `USAGE_QUOTAS.md` ladder). A pricing change is a one-file edit (`pricing.json`) that flows to `Product`/`Offer`/`/api/answer`/`llms.txt` in one build.

### 2.3 The FAQ byte-equivalence

The FAQ blocks (`faqTeaserBlock`, `faqFullBlock`, `pricingFaqBlock`) read their Q/A pairs from a *shared* data file, **not** from the visible page text. The visible FAQ answer on `/faq` and the `FAQPage.answer` text are generated from the **same** `content/faq/` item (`CONTENT_SCHEMAS.md`'s `FAQItem` contract) — so a drift is structurally impossible. The `Q5 schema match` check in `CONTENT_STRATEGY.md §4` is *automated* by the generator (the CI `ld-lint` lane asserts the byte-equivalence, §5 below), not by a human eyeball.

## 3. The exact JSON-LD blocks

The blocks below are **generated**, not hand-typed. They are shown here as the *shape* the generator emits, with the *real* values from `packages/contracts/src/plans.ts` (the quotas) and the *placeholder* values from `PRICING_STRATEGY.md §7` (the prices — the "the exact price points are a market decision" deferral; `content/pricing/pricing.json` holds the live number).

### 3.1 Organization (every page)

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://vercode.com/#organization",
  "name": "Vercode",
  "url": "https://vercode.com",
  "logo": "https://vercode.com/og/logo.png",
  "sameAs": [
    "https://github.com/vercode/vercode"
  ],
  "description": "VERCODE is the AI code-review a team actually reads — deterministic-first, evidence-backed, cost-disciplined, a workspace not just a bot."
}
```

The `description` is the `SAAS_LAUNCH_PLAN.md §1` wedge, verbatim.

### 3.2 WebSite (the root only; the `SearchAction` is *omitted* in P2)

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": "https://vercode.com/#website",
  "url": "https://vercode.com",
  "name": "Vercode",
  "publisher": { "@id": "https://vercode.com/#organization" },
  "description": "AI code review for GitHub teams. Deterministic-first, evidence-backed, cost-disciplined.",
  "hasPart": [
    { "@type": "WebPage", "@id": "https://vercode.com/#features", "name": "Features" },
    { "@type": "WebPage", "@id": "https://vercode.com/#pricing", "name": "Pricing" },
    { "@type": "WebPage", "@id": "https://vercode.com/#docs", "name": "Docs" },
    { "@type": "WebPage", "@id": "https://vercode.com/#faq", "name": "FAQ" },
    { "@type": "WebPage", "@id": "https://vercode.com/#changelog", "name": "Changelog" },
    { "@type": "WebPage", "@id": "https://vercode.com/#blog", "name": "Blog" }
  ]
}
```

**The `SearchAction` is deliberately absent.** A `WebSite` `potentialAction` `SearchAction` is the schema.org convention for a site that exposes a search endpoint. P2 has *no* header search (a "docs search" that only searches the docs is a lie, `INFORMATION_ARCHITECTURE_AND_PAGES.md §6`'s "no search box in the header in P2" rule; a `/docs/search` route is P3, `PRD.md §6`'s out-of-scope list). Emitting a `SearchAction` would be a *fabrication* — the search box does not exist. The `SearchAction` is re-added in P3 when the docs search ships (`PRD.md §6`'s "a living docs site with search" P3 item).

### 3.3 SoftwareApplication (the product; on `/` + `/features`)

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "@id": "https://vercode.com/#product",
  "name": "VERCODE",
  "alternateName": "Vercode",
  "url": "https://vercode.com",
  "applicationCategory": "DeveloperApplication",
  "operatingSystem": "Any (a SaaS; the GitHub App runs in the browser + a webhook)",
  "description": "AI code review for GitHub teams: a deterministic-first pipeline (static analysis before the LLM) that posts a summary verdict + evidence-backed inline comments, with a dashboard that answers the org's risk + cost question.",
  "offers": [
    {
      "@type": "Offer",
      "url": "https://vercode.com/pricing",
      "price": "0",
      "priceCurrency": "USD",
      "itemOffered": { "@id": "https://vercode.com/#product" },
      "description": "The Free plan: 50 reviews/mo, 20 files/review, 1 concurrent, 30-day finding retention, 3 custom rules, the standard model tier."
    }
  ],
  "featureList": [
    "deterministic-first pipeline (static analysis before the LLM)",
    "evidence-backed findings (every finding carries a category, severity, confidence, reason, fix)",
    "per-org cost discipline (a monthly token-spend cap, NFR-18)",
    "a workspace, not just a bot (a security-findings rollup, an audit trail, a usage view)"
  ]
}
```

The `featureList` is the 4 pillars (`README.md`'s four, `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.1`'s block 3). A single `Offer` (the Free plan) is on the `SoftwareApplication` block; the full 4-plan `Product`+`Offer` pairs are on `/pricing` (§3.4 below).

### 3.4 Product + Offer (the 4 plans; on `/pricing`)

The 4 plans are **4 separate `Product` blocks**, each with its own `Offer` (not one `Product` with 4 `hasPart` `Offer`s — §1's `hasPart` rule). The price values are `PLACEHOLDER` until `content/pricing/pricing.json` ships (`PRICING_STRATEGY.md §7`'s "the exact price points are a market decision" deferral; the quota numbers are the *real* values from `packages/contracts/src/plans.ts`).

**The Free plan (`Product`+`Offer` pair # 1 of 4):**

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "@id": "https://vercode.com/#product-free",
  "name": "VERCODE Free plan",
  "description": "The activation funnel: a permanent Free org, 50 reviews/mo, the standard model tier.",
  "brand": { "@id": "https://vercode.com/#organization" },
  "category": "Software > Developer > Code Review",
  "offers": {
    "@type": "Offer",
    "@id": "https://vercode.com/#offer-free",
    "url": "https://vercode.com/pricing",
    "price": "0",
    "priceCurrency": "USD",
    "availability": "https://schema.org/InStock",
    "itemOffered": { "@id": "https://vercode.com/#product-free" },
    "description": "50 reviews/month · 20 files/review · 1 concurrent · 30-day finding retention · 3 custom rules · the standard model tier."
  }
}
```

The `Offer.description` is the **quota line, verbatim, from `USAGE_QUOTAS.md §2`'s `FREE` row + `packages/contracts/src/plans.ts`'s `FREE_QUOTA`** (the "50 / 20 / 1 / 30 / 3 / standard" values are the *real* numbers, not a placeholder). The price is `0` (the `PRICING_STRATEGY.md` "a Free $0" line, not a deferral — the Free tier is a permanent $0 plan, §1's "the Free tier is a real product, not a trial" rule).

**The Developer plan (`Product`+`Offer` pair # 2 of 4):**

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "@id": "https://vercode.com/#product-developer",
  "name": "VERCODE Developer plan",
  "description": "An individual / a small team's paid tier: 500 reviews/mo, the standard model tier, a volume step over Free.",
  "brand": { "@id": "https://vercode.com/#organization" },
  "category": "Software > Developer > Code Review",
  "offers": {
    "@type": "Offer",
    "@id": "https://vercode.com/#offer-developer",
    "url": "https://vercode.com/pricing",
    "price": "PLACEHOLDER",
    "priceCurrency": "USD",
    "availability": "https://schema.org/InStock",
    "itemOffered": { "@id": "https://vercode.com/#product-developer" },
    "description": "500 reviews/month · 60 files/review · 3 concurrent · 90-day finding retention · 10 custom rules · the standard model tier."
  }
}
```

**The Team plan (`Product`+`Offer` pair # 3 of 4):**

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "@id": "https://vercode.com/#product-team",
  "name": "VERCODE Team plan",
  "description": "The core commercial tier: 5,000 reviews/mo, the standard + strong model tier, a capability step over Developer.",
  "brand": { "@id": "https://vercode.com/#organization" },
  "category": "Software > Developer > Code Review",
  "offers": {
    "@type": "Offer",
    "@id": "https://vercode.com/#offer-team",
    "url": "https://vercode.com/pricing",
    "price": "PLACEHOLDER",
    "priceCurrency": "USD",
    "availability": "https://schema.org/InStock",
    "itemOffered": { "@id": "https://vercode.com/#product-team" },
    "description": "5,000 reviews/month · 100 files/review · 10 concurrent · 365-day finding retention · 50 custom rules · the standard + strong model tier."
  }
}
```

**The Enterprise plan (`Product`+`Offer` pair # 4 of 4):**

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "@id": "https://vercode.com/#product-enterprise",
  "name": "VERCODE Enterprise plan",
  "description": "The cost-shifting + compliance + frontier play: a configurable quota, the frontier model tier, BYOK + Ollama, SSO/SCIM, data-residency.",
  "brand": { "@id": "https://vercode.com/#organization" },
  "category": "Software > Developer > Code Review",
  "offers": {
    "@type": "Offer",
    "@id": "https://vercode.com/#offer-enterprise",
    "url": "https://vercode.com/pricing",
    "price": "PLACEHOLDER",
    "priceCurrency": "USD",
    "availability": "https://schema.org/InStock",
    "itemOffered": { "@id": "https://vercode.com/#product-enterprise" },
    "description": "A configurable quota (the config-driven floor: 50,000 reviews/mo, 500 files/review, 50 concurrent, 730-day retention, 500 custom rules, the any model tier, a negotiated token-spend cap), BYOK + Ollama, SSO/SCIM, data-residency."
  }
}
```

The Enterprise `Offer.price` is `PLACEHOLDER` (a "negotiated" value — a `PRICING_STRATEGY.md §4`'s "a Enterprise platform-cap carve-out" line; a `mailto:` link on the card, `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.3`). The quota numbers in the `Offer.description` are the `ENTERPRISE_QUOTA` floor values from `packages/contracts/src/plans.ts` (the `50000 / 500 / 50 / 730 / 500 / any / 5000` values, §3's "the defaults here are the floor, a per-account negotiation can raise them" note).

### 3.5 FAQPage (the full 15; on `/faq` + the top-5 on `/` + the 6 pricing FAQ on `/pricing`)

The `FAQPage` block is generated from `content/faq/` (the `CONTENT_SCHEMAS.md` `FAQItem` contract). **The visible answer text on `/faq` and the `FAQPage` `acceptedAnswer.text` are generated from the same item — a byte-equivalence the CI `ld-lint` lane asserts, §5.** The 3 example Q/A pairs below are the *first 3* of the 15, shown in the *exact* shape the generator emits (the `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.4`'s canonical question set, questions 1–3):

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://vercode.com/faq/#faq",
  "mainEntity": [
    {
      "@type": "Question",
      "@id": "https://vercode.com/faq/#q1",
      "name": "Does VERCODE post comments on my pull requests?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. VERCODE posts a summary comment (e.g. \"Needs changes · 2 high\") + inline comments on the actual changed lines, via the GitHub App's write permission on the `pull-requests` scope (FR-206, the least-privilege list in /docs/github-app)."
      }
    },
    {
      "@type": "Question",
      "@id": "https://vercode.com/faq/#q2",
      "name": "How fast is a review?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "p50 < 120 seconds, p95 < 300 seconds, measured from webhook receipt to GitHub publish completion (NFR-02, the dashboard's success metric). The static-analysis stage runs first; the AI stage is task-routed, not every file gets the strong model."
      }
    },
    {
      "@type": "Question",
      "@id": "https://vercode.com/faq/#q3",
      "name": "Will it flood my PR with comments?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "No. The default confidence floor is 0.6 (FR-308) — findings below that floor are suppressed by default. Finding density is a 3–8 sweet spot (SUCCESS_METRICS.md); a density < 1 or > 15 triggers a routing/tuning review, not a flood."
      }
    }
  ]
}
```

**The `WFR-204` byte-equivalence rule, concretely:** the visible `Answer` text on `/faq` for question 1 is rendered from the *same* `FAQItem.text` value that the generator writes into `mainEntity[0].acceptedAnswer.text`. The CI lane (`ld-lint` + a custom `byte-equivalence` check, §5) greps the built HTML for the `Answer` text and asserts it is a substring of the HTML; a mismatch is a `RELEASE_CRITERIA gate 12` docs-drift failure. This is the "triple source" rule (`PRD.md WFR-402`): a fact is present in (1) the visible page text, (2) the JSON-LD, and (3) `llms.txt`/`/api/answer` — all three from the same source file, generated in one build.

The `/faq` top-5 teaser on `/` (block 6, `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.1`) is a **subset** of the same `content/faq/` items (the first 5, by the IA doc's ordering) — the visible `/` teaser answers are the *same text* as the full `/faq` answers (a "the visible 5 are the same text" rule, `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.1` block 6's note).

The 6-question **pricing FAQ** on `/pricing` (block 4, `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.3`) is a *separate* `content/faq/pricing.json` item set (the 6 questions: which plan, what happens at the quota, can I BYOK, do you offer annual, what if I exceed the quota, can I self-host), a separate `FAQPage` block on the `/pricing` page (a `mainEntity` of 6), not a subset of the 15-question `/faq` set.

### 3.6 HowTo (the "how it works"; on `/`)

The 3-step `HowTo` (`INFORMATION_ARCHITECTURE_AND_PAGES.md §3.1`'s block 2: "Install the App" → "Open a pull request" → "Read the review"):

```json
{
  "@context": "https://schema.org",
  "@type": "HowTo",
  "@id": "https://vercode.com/#how-it-works",
  "name": "How VERCODE works (the pipeline in 30 seconds)",
  "description": "Install the GitHub App, open a pull request, and read the review VERCODE posts on it.",
  "totalTime": "PT10M",
  "step": [
    {
      "@type": "HowToStep",
      "position": 1,
      "name": "Install the GitHub App",
      "text": "From the dashboard, click 'Install VERCODE' → the GitHub App install URL (pre-scoped to the least-privilege list, FR-210) → authorize. The webhook records the install; VERCODE discovers the org's repos."
    },
    {
      "@type": "HowToStep",
      "position": 2,
      "name": "Open a pull request",
      "text": "GitHub dispatches `pull_request.opened` → VERCODE's webhook (verified, signature-checked) enqueues a review job: static analysis first, then the task-routed AI stage."
    },
    {
      "@type": "HowToStep",
      "position": 3,
      "name": "Read the review",
      "text": "Within ~2 min, VERCODE posts a summary verdict ('Needs changes · 2 high' or 'Approve · 0 findings') + inline comments on the actual changed lines. The dashboard's review-history page shows both job versions for the PR, keyed by commit SHA."
    }
  ]
}
```

The `totalTime: "PT10M"` is the `SUCCESS_METRICS.md`'s activation KPI ("a first review published within 10 min of GitHub install ≥ 80% of orgs") — a *measured*, not a claimed, figure.

### 3.7 Article (a blog post; on `/blog/<slug>`)

The `Article` block for a blog post (the `CONTENT_SCHEMAS.md`'s `Article` front-matter contract: `title`, `description`, `date`, `updated`, `author`, `tags`, `status`, `ogImage`, `canonical`):

```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "@id": "https://vercode.com/blog/why-static-analysis-before-the-llm/#article",
  "headline": "Why static analysis before the LLM cuts false positives more than a bigger model does",
  "description": "A 1,200-word argument + a benchmark result: running ESLint + Semgrep on changed files before the LLM stage cuts the false-positive dismiss rate by 40% vs. a pure-LLM baseline (the BENCHMARK_DATASET.md v3 run, 2026-09).",
  "image": "https://vercode.com/og/blog/why-static-analysis-before-the-llm-1200x630.png",
  "datePublished": "2026-09-15",
  "dateModified": "2026-09-15",
  "author": {
    "@type": "Person",
    "name": "Aisha Verma",
    "url": "https://vercode.com/about#team-aisha-verma"
  },
  "publisher": { "@id": "https://vercode.com/#organization" },
  "mainEntityOfPage": { "@id": "https://vercode.com/blog/why-static-analysis-before-the-llm/" },
  "about": { "@id": "https://vercode.com/#product" },
  "keywords": ["AI code review", "static analysis", "false positives", "LLM code review", "VERCODE"]
}
```

The `author` is a `Person` (a *named*, real team member — a "no John Doe" rule, `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.8` + the `CONTENT_STRATEGY.md §2.3`'s "named authors with a real profile" line). The `Person.url` is the `/about` anchor (the `#team-aisha-verma` in the `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.8`'s named-team block).

The `/docs/<topic>` `Article` block is the same shape, with `author` = the doc owner (the `CONTENT_SCHEMAS.md`'s `docsAuthor` field, the feature's FR-block owner per `CONTENT_STRATEGY.md §2.1`'s "a doc owner (the same person who owns the FUNCTIONAL_REQUIREMENTS.md FR block)") and `dateModified` = the last *material* docs change (a "lastmod is honest" rule, `CONTENT_STRATEGY.md §3`'s point 5: "a typo fix is not a lastmod bump").

### 3.8 BreadcrumbList (`/docs/quickstart` example; on every `/docs/*`, `/changelog/*`, `/blog/*` per `WFR-104`)

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "@id": "https://vercode.com/docs/quickstart/#breadcrumb",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Vercode", "item": "https://vercode.com/" },
    { "@type": "ListItem", "position": 2, "name": "Docs", "item": "https://vercode.com/docs" },
    { "@type": "ListItem", "position": 3, "name": "Quickstart", "item": "https://vercode.com/docs/quickstart" }
  ]
}
```

The `WFR-104` rule: a `BreadcrumbList` on **every** `/docs/*`, `/changelog/*`, `/blog/*` (root → section → page). The root is always `["Vercode", <section>, <page>]` (a 3-level breadcrumb; the `WFR-104`'s "root → section → page" is the 3-level shape, not a 1-level "Vercode > page" shape).

### 3.9 ItemList (the `/changelog` index; the last 10)

```json
{
  "@context": "https://schema.org",
  "@type": "ItemList",
  "@id": "https://vercode.com/changelog/#changelog",
  "name": "VERCODE changelog",
  "description": "A time-ordered feed of VERCODE releases: one entry per release, the Keep-a-Changelog vocabulary (Added / Changed / Fixed / Deprecated / Removed / Security).",
  "itemListOrder": "https://schema.org/DescendingOrder",
  "numberOfItems": 10,
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "v1.4.0 — the quota strip + a 80% warning banner", "item": "https://vercode.com/changelog/2026-09-28" },
    { "@type": "ListItem", "position": 2, "name": "v1.3.2 — a BYOK key-rotation fix", "item": "https://vercode.com/changelog/2026-09-14" },
    { "@type": "ListItem", "position": 3, "name": "v1.3.0 — the security-findings rollup", "item": "https://vercode.com/changelog/2026-08-30" }
  ]
}
```

The `WFR-302` rule: an `ItemList` listing the **latest 10** releases. The `itemListElement` names are the `version + title` (the `ChangelogEntry`'s `version` + `title` front-matter, `CONTENT_SCHEMAS.md`'s contract); the `item` is the `/changelog/<date>` canonical URL. Each element *references* the dedicated page (a `CreativeWork` there, §3.8's sibling); the `ItemList` is a *pointer*, not a duplicate.

The `/blog` index (`WFR-303`'s sibling, the "an article index") is the same shape: an `ItemList` of the published articles (`status: published` only, a `WFR-305` filter), the last 10, the `name` is the headline, the `item` is the `/blog/<slug>` canonical.

### 3.10 Person (the named author; on `/about` + the `Article.author` ref)

```json
{
  "@context": "https://schema.org",
  "@type": "Person",
  "@id": "https://vercode.com/about/#team-aisha-verma",
  "name": "Aisha Verma",
  "jobTitle": "Founding Engineer",
  "worksFor": { "@id": "https://vercode.com/#organization" },
  "sameAs": ["https://github.com/aishav"]
}
```

The `Person` block is emitted on `/about` (a `Person` array, the named team, `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.8`'s "a named team (real people)" rule) and *referenced* (via `@id`) by every `Article.author` (a `$ref`, not an inline `Person` — a single source of truth, the `Person` lives on `/about` and the `Article` links to it).

## 4. The GEO / AEO implications (the "triple source" + the byte-equivalence)

### 4.1 The triple source (a fact is in 3 places, all from one file)

A `WFR-402` fact (e.g. "the Team plan is 5,000 reviews/mo, the standard + strong tier, a 365-day retention") is present in:

1. **The visible page text** — the `/pricing` card + the `/faq` answer + the `/docs/pricing` table (all rendered from `content/pricing/pricing.json` + `packages/contracts/src/plans.ts`).
2. **The JSON-LD** — the `Product`+`Offer` `description` field (`Offer.description` = the quota line, §3.4) + the `FAQPage` `acceptedAnswer` text (§3.5) + the `SoftwareApplication` `offers` (§3.3).
3. **`llms.txt` + `/api/answer`** — the `ProductFact` JSON contract (`CONTENT_SCHEMAS.md §2.6`), the *same* fact, in machine-readable form, for an LLM that makes an HTTP call.

The three are generated from the *same* source files in one build; a pricing change in `pricing.json` + a quota change in `plans.ts` propagates to all three in one CI run. A drift between the three is a `RELEASE_CRITERIA gate 12` docs-drift failure (a `ld-lint` + a custom `triple-source` check, §5).

### 4.2 The byte-equivalence (the FAQ + the docs)

The `FAQPage` `acceptedAnswer.text` and the *visible* FAQ answer are byte-identical (§3.5's `WFR-204` rule). The `/docs/<topic>` `Article.headline` and the *visible* H1 are identical. The `/blog/<slug>` `Article.headline` + `Article.image` and the *visible* H1 + OG image are identical. This is the "an answer engine quoting VERCODE quotes the *true* number, not a paraphrase" rule — a `SEO_AEO_GEO.md §3`'s "a fact is verbatim-quotable" requirement, the `CONTENT_STRATEGY.md §4` Q5 check (the CI-automated version).

### 4.3 The `Offer.description` is the quota line (a "machine-readable table" rule)

The `Offer.description` field (§3.4) is the **verbatim quota line** (the `USAGE_QUOTAS.md §2` table row, the `plans.ts` constants). An LLM answering "what is VERCODE Team plan pricing" gets the *exact* number from the JSON-LD, not a "5,000-ish" paraphrase. This is the `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.3`'s "a table is the most quotable format" rule, applied to the JSON-LD: a `Product`+`Offer` with a *literal* `Offer.description` is the most LLM-quotable pricing artifact.

## 5. Validation + the CI lane

### 5.1 The two checks

| Check | Tool | The rule |
| --- | --- | --- |
| **JSON-LD validity** | `ld-lint` (the schema.org validator) | 0 errors on every page's `<script type="application/ld+json">` (a `RELEASE_CRITERIA` gate, a new website-specific lane, `TECHNICAL_ARCHITECTURE.md §5`'s "a `Website JSON-LD validity`" lane — a `ld-lint` run on every `WFR-101` route + the `sitemap.xml` entries). |
| **The byte-equivalence** | a custom `triple-source` check (a small Node script in the CI lane) | Greps the built HTML for the `FAQPage` `acceptedAnswer.text` + the `Offer.description` + the `Article.headline`; asserts each is a *substring* of the HTML (a "the JSON-LD text == the visible text" rule). A mismatch is a `RELEASE_CRITERIA gate 12` docs-drift failure (a "a pricing change that's not in the visible text + the JSON-LD + the llms.txt simultaneously is a defect" — the `USAGE_QUOTAS.md §6`'s "a two-source quota is a drift vector" rule, applied to the website). |

### 5.2 The CI lane (the "new" website lane)

The JSON-LD check is a **new** website-specific lane (a `gate 14`-style new lane, `TECHNICAL_ARCHITECTURE.md §5`'s "a `gate 14` new, the CI lane convention" note — the *existing* 12 gates in `RELEASE_CRITERIA.md` are unchanged; the website *adds* 4 new lane checks + 2 route checks, §5's "the website *adds* 4 new lane checks" line). The lane runs on the *built* static export (a `next build` output, not a dev server) — a JSON-LD check on a dev-server URL is not the production artifact. The lane is a **separate** merge gate (the `website` deployable's own gate, `OPERATIONS/CI_CD.md`'s lane convention — the *app* lanes + the *website* lanes are **independent** CI runs, a `make check-website` target, `TECHNICAL_ARCHITECTURE.md §5`).

### 5.3 The `WFR-102` + `WFR-204` acceptance

A `WFR-102` (every page has a unique title + a unique meta description + a canonical + one JSON-LD block) passes when:

- the `ld-lint` check is green (0 errors) on the route.
- the `title` is ≤ 60 chars (a `SEO_AEO_GEO.md §2`'s on-page gate) — a *generated* check (the CI lane asserts the `<title>` length from the built HTML; a `PageDef.title` > 60 chars is a build-time `zod` rejection, `CONTENT_SCHEMAS.md §1`'s front-matter schema).
- the `metaDescription` is 120–158 chars (a `SEO_AEO_GEO.md §2`'s on-page gate) — the same generated check.
- the `canonical` is the `PageDef.route`'s absolute URL (a `VERCODE_WEBSITE_BASE_URL`-prefixed, `TECHNICAL_ARCHITECTURE.md §6`'s env var) — a `WFR-102` rule (a "a canonical URL" line).
- the JSON-LD `@id`s are *absolute* URLs (a schema.org convention — a relative `@id` is a validator warning; the generator emits absolute `@id`s from the `PageDef.route` + the base URL).

A `WFR-204` (the FAQ visible answer == the JSON-LD text byte-for-byte) passes when:

- the `triple-source` check is green (a `FAQPage` `acceptedAnswer.text` is a substring of the built HTML's visible answer).
- the `FAQPage` `mainEntity` count == the visible `Question` count on `/faq` (a "a 15-question FAQ has a 15-item `mainEntity`" rule — a `WFR-204`'s "a 15+ question" line).

## 6. What this doc deliberately does *not* decide

- **The exact price values** — a `PLACEHOLDER` until `content/pricing/pricing.json` ships (a `PRICING_STRATEGY.md §7`'s "the exact price points are a market decision" deferral). The *quota* values are the real numbers from `packages/contracts/src/plans.ts`; the *price* values are the market-research decision. The `PLACEHOLDER` is a *one-line* edit in `pricing.json` at launch, not a *doc* change.
- **The per-page OG image *generation*** — a `@vercel/og` static build (a `TECHNICAL_ARCHITECTURE.md §3`'s "a 1200×630 default + a per-blog-slug one" line); the *image content* is a `DESIGN_SYSTEM_AND_TYPOGRAPHY.md` decision, not a structured-data decision.
- **The `Release`-flavoured sub-block on a `/changelog/<date>` page** — a P3 nicety (a `WFR-302`'s "a CreativeWork (or a Release on a dedicated page)" deferral; P2 uses `CreativeWork`).
- **The `Review` / `ProductReview` block** — a `PRD.md`'s "a `W5` — no machine-readable product facts: Organization / WebSite / SoftwareApplication / Product / Offer / ProductReview / FAQPage / HowTo / BreadcrumbList / Article / Person schemas" line *names* `ProductReview` as a *future* schema (a "a user-generated review" artifact, P3); P2 is *product-authored* only, no `ProductReview`.
- **The multi-language JSON-LD** — a `WFR-405`'s "a hreflang is not used in MVP (EN only)" rule; a P3 i18n (a `PRD.md §6` out-of-scope list) would add a `inLanguage` + a `hreflang` to every block.
