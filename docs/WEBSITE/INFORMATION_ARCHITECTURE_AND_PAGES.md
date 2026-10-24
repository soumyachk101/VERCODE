# VERCODE Website — Information Architecture & Page Specifications

The website's route tree, the *one question* each page answers, and the per-page blocks. This is the website sibling of `docs/DESIGN/INFORMATION_ARCHITECTURE.md` + `docs/DESIGN/PAGE_SPECIFICATIONS.md` (the dashboard's), and it applies the same rules to the *page* surface (`DESIGN_SYSTEM.md §7`'s "the *page* rules"): **one dealt direction per page, a real idea from the subject, no template filler, no decorative empty space.**

## 1. The route tree

```
/                      → the landing surface (hero → how it works → capability → connect → proof → FAQ → CTA)
/features              → the capability narrative (the 4 pillars, the 6 user-facing stories)
/faq                   → the ≥15-question FAQ (FAQPage schema)
/docs                  → the docs hub (the 9-topic index + a "quickstart" first; see §3.4's canonical 9-topic list)
/docs/quickstart       → install the GitHub App + the first review (J1's public mirror)
/docs/api              → the API reference (the dashboard REST + the webhook contract)
/docs/github-app       → the GitHub App connect guide: connect, repository selection, disconnect (FR-201..FR-210, in public terms; the /api/v1/github/* surface, TECHNICAL_ARCHITECTURE.md §9)
/docs/rules             → the custom-rules guide (FR-505)
/docs/security         → the security-findings guide (FR-504)
/docs/usage            → the plain usage report reference (reviews run, per repo/PR, token attribution — no quotas, no plans)
/changelog              → the release feed (ItemList) 
/changelog/<date>      → one release (CreativeWork/Release JSON-LD)
/blog                  → the article index
/blog/<slug>           → one article (Article JSON-LD)
/about                 → the company + the open-source posture (MIT, `LICENSE.md`; the "is it open source" FAQ answer, `PRD.md WFR-401`)
/legal/terms           → the terms of service
/legal/privacy         → the privacy policy (a DPDP-aligned posture, `SECURITY/PRIVACY.md`)
/legal/security        → the public security & trust page (a public form of SECURITY_ARCHITECTURE.md)
/legal/dpa             → the data-processing addendum (P3 launch prereq, `SAAS_LAUNCH_PLAN P3`)
/legal/status          → a thin status page (a link to the external status service, `PRD.md §8 U3`)
/signin                → the auth entry (an existing dashboard route, `apps/web/src/app/signin`)
/robots.txt            → the crawler policy
/sitemap.xml           → the URL index
/llms.txt              → the LLM fact index (`PRD.md WFR-401`)
/llms-full.txt         → the full product-fact prose (`PRD.md §8 U6`)
```

**`WFR-101`'s public route set is exactly this.** There is **no `/pricing` route** — the pricing/plan/quota/billing system is removed from the product (`SAAS_LAUNCH_PLAN`'s direction: launched without paid tiers), and the landing CTA path is `/` → `/signin` → the dashboard's repositories connect flow (the `/repositories` page, `docs/DESIGN/INFORMATION_ARCHITECTURE.md`; the connect/disconnect/repository-selection API under `/api/v1/github/*`, `TECHNICAL_ARCHITECTURE.md §9`). A `/docs/search` route is **NOT** in this set in P2 (a header docs-search that only searches the docs is a lie, `§6`'s "no search box in the header in P2" rule; a `/docs/search` is a P3, `PRD.md §6`'s out-of-scope list "a living docs site with search") — it has been removed from the tree above. Two carve-outs: `/signin` is the *existing* dashboard route (the auth app, `AUTHENTICATION.md`), and `/api/answer` + `/api/track` are **API** routes, not pages (the Fastify app, `PRD.md WFR-403` + `WFR-504`).

## 2. The one-question rule

Each page answers **one** question, in the order the blocks are stacked. A block that doesn't answer a *next* question is deleted (`DESIGN_SYSTEM.md`'s page rule, mirrored from the app's "a block with no question is deleted").

