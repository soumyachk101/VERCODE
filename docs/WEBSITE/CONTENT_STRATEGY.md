# VERCODE Website — Content Strategy

The editorial policy for the three content surfaces of the website — **docs**, **changelog**, and **blog** — plus the shared **rules** every surface obeys. Strategy (what, why, voice, cadence) lives here; *schemas* (the front-matter shape, the JSON-LD per type) live in `CONTENT_SCHEMAS.md`; *where each page lives and its blocks* live in `INFORMATION_ARCHITECTURE_AND_PAGES.md`.

## 1. Positioning & voice

### 1.1 The single claim every piece supports

The wedge (`SAAS_LAUNCH_PLAN.md §1`): **"VERCODE is the AI code-review a team actually reads."** Every doc, changelog entry, and blog article is written to make that *believable* for a specific reader, not to repeat the marketing line. The three **trust levers** a skeptical engineer (the `Wendy` persona, `PRD.md §3`) will test:

1. **Specificity** — numbers over adjectives ("p50 < 120 s" not "fast"; "confidence floor 0.6" not "high confidence").
2. **Honesty about limits** — the `KNOWN_LIMITATIONS.md` posture: a deferred capability is *documented, not silently absent* (no "coming soon", ever).
3. **Evidence** — a claim is only made with a measured figure, a benchmark (`docs/TESTING/BENCHMARK_DATASET.md`), or a link to the source (the `docs/API/`, `docs/SECURITY/`).

### 1.2 The voice

