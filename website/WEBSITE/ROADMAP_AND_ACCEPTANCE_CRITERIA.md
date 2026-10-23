# VERCODE Website — Roadmap & Acceptance Criteria

The *build* sequence for the VERCODE public website (`PRD.md`) and the *measured* gates that close it. The roadmap (Part A) maps the website onto the launch phases (`SAAS_LAUNCH_PLAN.md §5`); the acceptance criteria (Part B) are the `W-AC-*` oracles that prove each P0 WFR-group; the decision log (Part C) is the formal table of the seven open decisions (`PRD.md §8 U1–U7`). The posture is `SAAS_LAUNCH_PLAN §5`'s: **a gate is a measurement, not a checkbox** (`RELEASE_CRITERIA.md §2`); a `W-AC` with no test is an incomplete feature (`docs/PRODUCT/ACCEPTANCE_CRITERIA.md`).

> **The task convention.** The app's milestone tasks are `T#.#` (`IMPLEMENTATION_PLAN.md`, `M1–M8`). The website gets its own numbering series, **`WT#.#`** — a *new* series, not a continuation of the app's `T#.#` (the website is a P2 launch build, not part of the M1–M8 app build, `PRD.md`'s scope guardrail). Each `WT` phase below carries `WT#.#` tasks in `IMPLEMENTATION_PLAN.md`'s style: a coherent, verifiable increment, a *measured* verified state, then the next concrete task. `WP` = a website build phase (`WP1–WP4`); the tasks within a phase are `WT#.#` where `#` is the *sequential* website task number (WT1.1, WT1.2, …; WT2.1, …).

## A. The roadmap

### A.0 Where the website sits in the launch sequence

The website builds **in P2** and is a P2 *launch prerequisite* (`SAAS_LAUNCH_PLAN §5 P2`'s "a marketing site + a pricing page + a docs site"). It can *start* after P1 (the live integration is verified — gate-13 green on a credentialed lane), and it *finishes* before the P2 public-launch checklist closes. The mapping:

| Launch phase (`SAAS_LAUNCH_PLAN §5`) | The website's state | The measured gate |
| --- | --- | --- |
| **P0: a dev-stack verified** | website not started (the dashboard dev-stack is verified; the website's build lane can be dry-run but is not a P0 gate) | `E2E_TEST_PLAN` dev-stack run + `RELEASE_CRITERIA` gates 1–12 |
| **P1: a live integration** | website may *start* (WP1 foundations) — the dashboard's live App/provider/billing is verified (gate-13), which unblocks the website's CTA destination (`/signin`) | `RELEASE_CRITERIA gate-13` (a live external suite, a credentialed lane) |
| **P2: a public launch** | website *finished* (WP1–WP4 all closed) — the P2 checklist's "domain + marketing site + pricing + docs + status" rows are measured green | the launch checklist (`SAAS_LAUNCH_PLAN §5 P2`), incl. the website's own lanes |
| **P3: a designated market** | website ships P3 additions (a live docs site, multi-lang, a CMS) | the market-launch gate (`§5 P3`) |

### A.1 The four website build phases (WP1–WP4)

Each phase: scope (the WFR groups), an **entry gate** (what must be *true* to start), an **exit gate** (the *measured* state that closes it), and the `WT#.#` tasks. The exit gate is a CI lane or a test, never a self-assertion.

---

#### WP1 — foundations (`apps/website` scaffold + the design-tokens bridge + the `content/` store + the schema generator)

**Scope:** `WFR-101` (the route set), `WFR-102` (on-page meta), `WFR-103` (sitemap + robots), the `content/` store + `CONTENT_SCHEMAS.md` contracts (`WFR-304/305`), the `schema-generator.ts` single source (`WFR-402`'s generator half). No *content surfaces* yet (no `/docs` topics, no `/blog`); the skeleton + the generator + the token bridge are what ship.

**Entry gate:**
- P1 live integration verified (`SAAS_LAUNCH_PLAN §5 P1` gate-13, a credentialed lane green).
- `apps/web` + `apps/api` M1–M8 built (the website's CTA lands on a *real* `/signin`; the `/api/answer` route has a host, `TECHNICAL_ARCHITECTURE.md §1`).
- `DESIGN_SYSTEM.md` + `USAGE_QUOTAS.md` + `PRICING_STRATEGY.md` frozen (the website renders their numbers verbatim).

**Exit gate (measured):**
- The `make check-website` target (`TECHNICAL_ARCHITECTURE.md §5`) green: a `pnpm --filter @vercode/website build` static-export + a `content/` schema gate + `sitemap.xml`/`robots.txt`/`llms.txt` generation + a **`sitemap.xml` count == `WFR-101` page-set count + published-content count** (a build-time assertion, not a hope).
- The design-tokens bridge is *imported* from a `packages/design-tokens` (a new package, `ADR-0xx-4`), not hand-replicated in `apps/website/src/styles/`.
- A Lighthouse CI dry-run on a placeholder `/` + `/pricing` reports a *measurable* mobile number (the ≥90 gate is enforced from WP2 onward; WP1 just proves the harness runs).

**Tasks (`WT1.#`):**

- **WT1.1 — Scaffold `apps/website`** (a `Next.js 15` + `output: "export"` + `App Router`, the `WFR-101` route set as empty SSG shells; a `Makefile` target `check-website`; a `next.config.ts` with a static image loader + the sitemap/robots/`llms.txt` generators, `TECHNICAL_ARCHITECTURE.md §1–§2`). *Verified:* `pnpm --filter @vercode/website build` emits a static `out/` with the `WFR-101` routes + `/robots.txt` + `/sitemap.xml`.
- **WT1.2 — The `packages/design-tokens` bridge** (the shared palette + radii + spacing, `DESIGN_SYSTEM.md §4`; a single `tokens.ts` both `apps/web` + `apps/website` import, `ADR-0xx-4`; a *new* package, a deviation noted in `TECHNICAL_ARCHITECTURE.md §3`). *Verified:* a grep-level test that no color/radius literal is hand-written in either app (the tokens are the source).
- **WT1.3 — The `content/` store + `CONTENT_SCHEMAS.md` contracts** (a `content/` repo dir: `blog/`, `docs/`, `changelog/`, `faq/`, `pricing/`; a `zod` `ProductFact`/`Article`/`ChangelogEntry`/`FAQ`/`FrontMatter` contract in `packages/contracts`; a build-time schema gate, `WFR-304/305`). *Verified:* a `content/` PR that's malformed fails the build (the `RELEASE_CRITERIA gate-12` docs-drift gate extended to `content/`).
- **WT1.4 — The `schema-generator.ts` single source** (`generateSchemaFor(page: PageDef): JsonLd[]`; the *only* JSON-LD emitter, `TECHNICAL_ARCHITECTURE.md §4.1`; a `content/pricing/` source that feeds `Product`+`Offer`+`FAQPage`+`/api/answer`+`llms.txt` in one build, `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.3`'s consistency rule). *Verified:* a `UT`-style assertion that a pricing edit in `content/pricing/` flows to *all five* consumers (no hand-typed numbers).
- **WT1.5 — The sitemap + robots + `llms.txt` generators** (`WFR-103` + `WFR-401`'s fact-list half; a `sitemap.xml` count assertion; a `robots.txt` that allows-all + points at `/sitemap.xml` + disallows `/docs/source`). *Verified:* the build-time count == `WFR-101` + content count; a `ld-lint`/`schema-dts` check reports 0 errors on every emitted block.

---

#### WP2 — core pages (`/`, `/features`, `/pricing`, `/faq`)

**Scope:** `WFR-201` (the hero), `WFR-202` (section order), `WFR-203` (the pricing ladder), `WFR-204` (the `/faq`), `WFR-205` (the `/features` narrative), plus the P0 on-page/SEO slice of `WFR-101/102/104` for these four routes + `WFR-501/502` (the CTA wiring).

**Entry gate:**
- WP1 exit gate green (the build lane, the token bridge, the `content/` store, the generator).
- `USAGE_QUOTAS.md` + `PRICING_STRATEGY.md` numbers frozen (the `/pricing` + `/faq` render them *verbatim*, a build-time check against the `content/pricing/` source, `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.3`).
- The `apps/web` `/signin` route + the auth plan-override contract (`AUTHENTICATION.md`'s `/signin?plan=team`) live (the CTA destination is real, `WFR-502`).

**Exit gate (measured):**
- A **Lighthouse mobile ≥ 90 on `/`, `/pricing`, `/docs/quickstart`** (the PRD §5 + `PERFORMANCE_AND_ACCESSIBILITY.md` budget; a CI Chrome-headless run, a per-page CRFP budget).
- A **0 critical axe violation** on all four core routes (a `@axe-core/playwright` run, WCAG 2.2 AA).
- A **byte-for-byte** FAQ visible-text == `FAQPage` JSON-LD check (`WFR-204`'s GEO rule, `SEO_AEO_GEO.md §3`).
- The hero's banned tells (`DESIGN_SYSTEM.md §9`: no gradient, no icon-topped cards, no "10,000+ teams") absent — a `DESIGN_SYSTEM §11` anti-slop lint over the marketing surface.

**Tasks (`WT2.#`):**

- **WT2.1 — `/` + the section order** (`WFR-201/202`: the review-verdict hero, how-it-works `HowTo`, the 4 pillars, the pricing teaser, the social-proof-omit-not-fabricate rule, the FAQ teaser, the closing CTA; the `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.1` block order). *Verified:* a DOM-order assertion on the rendered `/` (the 7 blocks, in order) + the anti-slop lint green.
- **WT2.2 — `/pricing` + the quota table** (`WFR-203`: the 4 plan cards from `PRICING_STRATEGY.md`, the `USAGE_QUOTAS.md`-verbatim table, the `Product`+`Offer` per plan + the pricing `FAQPage`). *Verified:* a pricing-drift test (the page number == the `content/pricing/` source, byte-equal) + a `schema-dts` check.
- **WT2.3 — `/faq` + the byte-equivalence** (`WFR-204`: ≥15 `Question`+`acceptedAnswer` in `FAQPage` JSON-LD; the visible text == the JSON-LD text). *Verified:* a byte-equivalence test over all 16 canonical questions (`INFORMATION_ARCHITECTURE_AND_PAGES.md §3.4`).
- **WT2.4 — `/features` + the FR traceability** (`WFR-205`: the 4 pillars + the 6-story grid; every feature carries an FR-ID link in its source, `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.2`'s traceability rule). *Verified:* a grep-level assertion that each story block names its FR ID.
- **WT2.5 — The CTA wiring** (`WFR-501/502`: primary `/signin` "Start a free review"; secondary `/docs/quickstart`; the `?plan=team` override on the paid cards, the `AUTHENTICATION.md` contract). *Verified:* an E2E (a Playwright run) that each CTA resolves to the right destination + a `?src=web-{page}` param is present on the `?plan=` links.

---

#### WP3 — content surfaces (`/docs` first-cut, `/changelog`, `/blog`, `/legal`)

**Scope:** `WFR-301` (the first-cut docs set), `WFR-302` (the changelog feed), `WFR-303` (the blog index + articles), `WFR-305` (the front-matter shape, the draft-never-rendered rule), `WFR-406` (the `/legal` cluster), `WFR-404` (the OG image per blog slug). The *living* docs (search, versioning) is P3; this is the first-cut static hub (`PRD.md §6`).

**Entry gate:**
- WP2 exit gate green (the core pages + the Lighthouse/axe gates pass; the content pipeline from WP1 is live).
- The 9 first-cut docs topics drafted in `content/docs/` (the `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.5` list: quickstart, github-app, api, rules, security, providers, pricing, quotas, privacy), each `Article`+`BreadcrumbList`-ready (`WFR-104`).
- A status service (an external link, `U3` + `SAAS_LAUNCH_PLAN §5`'s launch prereq) is chosen — `/legal/status` has a target.

**Exit gate (measured):**
- A **`sitemap.xml` count == `WFR-101` + the published blog/docs/changelog/legal count** (the build-time assertion; a `draft` item is absent, `WFR-305`).
- A **0 orphan-page** weekly crawl check: every `sitemap.xml` URL is reachable and every page is reachable from the sitemap (`INFORMATION_ARCHITECTURE_AND_PAGES.md §5`).
- A **changelog `ItemList`** listing the latest 10 (a `WFR-302` schema check) + a per-entry `CreativeWork`/`Release` block.
- A **byte-for-byte FAQ rule** re-run on the `/docs`-embedded FAQ items (`CONTENT_STRATEGY.md`'s AEO pass Q5).

**Tasks (`WT3.#`):**

- **WT3.1 — `/docs` first-cut hub** (`WFR-301`: 9 topics, each a static SSG page + `Article`+`BreadcrumbList` JSON-LD, the `/docs` index with the quickstart card first). *Verified:* a `sitemap.xml` + `ld-lint` green on the 9 topics; a breadcrumb-on-every-docs-page check.
- **WT3.2 — `/changelog` feed** (`WFR-302`: a Keep-a-Changelog feed, an `ItemList` of the latest 10, a per-entry `CreativeWork`). *Verified:* a schema check on the `ItemList` + a front-matter `ChangelogEntry` validation.
- **WT3.3 — `/blog` index + articles** (`WFR-303`: the `Article` with `Person` author, `datePublished`/`dateModified`, a per-slug OG image). *Verified:* an OG-image presence test on every `/blog/<slug>` + an `ld-lint` check.
- **WT3.4 — The `/legal` cluster** (`WFR-406`: `terms`, `privacy`, `security` [the public trust page], `dpa`, `status` [a thin link, `U3`]). *Verified:* a 200-status + canonical on each legal page; a `draft`-never-rendered assertion.
- **WT3.5 — The front-matter draft rule** (`WFR-305`: a `status: draft` item is neither rendered nor in `sitemap.xml`). *Verified:* a `UT` that a `draft` blog item does not appear in the generated `sitemap.xml`.

---

#### WP4 — GEO + verification (`llms.txt`, `/api/answer`, `/api/track`, the verification lanes, the Lighthouse/axe gates)

**Scope:** `WFR-401` (the `llms.txt`), `WFR-403` (the `/api/answer` endpoint), `WFR-402` (the triple-source rule), `WFR-504` (the beacon), `WFR-404` (the OG meta on every page), and the *enforcement* lanes (the Lighthouse ≥90, the axe 0-violation, the `JSON-LD` validity, the `/api/answer` route, the beacon cookieless-ness).

**Entry gate:**
- WP3 exit gate green (all content surfaces live + the crawl check passes).
- The `apps/api` host for the two new routes (`GET /api/answer` + `POST /api/track`) is confirmed (`TECHNICAL_ARCHITECTURE.md §1`'s "a new route on the *existing* Fastify app").
- `VERCODE_BEACON_SECRET` is provisioned in `.env.example` (a `SECURITY/SECRETS_MANAGEMENT.md` placeholder, `TECHNICAL_ARCHITECTURE.md §6`).

**Exit gate (measured) — the P2 public-launch gate:**
- A **Lighthouse mobile ≥ 90** on `/` + `/pricing` + `/docs/quickstart` (a CI run; a per-page CRFP budget, `PERFORMANCE_AND_ACCESSIBILITY.md`).
- A **0 critical axe violation** on all `WFR-101` routes (a `@axe-core/playwright` run, WCAG 2.2 AA).
- A **`/api/answer` vitest + OpenAPI-diff** green (a `RELEASE_CRITERIA gate-11` contract check; the `OpenAPI.yaml` updated first).
- A **beacon cookieless-ness** check (a `POST /api/track` returns `204`, no `Set-Cookie`, a PII-redaction pass, `SECURITY_TEST_PLAN`'s public-surface check).
- A **`llms.txt` triple-source** test: every `WFR-401` fact is present in the visible text *and* the JSON-LD *and* the `llms.txt` (a `WFR-402` byte-consistency check, `SEO_AEO_GEO.md §2`).

**Tasks (`WT4.#`):**

- **WT4.1 — `/api/answer` route** (`WFR-403`: a Fastify `GET` on the *existing* `apps/api`; a `contracts`-validated bounded query language; a deterministic fact lookup, *no LLM at runtime*; an `OpenAPI.yaml` diff, `RELEASE_CRITERIA gate-11`). *Verified:* a vitest unit + a `Fastify` schema-validity + the OpenAPI-diff gate.
- **WT4.2 — `/api/track` beacon** (`WFR-504`: a first-party, cookieless `POST`; a `?src=web-{page}` param; a `204` with no cookie + no PII; a `VERCODE_BEACON_SECRET` HMAC, a PII-redaction check). *Verified:* the cookieless-ness + PII-redaction test (`SECURITY_TEST_PLAN`'s public-surface lane).
- **WT4.3 — The `llms.txt` + `llms-full.txt` builders** (`WFR-401` + `U6`'s lean: a minimal `/llms.txt` + a concatenated `/llms-full.txt`; the fact-list in hero→CTA order, the `SEO_AEO_GEO.md §4` machine-readable layer). *Verified:* a build-time emission + a triple-source test (`WFR-402`).
- **WT4.4 — The Lighthouse + axe + JSON-LD verification lanes** (the enforcement of `PERFORMANCE_AND_ACCESSIBILITY.md` + `PERFORMANCE_AND_ACCESSIBILITY.md`: a Chrome-headless Lighthouse ≥90 on the 3 budget pages; a `@axe-core/playwright` 0-critical on all routes; a `ld-lint`/`schema-dts` 0-error on every JSON-LD block). *Verified:* the `make check-website` target reports all three as *measured* pass/fail numbers, not green-checks.

---

### A.2 The dependency + timing rule

- **WP1 → WP2 → WP3 → WP4** is the *build* order (each WP's entry gate is the prior WP's exit gate; a WP cannot start until the prior WP's CI lane is green).
- The website is *not* on the M1–M8 app critical path (`IMPLEMENTATION_PLAN.md`); it starts after P1 (gate-13) and must finish before the P2 public-launch checklist closes (`SAAS_LAUNCH_PLAN §5 P2`). A website that's not finished by P2 blocks P2 (a launch prereq, `PRD.md`'s scope guardrail) — it is *marked blocked*, not claimed, `PHASE 10`'s rule.
- The P3 website additions (a live docs site + search, multi-lang `U6`/`U7`, a CMS, a live "current plan pricing", the `llms-full.txt` scope) are *after* P2; they are tracked as `PRD.md §8` U-items, not WP-tasks.

## B. The acceptance criteria

`W-AC-##` oracles, one per P0 WFR group (the `WFR-1xx/2xx/3xx/4xx/5xx` P0s). Each is keyed to the WFR IDs it covers, the WFR's P-level, and the *named* test/CI lane/measurement that proves it. The rule is `docs/PRODUCT/ACCEPTANCE_CRITERIA.md`'s, mirrored: **a `WFR` with no `W-AC` is not P0; a `W-AC` with no test is an incomplete feature** (`PRD.md §9`). Test/AC IDs follow the app's `UT-*`/`IT-*`/`ST-*`/`E2E-*` convention; the website's *new* tests are `UT-web-*`, `IT-web-*`, `ST-web-*`, `E2E-web-*` (a `E2E_TEST_PLAN`'s website lane).

> "The verification" column names the *measured* artifact: a CI lane (the `make check-website` target's sub-gates, `TECHNICAL_ARCHITECTURE.md §5`), a `RELEASE_CRITERIA` gate number, or a test ID. A `W-AC` whose verification is only "a human check" is *incomplete* until that check is automated into a test or a CI lane.

### B.1 The WFR-1xx group (sitemap & pages, P0)

**W-AC-01 (`WFR-101/102/103/104/105`)**
- Given the `WFR-101` public route set (a `/`, `/features`, `/pricing`, `/faq`, `/docs` + topics, `/changelog` + entries, `/blog` + slugs, `/about`, `/legal/*`, `/404`, `/500`), When the site builds, Then every route is a static SSG page with a *unique* `<title>` ≤60 chars + a *unique* meta description 120–158 chars + a canonical URL + one JSON-LD block (`WFR-102`), and the `sitemap.xml` lists *every* `WFR-101` URL + every content entry with an *honest* `<changefreq>` (`WFR-103`).
- Given a soft-deleted docs page, When it is requested, Then the site returns an HTTP `410 Gone` (a *410*, not a 200-with-404-body; a *404* on-domain for unknown routes, `WFR-105`).
- Verification: the `make check-website` sitemap-count sub-gate (a `sitemap.xml` count == `WFR-101` + content count, `UT-web-sitemap-count`); a `ld-lint`/`schema-dts` 0-error on every JSON-LD block (`UT-web-jsonld`); a breadcrumb-on-every-`/docs|/changelog|/blog` check (`UT-web-breadcrumb`, `WFR-104`); a `410`-on-soft-delete test (`UT-web-410`, `WFR-105`).

### B.2 The WFR-2xx group (marketing & pricing, P0)

**W-AC-02 (`WFR-201/202`)**
- Given `/`, When it renders, Then the hero is the *review-verdict device* (a type-set "Needs changes · 2 high" line, a *static* card, no live fetch, `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.1`) with **no gradient, no icon-topped cards, no eyebrow, no monospace-outside-code** (`DESIGN_SYSTEM §7/§9`), the sub-headline states the `SAAS_LAUNCH_PLAN §1` wedge *verbatim*, and the section order is hero→how-it-works→capability→pricing-teaser→social-proof→FAQ→footer (`WFR-202`).
- Given an *empty* social-proof state, When `/` renders, Then the social-proof section is **omitted** (never a fabricated logo, `DESIGN_SYSTEM §9` + `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.1`'s block 5).
- Verification: a DOM-order assertion on the 7 blocks (`E2E-web-hero-order`); a `DESIGN_SYSTEM §11` anti-slop lint (a `lint.mjs --marketing` over the hero, a 0-FAIL); an empty-state test that the social-proof block is absent when `content/` has no logos (`UT-web-socialproof-empty`).

**W-AC-03 (`WFR-203`)**
- Given `content/pricing/` (the machine-readable source, `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.3`), When `/pricing` renders, Then the 4 plan cards (Free/Developer/Team/Enterprise) show the *exact* `USAGE_QUOTAS.md` numbers verbatim + the `PRICING_STRATEGY.md` ladder, each plan a `Product`+`Offer` JSON-LD pair, the quota table a real `<table>` (machine-readable), and the pricing FAQ a `FAQPage` block.
- Verification: a pricing-drift test (the page number == the `content/pricing/` source, byte-equal — a structural drift-impossibility, `UT-web-pricing-drift`); a `schema-dts` check on the `Product`+`Offer` pairs (`UT-web-offer-schema`); a `FAQPage` byte-equivalence re-check on the pricing FAQ (`UT-web-faq-pricing`, the `SEO_AEO_GEO.md §3` rule).

**W-AC-04 (`WFR-204`)**
- Given `/faq` with ≥15 questions, When it renders, Then each question has a `mainEntity` `Question` + `acceptedAnswer` in the `FAQPage` JSON-LD and the *visible* answer text **== the JSON-LD text byte-for-byte** (the GEO/answer-engine consistency, `SEO_AEO_GEO.md §3`).
- Verification: a byte-equivalence test over all canonical questions (`UT-web-faq-byte`, the 16-question set from `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.4`) + a `FAQPage` schema check (`UT-web-faq-schema`).

**W-AC-05 (`WFR-205`)**
- Given `/features`, When it renders, Then the 4 pillars + the 6-story grid are present, and **every feature block names its dashboard FR ID** in its source (the `FR-504/505/506/507/509/510` traceability link, `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.2`).
- Verification: a grep-level assertion that each of the 6 story blocks + the 4 pillars carries an FR-ID reference (`UT-web-features-traceability`); an `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.2` anchor-presence check on the 4 pillar sections.

### B.3 The WFR-3xx group (docs & content, P0)

**W-AC-06 (`WFR-301/304/305`)**
- Given `content/docs/` with the 9 first-cut topics (a quickstart, github-app, api, rules, security, providers, pricing, quotas, privacy — the `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.5` list), When the site builds, Then each `/docs/<topic>` is a static SSG page + `Article`+`BreadcrumbList` JSON-LD; content is authored as Markdown in `content/` (a `next-mdx`/plain-MD loader, *no CMS*, `WFR-304`) with the `CONTENT_SCHEMAS.md` front-matter shape (`WFR-305`), and a `draft` item is *neither rendered nor in `sitemap.xml`*.
- Verification: a `content/` schema gate (a `RELEASE_CRITERIA gate-12` docs-drift extended to `content/`, `UT-web-content-schema`); a `sitemap.xml` + `ld-lint` green on 9 topics (`UT-web-docs-9`); a draft-never-rendered test (`UT-web-draft-excluded`).

**W-AC-07 (`WFR-302`)**
- Given `content/changelog/`, When `/changelog` renders, Then the time-ordered feed shows each entry as a `CreativeWork`/`Release` with date + author + a human-readable summary, and the feed's `ItemList` JSON-LD lists the latest 10 (a `WFR-302` schema).
- Verification: an `ItemList` schema check (latest-10 listing, `UT-web-changelog-itemlist`); a `ChangelogEntry` front-matter validation (a `date`+`version`+`sections` contract, `UT-web-changelog-frontmatter`).

**W-AC-08 (`WFR-303/404`)**
- Given `content/blog/`, When `/blog` + a `/blog/<slug>` render, Then each article is an `Article` JSON-LD with an `author` (`Person`), `datePublished`, `dateModified`, a `headline` ≤110 chars, and an OG image (1200×630, the `image` front-matter field, a `WFR-303`); the OG/Twitter-card meta is present on *every* `WFR-101` page (`WFR-404`).
- Verification: an OG-image presence test on every `/blog/<slug>` (`UT-web-og-blog`); a meta-presence check on all `WFR-101` routes (`UT-web-meta-all`, `WFR-404`).

### B.4 The WFR-4xx group (machine readability & SEO, P0)

**W-AC-09 (`WFR-401/402`)**
- Given the `content/pricing/` + the product-fact set, When the site builds, Then a top-level `/llms.txt` lists the key product facts (pricing, quotas, rate limits, the wedge, the 4 pillars, the "open-source?" + "self-hosted?" answers) **in hero→CTA order** (`WFR-401`), and **every `WFR-401` fact is also present in the visible text *and* the JSON-LD** (the "triple source" rule, `WFR-402`, `SEO_AEO_GEO.md §2`).
- Verification: a build-time `llms.txt` emission + a triple-source byte-consistency test (`UT-web-triple-source`); a `U6`-lean scope check (a minimal `/llms.txt` + a `/llms-full.txt` concatenation, `UT-web-llms-scope`).

**W-AC-10 (`WFR-403`)**
- Given the existing `apps/api` (a Fastify app, `TECHNICAL_ARCHITECTURE.md §1`), When a bounded query is sent to `GET /api/answer` (a "what's the team plan price", a "how many reviews does free include", an "is it open source"), Then the endpoint returns the product's structured answer from a `contracts`-validated fact lookup (*deterministic, no LLM at runtime*, `SEO_AEO_GEO.md §4`), and the `OpenAPI.yaml` is updated *first* (a contract change, `RELEASE_CRITERIA gate-11`).
- Verification: a vitest unit over the bounded query language (`UT-web-answer`); a `Fastify` schema-validity check; the `RELEASE_CRITERIA gate-11` OpenAPI-diff gate (a contract drift check).

**W-AC-11 (`WFR-405`)**
- Given the MVP EN-only scope, When any page renders, Then **no `hreflang` is emitted** (a *declared absence*, `WFR-405`; a multi-lang is a P3 decision, `UNRESOLVED` U6/U7 below).
- Verification: a grep-level test that no `hreflang` tag appears in any built page (`UT-web-no-hreflang`).

**W-AC-12 (`WFR-406`)**
- Given the `/legal` cluster, When it renders, Then `terms`, `privacy`, `security` (a public trust page that *links* to `docs/SECURITY/SECURITY_ARCHITECTURE.md` in a simplified form), `dpa`, and `status` (a *thin link* to the external status service, `U3` + `SAAS_LAUNCH_PLAN §5`) are all present + canonical + 200.
- Verification: a status + canonical check on each of the 5 legal pages (`UT-web-legal`); a `/legal/status` link-resolution test (the target external service URL is reachable, `E2E-web-status-link`).

### B.5 The WFR-5xx group (CTA & conversion, P0)

**W-AC-13 (`WFR-501/502`)**
- Given `/` + `/pricing`, When the CTAs render, Then the *primary* CTA is `/signin` (a "Start a free review", the trade-word, `DESIGN_SYSTEM §7`) with a *secondary* `/docs/quickstart`; the paid-plan CTAs go to `/signin?plan=<plan>` (a plan-override the auth app reads to pre-select at org-create, an `AUTHENTICATION.md` contract, `WFR-502`).
- Verification: an E2E (a Playwright run) that each CTA resolves to the correct destination + a `?src=web-{page}` param is present on the `?plan=` links (`E2E-web-cta-wiring`); a plan-override contract test (the `/signin?plan=team` param is *read* by the auth app, an `IT-web-plan-override` against `AUTHENTICATION.md`).

**W-AC-14 (`WFR-503/504`)**
- Given the P2 public-launch state, When the site is live, Then a **waitlist CTA is *not* present** (a *declared absence*, `WFR-503`; the Free tier is self-serve, `SAAS_LAUNCH_PLAN §4`), and there is **one** first-party cookieless beacon on `/signin` success (a "first review published" activation, a `SUCCESS_METRICS` activation KPI; a `?src=web-{page}` param; *no* third-party analytics, the DPDP posture, `SECURITY/PRIVACY.md`, `WFR-504`).
- Verification: a no-waitlist test (no waitlist form element in any built page, `UT-web-no-waitlist`); the beacon cookieless-ness + PII-redaction test (`POST /api/track` → `204`, no `Set-Cookie`, no PII, `ST-web-beacon`, `TECHNICAL_ARCHITECTURE.md §5`'s beacon lane + `SECURITY_TEST_PLAN`'s public-surface check).

### B.6 The NFR + verification-lane AC (cross-cutting, P0)

**W-AC-15 (`WNFR-*` + `TECHNICAL_ARCHITECTURE.md §5`'s new lanes)**
- Given all `WFR-101` routes, When the website verification lanes run, Then: Lighthouse mobile ≥ 90 on `/`, `/pricing`, `/docs/quickstart` (a CRFP budget, `PERFORMANCE_AND_ACCESSIBILITY.md`); a `@axe-core/playwright` **0 critical violation** on all routes (WCAG 2.2 AA, `PERFORMANCE_AND_ACCESSIBILITY.md`); a `ld-lint`/`schema-dts` **0 errors** on every JSON-LD block; the `/api/answer` + the beacon routes pass their contract + PII checks.
- Verification: the `make check-website` target's *four* sub-gates (a website build, a Lighthouse, an axe, a JSON-LD validity, `TECHNICAL_ARCHITECTURE.md §5`), each reported as a *measured* number (a Lighthouse mobile score, a violation count, an error count), not a pass/fail checkbox.

> **The "an AC with no test is incomplete" rule, applied.** Every `W-AC` above names a `UT-web-*` / `IT-web-*` / `ST-web-*` / `E2E-web-*` test *or* a `make check-website` sub-gate / a `RELEASE_CRITERIA` gate number. A `W-AC` whose "verification" is only a human eyeball is *incomplete* until that check is automated into one of those — that is the `docs/PRODUCT/ACCEPTANCE_CRITERIA.md` + `PRD.md §9` rule, mirrored.

## C. The decision log (`PRD.md §8 U1–U7`, formalized)

The seven open decisions from `PRD.md §8`, carried into a formal table. The structure mirrors `docs/TECHNICAL/ARCHITECTURE_DECISIONS.md` (a context→decision→consequences ADR) but this is the *decision* table (the ADRs are *recorded* in `ARCHITECTURE_DECISIONS.md` — the next `ADR-0xx` numbers, `TECHNICAL_ARCHITECTURE.md §7` — when each U-item is *resolved*; this table is the *live* state). "Due gate" = the launch-phase gate at which the decision must be closed (`SAAS_LAUNCH_PLAN §5` P0–P3).

| ID | Decision (the question) | Options | Leaning (the recommended answer) | Owner | Due gate |
| --- | --- | --- | --- | --- | --- |
| **U1** | Hosting topology: a *separate* `apps/website` vs. a *route inside* `apps/web` | (a) a separate `Next.js 15` static-export app; (b) a `marketing` segment inside the dashboard `apps/web` | **(a) a separate `apps/website`** (decouples the two surfaces' perf budgets — the dashboard NFR ≠ the website WNFR — + lets the website fail independently, `TECHNICAL_ARCHITECTURE.md §1`) | infra | before P2 build start (WP1 entry gate) |
| **U2** | Content store: `content/` + `next-mdx` vs. a static `Astro` collection | (a) `content/` repo dir + `next-mdx-remote` + a `zod` contract; (b) an `Astro` content collection | **(a) `content/` + `next-mdx`** (pins the stack to `TECHNICAL_ARCHITECTURE.md §3`, `WFR-304`'s default; a *live* CMS is P3, `PRD.md §6`) | frontend | before P2 build (WP1 entry gate) |
| **U3** | Status page: an *external* link vs. a *self-hosted* `/status` | (a) an external service (a Statuspage-style, a launch prereq, `SAAS_LAUNCH_PLAN §5`) + a thin `/legal/status` link; (b) a self-hosted `/status` page | **(a) an external link + a thin `/legal/status` that embeds the external dashboard** (`WFR-406`) | infra | before P2 (WP3 entry gate) |
| **U4** | Analytics: a first-party cookieless beacon only vs. a self-hosted Plausible/Matomo | (a) a cookieless first-party beacon only (`WFR-504`); (b) a self-hosted Plausible/Matomo | **(a) a cookieless first-party only** for P2 (the DPDP posture, `SECURITY/PRIVACY.md`); a self-hosted Plausible is a P3 option | data | P2 (WP4 entry gate) |
| **U5** | Domain: the *exact* prod domain | a placeholder `*.vercode.dev` for dev + `vercode.com` for prod (the `SAAS_LAUNCH_PLAN §3` launch prereq) | **the exact domain is *not* in the repo yet**; P2 assumes `*.vercode.dev` (dev) + `vercode.com` (prod), both owned by infra (`VERCODE_WEBSITE_BASE_URL`, `TECHNICAL_ARCHITECTURE.md §6`) | infra | P2 (the launch prereq, `SAAS_LAUNCH_PLAN §7`) |
| **U6** | The `llms.txt` scope: a minimal fact-list vs. the full product-fact graph | (a) a minimal `/llms.txt`; (b) a `llms-full.txt`-style full graph (a file per domain) | **(a) a minimal `/llms.txt` + a `/llms-full.txt` that concatenates the full product facts** (`WFR-401` + `SEO_AEO_GEO.md §4`) | SEO | P2 (WP4, `W-AC-09`) |
| **U7** | The AEO test lane: a manual monthly sample vs. an automated CI job | (a) a manual monthly LLM-answer sample (`PRD.md §7` KPI #3); (b) an automated CI job that calls a named LLM + checks its answer for VERCODE-correct facts | **(b) an automated nightly LLM call + a JSON snapshot — the P3 automation track**. `PRD.md §8`'s "due: P3" is authoritative (the KPI itself is manual-monthly in P2, `PRD.md §7`; the P3 lane is the automated version). A note in `TECHNICAL_ARCHITECTURE.md §7`'s `ADR-0xx-6` row reads "a P3"; a note in `PRD.md §8` reads "P1 decision"; **this row (P3) is the tie-breaker.** | data | P3 (post-launch, `SAAS_LAUNCH_PLAN §8`) |

> **The rule this table obeys.** A U-item is *open* until its decision is recorded as an `ADR-0xx` in `docs/TECHNICAL/ARCHITECTURE_DECISIONS.md` (`TECHNICAL_ARCHITECTURE.md §7`'s ADR list, `ADR-0xx-1`–`-6`). The table above is the *live* decision state; the ADR is the *recorded* decision. An U-item that's past its "due gate" without a recorded ADR is a *measured* P2/P3 blocker (it blocks the launch checklist, `SAAS_LAUNCH_PLAN §7`), not a silent deferral.

## D. Status + next concrete task

**The state:** WP1, WP2, and WP3 are **built + verified** — `make check-website` is green (the `@vercode/website` build + typecheck + the 11 `UT-web-*` tests + the anti-slop lint, the `TECHNICAL_ARCHITECTURE.md §5` build-time sub-gates). That landed:
- **WP1 (WT1.1–WT1.5):** the `apps/website` scaffold (a `Next.js 15` static export, `apps/website/next.config.mjs`'s `output: "export"`), the `content/` store + the `CONTENT_SCHEMAS.md` contracts, the `schema-generator.ts` single source (`apps/website/src/lib/schema-generator.ts`), and the `sitemap.xml`/`robots.txt`/`llms.txt`/`llms-full.txt` generators (`apps/website/src/lib/llms.ts`).
- **WP2 (WT2.1–WT2.4):** the core pages — `/` + the section order, `/features` + the FR traceability, `/pricing` + the quota table from `content/pricing/pricing.json`, `/faq` + the 16-question byte-equivalence.
- **WP3 (WT3.1–WT3.5):** the 9 `content/docs/` topics, the 2-entry changelog feed, the 2-post blog, the 5 `/legal` pages, and the draft-never-rendered rule.

**The open state is WP4:** the *host-side* verification lanes + the two new `apps/api` routes. The Lighthouse ≥90 + the axe 0-critical + the `JSON-LD`-lint lanes are the `PERFORMANCE_AND_ACCESSIBILITY.md` host-side runs (the Chrome + tool binaries, not in the repo build); the `/api/answer` + the `/api/track` routes are a new-route-on-the-existing-Fastify (`TECHNICAL_ARCHITECTURE.md §1` + `DEPLOYMENT_AND_TESTING.md §1.1`'s "the routes deploy with the `api` unit" rule).

**The next concrete task (WP4, the P2 public-launch gate's close):**
1. **WT4.1** — the `GET /api/answer` route on the existing `apps/api` (a `contracts`-validated bounded fact lookup, *no LLM at runtime*; the `OpenAPI.yaml` updated first, `RELEASE_CRITERIA.md` gate 11).
2. **WT4.2** — the `POST /api/track` beacon (a first-party cookieless `204`, no `Set-Cookie`, no PII, a `VERCODE_BEACON_SECRET` HMAC, `SECURITY_TEST_PLAN`'s public-surface check).
3. **WT4.3** — the `llms.txt` + `llms-full.txt` triple-source check wired as a host-side lane (the `WFR-402` byte-consistency, `SEO_AEO_GEO.md §2`).
4. **WT4.4** — the Lighthouse + axe + JSON-LD verification lanes: a `@lhci/cli` mobile run ≥90 on the 5 `PERFORMANCE_AND_ACCESSIBILITY.md` budget pages; a `@axe-core/playwright` 0-critical on every `WFR-101` route; a `ld-lint`/`schema-dts` 0-error on every emitted block. The `make check-website` target gains these three as *measured* pass/fail numbers (a `DEPLOYMENT_AND_TESTING.md §3` lane, gate 14's host-side half).

When all four are green, the P2 public-launch checklist closes (`SAAS_LAUNCH_PLAN §5 P2`'s "domain + marketing site + pricing + docs + status" rows measured green, `RELEASE_CRITERIA.md §2`'s "a gate is a measurement, not a checkbox").