| Route | The one question |
| --- | --- |
| `/` | "Is this AI code review actually trustworthy, and can I try it?" |
| `/features` | "What does VERCODE actually do that other AI reviewers don't?" |
| `/faq` | "Will it do the specific thing I'm worried about?" |
| `/docs` | "How do I connect my repos and get my first review?" |
| `/docs/<topic>` | "How do I do X?" |
| `/changelog` | "What changed recently?" |
| `/blog` | "Why should I trust this team's thinking about code review?" |
| `/about` | "Who is behind VERCODE, and can I read the source?" |
| `/legal/security` | "Can I trust this with my source code?" |

## 3. Per-page specifications

### 3.1 `/` — the landing surface

**Question:** "Is this AI code review actually trustworthy, and can I try it?"

**Blocks, in order:**

1. **The hero.** An H1 that states the wedge in *plain language* (≤ 12 words): the `SAAS_LAUNCH_PLAN §1` one-liner, humanized. Beneath it, the **review-verdict device** — the *dealt direction* (`DESIGN_SYSTEM.md §7`): a small, app-styled card showing a real verdict ("Needs changes" + 2 severity marks) and one static-analysis finding line (`payments.ts:84` — SQL injection, from static analysis). *Static*, an image or a DOM card, no live fetch. Then the subhead — the value loop, ≤ 2 sentences (*connect your repo → reviews land on your PRs → findings + a verdict → a plain usage report*) — then the two CTAs ("Connect your repo" → `/signin`; "Read the docs" → `/docs/quickstart`). The CTA is a *connection* CTA, never a pricing CTA (`PRD.md WFR-201` + the direction note in `PRD.md`'s header).
   - *Schema:* `WebSite` (on the root) + `Organization`.
2. **How it works** (3 steps, a `HowTo` schema): "Connect your repo" → "Open a pull request" → "Read the review". Each step: a number, an H3, 2 sentences. Each names a *specific* product behaviour (the connect flow → the webhook → the published inline comment), not an abstraction. No "pick a plan" step — there are no plans.
3. **The capability narrative** (4 pillars, `README.md`'s four): *Deterministic precision* (static analysis runs **before** the model — the ADR-005 story), *Evidence-backed reasoning* (every finding carries a category, severity, confidence, reason, fix), *Connect, not configure* (the GitHub App connection: pick the repositories to review, disconnect when done — no plans, no tiers, `TECHNICAL_ARCHITECTURE.md §9`), *A workspace, not just a bot* (the dashboard: the security rollup, the audit trail, the usage report). Each pillar: an H3 + 2–3 sentences + a link to `/features#<pillar>` or `/docs/<topic>`.
4. **The connect block.** A short section — the GitHub-connection story (the connect/pick/disconnect verbs, the least-privilege permission list, a link to `/docs/github-app`) — where the *old* "pricing teaser" block sits in the section order (`PRD.md WFR-202`).
5. **The social proof.** **Real** logos/names/quotes only. *If there are none yet (P2 early), this block is **omitted** — never a placeholder.* (`PRD.md WFR-202`; the `DESIGN_SYSTEM.md §9` "no Acme/John Doe" ban.)
6. **The FAQ teaser** (the top 5 questions from `/faq`), each a link to the full answer. `FAQPage` schema (the *full* 15 on the page; the visible 5 are the same text, `SEO_AEO_GEO.md §3`'s "the visible text == the schema text" rule).
7. **The closing CTA.** A single line + the one button ("Connect your repo").

**States:** a **404** (`/nope` → a helpful 404 with a search box + the 5 top links, HTTP 404 — *not* a soft 200); a **500** (an apology + a status link + a retry).

### 3.2 `/features` — the capability narrative

**Question:** "What does VERCODE actually do that other AI reviewers don't?"

**Blocks:** an H2 + 4 pillars as anchorable sections (`#deterministic-precision`, `#evidence-backed`, `#connect-not-configure`, `#the-workspace`), each with: the H2, 2–4 sentences, a *screenshot or a code/UI fragment* of the real surface, and a "How it works →" link to the relevant `/docs` topic. Then a **6-story grid** mapping the dashboard's user-facing features to their FR IDs (`FR-504` the security rollup, `FR-505` the rules, `FR-506` the usage report, `FR-507` the org management, the GitHub connection (the `/repositories` connect flow + `/api/v1/github/*`, `FR-201..FR-210`, `TECHNICAL_ARCHITECTURE.md §9`), `FR-510` the audit log) — each story: an H3 + 2 sentences + a doc link.

**The traceability rule:** every feature on this page carries an **FR ID link** in its source (an HTML comment or a front-matter field), so the page can be audited against `docs/PRODUCT/FUNCTIONAL_REQUIREMENTS.md` (`PRD.md WFR-205`).

### 3.3 `/faq` — the questions

**Question:** "Will it do the specific thing I'm worried about?"

15+ questions in 4 groups: *Getting started* (4), *Reviews & findings* (4), *Security & privacy* (3), *GitHub connection* (3: "how do I connect my repositories", "which GitHub permissions does the App need", "how do I disconnect or pick specific repos" — `PRD.md WFR-204`). No billing/quota group: the pricing/plan/quota system is removed. Each: an H3 question + a 2–4 sentence answer **in the product's own words of the trade** (`DESIGN_SYSTEM.md §7`). The JSON-LD `FAQPage` carries the *same* text (`PRD.md WFR-204`).

The canonical question set (drafted here, finalized in `CONTENT_SCHEMAS.md`):

| # | Question | The answer's anchor |
| --- | --- | --- |
| 1 | Does VERCODE post comments on my pull requests? | `FR-206` (inline comments + a summary comment) |
| 2 | How fast is a review? | `NFR-02` (p50 < 120 s, p95 < 300 s) |
| 3 | Will it flood my PR with comments? | the noise thesis + the confidence floor (`FR-308`, default 0.6) |
| 4 | What languages does it support? | the classification rules (`FR-302`) |
| 5 | Does it run my tests? | `L-1` (no untrusted code execution in the MVP — an *honest* answer) |
| 6 | Which AI models does it use? | `MODEL_ROUTING.md` + BYOK (`FR-311`, `FR-313`) |
| 7 | Can I bring my own API key? | `FR-313` (BYOK, AES-256-GCM, KMS-wrapped) |
| 8 | Where is my code stored? | the *not stored* answer — VERCODE analyzes, it doesn't persist source (`SECURITY/PRIVACY.md`, `DATA_RETENTION.md`) |
| 9 | Does it send my code to a third party? | `NFR-09` + the provider-routing explanation (`AI_SYSTEM_DESIGN.md`) |
| 10 | Which GitHub permissions does the App need? | `FR-210` (the least-privilege list, verbatim) |
| 11 | Does it work on pull requests from forks? | `FR-203` (the sandboxed path) |
| 12 | How do I silence a noisy category? | `FR-505` (custom rules, per-org + per-repo) |
| 13 | How do I connect my repositories? | the GitHub App connect flow (`FR-201`, the `/repositories` page + `/api/v1/github/*`, `TECHNICAL_ARCHITECTURE.md §9`) |
| 14 | Is VERCODE open source? | the MIT license + the repo (`LICENSE.md`, `README.md`) |
| 15 | Can I self-host it? | the honest answer (the repo is public; the *hosted* pipeline needs the App + provider credentials, `DEPLOYMENT.md §5`) |
| 16 | How do I export or delete my data? | `DATA_RETENTION.md` + `FR-404` (deletion on access revocation) |

### 3.4 `/docs` and `/docs/<topic>`

**Question:** "How do I connect my repos and get my first review?" (`/docs`) / "How do I do X?" (a topic).

**`/docs` blocks:** the H1 ("Documentation") + a 2-sentence orientation + the **quickstart card** (the first thing — "Connect your repo and get your first review in 10 minutes", the `SUCCESS_METRICS` activation KPI) + the topic index, grouped: *Get started* (quickstart, github-app) / *Configure* (rules, security, providers) / *Reference* (api, usage) / *Legal & security* (privacy).

**The first-cut set is 9 topics**: quickstart, github-app, api, rules, security, providers, usage, connect, privacy. Each is a `/docs/<topic>` SSG page with `Article` + `BreadcrumbList` JSON-LD (`WFR-104`). `/legal/security` (the public trust page, `WFR-406`) and `/legal/privacy` (the privacy policy, `WFR-406`) live under `/legal`, not under `/docs` — a `docs/SECURITY/SECURITY_ARCHITECTURE.md`-style *reference* link from `/legal/security` points at the repo's `docs/` (not at a site page), and the `Security & privacy` FAQ group (`§3.3`) answers the `/docs`-equivalent questions on `/faq`.

**The GitHub-connection topics (the new surface, `TECHNICAL_ARCHITECTURE.md §9`):** `github-app` documents the connect/install side of the connection (the install URL, the least-privilege permission list, `FR-201..FR-210`); `connect` is the dashboard-side guide (repository selection on the settings page, the `/repositories` connect flow, disconnecting a repo or the whole install — the `/api/v1/github/*` routes in public terms); `usage` is the plain usage-report reference (reviews run per day/week/month, per-repo + per-PR breakdowns, token + prompt-version attribution per review; *no* quotas, no plans, no cap numbers — an LLM asked "does VERCODE have usage limits" gets the honest "no per-org review caps; the usage report is informational" answer, `SEO_AEO_GEO.md §4.5`). The *old* `pricing` + `quotas` topics are **removed** from the first-cut set (the system they documented is gone); the topic count stays 9 — two out (pricing, quotas), two in (usage, connect).

**Consistency note (count carry-over):** `CONTENT_STRATEGY.md` and the `W-AC-06`/`UT-web-docs-*` rows in `ROADMAP_AND_ACCEPTANCE_CRITERIA.md` carry an earlier-draft count of "9 P2 topics" that **matches** this set (9). A previous draft of this doc listed 10 names (with a duplicated "security"); the deduplicated 9-topic list above is the build target.

**`/docs/<topic>` blocks:** the H1 + a 1-sentence purpose + the **table of contents** (a right rail on desktop, a collapsible `<details>` on mobile, for a page with > 3 sections) + the content + a "Related" footer (2–3 links) + a "Was this helpful?" affordance (a P3 nicety; P2 = omitted rather than a non-functional form).

**The docs content rules:** every docs page is written to be *answer-engine quotable* — short declarative sentences, the numbers literal, no marketing adjectives inside a docs page (`SEO_AEO_GEO.md §3`'s "a docs page is a fact sheet"). Each docs page carries `Article` + `BreadcrumbList` JSON-LD.

### 3.5 `/changelog` and `/changelog/<date>`

**Question:** "What changed recently?"

- **Index:** the reverse-chronological feed, each entry: a date (an ISO `<time datetime>`), a version tag, a title, a 1-sentence summary, and 2–5 bullet changes grouped as **Added / Changed / Fixed** (the Keep-a-Changelog vocabulary). The last 10 in an `ItemList` JSON-LD.
- **Entry:** the same content expanded, with an "Upgrade notes" section when a breaking change exists, and an `Article`-flavoured `CreativeWork` JSON-LD + breadcrumbs.

**The source-of-truth rule:** a changelog entry is authored in `content/changelog/` with a front-matter `date` + `version` + `sections` (`CONTENT_SCHEMAS.md`'s `ChangelogEntry` contract). The *dashboard's* `docs/` are NOT auto-synced into the changelog — the changelog is a *curated, human* artifact (a generated changelog is a P3 idea).

### 3.6 `/blog` and `/blog/<slug>`

**Question:** "Why should I trust this team's thinking about code review?"

- **Index:** the article list (a date, a title, a 1-sentence dek, the author, the reading time) + a topic tag row.
- **Article:** the H1 + the dek + the author + the publish date + the **reading content** (a 720px column) + an end-of-article "related articles" + a CTA.
- **The article front matter** (`CONTENT_SCHEMAS.md`'s `Article` contract): `title`, `description`, `date`, `updated`, `author`, `tags`, `status`, `ogImage`, `canonical`.

**The editorial bar** (`CONTENT_STRATEGY.md`): an article makes **one** claim and **supports it with evidence** (a benchmark, a measured precision figure, a documented limitation). No listicles, no "Top 10 AI tools", no posts that merely restate the product's marketing.

### 3.7 `/about`

The company story in 3 short paragraphs, the **open-source posture** (MIT, the repo link, the "read the source" CTA), the *named* team (real people, `they/them` if unstated — never "John Doe"), and a link to `/legal/security` + `/blog`.

### 3.8 `/legal/*`

Plain, readable legal pages in the 720px column, a "last updated" date, a table of contents, and a contact email. `/legal/security` is the *public trust page*: a summary of the threat model + the controls + the bug-bounty contact + the subprocessor list + a link to the full `docs/SECURITY/SECURITY_ARCHITECTURE.md` on the repo. `/legal/status` is a thin page linking the external status service (or an embedded iframe, `PRD.md §8 U3`).

## 4. Navigation

**Header (the marketing header, not the dashboard's shell):** the product mark + the wordmark (left); the nav links — Features, Docs, Changelog, Blog (right); the one CTA button "Connect your repo" (far right). A **sticky** header after the hero scrolls past (a 1px bottom border appears on scroll — the `DESIGN_SYSTEM.md`'s "a 1px line separates surfaces", no shadow).

**Footer:** 4 cols — Product (Features, Changelog), Resources (Docs, Blog, GitHub, Status), Company (About, Blog), Legal (Terms, Privacy, Security, DPA) + a bottom row (© year, the MIT license, the "built by" line). **No newsletter form** (`PRD.md §6`).

**Mobile:** the nav links collapse into a sheet (a `<dialog>`-based sheet, focus-trapped, `ESC`-dismissible — the a11y rules in `docs/DESIGN/ACCESSIBILITY.md`); the CTA stays visible as a button.

## 5. The internal-linking rules (SEO + AEO)

- **Every docs page links to ≥ 2 other docs pages** (no orphan pages).
- **Every blog article links to ≥ 1 docs page** (a content-to-product path).
- **The changelog links to the docs** for each behavioral change ("the `rules` API changed — see the docs").
- **Anchors are descriptive** ("the GitHub App permissions", not "click here").
- **No orphan public page** — the weekly crawl check (`PERFORMANCE_AND_ACCESSIBILITY.md`) asserts every `sitemap.xml` URL is reachable and every page is reachable from the sitemap.

## 6. What the website deliberately does *not* have

- **No `/pricing` page, no plan cards, no quota numbers, no "Start free / upgrade" CTAs** (the pricing/plan/quota/billing system is removed; `SAAS_LAUNCH_PLAN`'s direction — launched without paid tiers, usage-based gating removed). The conversion CTA is *one*: "Connect your repo" (`PRD.md WFR-501`). A pricing artifact resurfacing on any public page is a *direction* failure, not an oversight.
- **No user accounts on the marketing surface** (auth is the dashboard's, `AUTHENTICATION.md`; the website has no session).
- **No cookie banner in P2** (the site sets no cookies — the cookieless beacon, `WFR-504`; a cookie banner is therefore not required, and adding one would be dishonest).
- **No interstitials, no "wait for it" gates, no "enter your email to continue reading"** (the AEO/anti-pattern, `SEO_AEO_GEO.md §5`).
- **No dark-mode toggle in P2** (the palette ships both themes — `DESIGN_SYSTEM.md §4.3` — and the site follows `prefers-color-scheme` automatically; a manual toggle is P3).
- **No search box in the header** in P2 (a header search that only searches the docs is a lie; the docs search is P3, `PRD.md §6`).
