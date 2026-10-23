# VERCODE Website — Performance & Accessibility Requirements

The website's performance budget + the accessibility gate, as WNFRs. The PRD's summary targets (`PRD.md §5`) are the *claims*; this doc is the *measurement* — every budget here is asserted in CI, and a breach blocks merge (`DEPLOYMENT_AND_TESTING.md §3`). The dashboard's perf/a11y NFRs (`docs/PRODUCT/NON_FUNCTIONAL_REQUIREMENTS.md`, NFR-24/NFR-25) are *decoupled* from these (`TECHNICAL_ARCHITECTURE.md`'s boundary note): the website has its own budget, its own lane, its own gate.

## 0. The WNFR set (the IDs)

| ID | Statement | Target |
| --- | --- | --- |
| `WNFR-01` | Lighthouse mobile score on the 5 budget pages (`/`, `/pricing`, `/docs/quickstart`, `/docs/api`, `/blog/<slug>`) | ≥ 90, asserted per page, per PR (`PRD.md §5`'s "mobile ≥ 90", extended from its 3-page set to the 5-page budget set) |
| `WNFR-02` | The per-page CRFP budget (LCP / CLS / TBT / INP) | LCP ≤ 2.5 s, CLS ≤ 0.05, TBT ≤ 0.1 s, INP ≤ 200 ms on every budget page (mobile emulation) |
| `WNFR-03` | The JS + transfer budget | JS ≤ 150 KB gz per page; total transfer ≤ 500 KB gz on `/` (other pages: JS-bounded, total un-budgeted at P2 — a baseline is *measured*, not claimed, §1) |
| `WNFR-04` | **No third-party requests** in P2. The only outbound call is the first-party cookieless beacon (`POST /api/track` on the API domain, `PRD.md WFR-504`; the DPDP posture, `CONTENT_STRATEGY.md §6` "the beacon + GSC are the only two sources; no third-party analytics in P2") | 0 third-party origins in a Lighthouse network trace on every page |
| `WNFR-05` | **Self-hosted assets.** Fonts via `@fontsource` (a bundled, self-hosted request — a zero external font request, `DESIGN_SYSTEM_AND_TYPOGRAPHY.md §1` "the no-external-request rule"). Images: a static OG set + a *hand-authored* screenshot set, versioned in-repo and reviewed by eye (a real, not auto-compressed, asset — a pipeline-compressed image is a regression risk we do not accept in P2) | 0 requests to a font/image CDN; every image has a content-type + an explicit byte size in the asset manifest |
| `WNFR-06` | **WCAG 2.2 AA** on every public page (`INFORMATION_ARCHITECTURE_AND_PAGES.md §1`'s `WFR-101` route set). The app pins WCAG 2.1 AA (`docs/DESIGN/ACCESSIBILITY.md`'s NFR-24); 2.2 is a strict superset, so the same axe run satisfies both — the website *adds* the 2.2 level without moving the app's pin | axe: 0 critical/serious violations on every `WFR-101` route, in CI |
| `WNFR-07` | The *named* success criteria that apply to the marketing surface: 1.4.3 (contrast 4.5:1 on body text, both themes; the severity-mark exception is §3), 1.4.4 (resize to 200% with no loss), 2.1.1 (keyboard), 2.4.7 (focus visible), 4.1.2 (name/role/value on the interactive controls: the nav sheet, the pricing CTAs, the `<details>` FAQ), 1.3.1 (info in text: the verdict device's text is in the DOM, the screenshot's finding-line has an `<figcaption>` or alt) | each named by ID in the axe run config + a manual keyboard pass (§3) |
| `WNFR-08` | **Theming + motion are OS-respected:** the dark theme follows `prefers-color-scheme` (the palette ships both themes, `INFORMATION_ARCHITECTURE_AND_PAGES.md §6` "the site follows `prefers-color-scheme` automatically; a manual toggle is P3"; the dark tokens, `DESIGN_SYSTEM.md §4.3`). `prefers-reduced-motion` **disables the scroll-reveals** (`DESIGN_SYSTEM_AND_TYPOGRAPHY.md §5` "the one-time 100 ms scroll-reveal" — the only P2 motion) and collapses all motion to nothing (the app's NFR-25 rule, `DESIGN_SYSTEM.md §8`). Figures are set in tabular numerals (`DESIGN_SYSTEM_AND_TYPOGRAPHY.md §3` "a 32px tabular figure"; the `tabular-nums` face check, `DESIGN_SYSTEM.md §1`) | a Playwright reduced-motion run shows all content with zero travel; the dark theme renders at its `#000`/`#111`/`#fff`/`#b4b4b4`/`#949494` token set; the price + quota figures align in a column (a visual + a computed-style check) |
| `WNFR-09` | **Crawl coverage:** 100% of the `sitemap.xml` URLs reachable (a 200 or the `WFR-105` 410 for an archived doc), **0 orphan pages** (every public page is in the sitemap *and* reachable from it), **0 dead internal links** | a weekly scheduled-lane job (§2.2) + a PR-lane link check; a failure is a P1 |
| `WNFR-10` | **The regression gate:** a performance budget breach (a `WNFR-02`/`WNFR-03` miss, or a Lighthouse score drop against the git baseline) **blocks merge** — the website's equivalent of the app's benchmark gate (`CI_CD.md §3` "a merge that can't pass the benchmark gate is held"; the `tests/benchmark` harness's baseline-compare rule, `RELEASE_CRITERIA.md` gate 7) | the Lighthouse lane's `assert` step is a *merge* gate, not a report (a breach is a red lane, not a warning) |

## 1. The performance budget (the numbers, per page)

The budget is asserted with **Lighthouse CI** (an `@lhci/cli` run, a headless Chrome, mobile emulation: the `Lighthouse` `mobile` preset, a Moto G-class throttle, §2.1). The 5 pages:

| Page | LCP | CLS | TBT | INP | JS (gz) | Total transfer (gz) |
| --- | --- | --- | --- | --- | --- | --- |
| `/` | ≤ 2.5 s | ≤ 0.05 | ≤ 0.1 s | ≤ 200 ms | ≤ 150 KB | **≤ 500 KB** |
| `/pricing` | ≤ 2.5 s | ≤ 0.05 | ≤ 0.1 s | ≤ 200 ms | ≤ 150 KB | *(no P2 budget — the baseline is measured on first run and pinned; the "measured, not claimed" rule)* |
| `/docs/quickstart` | ≤ 2.5 s | ≤ 0.05 | ≤ 0.1 s | ≤ 200 ms | ≤ 150 KB | *(same)* |
| `/docs/api` | ≤ 2.5 s | ≤ 0.05 | ≤ 0.1 s | ≤ 200 ms | ≤ 150 KB | *(same)* |
| `/blog/<slug>` | ≤ 2.5 s | ≤ 0.05 | ≤ 0.1 s | ≤ 200 ms | ≤ 150 KB | *(same — asserted on the *longest* published article at run time)* |

**The structural rules that make the budgets hold** (a budget that's not enforceable by the build is a wish):

- **The static export is the perf floor** (`TECHNICAL_ARCHITECTURE.md §1` "a `Next.js 15 static export`"): the content is HTML at the edge; there is no server-rendering latency in P2 (a live "current plan pricing" is P3, §8's "a decision").
- **Fonts:** the `@fontsource` package's CSS + woff2 is *bundled into the static build* (a `font-src 'self'`, `DESIGN_SYSTEM_AND_TYPOGRAPHY.md §1`); a Google-Fonts request is a `WNFR-04` violation (a Lighthouse network-trace check).
- **Images:** the OG default + the per-blog-slug image (`PRD.md WFR-404`/`WFR-303`) + the handful of hand-authored screenshots (`INFORMATION_ARCHITECTURE_AND_PAGES.md §3.2` "a screenshot or a code/UI fragment") are **versioned, named files with a reviewed byte size** (a hand-authored PNG/WebP, not an auto-compressed derivative — a compressor upgrade must not silently change the shipped bytes; the asset manifest pins the size, a `WNFR-03` input).
- **The beacon is not a request on page-load** — it fires on the `/signin` success (`PRD.md WFR-504`), so it never enters a page's network trace.
- **The JS ceiling (150 KB gz/page)** covers the framework hydration + the (CSS-only-preferred) scroll-reveal; an `IntersectionObserver` fallback is *in* that budget, not on top of it (`DESIGN_SYSTEM_AND_TYPOGRAPHY.md §5`).

## 2. The measurement (the CI)

The lane names below are `TECHNICAL_ARCHITECTURE.md §5`'s (`the "Website build" / "Website Lighthouse" / "Website axe" / "Website JSON-LD validity" lanes`); the scripts + the `make check-website` target are this doc's.

### 2.1 The Lighthouse CI lane ("Website Lighthouse")

- **The tool:** `@lhci/cli` (Lighthouse CI) driving a headless Chrome, the **mobile** preset, run on a **local static server over the built export** (a `next build` export served by the lane's server step — the same server as §2.4 of `DEPLOYMENT_AND_TESTING.md §4`, so the measured page is the shipped page, not a dev-server dev build).
- **The config:** `apps/website/lighthouserc.json` — a per-page assertion set (`assertions` on `WNFR-02`/`WNFR-03`'s numbers + a `performance ≥ 90` score assertion on the 5 pages), a **git baseline** (the `assert: preset: git` mode — the baseline is the last green run; a score or budget regression against it fails the run), a `screenshot` capture on fail.
- **The script:** `apps/website` package scripts: `lighthouse` (the `@lhci/cli` run) — invoked by the lane as a named job ("Website Lighthouse", the `CI_CD.md §1` lane convention; `TECHNICAL_ARCHITECTURE.md §5` "a Lighthouse CI (a Chrome headless run on `/`, `/pricing`, `/docs/quickstart`)" — this doc runs it on the 5-page set, §0's `WNFR-01`).
- **The gate (a `WNFR-10`):** the lane is a **merge gate** — a `git`-baseline assertion failure (a score drop, a budget breach) **holds the merge** (`CI_CD.md §3`'s benchmark-gate pattern, "a merge that can't pass the benchmark gate is held"). A *new* page or a *lowered* budget is a config change that must pass the PR lane *and* be reviewed (the "the budget is a reviewed number" rule — no silent budget-creep).
- **The reporting posture:** the lane emits the *number* (the score + the 4 CRFP values per page, in the report), never a green-checkmark without it (`RELEASE_CRITERIA.md §2` "the benchmark gate is a number, not a 'the tests ran'").

### 2.2 The crawl-coverage job ("weekly crawl")

A **scheduled-lane** job (a new entry in the `CI_CD.md §1` "scheduled" lane, *weekly* — the lane is currently nightly-only; this job is the weekly add) that runs against the **live prod URL**:

| Check | Tool / assertion | Failure means |
| --- | --- | --- |
| **Sitemap reachable** | every `/sitemap.xml` URL returns a 200 (an archived doc returns a 410, `WFR-105`) | a launch-URL that's dead is a **P1 incident** (the `PRD.md §7` "100% of `WFR-101` URLs" KPI source) |
| **0 orphan pages** | the link checker's *reachable* set == the *sitemap* set (a page the sitemap lists but nothing links is flagged, and a page that's linked but not in the sitemap is flagged — both are orphans / omissions, `INFORMATION_ARCHITECTURE_AND_PAGES.md §5` "no orphan public page — the weekly crawl check asserts…") | a content link that broke in a PR is caught *before* the next release lane |
| **0 dead internal links** | the link checker asserts every *internal* `<a>` resolves (a 200 or the 410 rule; external links are *not* asserted — a dead third-party link is a P2+ content decision, not a CI P1) | a dead `/docs` cross-link is a `WNFR-09` P1 |

**The tool:** a link checker (`linkinator` — a Node, stack-consistent; a `lychee` is the alternative, an open call, `UNRESOLVED` below), driven by `apps/website`'s `crawl-coverage` script (a weekly scheduled-lane job + a *PR-lane* run of the same script against the local build, so a link break is caught at merge, not at Monday).

### 2.3 The link-checker's scope

- **The input:** the built export (a local static server, §2.4's server) — the *same artifact* that ships (`DEPLOYMENT_AND_TESTING.md §1`'s "the shipped page is the tested page" rule, a `DEPLOYMENT.md §4` "verify" posture).
- **What it does NOT check:** the OG-image `og:image` URLs (an asset-manifest check, `WNFR-05`), the canonical URLs (a content-sanity check, a separate `content/`-schema lane), the `robots.txt` directives (a `WFR-103` assertion, `DEPLOYMENT_AND_TESTING.md §3`).

### 2.4 The server step (shared by §2.1 + §2.2)

A **CI job** that `pnpm --filter @vercode/website build`s and serves the `out/` (a `next export`) with a static file server (the `DEPLOYMENT_AND_TESTING.md §4` "dev-stack equivalent" — a no-`docker compose` matrix). Both the Lighthouse + the link-checker runs hit *that* server; a lane that runs against a dev-server build is invalid (the dev build's asset names + the hydration path differ from the export).

## 3. Accessibility (the WCAG 2.2 AA gate)

The reference is `docs/DESIGN/ACCESSIBILITY.md` (the app's WCAG **2.1 AA**, NFR-24) — its *standard + tooling* are adopted; the website *adds* the **2.2** level per `PRD.md §5` ("WCAG 2.2 AA on every public page"). 2.2 adds no *criteria that apply to the marketing surface* that the 2.1 set doesn't already cover, but the *level claim* is 2.2 (the website's `a11y` statement is "WCAG 2.2 AA"; the app's is "WCAG 2.1 AA" — the two are consistent, not contradictory, because 2.2 ⊃ 2.1 for the applicable criteria). The tooling commitments (`ACCESSIBILITY.md §6`'s "a gate, not a late pass") are reused:

- **The CI axe run:** a `@axe-core/playwright` spec over every `WFR-101` route (`TECHNICAL_ARCHITECTURE.md §5` "Website axe" lane, "a `@axe-core/playwright` on every `WFR-101` route; 0 critical violations") — the `ACCESSIBILITY.md §6` "Static a11y" gate's *website* instantiation (a `0 critical/serious` rule, the app's `jest-axe`/`vitest-axe` alternative is the same check in a *component* test, `ACCESSIBILITY.md §6`'s "Playwright `@axe-core/playwright` *or* the `jest-axe`/`vitest-axe`" line — the website is a *page* suite, so it's the Playwright variant).
- **The named criteria** (a `WNFR-07` "named by ID in the axe run config" — the axe run's `runOnly`/`tags` is scoped to the `wcag2a`+`wcag2aa`+`wcag21a`+`wcag21aa`+`wcag22a`+`wcag22aa` tag sets, *filtered* to the 6 IDs below, so the gate is the 6-criteria set, not the whole-rule-bomb):

| Criterion | The marketing-surface application | The exception, stated |
| --- | --- | --- |
| **1.4.3** (contrast, 4.5:1) | body + section + meta text on *both* the light (`DESIGN_SYSTEM.md §4.2`) + dark (§4.3) themes; the `--muted`/`--faint` greys hold their 4.5:1 floor (`ACCESSIBILITY.md §1` "a 2.5–3:1 grey that *looks* fine but fails is a defect, not a judgment call") | **The severity mark is *not* a contrast violation by design** — the severity square is *paired with the word* (`ACCESSIBILITY.md §1` "the SeverityMark square is always paired with the word"; `DESIGN_SYSTEM.md §10` "a colour-blind reader gets the word; the square is the glance mark, not the sole signal"). The *coloured-on-colour* severity tints (a verdict-card, a screenshot embed) are *data representations*, exempt as a "the mark is a UI component, not body text" — a body *paragraph* that fails 4.5:1 is a defect, a severity mark that's low-contrast but *word-paired* is the `WNFR-07` exception, documented here |
| **1.4.4** (resize to 200%) | the 720px reading column + the pricing card grid must not *clip* or *lose* content at 200% (a reflow, not a scroll-trap; a horizontal scroll on the price figures at 200% is a fail) | — |
| **2.1.1** (keyboard) | every interactive element on a public page is keyboard-reachable + actionable: the header CTA, the pricing CTAs, the footer links, the mobile nav sheet's items, the `<details>` FAQ, the 404's search box | a hover-only affordance is a fail (the app's `ACCESSIBILITY.md §4` "no hover-only interactions" rule applies) |
| **2.4.7** (focus visible) | a *visible* focus ring on every focusable (the app's `--control`-step ring, `ACCESSIBILITY.md §2` "a focus ring that's only a *colour* change (no outline) fails") | — |
| **4.1.2** (name/role/value) | the mobile nav sheet (a `<dialog>`-based sheet, `INFORMATION_ARCHITECTURE_AND_PAGES.md §4` "focus-trapped, `ESC`-dismissible"), the pricing card CTAs, the FAQ `<details>`/`<summary>` — each has an accessible name + a correct role + a state that's announced | a styled `<div>` that *is* a button in the DOM is an axe fail (`ACCESSIBILITY.md §3` "a *styled* control that isn't a `<button>`/`<a>` in the DOM is an axe failure") |
| **1.3.1** (info in text) | the review-verdict hero device: the "Needs changes · 2 high" line + the finding line (`INFORMATION_ARCHITECTURE_AND_PAGES.md §3.1` block 1) is *in the DOM* (a text card, not an image-only hero — a static DOM card is the `WFR-201` "a live, type-set… line as the one large thing"); a *screenshot* embed (`§3.2` "a screenshot or a code/UI fragment of the real surface") carries a `figcaption`/alt that states the finding-line's *content*, not "image of" (`ACCESSIBILITY.md §7` "an alt text that's 'image of' or 'logo'" ban) | — |

- **The manual keyboard pass (a `WNFR-07` + `ACCESSIBILITY.md §6` "Keyboard-only" gate's website scope):** a *named* keyboard pass, done by hand (the suite's keyboard run covers the app's J1–J5, `E2E_TEST_PLAN.md §2`'s `a11y-keyboard.spec.ts`; the website's two surfaces are the manual pass, the "top-5 journeys" are the app's):
  1. **The mobile nav sheet** (`INFORMATION_ARCHITECTURE_AND_PAGES.md §4` "a `<dialog>`-based sheet, focus-trapped, `ESC`-dismissible"): open (a Tab + Enter from the header trigger), navigate (arrows within the sheet), close (Esc), focus **returns to the trigger** on close (`ACCESSIBILITY.md §2` "a dialog traps focus inside; Esc closes it; focus returns to the trigger on close"). A focus that lands *outside* the sheet on open, or *doesn't return* on close, is a fail.
  2. **The pricing cards** (`/pricing`, a `WNFR-07` keyboard target): Tab across the 4 cards' CTAs in DOM order (no positive `tabindex`, `ACCESSIBILITY.md §2` "no `tabindex` greater than 0"), each CTA is actionable by keyboard (Enter/Space), the Enterprise card's `mailto:` CTA is a keyboard-reachable link (a `<a>`, not a `window.location`-on-click, `4.1.2`).
- **The theming + motion (a `WNFR-08`):** a **`prefers-color-scheme`** run (a dark-theme axe pass — the contrast check, §3's 1.4.3, runs on *both* themes, a Lighthouse-emulated `prefers-color-scheme: dark` context + the axe run's dark pass) and a **`prefers-reduced-motion: reduce`** run (a Playwright emulated context, the `ACCESSIBILITY.md §6` "Reduced motion" gate's rule: "content still appears (no blank/hidden-on-reduced-motion state); a motion-gated interaction has its alternative") — on the website, the reduced-motion state *removes the scroll-reveals entirely* (`DESIGN_SYSTEM_AND_TYPOGRAPHY.md §5` "the one-time, 100ms scroll-reveal" is *the only* P2 motion, so "collapse to opacity-only" = "no travel, no reveal, content is in its final position" — a reduced-motion page that still *animates* the reveal is a fail). A *tabular-figures* check (a `font-variant-numeric: tabular-nums` assertion on the price + quota figures, `DESIGN_SYSTEM_AND_TYPOGRAPHY.md §3` "a 32px tabular number, the `tabular-nums` face check") is a computed-style assertion in the axe spec (a `DESIGN_SYSTEM.md §1` "a face whose digits don't actually align is rejected" release-gate, applied to the website's figures).

## 4. The audit matrix (WNFR → lane + manual + gate)

The "gate" column is the *merge/block* meaning: "merge" = a breach holds the merge (a `WNFR-10` / a `CI_CD.md §3` "a merge that can't pass… is held" pattern); "release" = the P2 public-launch gate (`RELEASE_CRITERIA.md`'s website lane, `TECHNICAL_ARCHITECTURE.md §5` "gate 14"); "P1" = an incident-level flag (a `WNFR-09` crawl failure).

| WNFR | CI lane (the `TECHNICAL_ARCHITECTURE.md §5` name + the script) | Manual check | Gate |
| --- | --- | --- | --- |
| `WNFR-01` | "Website Lighthouse" (the `lighthouse` script, a `@lhci/cli` mobile run on the 5 pages) | a *real* mobile device + a throttled-network spot-check (a monthly sample, the "measured, not claimed" rule — a CI emulation is a *proxy*, not the real thing) | merge (a score < 90 holds) + release |
| `WNFR-02` | "Website Lighthouse" (a per-page CRFP assertion, a git baseline) | — | merge (a budget breach holds) + release |
| `WNFR-03` | "Website Lighthouse" (a JS-size + a total-transfer assertion, a 150 KB gz/page + a 500 KB gz `/`) + the asset-manifest byte check (a `WNFR-05` input) | a hand-authored image set: a byte-size review on PR (a new screenshot that doubles the `/`'s transfer is a *review* catch, not a CI one) | merge + release |
| `WNFR-04` | a Lighthouse network-trace check (a "0 third-party origins" assertion, a `WNFR-05` + a `WNFR-04` combined trace) | — | merge + release |
| `WNFR-05` | the asset-manifest check + a `font-src`/`img-src` self-hosted assertion (the build lane, a "Website build" sub-check) | the screenshot set is reviewed by eye (a hand-authored, not auto-compressed, asset) | merge + release |
| `WNFR-06` | "Website axe" (a `@axe-core/playwright` over every `WFR-101` route, 0 critical/serious) | — | merge (a 0-critical breach holds) + release |
| `WNFR-07` | the axe run, scoped to the 6 named criteria (a `§3` "the named criteria" table) | **the manual keyboard pass** (the mobile nav sheet + the pricing cards, a `§3` "the manual keyboard pass") — a *named* sign-off (an `a11y-keyboard` equivalent, `E2E_TEST_PLAN.md §2`'s `a11y-keyboard.spec.ts` pattern, extended to the website's 2 surfaces) | merge + release (a keyboard-trap or a focus-not-returned is a hold) |
| `WNFR-08` | the dark-theme + the reduced-motion Playwright emulations + a `tabular-nums` computed-style check | a `prefers-color-scheme`/`prefers-reduced-motion` spot-check in a real browser (a monthly sample) | merge + release |
| `WNFR-09` | the weekly "crawl-coverage" job (a `crawl-coverage` script, a scheduled-lane add; a PR-lane run against the local build) + a "Website build" sitemap-count check (a `sitemap.xml` count == a `WFR-101` + content count, `TECHNICAL_ARCHITECTURE.md §5` "Website build" lane) | a link-checker diff review (a Monday post-run, a dead-link that's *expected* — an archived doc's 410 — is a *documented* allow-list, not a silent pass) | P1 (a live-URL dead is an incident, `PRD.md §7` KPI) + merge (a PR-lane break holds) |
| `WNFR-10` | the Lighthouse lane's `assert` step (a `git`-baseline, a breach = a red lane, §2.1 "The gate") | a budget-crease review (a lowered budget is a *config* change, not a lane-skip) | merge (the regression gate *is* the merge gate) |

**The posture:** the audit matrix is a *measurement*, not a checklist (a `RELEASE_CRITERIA.md §2` "the pass is a measurement, not a checkbox" rule) — a row that's green has a *number* (a score, a violation count, a link-check diff) + a *run date* + a *tool version* (an `@lhci/cli` + a `@axe-core/playwright` version, the `BENCHMARK_DATASET.md §6` "a reviewer re-runs and gets the same number" determinism posture, applied to the perf/a11y runs).

## 5. What this doc does NOT set

- **A live-CDN TTFB / edge-cache budget** (a `vercel`/a CDN's edge-TTFB is a host metric, not a page metric, `DEPLOYMENT_AND_TESTING.md §1`'s "scales on RPS via CDN" — a host SLA, not a P2 budget).
- **A Web-Vitals *field* (RUM) budget** (a `WFR-504` cookieless beacon is a first-party, *activation* beacon — a LCP/INP *field* metric is a P3 data decision, `PRD.md §8 U4` "a self-hosted Plausible is a P3 option").
- **The 2.2 *added* criteria that don't apply** (a `WCAG 2.2`'s 9 *new* criteria — 2.4.9 *focus not obscured*, 2.4.10 / 2.5.7 / 2.5.8 / 3.2.6 etc. — are *not* in the `WNFR-07` named set because the marketing surface's interactivity (a nav sheet, a CTA, a `<details>`, a search box) is a *small* surface; a criterion that doesn't touch a P2 control is *exempt, documented, not ignored* — a `PRD.md` "out of scope (explicit)" posture, here).

## 6. Unresolved

- **The link-checker tool** (a `linkinator` vs a `lychee`) — a P2 build-time choice (a `linkinator` is the leaning, a Node-stack fit; a `lychee` is a Rust-binary fit). *(Owner: infra; due: before P2 build start.)*
- **The 2.2-criterion exemption list** (a `WNFR-07` "the named set" vs a "the full 2.2 rule set" — this doc's §5 leans *named*; a full-rule-set axe run is the alternative, a P3 hardening). *(Owner: a11y; due: P2.)*
- **A real-device mobile budget** (a `WNFR-01` "the monthly real-device spot-check" — a `Lighthouse` mobile-emulation vs a *device* LCP delta is not yet *measured*; the 2.5 s LCP budget is an *emulation* number, a device number is a P2+ measurement, not a P2 claim). *(Owner: data; due: P2.)*