- **Second person, present tense** ("VERCODE runs static analysis first", not "VERCODE will run…").
- **The words of the trade** (`INFORMATION_ARCHITECTURE.md` §7 for the app, mirrored here): "review", "finding", "verdict", "severity", "confidence floor", "connect", "install" — never "insights", "leverage", "best-in-class", "seamless".
- **Sentence case** throughout (no uppercase labels, `DESIGN_SYSTEM.md §2`'s ban).
- **Short declarative sentences** in docs and FAQ (an answer-engine can quote one at a time); **prose** in blog (the editorial surface).
- **No emoji in public content** (the `DESIGN_SYSTEM.md` "no emoji" house rule extends to copy).
- **Never "10,000+ teams"** — a vanity total, a banned tell (`DESIGN_SYSTEM.md §9`). If there's no social proof, the section is omitted.

### 1.3 The banned list (editorial)

A content piece that contains any of these fails review: the words "revolutionary / game-changing / seamless / best-in-class"; a fabricated customer name or logo ("Acme"); a "coming soon" without a date; a metric with no source; a claim about competitors that we can't substantiate (a "vs CodeRabbit" table is allowed only when every cell is a *measured* figure from `BENCHMARK_DATASET.md`, never a "we are better" assertion).

## 2. Surface-by-surface strategy

### 2.1 Docs (`/docs`)

- **Purpose:** reduce evaluation time for a technical buyer; be the *most quotable* surface (an answer engine answering "how does VERCODE work" should be pulling from `/docs`, `SEO_AEO_GEO.md`'s target).
- **First-cut set (P2):** the `INFORMATION_ARCHITECTURE.md §3.4` topic list — quickstart, github-app, api, rules, security, providers, usage, connect, privacy (the 9 P2 topics; `pricing` + `quotas` are removed with the pricing system — see `INFORMATION_ARCHITECTURE_AND_PAGES.md §3.4`).
- **Cadence:** a doc page lands **with** the feature (a `DEFINITION_OF_DONE` item — a feature is not "done" until its doc page exists, the "docs kept in sync with code" cross-cutting gate, `README.md`).
- **Authoring:** an engineer who built the feature writes the first draft; a doc owner (the same person who owns the `FUNCTIONAL_REQUIREMENTS.md` FR block) reviews; every number is traceable to a doc in `docs/` (an `FR-*`, an `NFR-*`, an `ADR-*`).
- **Review gate:** a docs PR must pass the `RELEASE_CRITERIA` docs-drift gate (a `content/` schema validation, the `TECHNICAL_ARCHITECTURE.md §5`'s lane 1) + a peer review + an AEO pass (§4 below).
- **No versioning in P2.** A versioned docs site (a "v1 / v2" selector) is P3; P2 is a single current version, and breaking changes are called out *inline* ("In 2.0 the usage-report key changed from `reviews_total` to `reviews_by_range`").

### 2.2 Changelog (`/changelog`)

- **Purpose:** *trust* — a public, dated, honest record of what changed; a launch-prereq at P2 (`SAAS_LAUNCH_PLAN` "a docs site", the changelog is the "what's new" surface).
- **Cadence:** **one entry per release** (the release, not the PR — a release is a tag, the `CI_CD.md`'s release lane). At minimum: minor features, breaking changes, security fixes *always*; a "nothing user-visible" entry is allowed for a patch-only release, but the entry still exists (a *dated* silence is not a silence).
- **Format:** Keep-a-Changelog (`Added / Changed / Fixed / Deprecated / Removed / Security`) — the §3.6 vocabulary. Each entry: a `version` + a `date` + the sections. **Upgrade notes are mandatory** on any `Deprecated` or `Removed`.
- **Honesty rule:** the changelog describes *shipped, verified* behavior only — the `SAAS_LAUNCH_PLAN §5`'s "a measured gate" rule applied to copy: a changelog that says "you can now self-host" is false while self-hosting is `L-9` (Phase 3, `KNOWN_LIMITATIONS.md`).
- **AEO target:** "what's new in VERCODE" / "VERCODE changelog" — the `/changelog` index's `ItemList` is the quotable artifact (`STRUCTURED_DATA.md §5`).

### 2.3 Blog (`/blog`)

- **Purpose:** establish the *thinking* behind the product (the "why deterministic-first" argument, the cost-discipline numbers) so that search + LLM traffic arrives *informed*; convert a skeptical reader.
- **Cadence:** ≥ 1 article / 2 weeks (the `PRD.md §7`'s blog `changefreq` is `monthly` — the sitemap is conservative; the actual cadence target is 2-weekly while in active build).
- **Topic bar (a 3-part test, all must pass):**
  1. **A claim** — the post takes a position ("Static analysis before the LLM cuts false positives more than a bigger model does").
  2. **Evidence** — a number, a benchmark result, a dataset finding, or a code walkthrough. No claim without a source.
  3. **A product angle** — it connects to a VERCODE decision (an `ADR`, an `NFR`, a `FR`) without being a product announcement (an announcement is a changelog entry, not a blog post).
- **Formats allowed:** a short argumentative post (800–1,500 words), a deep technical post (2,000–4,000 words), a **case study** (only with a real customer, P3 — a P2 case study with no customer is a lie), a **post-mortem** (honest, public, `KNOWING_LIMITATIONS` posture). **Formats banned:** listicles, "Top N" posts, a company PR without a technical argument, a re-marketing of a feature (use the changelog).
- **Authorship:** named authors with a real profile (an `about/`-linked `Person`, `STRUCTURED_DATA.md §5`).

## 3. The shared content rules (all surfaces)

1. **One claim per page** (docs/changelog are exceptions — a doc page teaches one *procedure*, a changelog entry records one *release*; still, no topic salad).
2. **The numbers are always literal** — "p95 under 300 seconds" not "sub-5-minute"; every literal is traceable (`NFR-02` for latency, `SUCCESS_METRICS.md` for the activation/retention figures). No price, plan, or quota numbers appear anywhere in the content — the pricing system is removed (`SAAS_LAUNCH_PLAN`'s direction note).
3. **Machine-readable is the default** — every page has its JSON-LD (a `CONTENT_SCHEMAS.md` per-type contract) + its `llms.txt` representation (the `SEO_AEO_GEO.md §4` fact list for the top-level claims).
4. **No orphan pages** — `INFORMATION_ARCHITECTURE_AND_PAGES.md §5`'s link rules; the weekly crawl check enforces it.
5. **`lastmod` is honest** — the `sitemap.xml` `lastmod` reflects the last *material* change to the page (a typo fix is not a `lastmod` bump, `SEMAN` — a crawler is told the truth, `SEO_AEO_GEO.md §5`).
6. **The "was this helpful?" affordance is out of scope for P2** (§3.5 of the IA doc) — P3.
7. **Status labels** — `draft` / `published` / `archived` (a `CONTENT_SCHEMAS.md` enum); a `draft` is never rendered publicly, never in `sitemap.xml`; an `archived` page 410s (the `INFORMATION_ARCHITECTURE.md`'s "a soft-deleted doc is a 410" rule) and keeps its JSON-LD off the sitemap but **keeps** its canonical URL resolvable for existing backlinks (a 410 is better than a 404 for SEO continuity, `SEO_AEO_GEO.md §2`).

## 4. The AEO (answer-engine-optimization) editorial pass

Every **published** doc / FAQ / blog post passes a 5-point AEO check before merge (`RELEASE_CRITERIA`'s new website lane, `TECHNICAL_ARCHITECTURE.md §5`):

| Check | Rule |
| --- | --- |
| **Q1 quotability** | Can the top of the article answer a question in ≤ 2 sentences *at the top of the page*? (An answer engine / LLM extracts the first 100–300 tokens; the answer lives there, not at the bottom.) |
| **Q2 declarative** | Are the key statements **declarative, subject–verb–object** sentences? ("VERCODE runs ESLint and Semgrep on changed files before the LLM" — not "VERCODE's pipeline leverages static analysis…"). |
| **Q3 literal numbers** | Are every number a literal with a unit? ("p95 under 300 seconds" — not "sub-5-minute"). |
| **Q4 table / list where a table / list is the answer** | A "which GitHub permissions does the App need" is a **list**, not a paragraph; a "what are the repo-selection settings" is a **table**, not prose. |
| **Q5 schema match** | The JSON-LD's text == the visible text (byte-equivalent for FAQ; near-equivalent for Article, `SEO_AEO_GEO.md §3`). |

A post that fails Q1–Q5 is rewritten, not published.

## 5. The ownership & process

| Surface | Author | Reviewer | Gate |
| --- | --- | --- | --- |
| Docs | the feature's owner | the doc owner (FR block) + a peer | build-time `content/` schema + AEO pass + a peer |
| Changelog | the release engineer | the doc owner | a *release* gate (the `CI_CD` release lane) |
| Blog | any named author | 2 peers (one technical, one editing) | a PR review + an AEO pass + the §2.3 3-part test |
| FAQ (a `content/faq/` item) | the doc owner | the product owner | the `FAQPage` schema check (Q5, byte-equivalence) |

**The publishing workflow** (a single PR, two reviews, one CI): author → a `content/`-schema CI run (the build gate) → 2 peer reviews (docs/changelog: the table above; blog: the 2-peer rule) → the AEO lane (the automated Q1–Q5 check, §4) → merge → the static site redeploys (a `TECHNICAL_ARCHITECTURE.md §5`'s website build lane). **No out-of-band publishing** (no manual CMS edits; a P2 content change is a PR — the "no CMS" rule, `CONTENT_SCHEMAS.md`'s scope note).

## 6. Measurement

| Surface | The KPI | The target |
| --- | --- | --- |
| Docs | a "docs-first" session (a session that lands on `/docs` and *doesn't* bounce) | ≥ 60% |
| Changelog | a changelog-driven return visit | ≥ 15% of weekly active users |
| Blog | a blog → sign-up conversion | ≥ 2% (a top-of-funnel content, `PRD.md §7`'s `?src=web-blog` beacon) |
| FAQ | a FAQ → sign-up conversion | ≥ 5% (a bottom-of-funnel, high-intent) |
| All | a GSC "impressed" organic position for a top-3 keyword ("AI code review", "AI PR reviewer", "AI code review GitHub") | ≥ top-10, within 6 months of P2 launch |

The beacon (`WFR-504`) + a GSC (or a self-hosted crawler proxy, `U4`) are the only two sources; **no** third-party analytics in P2.
