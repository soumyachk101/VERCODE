# VERCODE Website — Technical Architecture

The deployable + data-flow architecture of the VERCODE website (`docs/WEBSITE/PRD.md` `WFR-*`). Every decision here either **pins** the existing stack (`docs/TECHNICAL/TECH_STACK.md`) or **records a new ADR** (`docs/TECHNICAL/ARCHITECTURE_DECISIONS.md` — the next ADR number, `ADR-0xx`). The *honest* rule applies: anything not in this file is a deviation (`TECH_STACK.md`'s own rule).

> **Boundary:** the dashboard app (`apps/web`) is *not* this doc's concern. This doc covers the new `website` app + its content pipeline + its CI lane. The **two surfaces share one typeface + palette** (`DESIGN_SYSTEM.md §7`), but have **decoupled perf budgets** (dashboard NFRs, `docs/PRODUCT/NON_FUNCTIONAL_REQUIREMENTS.md` vs. website WNFRs, `docs/WEBSITE/PERFORMANCE_AND_ACCESSIBILITY.md`), **decoupled deployable units** (`OPERATIONS/DEPLOYMENT.md`'s `web`/`api`/`worker` + a new `website` unit), and a **separate content store** (`website/content/`).

## 1. The deployable

| Unit | What it is | New? | Notes |
| --- | --- | --- | --- |
| **`website`** | a Next.js 15 static export (`output: export`); a single Node container (or a CDN static hosting) | **yes** | the *new* deployable, sibling to `web`/`api`/`worker` in `OPERATIONS/DEPLOYMENT.md §1`. Adds one row to the deployables table. |
| **`content/`** | a repo root dir (not a deployable): Markdown + front matter + `content/` schemas | **yes** | validated by `packages/contracts` + a CI build-time gate (`RELEASE_CRITERIA.md`'s docs-drift gate, `gate 12`). |
| **`api` (existing)** | a new `GET /api/answer` route on the *existing* Fastify app | a new route | the GEO backing endpoint (`PRD.md WFR-403`). A **contract change** (the OpenAPI drift, `RELEASE_CRITERIA gate 11`) — the route is added to `docs/API/OPENAPI.yaml` first. |

**Why a separate app (U1, `PRD.md §8`):** a `Next.js 15 + App Router` for the marketing surface, decoupled from the dashboard `apps/web` (the dashboard is `output: standalone` + cookie-authenticated; the website is `output: export` + public + cookieless). A separate app lets the website **fail independently** (a website deploy doesn't touch the dashboard; the `DEPLOYMENT.md`'s "the 3 independently-deployable units" become 4), and **budget independently** (a website Lighthouse ≥ 90 is cheaper to hold than a dashboard that has 10+ KPI tiles).

## 2. Repository layout

`REPOSITORY_STRUCTURE.md`'s tree, extended:

```
apps/
  website/                ← NEW (sibling to web/, api/, worker/)
    package.json          ← @vercode/website; Next.js 15, Tailwind 4 (the token bridge, §3)
    content/              ← MDX + front matter (the WFR-304 store; schema per CONTENT_SCHEMAS.md)
      blog/
      docs/
      changelog/
      faq/
    src/
      app/                ← App Router routes (WFR-101's set, 1:1)
      components/         ← the marketing components (NOT the dashboard's shadcn set; the site's own small library)
      lib/                ← schema generators, llms.txt builder, the /api/answer route's shared types
      styles/             ← Tailwind 4 + a token bridge to DESIGN_SYSTEM.md §4 (the *shared* palette; the site's own type scale per DESIGN_SYSTEM §7's "the *page* rules")
    next.config.ts        ← output: "export"; images: a static loader; a sitemap/robots generator (the WFR-103)
    schema/               ← a single `schema-generator.ts` (the STRUCTURED_DATA.md's "single source of truth", §5 below)
    tests/                ← the website E2E lane (Playwright, E2E_TEST_PLAN.md's sibling)
    package.json          ← the `build` = `next build` (static export) + `test` = `vitest` + `lighthouse` script
```

**Why `content/` is a repo dir, not a separate service (U2):** the website has **no write path** in P2 (a blog post is authored in the repo, CI-built, deployed). A *live* CMS is P3 (a **decision**, `PRD.md §8 U6`, not an implementation). `content/` is **versioned, diffable, and CI-gated** (a blog post that's malformed fails the build, `RELEASE_CRITERIA gate 12`'s docs-drift gate, extended to the `content/` dir).

## 3. Stack (pinned from `TECHNICAL/TECH_STACK.md`)

| Layer | Choice | Source |
| --- | --- | --- |
| Framework | Next.js 15 (App Router, `output: export`) | `TECH_STACK.md §Frontend` |
| Language | TypeScript strict (root `tsconfig.base.json`) | same |
| Styling | Tailwind 4 + a **token bridge** to `DESIGN_SYSTEM.md §4` (the *shared* palette; the site's own type scale, `DESIGN_SYSTEM §7`'s "the *page* rules", NOT the app's 24px-h1 rule) | same + a new bridge file |
| Content | MDX via `next-mdx-remote` + front matter via a `zod` schema in `packages/contracts` (a new `contracts` file, `CONTENT_SCHEMAS.md`) | new |
| Static hosting | Vercel (prod) or a Cloudflare Pages bucket (dev); both with **CDN + a zero-JS** default | `OPERATIONS/DEPLOYMENT.md §5` |
| The `/api/answer` route | Fastify on the **existing** `apps/api` (NOT a separate service); the website *calls* it, doesn't host it | `SERVICE_BOUNDARIES.md` |
| OG images | `@vercel/og` (a static generation at build time; the 1200×630 default + a per-blog-slug one) | new |
| Search (P2) | a plain `client-side` search index (lunr or a static JSON) on `/docs/search` — **P3**; P2 is the *first-cut* docs hub, `PRD.md WFR-301` | new (P3) |

**The *token bridge* (`DESIGN_SYSTEM.md §4` → `website/src/styles/tokens.ts`):** the **shared** values — the ground/surface/ink/severity palette (`DESIGN_SYSTEM.md §4.2`), the radii, the spacing — are *imported* (a single `tokens.ts` that both `apps/web` and `website` import from `packages/contracts` or a `packages/design-tokens` new package, **ADR-0xx**). The **site's own** values — the hero type scale, the "a dealt direction" motion, the `DESIGN_SYSTEM §7`'s "the *page* rules" — live *only* in `website`.

## 4. Data & content flows

### 4.1 Build-time flow (the website is static)

```
content/*.md  →  next-mdx-remote  →  React tree  →  SSG pages (WFR-101)
                                  ↘
                                    schema-generator.ts  →  per-page JSON-LD <script>
                                                         ↘
                                                           llms.txt + llms-full.txt
                                                         ↘
                                                           sitemap.xml + robots.txt
                                                         ↘
                                                           _next/static/ assets (hashed)
```

**The `schema-generator.ts` is the single source of truth** (`STRUCTURED_DATA.md §5`'s rule): one function, `generateSchemaFor(page: PageDef): JsonLd[]`, that emits every `WFR-102` block for every route. **No hand-written JSON-LD** in a page file; it's *generated* from the page's data, so a fact-set change in `content/facts/` flows to `SoftwareApplication`+`FAQPage`+`/api/answer`+`llms.txt` in one build. (The site has no `content/pricing/` — the pricing system is removed; `PRD.md`'s direction note. The one `Product`-class block that remains is the `SoftwareApplication` on `/` + `/features`, with **no `offers` array**.)

### 4.2 Runtime flow (the live bits)

- `/api/answer?q=...` → the **existing** Fastify app's new route → a `contracts`-validated query language (a small Zod enum + a bounded keyword match) → a JSON answer (the `PRODUCT` facts, `CONTENT_SCHEMAS.md`'s `ProductFact` contract — the fact set is product facts, **no pricing intents**: a pricing query is a 404 body, `PRD.md WFR-403`). **No LLM at runtime** (the GEO backing is a *deterministic* fact lookup, the `SEO_AEO_GEO.md §4` "the fact is not generated, it's looked up" rule).
- `?src=web-{page}` beacon → a first-party cookieless `POST /api/track` (a **new** route on `apps/api`; the `SUCCESS_METRICS` activation KPI, `PRD.md §7`). A 204 response, no cookie, no PII (`SECURITY/PRIVACY.md`).
- **No client-side data fetching** in P2 (a static export + a small runtime fetch for `/api/answer` only if a "ask VERCODE" widget is added, which is P3).

### 4.3 The *single* DB coupling

The website **does not read the app's Postgres** in P2 (the product facts live in `content/facts/` — the `CONTENT_SCHEMAS.md`'s `ProductFact` is the *contract*, and the `apps/api`'s `/api/answer` reads the *same* file at build time; no runtime DB read on the static site). **A decision**: a live "current product facts" feed (if the fact-set changes without a deploy) is P3, `PRD.md §8 U1/U2`.

## 5. Deployables & CI (extension of `OPERATIONS/CI_CD.md` + `RELEASE_CRITERIA.md`)

The *existing* 12 gates (`RELEASE_CRITERIA.md`) + one **new** website-specific lane (a `gate 14`, **new**, the CI lane convention, `CI_CD.md §2`):

| New lane | What it checks | New? |
| --- | --- | --- |
| **Website build** | `pnpm --filter @vercode/website build` (a `next build` export); the `content/` schema gate; a `sitemap.xml` + `robots.txt` + `llms.txt` generation; **a `sitemap.xml` count == `WFR-101` + content count** | yes |
| **Website Lighthouse** | a Lighthouse CI (a Chrome headless run on `/`, `/docs/quickstart`); mobile ≥ 90, a per-page CRFP budget (`PERFORMANCE_AND_ACCESSIBILITY.md`) | yes |
| **Website axe** | a `@axe-core/playwright` on every `WFR-101` route; 0 critical violations (WCAG 2.2 AA, `PERFORMANCE_AND_ACCESSIBILITY.md`) | yes |
| **Website JSON-LD validity** | a `ld-lint` (or a `schema-dts` type check) on every page's `<script type="application/ld+json">`; 0 errors | yes |
| **The `/api/answer` route** | a vitest unit + a Fastify schema-validity check; the `OpenAPI.yaml` diff (a contract, `RELEASE_CRITERIA gate 11`) | a new route in the existing lane |
| **The beacon `/api/track`** | a cookieless-ness check (`Set-Cookie` is absent; a 204 response; a PII redaction check, `SECURITY_TEST_PLAN`'s public-surface check) | a new route |

**The *existing* 12 gates run unchanged** (`RELEASE_CRITERIA.md`); the website *adds* 4 new lane checks + 2 route checks. A green "website" lane is a **separate** merge gate (the `website` deployable's own gate, `OPERATIONS/CI_CD.md`'s lane convention — the *app* lanes + the *website* lanes are **independent** CI runs, a single `check` target is `make check-website` (a new Make target, the `Makefile` extension)).

## 6. Environment variables

`OPERATIONS/ENVIRONMENT_VARIABLES.md`'s table, new rows:

| Var | Required? | Notes |
| --- | --- | --- |
| `VERCODE_WEBSITE_BASE_URL` | yes (prod) | the canonical domain (`U5`); used by `sitemap.xml` + `robots.txt` + `canonical` + `og:url` |
| `VERCODE_WEBSITE_OG_DEFAULT` | no | a default OG image path; the per-blog image is a front-matter field |
| `VERCODE_BEACON_SECRET` | yes (prod) | a HMAC key for the `POST /api/track` (a `SECURITY/SECRETS_MANAGEMENT.md`'s "a secret in the .env.example placeholder" rule — no secret in an image, `DEPLOYMENT.md §4`) |

The **`.env.example`** gets 3 new placeholder rows (the docs-drift check, `CI_CD.md §3 gate 12`).

## 7. The ADRs this doc records (in `ARCHITECTURE_DECISIONS.md`)

| ADR | The decision | Status |
| --- | --- | --- |
| `ADR-0xx-1` | a *separate* `website` (NOT a route inside `apps/web`) | open, `PRD.md §8 U1`, leaning **yes** |
| `ADR-0xx-2` | `content/` in-repo + `next-mdx-remote` + `zod` (a `CONTENT_SCHEMAS.md` contract) | open, `U2`, leaning **yes** |
| `ADR-0xx-3` | the `/api/answer` on the *existing* `apps/api` (not a new service) | decided **yes** (the minimal surface) |
| `ADR-0xx-4` | a `packages/design-tokens` new package (the shared palette, `DESIGN_SYSTEM.md §4`) | open, leaning **yes** |
| `ADR-0xx-5` | the `llms.txt` scope (`U6`) | open, leaning **minimal + a full** |
| `ADR-0xx-6` | the AEO test lane (`U7`) | open, P3 |

## 8. What this doc deliberately does *not* decide

- The **exact** hosting vendor (Vercel vs. Cloudflare vs. a self-hosted static bucket) — an infra decision, `U5` + `OPERATIONS/DEPLOYMENT.md` (a P2 build-time choice, the `TECHNICAL_ARCHITECTURE` here *assumes* Vercel for prod + a CF bucket for dev; a one-line change in `next.config` + a Dockerfile, `DEPLOYMENT.md §2`).
- The **CMS** (P3, `WFR-304`'s out-of-scope line, the `PRD.md §6`).
- The **multi-language** surface (P3, `U6`, the `PRD.md §6` "declared absent").
- The **live "current product facts"** (P3, §4.3's "a decision").

## 9. The GitHub connection surface (design-level; the heads own the implementation)

The product's value loop — *connect your repo → get reviews → findings → a plain usage report* — means the connection lifecycle is first-class product, not a billing feature. This doc records its *shape* so the website package (the `/docs/github-app` page, the `HowTo` JSON-LD, the FAQ group-4 answers, `PRD.md WFR-602`) and the app package stay consistent; the routes themselves live in `apps/api` (an existing file the other heads own), not in this doc's `website` scope.

- **The API surface** (`/api/v1/github/*`, additive on the existing Fastify app):
  - **connect** — returns the GitHub App install URL (pre-scoped to the least-privilege list, `FR-210`) + records the pending install; the `installation.created` webhook confirms it (the existing `installation.created` handling in `apps/api/src/routes/github.ts`, which the heads extend, not replace).
  - **list** — the org's connected repositories (the repositories page's table data: `full_name`, reviews-30d, open high/critical, last reviewed, status), feeding the dashboard's `/repositories` connected-repos table.
  - **settings** — repository selection (which discovered repos are enabled for review; per-org, stored in the settings area — `docs/DESIGN/PAGE_SPECIFICATIONS.md`'s settings/providers page); this is a *selection* feature, not a plan tier.
  - **disconnect** — revoke the App (or a single repo): VERCODE records the revocation, stops enqueuing reviews for it, and retains prior findings + the audit trail (`DATA_RETENTION.md`).
- **The acceptance criteria (design level, app-side):** after connect → the repositories list reflects the install within one webhook round; selecting a repo makes its next PR reviewable without a second step; disconnecting a repo makes its next PR *not* reviewed (a `skipped`-adjacent state is *not* a quota state — there is no quota); disconnecting the whole install empties the table but the usage report's history persists.
- **The website's coupling:** the `HowTo` schema's step 1 is the connect URL; `/docs/github-app` documents connect/pick/disconnect in public terms; the FAQ "Which GitHub permissions does the App need?" answer is byte-equal to the `llms.txt` GitHub-connection bullet (`SEO_AEO_GEO.md §4.5`). A *new* docs topic (`github-app`/`connect` is P2 topic set #2) already exists in the route set; no *new* marketing route is added for this — the connect flow is a *dashboard* surface, reached after `/signin`.
