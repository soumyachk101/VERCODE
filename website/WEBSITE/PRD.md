# VERCODE Website — Product Requirements Document (PRD)

This PRD governs the VERCODE public website: the marketing/landing surface that the `SAAS_LAUNCH_PLAN.md §5 P2` gate calls a *launch prerequisite* ("a marketing site + a docs site"). It defines **what** the website must do and **why**. The technical *how* (stack, hosting, structured-data format, test lanes) lives in `docs/TECHNICAL` + `docs/OPERATIONS` + `docs/WEBSITE/` sibling docs; those are the design-system/SEO/structured-data/perf-and-a11y/content/deployment/testing/roadmap siblings of this package.

> **Scope guardrail (matches `MVP_SCOPE.md` + `SAAS_LAUNCH_PLAN`):** the *dashboard* is the P0 product (`PRD.md`); this website is a P2 *launch* prerequisite, not part of the M1–M8 app build. Until the public launch phase, it ships *before* P2 and *after* the dev-stack is verified (gate-P0/P1, `SAAS_LAUNCH_PLAN §5`). The two surfaces share one typeface + palette (`DESIGN_SYSTEM.md §7` "a product site that shows its app").

## 1. Product Summary

The VERCODE website is the public, indexable, machine-readable surface that turns search/answer-engine/LLM traffic into **sign-ups** and **installations**. It is:

- **A marketing site** (one domain, `/`): hero, capability narrative, social proof, and the CTA that starts J1 (`USER_JOURNEYS`).
- **A docs & changelog hub** (`/docs/*`, `/changelog/*`, `/blog/*`): the content surfaces `SAAS_LAUNCH_PLAN P2` requires to be *live* at public launch.
- **An AI-answerable surface** (AEO/GEO, `SEO_AEO_GEO.md`): every factual claim about the product is expressed so that search snippets, answer engines, and LLMs can cite VERCODE without paraphrasing it into fiction.

Target: the same audience as the `PRD.md §3` personas, *pre-signup*: a GitHub-native engineering team leader evaluating AI code-review tools. The one-line wedge (`SAAS_LAUNCH_PLAN §1`): **"VERCODE is the AI code-review a team actually reads — deterministic-first, evidence-backed, cost-disciplined, a workspace not just a bot."**

## 2. Core Problems Solved (Website-Specific)

