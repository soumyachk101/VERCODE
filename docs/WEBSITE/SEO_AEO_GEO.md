# VERCODE Website — Technical SEO, AEO & GEO

The technical search strategy for the website: how the pages are crawled, how they are indexed, how an *answer engine* (AEO) extracts a quotable answer from them, and how a *generative engine* (GEO) retrieves a VERCODE-correct fact from them. The *what* the pages are lives in `INFORMATION_ARCHITECTURE_AND_PAGES.md`; the *JSON-LD* contract lives in `STRUCTURED_DATA.md`; the *editorial* rules live in `CONTENT_STRATEGY.md`.

> **The one-line thesis:** VERCODE is *deterministic-first* as a product; the website is *deterministic-first* as a document. Every claim a crawler, an answer engine, or an LLM can reach is a **literal, sourced, generated-from-one-source** fact — never a paraphrase, never a vanity total, never a "coming soon" (`CONTENT_STRATEGY.md §1.3`'s banned list).

## 1. The technical SEO baseline

### 1.1 Crawlability (the static export)

The website is a **Next.js 15 static export** (`output: export`, `TECHNICAL_ARCHITECTURE.md §1`'s deployable table). Three consequences, all of them load-bearing for AEO/GEO:

- **No JS-gated content.** Every word on every page is in the served HTML. The static export *cannot* hydrate-gate content (there is no server to gate it against). A crawler with no JS renderer sees the same page a browser sees. This is the "no JS-gated content" line in `PRD.md §2`'s W1 row and the `PRD.md §5`'s "100% of `WFR-101` pages pass the on-page check" target.
- **Zero-JS default.** The page ships no client-side data fetching in P2 (`TECHNICAL_ARCHITECTURE.md §4.2`'s "no client-side data fetching in P2"). The only JS on the site is the mobile nav sheet (a `<dialog>`), the scroll-reveal (a CSS `IntersectionObserver`), and the FAQ toggle (`DESIGN_SYSTEM_AND_TYPOGRAPHY.md §3`'s "`details`/`summary` is *allowed*"; the answer is always in the DOM).
- **The FAQ answers are always expanded.** A `<details>` toggle never *removes* the answer text from the HTML — a collapsed-by-default FAQ would be invisible to a non-JS crawler and to an answer engine that strips the DOM.

### 1.2 `robots.txt` (the content spec)

`/robots.txt` (`WFR-103`) is generated at build time from the same route list as the sitemap (`TECHNICAL_ARCHITECTURE.md §4.1`'s flow diagram). The exact content:

```
# robots.txt — Vercode
User-agent: *
Allow: /
Disallow: /docs/source

Sitemap: https://vercode.com/sitemap.xml
```

The rules:

- **Allow all.** The site is public; there is nothing to hide (no `Disallow: /admin` — the marketing site has no admin, `INFORMATION_ARCHITECTURE_AND_PAGES.md §6`'s "no user accounts on the marketing surface").
- **`Disallow: /docs/source`** — the raw-source view of a docs page, *if* such a route ever exists (`WFR-103`'s "raw source, if any"). The canonical `/docs/<topic>` page is the crawlable one; the raw Markdown is a duplicate that would compete with it. In P2 the route does not exist, and the `Disallow` is a *harmless forward-compatible* line (a `Disallow` on a non-existent path costs nothing).
- **`Sitemap:`** — an absolute, canonical URL (the `VERCODE_WEBSITE_BASE_URL` env var, `TECHNICAL_ARCHITECTURE.md §6`).
- **No `User-agent` block other than `*`.** A named-agent block (e.g. a `GPTBot` allow/deny) is a **P3 decision** — the "should AI crawlers be allowed" question is an *ownership* decision, not a technical one, and a wrong default (denying the crawlers whose citations we want) is expensive. P2 allows all and relies on the GEO surface for citation (a `llms.txt` + an `/api/answer` an LLM can fetch).
- **No `Crawl-delay`.** The site is static and CDN-served; a crawl-delay only slows indexing.

### 1.3 `sitemap.xml` (the grouping + the `changefreq` rules)

`/sitemap.xml` (`WFR-103`) is generated from the route list + the content store. The rules:

- **Every `WFR-101` URL + every published `/blog` + `/docs` + `/changelog` entry.** A `draft` item is *not* in the sitemap (`WFR-305`); an `archived` item is *not* in the sitemap but its canonical URL stays resolvable (§1.5's 410 rule).
- **Grouped by `<lastmod>`** — the entries are grouped into `<urlset>` blocks by the day of their last material change, so a crawler's incremental fetch is a *partial* download. This is the `WFR-103`'s "grouped by lastmod" line.
- **`<changefreq>` is honest, per surface:**

| Surface | `changefreq` | Why |
| --- | --- | --- |
| `/` , `/features` | `weekly` | the marketing pages change on a release cadence, not daily (`WFR-103`'s "marketing `weekly`") |
| `/faq`, `/legal/*` | `monthly` | a slow-changing surface |
| `/docs/*` | `daily` | the docs ship *with* the feature (`CONTENT_STRATEGY.md §2.1`'s cadence) |
| `/blog/*` | `monthly` | the *sitemap* is conservative; the *actual* cadence target is 2-weekly (`CONTENT_STRATEGY.md §2.2`'s note) — the sitemap tells the truth about the *page*, not the ambition |
| `/changelog/*` | `weekly` | one entry per release (`CONTENT_STRATEGY.md §2.2`'s cadence) |

- **`<lastmod>` is the last *material* change.** A typo fix is *not* a `lastmod` bump (`CONTENT_STRATEGY.md §3`'s point 5: "a crawler is told the truth"). A `lastmod` that lies trains a crawler to ignore it.
- **No `<priority>`** in P2. `priority` is a hint every major engine ignores; a `priority` column that says "the homepage is 1.0 and the 404 is 0.1" is a fake signal. Priority is expressed by *internal linking* (§2.4), not by a sitemap attribute.
- **The sitemap count is asserted in CI.** The website build lane asserts `sitemap.xml` count == the `WFR-101` route count + the published content count (`TECHNICAL_ARCHITECTURE.md §5`'s "a `sitemap.xml` count == `WFR-101` + content count"). A sitemap that drops a page is a build failure, not a silent omission.

### 1.4 Canonicals + Open Graph / Twitter

Every page (`WFR-102`) carries:

```html
<link rel="canonical" href="https://vercode.com/docs/quickstart" />
<meta name="description" content="..." />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://vercode.com/docs/quickstart" />
<meta property="og:title" content="..." />
<meta property="og:description" content="..." />
<meta property="og:image" content="https://vercode.com/og/default-1200x630.png" />
<meta property="og:site_name" content="Vercode" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="..." />
<meta name="twitter:description" content="..." />
<meta name="twitter:image" content="https://vercode.com/og/default-1200x630.png" />
```

The rules:

- **The canonical is absolute** (the `VERCODE_WEBSITE_BASE_URL` + the route, `TECHNICAL_ARCHITECTURE.md §6`) — a relative canonical is a bug.
- **The canonical == the `og:url`** — a mismatch is a "which URL is this page" ambiguity to a social scraper.
- **The `og:image` is 1200×630** (`WFR-404`): a VERCODE-default (the product mark + a short one-line) on every page, and a *per-page* one on `/blog/<slug>` (the `WFR-303`'s `image` field, the `CONTENT_SCHEMAS.md`'s `ogImage` front-matter field).
- **`twitter:card` is `summary_large_image`** everywhere — a `summary` card renders a 1200×630 image at a thumbnail size on X.
- **No `<meta name="keywords">`.** It has been ignored by every engine since 2009 and it *attracts spam scrapers*. The keyword strategy is §3.4's AEO keyword map, not a `keywords` meta tag.

### 1.5 The 404 / 410 policy

`WFR-105` + `CONTENT_STRATEGY.md §3`'s point 7:

| Case | Status | Body | In the sitemap? |
| --- | --- | --- | --- |
| An unknown route | **404** | the on-domain 404 page (a helpful page + a search box + the 5 top links, `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.1`'s "states" line) | no |
| A `draft` content item | **404** (it was never published) | the 404 page | no |
| An `archived` content item | **410 Gone** | the 404 page's content, but the *status* is 410 | no |
| A soft-deleted doc | **410 Gone** | same | no |

The rules:

- **Never a soft-200.** A 404 page served with a `200 OK` status is an *SEO trap* (`WFR-105`'s own words: "not a 200 with a 404 body"). It tells the crawler "this URL is a real page" and it accumulates soft-404 signals for the whole domain.
- **A 410 is a deliberate signal.** A 410 says "this resource *was* here and is intentionally gone" — it asks the crawler to drop the URL faster than a 404. A soft-deleted doc is a 410, not a 404 (`CONTENT_STRATEGY.md §3`'s point 7: "a 410 is better than a 404 for SEO continuity").
- **The canonical of a 410 page points at itself** (the URL that is gone) — the page stays resolvable for existing backlinks, which is the SEO-continuity reason for the 410 (`CONTENT_STRATEGY.md §3`'s point 7: "keeps its canonical URL resolvable for existing backlinks").
- **The `/404` and `/500` routes carry no JSON-LD** (`STRUCTURED_DATA.md §1`'s table) and are **not** in the sitemap — a sitemap that lists the 404 page is a self-inflicted soft-404.

### 1.6 `hreflang` (declared absent)

`WFR-405`: **`hreflang` is not used in MVP.** The site is English-only; a `hreflang` cluster with a single locale adds noise without a benefit, and a *wrong* `hreflang` is worse than none.

- The **absence is declared** in this doc and in `PRD.md WFR-405` — the site does not emit `hreflang` links and does not emit `og:locale:alternate`.
- `<html lang="en">` is set on every page (the one internationalization declaration that is always correct).
- The P1 decision (a multi-language site) would add: `hreflang` clusters (a self-reference + reciprocal pairs), `og:locale:alternate`, a `/de/` + `/fr/` route tree, and the `inLanguage` property on the JSON-LD blocks (`STRUCTURED_DATA.md §6`'s last row). Multi-language is **P3** in the out-of-scope list (`PRD.md §6`).

### 1.7 What the baseline deliberately does *not* do

- **No `hreflang`** (§1.6).
- **No `noindex` meta on public pages** — every `WFR-101` page is indexed. A `noindex` on a marketing page is a bug, not a tactic.
- **No `robots` per-page directives** beyond the global `robots.txt`.
- **No programmatic SEO pages** (a "AI code review for [language] × [framework]" generator). It is a classic doorway-page pattern; a search engine treats a scaled template as a *duplicate*, and an answer engine treats it as unquotable.
- **No `sitemap` index for content** — one flat `sitemap.xml` (the content volume at P2 is ~30 URLs; a sitemap *index* is a scale answer, not a P2 answer).

## 2. The on-page gate (the "every page passes" rule)

`PRD.md §5`'s "SEO: 100% of `WFR-101` pages pass the on-page check". The gate is **automated** — a `title`-length and `description`-length check is a *regex*, not a review. The checks run in the website CI lane (§5.1 below) against the *built* HTML.

| # | Check | The rule | The failure |
| --- | --- | --- | --- |
| 1 | **Title** | ≤ 60 chars, unique across the site; the H1 text is the title's core (a "one question per page" title, `INFORMATION_ARCHITECTURE_AND_PAGES.md §2`) | a truncated title in the SERP |
| 2 | **Meta description** | 120–158 chars, unique across the site | a truncated or a rewritten description |
| 3 | **One H1** | exactly one `<h1>` per page, and it is the page's *question's answer* | a "no one knows what this page is" page |
| 4 | **Descriptive anchors** | no "click here", "read more", "learn more"; the anchor text is the target's noun phrase ("the GitHub App permissions") | an anchor-invisible page (a crawler + an LLM can't tell what a link points at) |
| 5 | **Image `alt`** | every `<img>` has an `alt`; a *decorative* image has `alt=""` (not a missing `alt`) | a screen-reader gap + an unverifiable image claim |
| 6 | **Heading order** | no skipped levels (h1 → h2 → h3) | an outline an extractor cannot follow |
| 7 | **Canonical** | present, absolute, self-referencing | a duplicate-URL ambiguity |
| 8 | **JSON-LD** | present, valid (`ld-lint`), the FAQ byte-equivalence | an unquotable page |

### 2.1 The internal-linking rules

From `INFORMATION_ARCHITECTURE_AND_PAGES.md §5` (the *no-orphan* rules):

- **Every docs page links to ≥ 2 other docs pages.** No orphan pages.
- **Every blog article links to ≥ 1 docs page** (a content-to-product path).
- **The changelog links to the docs for each behavioral change** ("the `rules` API changed — see the docs"). A changelog entry that changes behavior *without* a docs link is an incomplete entry (`CONTENT_STRATEGY.md §2.2`'s "Upgrade notes are mandatory" spirit).
- **No orphan public page.** The weekly crawl check (§5.2) asserts every `sitemap.xml` URL is reachable *and* every public page is reachable *from* the sitemap. A page that is in neither set is a dead end.

**The AEO-specific linking rules (added here):**

- **A link's anchor text states the fact, not the destination.** "the GitHub App's least-privilege permissions" beats "docs" — an answer engine that extracts only a link's anchor text gets the fact from the anchor.
- **A link's target page repeats the anchor's key noun.** A page linked as "the GitHub App connect flow" must have "GitHub App connect flow" in its H1 + its title + its first paragraph. A link that promises a term the target doesn't use is a broken promise to a crawler.
- **The context-to-product path is 1 hop.** `/blog/<slug>` → `/docs/<topic>` → `/signin` (the connect CTA) — a reader (and a crawler) reaches the connect path in ≤ 2 clicks from any entry page. A deeper path is a conversion leak. The CTA is the connection — there is nothing to purchase first.

### 2.2 The title / description patterns (by surface)

| Surface | Title pattern | Description pattern |
| --- | --- | --- |
| `/` | "AI code review for GitHub teams — VERCODE" | the wedge + "a deterministic-first review that posts a verdict + evidence-backed inline comments" |
| `/features` | "What VERCODE does that other AI reviewers don't" | the 4 pillars, one clause each |
| `/faq` | "FAQ — will VERCODE post comments, which models, is it open source" | the 3 highest-intent questions, named |
| `/docs/<topic>` | "<Topic> — VERCODE docs" | the one-sentence purpose, with the literal |
| `/blog/<slug>` | the article's headline (≤ 110 chars, `WFR-303`) | the dek (the 1-sentence claim) |
| `/changelog` | "Changelog — every VERCODE release" | "One entry per release: what changed, what broke, what to do." |
| `/legal/<x>` | "<X> — Vercode" | the scope + the "last updated" date |

## 3. AEO (answer-engine optimization)

An answer engine (a Google AI Overview, a Perplexity answer, a Copilot answer, a ChatGPT search) does three things: it **retrieves** a page, it **extracts** a passage, and it **cites** the URL. AEO is the engineering of the extraction step: making the passage it extracts *the answer*, not a lead-in.

### 3.1 The quotability rules (the `CONTENT_STRATEGY.md §4` pass, enforced)

| # | Rule | A bad example | A good example |
| --- | --- | --- | --- |
| **Q1** | The answer lives at the **top** of the page (the first 300 tokens), not at the bottom | "Learn about how VERCODE works below… (four sections later)…" | "VERCODE connects your GitHub repositories and posts a summary verdict + inline findings on each review." — the first paragraph |
| **Q2** | Declarative **subject–verb–object** sentences | "VERCODE's pipeline leverages static analysis…" | "VERCODE runs ESLint and Semgrep on changed files before the LLM." |
| **Q3** | Literal numbers **with units** | "sub-5-minute reviews" | "p50 under 120 seconds, p95 under 300 seconds." |
| **Q4** | A table or list when the answer *is* tabular | "We offer several configuration options…" | a `<table>` of the GitHub App's permission list (the `/docs/github-app` permissions, `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.4`'s connect topic) |
| **Q5** | The JSON-LD text **==** the visible text (byte-equivalent for the FAQ, `STRUCTURED_DATA.md §4.2`) | a schema answer that says "0.6" and a page that says "high confidence" | the same string, generated once |

### 3.2 The "answer at the top of the page" rule

Every page opens with a **self-contained answer paragraph** before any navigation, illustration, or secondary content:

- `/` — the H1 (the wedge) + a 1–2 sentence subhead that names what the product does (the value loop, connect → review → findings → usage report).
- `/faq` — the H1 + a 2-sentence orientation.
- `/docs/<topic>` — the H1 + a **1-sentence purpose** (`INFORMATION_ARCHITECTURE_AND_PAGES.md §3.5`) + the first factual statement. A docs page is a *fact sheet*; the fact is first.
- `/blog/<slug>` — the H1 + the dek (the 1-sentence claim).
- `/legal/<x>` — the H1 + the scope + the "last updated" date.

**The first-300-tokens rule is mechanical:** the first screen of every page contains the page's *answer sentence*, with no CTA, no image, and no nav above it. A CTA above the answer ("Start a free review" as the first element) is a conversion win and an AEO loss — a CTA is not a quotable answer.

### 3.3 The FAQ schema (the byte-equivalence, restated operationally)

The `FAQPage` on `/faq` carries ≥ 15 `Question`s, and each `acceptedAnswer.text` is the **same string** as the visible answer (`WFR-204`). The mechanism is a *shared source*, not a discipline (`STRUCTURED_DATA.md §2.3`): the visible answer and the `Answer.text` are rendered from the same `content/faq/` item, and the CI lane asserts the byte-equality against the built HTML.

Three consequences an editor must internalize:

- **Editing the visible FAQ text is not possible** — the text is edited in `content/faq/`, and it changes *both* surfaces. A "just tweak the wording on the page" edit is a `content/` edit.
- **The answer must be self-contained.** A `FAQPage` answer that begins "As mentioned above, it depends on your setup…" is unquotable in a snippet. Each answer starts with the subject: "VERCODE posts comments on your pull requests…".
- **A question that is asked as a keyword is answered as a sentence.** The 3 example Q/A pairs in `STRUCTURED_DATA.md §3.5` are the model: a 1–3 sentence answer, the first sentence carrying the whole answer.

### 3.4 The AEO keyword map

The map from a *search/answer intent* to the *page that answers it*. Each entry names the **question the page answers** — an AEO page that answers a question is quotable; a page that targets a keyword without answering it is not.

| Keyword / query | Target page | The question it answers | The quotable artifact on that page |
| --- | --- | --- | --- |
| **AI code review** | `/` | "What is AI code review, and how is VERCODE's different from a bot that comments?" | The hero's verdict device ("Needs changes · 2 high") + the "how it works" 3 steps + the `HowTo` JSON-LD (`STRUCTURED_DATA.md §3.6`) |
| **AI code reviewer** | `/features` | "What does the AI code reviewer actually do — what does it catch and what does it skip?" | The 4 pillars, each a 2–3 sentence declarative claim + the security-findings rollup story (`WFR-205`) |
| **automatic code review tool** | `/features#connect-not-configure` | "Can code review run automatically on every pull request, without a human reading the diff first?" | The "Connect your repo → Open a PR → Read the review" sequence + the connect-not-configure paragraph (the plain usage report) |
| **CodeRabbit alternative** | `/features` + `/docs` | "What does a deterministic-first alternative to CodeRabbit do differently?" | The deterministic-precision pillar (static analysis before the LLM) + the connect story + the confidence-floor answer (FAQ q3). **Constraint:** a competitor comparison is allowed *only* when every cell is a *measured* figure from `BENCHMARK_DATASET.md`; a "we are better" assertion is a banned claim (`CONTENT_STRATEGY.md §1.3`) |
| **AI PR review** | `/docs/quickstart` | "How do I get AI review on my pull requests?" | The 3-step quickstart + the `HowTo` + the permission list (the least-privilege list, `FR-210`) |
| **GitHub AI code review** | `/docs/github-app` | "Which GitHub permissions does the AI code review app need, and does it work on fork PRs?" | The permission list (a table — a list is the answer, Q4) + the fork-PR answer (the sandboxed path, `FR-203`) |
| **AI code review for teams** | `/docs/connect` | "How does a team connect its GitHub repositories to get reviews?" | The connect-flow guide (install URL, repository selection, disconnect) + the usage-report fact sheet — no pricing, plans, or limits to quote (`INFORMATION_ARCHITECTURE_AND_PAGES.md §3.4`'s GitHub-connection topics) |
| **LLM code review** | `/blog/why-static-analysis-before-the-llm` | "Is LLM-based code review accurate, and what makes an LLM reviewer less noisy?" | The article's one claim + its measured benchmark + the "deterministic code review" argument (`CONTENT_STRATEGY.md §2.3`'s 3-part test) |
| **deterministic code review** | `/features#deterministic-precision` | "What is deterministic code review, and why does it beat a pure-LLM reviewer on false positives?" | The deterministic-precision pillar + the ADR-005 story (static analysis before the model) + the confidence floor (0.6) |

**The map's rules:**

- **One primary keyword per page.** A page that targets three keywords answers none of them.
- **The keyword must appear in the page's *answer*, not just its title.** The title carries the keyword for the SERP; the answer paragraph carries it for the extraction.
- **The map's pages are the pages that exist.** No keyword in the map points at a route that is not in `INFORMATION_ARCHITECTURE_AND_PAGES.md §1`. A keyword that needs a page that does not exist is a *content gap* (a backlog item), not a landing-page brief.
- **The "CodeRabbit alternative" entry is the only competitive intent** and it is *bounded*: no feature-comparison table unless every cell is a measured figure (`CONTENT_STRATEGY.md §1.3`'s rule, verbatim).

## 4. GEO (generative-engine optimization)

Generative engines differ from answer engines in one way that matters: an answer engine cites a *passage*; a generative engine cites a *fact* it retrieved and rephrased. To survive rephrasing, a fact must be **retrievable in a compact, unambiguous, quotable form**. Three mechanisms: `llms.txt` (the natural-language index), `/api/answer` (the deterministic fact endpoint), and the citation-hygiene rules for every fact the site asserts.

### 4.1 `llms.txt` (the machine-readable index)

`WFR-401`: a top-level `/llms.txt` listing, in plain markdown, the key product facts — the wedge, the 4 pillars, the "open-source?" answer, the "self-hosted?" answer — **in the same order as the hero → CTA**. `llms.txt` is a *machine-readable index* for LLMs; it is **not** a schema replacement (JSON-LD is), it is the natural-language summary layer.

**The exact file format:**

```markdown
# Vercode

> VERCODE runs AI code review on your pull requests. Connect your GitHub App and reviews publish to the PR - no plans, no caps, plain usage visibility.

## What VERCODE does
- VERCODE runs ESLint and Semgrep on the changed files before the LLM stage.
- Every finding carries a category, a severity, a confidence, a reason, and a suggested fix.
- The default confidence floor is 0.6; findings below the floor are suppressed by default.
- VERCODE analyzes pull-request diffs. It does not persist source code.

## Is VERCODE open source?
- VERCODE is MIT-licensed and its repository is public. https://vercode.com/about

## Can I self-host VERCODE?
- The repository is public and the pipeline is documented. The hosted service depends on a GitHub App and on provider credentials; a fully self-hosted deployment is not documented as a supported path. https://vercode.com/docs/quickstart

## Where to read more
- Quickstart: https://vercode.com/docs/quickstart
- API reference: https://vercode.com/docs/api
- Changelog: https://vercode.com/changelog
- FAQ: https://vercode.com/faq
```

**The format rules:**

- **The first line is a one-line description header** — `# Vercode`, then a `>` blockquote carrying the *one-line description* (the wedge + the one differentiating sentence). This is the `llms.txt` convention: a title + a description, then sections.
- **Then a markdown list of the key facts**, grouped under `##` section headings, each fact a `- ` bullet with the literal numbers and a canonical URL.
- **The order mirrors the page** — the wedge first (the `hero → CTA` order, `WFR-401`), then the pillars, then the two yes/no answers, then the "where to read more" index. The order is a *narrative* order, so a truncated read still yields the top facts.
- **Every bullet is a self-contained fact** with the literal number and a URL. A bullet that requires another bullet to be understood is not a fact.
- **`llms.txt` is generated**, not hand-written — from a `content/facts/` file of the narrative facts. A hand-written `llms.txt` drifts (the "triple source" rule, §4.3).
- **The file is a `.txt`, not `.md`** — it is served as `text/plain; charset=utf-8` (a machine reads it, a human reads it in a browser).

### 4.2 `/llms-full.txt` (the `U6` decision: ship both)

`PRD.md §8 U6` leans: **minimal `/llms.txt` + a `/llms-full.txt` that concatenates the full product facts**. This doc confirms that lean:

- **`/llms.txt`** — the ~40-bullet index above. It is the *default* retrieval surface: it is short enough to be read wholly, and it answers the top facts.
- **`/llms-full.txt`** — the **full product fact prose**: the complete `ProductFact` set (`CONTENT_SCHEMAS.md §3`) serialized as markdown, one section per fact group, with the *complete* sentences (not the compressed bullets). It is the "everything, in one file" surface for a model that is asked to be thorough.
- **The rule:** `llms-full.txt` is a **concatenation of the same fact records** the minimal file draws from — the same `ProductFact` objects, a different *rendering*. It is **not** a second hand-written document, and it is **not** the site's prose (a scrape of the whole site is what an LLM can already do; the value-add is the *facts*, structured).
- **The minimal file is a strict subset of the full one** — every fact in `llms.txt` appears in `llms-full.txt` *verbatim*. A fact in the full file that contradicts the minimal one is a build failure (the same `triple-source` check, §4.3).

### 4.3 The "triple source" rule (`WFR-402`)

A `WFR-401` fact is present in **three** places, and all three are generated from **one** source in **one** build:

| # | Where | The form |
| --- | --- | --- |
| 1 | **The visible page text** | a sentence or a table cell on `/faq`, `/` |
| 2 | **The JSON-LD** | the `Product`/`Offer`/`FAQPage`/`SoftwareApplication` blocks (`STRUCTURED_DATA.md §3`) |
| 3 | **`llms.txt` + `/api/answer`** | the `ProductFact` JSON (`CONTENT_SCHEMAS.md §3`) rendered as the bullet + returned as the endpoint's answer |

The drift risk is *structural*, not behavioural: the three surfaces are generated from `content/facts/`, so a change propagates to all three or to none. The CI lane asserts the consistency (§5.1) — a fact whose JSON-LD text is not present in the visible HTML is a build failure (`STRUCTURED_DATA.md §5.1`'s `triple-source` check).

### 4.4 The `/api/answer` endpoint contract (`WFR-403`)

`/api/answer` is a **deterministic fact lookup** on the existing Fastify app (`TECHNICAL_ARCHITECTURE.md §1`'s `api` row, `ADR-0xx-3`) — **not** a runtime LLM call. The rule, from `TECHNICAL_ARCHITECTURE.md §4.2`: "the GEO backing is a *deterministic* fact lookup, the fact is not generated, it's looked up."

**Request:**

```
GET /api/answer?q=<urlencoded query>
```

**Response (200):**

```json
{
  "query": "does VERCODE have plans or caps",
  "intent": "faq.plans",
  "answer": "VERCODE has no plans, no caps, and no pricing. Connect your GitHub App and reviews publish to the PR with plain usage visibility.",
  "facts": [
    {
      "id": "usage.visibility",
      "label": "Usage visibility",
      "value": "plain",
      "unit": "",
      "source": "https://vercode.com",
      "asOf": "2026-10-01"
    }
  ],
  "source": "https://vercode.com",
  "generated": false
}
```

**Response (404 — a query the fact store does not answer):**

```json
{
  "query": "who is the ceo",
  "intent": null,
  "answer": null,
  "facts": [],
  "source": null,
  "generated": false
}
```

**The contract rules:**

- **The query language is bounded and enumerated.** A small Zod enum of *intents* (`faq.plans`, `faq.openSource`, `faq.selfHosted`, `latency.p50`, `latency.p95`, …) + a bounded keyword match against the query (`TECHNICAL_ARCHITECTURE.md §4.2`'s "a small Zod enum + a bounded keyword match"). An intent that is not in the enum is *not* answered — it returns the 404 body. An endpoint that answers *everything* is a hallucination surface.
- **`generated: false` is always present.** It states the answer was *looked up*, not generated. A generative engine reading the endpoint knows it is a *deterministic* source — the strongest possible citation signal.
- **`asOf` is required on every fact.** A fact without a date is a fact that will be wrong at some point and still be cited. The date is the fact's freshness (`CONTENT_STRATEGY.md §3`'s "the crawler is told the truth" principle, applied to facts).
- **`source` is the canonical URL of the human-readable page.** The endpoint's answer is quotable *because* the human can check it — a fact without a human-checkable source is a claim, not a fact.
- **A `404` is a legitimate, non-error answer.** The endpoint does not guess and it does not fall back to an LLM. "I don't have that fact" is the correct answer for an un-enumerated question.
- **The endpoint is read-only, public, and un-authenticated** (an answer engine makes anonymous HTTP calls). It is rate-limited like any other public route (`docs/API/RATE_LIMITING.md`).
- **The endpoint reads the same facts as the site** (`TECHNICAL_ARCHITECTURE.md §4.3`'s "the single DB coupling": the website does not read the app's Postgres in P2; the fact records live in `content/facts/` and the `apps/api`'s `/api/answer` reads the *same* file at build time). The OpenAPI drift gate applies (`RELEASE_CRITERIA gate 11`, `TECHNICAL_ARCHITECTURE.md §1`'s "a contract change — the route is added to `docs/API/OPENAPI.yaml` first").

### 4.5 Citation hygiene (the rules every fact obeys)

These are the rules that make a citing LLM *correct* rather than *plausible*:

1. **Facts are verbatim-quotable.** A fact is a single sentence with the literal number and the unit. It must be quotable *without* the surrounding paragraph. (This is the `CONTENT_STRATEGY.md §1.1`'s "specificity" lever, at the schema level.)
2. **No vanity totals.** "10,000+ teams", "the most popular AI reviewer", "developers love it" — a total with no source, no measurement, and no date. Banned (`CONTENT_STRATEGY.md §1.3`, `DESIGN_SYSTEM_AND_TYPOGRAPHY.md §6`'s checklist). The corollary: **if there is no social proof, the section is omitted, not fabricated** (`PRD.md WFR-202`).
3. **Named figures, not rounded ones.** "5,000 reviews per month", not "thousands of reviews". "p50 under 120 seconds", not "fast". A rounded figure invites a paraphrase into a false precision.
4. **Every figure has a source and a date.** The `ProductFact` record carries `source` + `asOf` (§4.4); a fact on a page carries a doc reference (`NFR-02`, `USAGE_QUOTAS.md §2`, `FR-206`). A figure with no traceable source does not ship (`CONTENT_STRATEGY.md §2.1`'s "every number is traceable to a doc in `docs/`").
5. **A claim about a *feature* is a claim about a *specific* behavior.** "VERCODE supports 5,000 reviews" is ambiguous (under what conditions?); "A single review covers up to 100 files per pull request" is quotable. The `ProductFact.label`/`value`/`unit` triple forces the specificity.
6. **Negative claims are stated as honestly as positive ones.** "VERCODE does not run your tests" and "VERCODE does not persist source code" are facts with a source (`L-1`, `SECURITY/PRIVACY.md`) — a fact an LLM cites about a *limitation* is as valuable as one about a feature (`CONTENT_STRATEGY.md §1.1`'s "honesty about limits").
7. **One claim per page.** A page asserting three unrelated things is not quotable for any of them (`CONTENT_STRATEGY.md §3`'s point 1).

## 5. The verification

Nothing in this doc is a claim about performance until it is measured. The verification split by *frequency* and by *automation*.

### 5.1 The CI lanes (automated; every build)

The website lanes are **separate** from the app's 12+1 gates (the *existing* gates in `RELEASE_CRITERIA.md` run unchanged; `TECHNICAL_ARCHITECTURE.md §5`'s "the website *adds* 4 new lane checks + 2 route checks"). The lanes this doc adds/uses:

| Lane | What it checks | Cadence |
| --- | --- | --- |
| **Website build** | the static export + the `content/` schema gate + the `sitemap.xml`/`robots.txt`/`llms.txt` generation + the `sitemap.xml` count == the route count + the content count | every build |
| **Website SEO lint** (a new lane; the *on-page gate*, §2) | the `<title>` ≤ 60 + unique; the meta description 120–158 + unique; exactly one `<h1>`; the canonical present + absolute; the OG/Twitter set present; the `alt` on every image; the heading order | every build |
| **Website JSON-LD validity** | the `ld-lint` check on every route's `<script type="application/ld+json">` (0 errors) + the `triple-source` byte-equivalence check (`STRUCTURED_DATA.md §5.1`) | every build |
| **Website crawl** (a new lane; §5.2) | every `sitemap.xml` URL is reachable (a 200) + every public page is reachable *from* the sitemap (the no-orphan check, `INFORMATION_ARCHITECTURE_AND_PAGES.md §5`) | every build + a weekly scheduled run against **production** |
| **Website Lighthouse** + **Website axe** | the perf budget + the 0-critical-violations rule (`TECHNICAL_ARCHITECTURE.md §5`) | every build |

The CI lanes run against the **built static export**, not a dev server (a dev-server check does not test the production artifact). The gate naming convention follows `OPERATIONS/CI_CD.md §2`'s job naming (`typecheck`, `lint`, `unit`, `docs`, `gate`); the website's jobs are prefixed `website-` and aggregate into a `check-website` target (a `Makefile` extension, `TECHNICAL_ARCHITECTURE.md §5`).

### 5.2 The weekly crawl job (the "no orphan, no 404" check)

A **scheduled** CI job (a cron, weekly, e.g. Monday 06:00 UTC) that runs against **production** (not a preview deploy):

1. **Fetch `/sitemap.xml`; parse every `<loc>`.**
2. **For each `<loc>`:** HTTP `GET`; assert a **200** (not a 3xx, not a 404, not a soft-404). A URL in the sitemap that 404s is a *sitemap* defect; a URL that 301s to the homepage is a *worse* defect (a soft-404 in disguise).
3. **Assert the count:** `sitemap count == the WFR-101 route count + the published content count` (`TECHNICAL_ARCHITECTURE.md §5`'s build-lane rule) — a *prerender* consistency check, run against production as well as the build.
4. **The reverse check (no orphan):** enumerate the *built* HTML output's routes; assert every route is either (a) in the sitemap, or (b) one of the declared non-indexed routes (`/404`, `/500`, `/signin`, the API routes, the `.txt`/`.xml` files). A route in neither set is a **page that exists but is unreachable from the sitemap** — the "no orphan public page" rule (`INFORMATION_ARCHITECTURE_AND_PAGES.md §5`).
5. **The internal-link check:** parse every page's `<a href>`; assert each internal link resolves to a 200 (an internal link to a 404 is a broken path for a crawler and for a reader).
6. **The 410 check:** for every `archived` content item, assert the URL returns **410**, not 404 and not 200.
7. **Report:** the job writes a JSON report (the URL set, the status of each, the orphans, the broken links) into the CI artifacts. A **red** weekly crawl is an alert (a Slack/email ping to the site owner); it does *not* block a merge (the build-time lane already covers the merge case). The weekly run's job is to catch a **production-only** drift (a CDN rule, a redirect, a host-level 404).

### 5.3 The GSC (Google Search Console) indexing check

A **manual, monthly** review of the GSC property (`https://vercode.com`), alongside the crawl job:

| What | How | The failure it catches |
| --- | --- | --- |
| **Index coverage** | the GSC *Pages* report → *Indexing* → the "Not indexed" reasons breakdown | a page excluded by a noindex, a canonical pointing elsewhere, a duplicate, a blocked URL |
| **Sitemaps** | the GSC *Sitemaps* report | a sitemap parse error, a submitted sitemap that isn't found, a "discovered but not submitted" gap |
| **Manual actions / security issues** | the GSC *Security & Manual Actions* report | a manual de-index (a *measured* signal — the "an honest launch" posture applied to SEO) |
| **Core Web Vitals** | the GSC *Core Web Vitals* report (field data) | a field regression the Lighthouse CI could not see (a real-user p75) |
| **The top-3 keyword positions** | the GSC *Performance* report → the queries for "AI code review", "AI PR reviewer", "AI code review GitHub" (`CONTENT_STRATEGY.md §6`'s KPI row) | a ranking drop |
| **The crawl-coverage KPI** | the GSC "indexed pages" count vs. the `sitemap.xml` count | the `PRD.md §7`'s "crawl coverage: 100% of `WFR-101` URLs in `index.html` via GSC" KPI |

The GSC is the *only* source for "is it indexed" — a self-hosted crawler check (§5.2) proves reachability, not indexing. Both are run; neither substitutes for the other.

### 5.4 The AEO citation-rate sampling (manual, monthly)

`PRD.md §7`'s KPI #3: **"Answer-engine citation rate — ≥ 1 in 5 top LLM answers to 'best AI code review' cite VERCODE verbatim on how it works — manual sampling, monthly"**. `PRD.md §8 U7` records the *automation* as a **P3** decision (the automated lane is deferred; the manual procedure is the P2 measurement).

**The procedure (a fixed protocol, so two samplers measure the same thing):**

1. **The query set (fixed, 8 queries).** Run every query *verbatim*, in a fresh session, on each of the 4 surfaces below. The queries: "best AI code review tool", "AI code review for GitHub teams", "CodeRabbit alternative", "AI PR review tools", "deterministic code review tools", "AI code review that is not noisy", "is AI code review accurate", "how does VERCODE post reviews". (The set is derived from §3.4's AEO keyword map; it changes only by a *documented* edit, so the monthly numbers are comparable.)
2. **The surfaces (4).** (a) a general LLM with web search enabled; (b) a dedicated search-answer surface (a Perplexity-style answer page); (c) a search engine's AI answer (a Google AI Overview where available); (d) a coding-assistant answer (a Copilot-style web answer). Each surface is recorded separately — the citation rates are *not* averaged into one number.
3. **The capture.** For each (query × surface): the full answer text is pasted into the report, with the date, the surface, the model/product name, and — where visible — the cited URLs.
4. **The scoring (three outcomes per answer).**
   - **Cited:** VERCODE is cited, and the cited fact is *correct* (matches the `content/facts/` records).
   - **Cited but wrong:** VERCODE is cited but a number is wrong, absent, or materially misstated. **This is the serious outcome** — it is a *drift* signal, and it is routed to the owner of the fact (the `CONTENT_STRATEGY.md §5` table's "the doc owner") within the week.
   - **Not cited.** (A VERCODE mention with no URL is scored as *not cited* — an unlinked mention is not a citation.)
5. **The rate.** `citation rate = (correctly-cited answers) / (total answers)` per surface and overall. The KPI is **≥ 1 in 5** on the "best AI code review"-class queries. A rate below the target for two consecutive months triggers a **content-gap review** (which §3.4 keyword's page is thin?) — *not* a schema change (the schema is not the bottleneck for a *citation*).
6. **The report.** A monthly one-page report: the query set, the per-surface rates, the "cited but wrong" list (with the corrected fact), and the top 3 content gaps. It is filed with the site's other monthly reports.

**Why the automation is P3, not P2:** an automated lane would call a *named* LLM, which means (a) a per-run API cost, (b) a non-deterministic result (the same query returns a different answer each week), and (c) an answer that *varies by the model's training cutoff* — the measurement would drift for reasons unrelated to the site. The manual procedure is slower but its numbers are comparable month-over-month. The automation decision (and its *snapshot* format) is `PRD.md §8 U7`, owned by data, due P3.

### 5.5 The GEO answer test (the "measured, not the claimed" rule)

The GEO test asks a *named* LLM a question about VERCODE and checks whether the answer contains **VERCODE-correct facts**. `SAAS_LAUNCH_PLAN.md §5`'s rule — "each *phase* has a *measured* state … a *not* a vague 'we're launching'" — applies to the GEO posture: **the citation rate is measured, never claimed.**

**The procedure:**

1. **The fact set (fixed).** Pick the **10 facts** that a generative engine is most likely to be asked about, from the `ProductFact` register (`CONTENT_SCHEMAS.md §3`): the wedge; the how-it-works 3 steps; the static-analysis-before-LLM order; the verdict + inline findings shape; the review latency p50/p95; the confidence floor; the open-source answer; the self-hosted answer; the "does it store source code" answer; the model-routing answer. The set is fixed so the score is comparable across months.
2. **The surfaces.** Ask each fact's question on at least **2** web-facing LLM surfaces (an LLM with web search; a dedicated answer engine). Use the *public* surfaces a user would reach — the *logged-in*, *personalized*, or *tool-calling* variants are *not* the surfaces an answer engine's user gets, and they are not reproducible.
3. **The prompt form (fixed).** The question, verbatim, in the *natural phrasing a user would type*, plus the neutral instruction: *"What is VERCODE's <fact>? Answer with the source."* The prompt is recorded alongside the answer; a changed prompt invalidates the comparison.
4. **The scoring (per answer, per fact).**
   - **Correct** — the answer's fact matches the `ProductFact` record's `value` + `unit` (and its `asOf` is not stale).
   - **Absent** — the answer does not state the fact (a *neutral* outcome; the fact is not being retrieved).
   - **Wrong** — the answer states a *different* number or a false claim (a *serious* outcome; the same drift routing as §5.4's "cited but wrong").
   - **Verbatim** — a bonus flag: the answer's phrasing matches the site's sentence closely enough to be a direct quotation (the `SEO_AEO_GEO.md §4.5`'s "verbatim-quotable" property, observed end-to-end).
5. **The report.** Per surface, per month: the `% correct`, the `% absent`, the `% wrong`, and the list of *wrong* facts with the corrected value. The headline number is the **fact accuracy rate** = `correct / (correct + wrong)` — **absent is excluded**, because an answer engine that says "I don't know" has not made a false claim. (An *absent* fact is a retrieval gap; a *wrong* fact is a correctness failure. Conflating them hides the difference.)
6. **The escalation.** Any `% wrong` > 0 is a defect, not a metric to watch: the fact is corrected (or the *page* that states it is corrected) within the week, and the correction is re-tested in the next cycle. A `% wrong` that persists across two cycles is escalated to the site's owner as a **content** defect.

**The "measured, not the claimed" rule, concretely:**

- A report says *"the GEO fact accuracy rate was 9 of 10 on the sampled surfaces in 2026-10; 1 fact was wrong (the review latency p95), corrected on 2026-10-08"* — **not** *"LLMs cite VERCODE correctly"*.
- A surface that could not be tested (a login wall, a region block, a quota) is recorded as **blocked, not claimed** — the same posture as `RELEASE_CRITERIA gate 13` (a live suite with no credentials is "marked blocked") and `CI_CD.md §7`'s "CI does not claim a live integration that the credentialed lane didn't actually run". The GEO test is a *measurement*; an unmeasurable surface is reported as unmeasured.
- The monthly report's numbers are the *only* numbers quoted about the GEO posture. There is no "LLM visibility score" bought from a vendor and quoted in a deck (the "no vanity totals" rule, `CONTENT_STRATEGY.md §1.3`).

## 6. What this doc deliberately does *not* decide

- **The `robots.txt` per-agent policy** — whether to allow/deny a named AI crawler is a **P3** ownership decision (§1.2); P2 allows all.
- **The AEO automation** — the nightly LLM-call lane + a JSON snapshot is `PRD.md §8 U7` (P3, owned by data); P2 measures manually (§5.4).
- **The multi-language surface** — a `hreflang` cluster + localized routes + `inLanguage` on the JSON-LD (P3, `PRD.md §6`).
- **The programmatic-SEO route set** — deliberately absent (§1.7).
- **The exact production domain** — `vercode.com` is assumed throughout (`PRD.md §8 U5`); the base URL is the `VERCODE_WEBSITE_BASE_URL` env var (`TECHNICAL_ARCHITECTURE.md §6`), so every absolute URL in this doc's examples is the *canonical* one and a domain change is a one-env-var change.
- **The SERP feature targets** (a "People Also Ask" placement, a featured-snippet win) — a *search-engine* outcome, not a controllable deliverable. What is controllable is the *quotability* of the page; the rest is measured (§5.3).