| # | Problem | How the website solves it |
| - | --- | --- |
| W1 | No discoverable public entry to the product | `/` + `/docs` indexable on `vercode.com` (domain a launch prereq, `SAAS_LAUNCH_PLAN §3`); no JS-gated content (SEO, `SEO_AEO_GEO.md`) |
| W2 | Generic AI-landing slop erodes trust | One typeface + palette shared with the app (`DESIGN_SYSTEM.md §7`), the **review-verdict hero** (`DESIGN_SYSTEM §7`'s "a dealt direction"), no gradient blobs, no "10,000+ teams" vanity totals (`DESIGN_SYSTEM §9` tell-ban) |
| W3 | Answer engines can't verify VERCODE's claims (GEO risk) | Every quota/rate-limit claim is a **verbatim-quotable statement + JSON-LD** (`STRUCTURED_DATA.md`), so an LLM citing VERCODE cites the *true* number |
| W4 | FAQ content exists only in the dashboard (not crawlable) | A `/faq` with `FAQPage` schema answers the top ~15 "will it post a comment / what models / is it open-source" questions AEO targets (`SEO_AEO_GEO.md`) |
| W5 | No machine-readable product facts | Organization/WebSite/SoftwareApplication/Product/Offer/ProductReview/FAQPage/HowTo/BreadcrumbList/Article/Person schemas (`STRUCTURED_DATA.md`) |
| W6 | Blog/changelog/docs content has no schema | Article + Breadcrumb + Person/author + changelog `ItemList` on `/changelog` (`CONTENT_SCHEMAS.md` + `STRUCTURED_DATA.md`) |
| W7 | No performance budget on the public surface | Lighthouse/CRFP budgets (`PERFORMANCE_AND_ACCESSIBILITY.md`) on marketing + docs pages, separate from the dashboard NFRs |
| W8 | No a11y gate on the public surface | WCAG 2.2 AA on all public pages (`ACCESSIBILITY.md` reference, `docs/DESIGN/ACCESSIBILITY.md`), axe-core in CI |

## 3. Target Users & Personas (Website Audience)

The website audience = the 5 dashboard personas **before** they sign up + **after** they're evaluating. One website-specific persona is added:

- **Wendy (the pre-signup evaluator):** a tech lead who has tried CodeRabbit/GitHub Copilot review and is skeptical of *noise*. Her journey: `/` → `/docs/compare` → `/signin`. The website's job is to reduce her evaluation time and make the wedge (`SAAS_LAUNCH_PLAN §1`) *believable* (deterministic-first + evidence-backed are her trust levers, `PRODUCT_VISION.md §4`).

Existing dashboard personas (`USER_PERSONAS.md`) drive the *post-signup* CTA copy; the website's hero + docs map to them directly.

## 4. Functional Requirements

IDs follow `WFR-<n>`. All P0 items ship at **P2 public launch** (`SAAS_LAUNCH_PLAN §5`). P1 items ship post-P2. The acceptance-criteria doc (`ROADMAP_AND_ACCEPTANCE_CRITERIA.md`, the `W-AC-*` IDs) keys every P0 WFR to a test.

### 4.1 Sitemap & Pages (Information Architecture)

- `WFR-101` The site's public routes are: `/`, `/features` (capability narrative), `/faq`, `/docs` (docs hub index), `/docs/<topic>` (per topic), `/changelog`, `/changelog/<date>`, `/blog`, `/blog/<slug>`, `/about`, `/legal` (terms, privacy, security, DPA, status), `/404`, `/500`. **No other public routes.** *(P0)*
- `WFR-102` Every page has: a unique `<title>` ≤ 60 chars, a unique meta description 120–158 chars, a canonical URL, and one JSON-LD block per `STRUCTURED_DATA.md §1`. *(P0)*
- `WFR-103` Sitemap XML at `/sitemap.xml` lists every `WFR-101` URL + every `/blog` + `/docs` + `/changelog` entry, grouped by lastmod, `<changefreq>` honest (marketing `weekly`, docs `daily`, blog `monthly`). `robots.txt` at `/robots.txt` allows all + points at `/sitemap.xml` + disallows `/docs/source` (raw source, if any). *(P0)*
- `WFR-104` Breadcrumb JSON-LD on every page `/docs/*`, `/changelog/*`, `/blog/*` (root → section → page); `BreadcrumbList` schema (`STRUCTURED_DATA.md §5`). *(P0)*
- `WFR-105` 404 page is on-domain, 410 (not 404) for soft-deleted docs, and *not* an SEO trap (returns `410 Gone` in the HTTP status, not a 200 with a 404 body). *(P0)*

### 4.2 Marketing Pages

- `WFR-201` `/` hero: **the review-verdict device** (`DESIGN_SYSTEM §7`) — a live, type-set "Needs changes · 2 high" line as the one large thing; **no gradient, no icon-topped feature cards, no eyebrow labels, no monospace outside code** (the banned tells, `DESIGN_SYSTEM §7 + §9`). Sub-headline states the wedge (`SAAS_LAUNCH_PLAN §1`) verbatim. Primary CTA: "Start free review" → `/signin` (the J1 entry, `USER_JOURNEYS J1`). Secondary CTA: "Read the docs" → `/docs`. *(P0)*
- `WFR-202` `/` section order: hero → **how it works** (3 steps, `HowTo` schema, "the pipeline in 30 seconds") → **capability** (deterministic-first, evidence-backed, cost discipline, the 4 pillars from `README.md`) → **social proof** (real logos/names only, no `DESIGN_SYSTEM §9` banned "Acme/John Doe" placeholders; an empty social-proof section is *omitted*, not fabricated) → **FAQ** (top 5, `FAQPage` schema) → footer. *(P0)*
- `WFR-203` `/faq` lists ≥ 15 questions, each with `mainEntity` `Question` + `acceptedAnswer` in the `FAQPage` JSON-LD; the visible answer text **matches the JSON-LD text byte-for-byte** (GEO/answer-engine consistency, `SEO_AEO_GEO.md §3`). *(P0)*
- `WFR-204` `/features` is the capability narrative: deterministic-first pipeline, the 4 pillars, the **security-findings rollup** story (the `FR-504` user-facing value), the **audit trail** story (`FR-510`), and **BYOK** for enterprise. Every feature is linked to the dashboard FR it satisfies (a traceability link, `PRODUCT/ACCEPTANCE_CRITERIA.md`). *(P0)*

### 4.3 Docs & Content Surfaces

- `WFR-301` `/docs` is the public developer docs hub. The *first-cut* content set (P2) is: **quickstart** (install + first review, mirroring `USER_JOURNEYS J1`'s sign-up→install→first-review), **API reference** (the dashboard REST + webhook contract, sourced from `docs/API/OPENAPI.yaml`), **GitHub App install guide**, **rules & configuration** (`FR-505`), **security findings** (`FR-504`), **quotas & limits** (`USAGE_QUOTAS`), **changelog link**. Each `/docs/<topic>` is a static page (SST, Next.js App Router), `Article` JSON-LD + `BreadcrumbList`. *(P0 at P2; the *living* docs site ships P2+)*
- `WFR-302` `/changelog` is a time-ordered feed of releases; each entry is a `CreativeWork` (or `Release` on a dedicated page) with date + author + a human-readable summary. The feed uses an `ItemList` JSON-LD listing the latest 10. *(P0)*
- `WFR-303` `/blog` is an article index; each `/blog/<slug>` is an `Article` with `author` (`Person`), `datePublished`, `dateModified`, `headline` (≤ 110 chars), `image` (an OG 1200×630). *(P0)*
- `WFR-304` Content (blog/changelog/docs) is authored as **Markdown in `content/`** (a new repo root dir, `docs/WEBSITE/CONTENT_SCHEMAS.md`), validated against a `Contract` schema (`packages/contracts` sibling), and rendered by `next-mdx` / a plain MD loader. **No CMS** in MVP. *(P0)*
- `WFR-305` Every published content item has a `front matter` shape defined by `CONTENT_SCHEMAS.md` (title, description, date, author, tags, status: draft|published|archived); `draft` items are not rendered at `/` nor included in `sitemap.xml`. *(P0)*

### 4.4 Machine Readability & SEO (AEO/GEO)

- `WFR-401` A top-level `llms.txt` at `/llms.txt` lists, in plain markdown, the key product facts (quotas, rate limits, the wedge, the 4 pillars, the "open-source?" answer, "self-hosted?" answer) **in the same order as the hero → CTA**. `llms.txt` is a *machine-readable index* for LLMs; it is **not** a schema replacement (JSON-LD is), it's the natural-language summary layer (`SEO_AEO_GEO.md §4`). *(P0)*
- `WFR-402` Every `WFR-401` fact is also present in the visible page text + JSON-LD (a "triple source" rule — see `SEO_AEO_GEO.md §2`). *(P0)*
- `WFR-403` A `/api/answer` JSON endpoint (Fastify) returns the product's structured answers to a bounded query language ("how many reviews does the standard quota include", "is it open source"). This endpoint is the GEO *backing* for any answer engine that can make HTTP calls; it is also the **single source of truth** that `STRUCTURED_DATA.md`'s JSON-LD generator reads from, so the on-page schema and the API answer can't drift. *(P0)*
- `WFR-404` Open Graph + Twitter Card meta on every page (`WFR-102`), with a VERCODE-default OG image (1200×630, the product mark + a short one-line). Per-page OG image for `/blog/<slug>` is the `image` field of `WFR-303`. *(P0)*
- `WFR-405` `hreflang` is **not** used in MVP (EN only; a multi-lang is a P1 decision, `UNRESOLVED` below). *(P0: the *absence* of hreflang is declared)*
- `WFR-406` A `/legal/` cluster: `terms`, `privacy`, `security` (a public trust page that *links* to `docs/SECURITY/SECURITY_ARCHITECTURE.md` in a simplified public form), `dpa` (the DPDP/SOC2 evidence page, `SAAS_LAUNCH_PLAN P3`), `status` (a link to the status page, a launch prereq, `SAAS_LAUNCH_PLAN §5`). *(P0 at P2)*

### 4.5 CTA & Conversion

- `WFR-501` The primary CTA on `/` is **"/signin"** (the J1 start, `USER_JOURNEYS`); the *secondary* is `/docs/quickstart`. CTA copy uses the *word of the trade* ("Start a free review", not "Get started" — `DESIGN_SYSTEM §7`). *(P0)*
- `WFR-503` A **waitlist** CTA is *not* part of P2 (the public launch is the self-serve, `SAAS_LAUNCH_PLAN §4`); a waitlist form is a P1 deferred feature if usage is rate-limited. *(P0: the *absence* is declared)*
- `WFR-504` Conversion instrumentation: **one** first-party, cookieless beacon on `/signin` success (the "first review published" activation, `SUCCESS_METRICS` activation KPI). The beacon URL carries a `?src=web-{page}` param; no third-party analytics in P2 (the DPDP posture, `SECURITY/PRIVACY.md`). *(P0)*

## 5. Non-Functional Requirements

The website NFRs live in `PERFORMANCE_AND_ACCESSIBILITY.md` (IDs `WNFR-##`). Summary targets:

- **Performance:** Lighthouse mobile ≥ 90 on `/` + `/docs/quickstart` (a CRFP budget, `PERFORMANCE_AND_ACCESSIBILITY.md`).
- **Accessibility:** WCAG 2.2 AA on every public page (`docs/DESIGN/ACCESSIBILITY.md` reference; axe-core 0-violations in CI).
- **SEO:** 100% of `WFR-101` pages pass the on-page check (`SEO_AEO_GEO.md §5` "the on-page gate").
- **Trust:** no vanity totals, no fabricated logos (`DESIGN_SYSTEM §9` tell-bans).

## 6. Out of Scope (Explicit)

- **A public API portal** (a `/api` reference site with a "try it" console) — P3.
- **A customer showcase / case-study section** — P3 (the *trust* evidence, `SAAS_LAUNCH_PLAN §4`).
- **A status page** — the *link* to one is P2 (`WFR-406`); the *page* is a separate service (Infra decision, `UNRESOLVED`).
- **Multi-language / i18n** — P3 (declared absent, `WFR-405`).
- **A customer "community" forum** — out of scope.
- **The *live* docs site** with versioning, search, and interactive examples — P2 is the *first-cut* static docs hub (`WFR-301`); the *living* docs (with search + a `/docs/search` AEO surface) is P3.

## 7. Success Metrics (Website KPIs)

Keyed to `SUCCESS_METRICS.md` (the dashboard KPIs) + new website KPIs:

| Metric | Target | Source |
| --- | --- | --- |
| Organic sign-ups (30 d post-launch) | ≥ 500 | the `?src=web-*` beacon (a first-party, cookieless, `WFR-504`) |
| Organic share of total sign-ups | ≥ 40% at 90 d | same beacon, segmented on `utm_source` |
| Answer-engine citation rate | ≥ 1 in 5 top LLM answers to "best AI code review" cite VERCODE verbatim on quota/limits | manual sampling, monthly, `SEO_AEO_GEO.md §5` |
| Lighthouse mobile `/` | ≥ 90 | CI Lighthouse, `PERFORMANCE_AND_ACCESSIBILITY.md` |
| 404 rate | < 1% of pageviews | server access logs |
| Crawl coverage | 100% of `WFR-101` URLs in `index.html` via GSC (or a self-hosted crawler check) | a weekly CI job, `PERFORMANCE_AND_ACCESSIBILITY.md` |

## 8. Unresolved Decisions (Carried into `UNRESOLVED_DECISIONS.md`)

The following are **open** as of this PRD write and are tracked in `UNRESOLVED_DECISIONS.md` with an owner + a decision deadline:

- **U1: Hosting topology** — the website is a *separate Next.js app* (`apps/website`) or a *route inside the existing `apps/web`* (`apps/web` with a `marketing` segment)? The dashboard app is `Next.js 15 + Tailwind 4 + shadcn` (`TECHNICAL/TECH_STACK.md`); a separate `apps/website` keeps the two surfaces' budgets decoupled (the dashboard's `NFR` perf budget ≠ the website's `WNFR`). **Leaning: a separate `apps/website`** (recommended). *(Owner: infra; due: before P2 build start.)*
- **U2: Content store** — Markdown in `content/` + `next-mdx` (the `WFR-304` default) vs. a static `Astro` content collection. **Leaning: `content/` + Next.js `next-mdx`** to keep the stack pinned to `TECH_STACK.md`. *(Owner: frontend; due: before P2 build.)*
- **U3: Status page** — a *link* at `/legal/status` to an external service (Statuspage, a launch prereq, `SAAS_LAUNCH_PLAN §5`) or a *self-hosted* `/status` page. **Leaning: external link + a `/status` thin page that embeds the external dashboard**. *(Owner: infra; due: before P2.)*
- **U4: Analytics** — a first-party cookieless beacon only (`WFR-504`) vs. a lightweight self-hosted Plausible/Matomo. **Leaning: cookieless first-party only** for P2 (the DPDP posture, `SECURITY/PRIVACY.md`); a self-hosted Plausible is a P3 option. *(Owner: data; due: P2.)*
- **U5: Domain** — `vercode.com` (a launch prereq, `SAAS_LAUNCH_PLAN §3`) — the *exact* domain is not in the repo yet; P2 assumes a placeholder `*.vercode.dev` for dev + `vercode.com` for prod, both owned by the infra team. *(Owner: infra.)*
- **U6: The `llms.txt` scope** — a *minimal* `WFR-401` fact-list, or the full product fact graph (a `llms-full.txt` style, one file per domain). **Leaning: minimal `/llms.txt` + a `/llms-full.txt` that concatenates the full product facts** (the `SEO_AEO_GEO.md §4` decision). *(Owner: SEO; due: P2.)*
- **U7: AEO test lane** — whether the answer-engine citation check (`§7` KPI #3) is a *manual* monthly sample or an *automated* CI job that calls a named LLM and checks its answer for VERCODE-correct facts. **Leaning: automated via a nightly GCP-hosted LLM call + a JSON snapshot; a P1 decision.** *(Owner: data; due: P3.)*

## 9. Acceptance Criteria Convention

Every `WFR-*` maps to a `W-AC-*` acceptance criterion in `ACCEPTANCE_CRITERIA.md` (a sibling) and to at least one test (`UNIT_TEST_PLAN`-style, `E2E_TEST_PLAN`'s website lane, `RELEASE_CRITERIA` gate, `SECURITY_TEST_PLAN`'s public-surface check). The convention is the same as the app's: **a `WFR` with no `W-AC` is not P0; a `W-AC` with no test is an incomplete feature** (`docs/PRODUCT/ACCEPTANCE_CRITERIA.md`'s rule, mirrored here).
