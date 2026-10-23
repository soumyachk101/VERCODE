# VERCODE Website — Design System & Typography

The website's visual system is **derived from `docs/DESIGN/DESIGN_SYSTEM.md`** but follows its **§7 "the *page* rules"** (the marketing/landing surface, NOT the app-screens study). The site's type scale, layout, and motion are the "product site that shows its app" pattern: **one shared typeface + one shared palette** with the dashboard, but a **page-appropriate** scale (a 48–72px hero is *allowed* on a marketing page — the app-screens "no 48px figure" ban is for *app screens only*, `DESIGN_SYSTEM.md §2`).

## 1. The shared vs. the site-specific

| Layer | Source | Shared? |
| --- | --- | --- |
| **Palette** (the `DESIGN_SYSTEM.md §4.2` tokens: `--ground`, `--surface`, `--ink`, `--severity-*`, the `--accent` data hue) | `packages/design-tokens` (a new ADR-0xx-4, `TECHNICAL_ARCHITECTURE.md §3`) | **yes** |
| **The severity ramp** (`DESIGN_SYSTEM.md §4.1`) | same | **yes** — the severity *marks* appear on the website only in the "how it works" + the social-proof examples (an embedded screenshot of a review detail), NOT as data on the marketing surface |
| **Typeface** (Inter, the `DESIGN_SYSTEM.md §2` "one neo-grotesk"; the site's mono is JetBrains Mono, only for code/SHAs) | the shared font (the `@fontsource/inter` self-hosted, the no-external-request rule) | **yes** |
| **Type *scale*** (the site's hero 64–72px, a card 20px, body 16px — the *page* scale, `DESIGN_SYSTEM.md §7`'s "the page rules") | `apps/website/src/styles/tokens.ts` (the site-specific half of the bridge) | **no** — the site has its own scale |
| **Layout** (the marketing: a centered, max-width 720px reading column for docs, a 1120px canvas for the hero/features, a 3-col pricing grid) | site-specific | **no** |
| **Motion** (the `emil-design-eng` rules, a *restrained* page motion: a one-time scroll-reveal, a hover on the CTA, NO the app's `@starting-style` row-expansion — the marketing page is *read*, not *worked-in*, `DESIGN_SYSTEM.md §7`) | site-specific, but constrained by the skill | partial |

## 2. Type scale (the *page* rules, `DESIGN_SYSTEM.md §7`)

The app's 24px-h1 rule does **not** apply. The marketing scale is:

| Role | Size (mobile) | Size (desktop) | Weight | Notes |
| --- | --- | --- | --- | --- |
| **Hero H1** | 40–48px | 56–72px | 700 | the "a dealt direction" line, the `PRD.md WFR-201` hero; a single sentence, ≤ 12 words; the *review-verdict device* sits beside/under it (a `DESIGN_SYSTEM §7` example, the "Needs changes · 2 high" line, in the *app* style, a small 16px verdict card, NOT the hero itself) |
| **Hero subhead** | 18px | 20px | 400 | the wedge (`SAAS_LAUNCH_PLAN §1`), 1–2 sentences |
| **Section H2** | 28px | 32px | 600 | a noun, "How it works", "Pricing", "Docs" — sentence case, `DESIGN_SYSTEM.md §2`'s "no uppercase" |
| **Section H3 / card title** | 18px | 20px | 500 | the "capability" cards, the pricing card headers |
| **Body (reading column)** | 16px | 16–17px | 400 | the docs + blog + changelog + FAQ; a 1.6 line-height; a max 72ch measure |
| **Meta / labels** | 13px | 14px | 500 | the "published", the "updated", the pricing card's "per month", the "from $X" |
| **Code / IDs / SHAs** | 14px | 14px | 400, the JetBrains Mono | the "how it works" code snippets, the docs' inline code; **mono is for code only**, `DESIGN_SYSTEM.md §2` |

**The "no landing-page tells" rule** (`DESIGN_SYSTEM.md §9` + `design-taste-frontend`'s page tells): the hero is *type, not gradient*; no eyebrow labels above an H2; no icon-topped feature cards (the "capability" section is a *numbered* list, not an icon grid); no "Trusted by 10,000+ teams" (a vanity total, the ban).

## 3. Layout

- **Hero:** a centered column (max 720px), the H1 + the subhead + the two CTAs (`PRD.md WFR-201`), and **beside/below** the H1 a *small* verdict device (a 16px, a "the review verdict" card that shows a real "Needs changes · 2 high" + a 3-line static analysis finding, a *static* image, NOT a live embed — the "shows its app" rule, `DESIGN_SYSTEM.md §7`).
- **How it works:** 3 steps, a *numbered* horizontal row (desktop) / a stacked vertical (mobile); each step is an H3 + 2 sentences; **no icons** (the `DESIGN_SYSTEM.md §7` ban), the *number* is the visual.
- **Capability:** 4 pillars (`README.md`'s "deterministic precision / evidence-backed / cost discipline / a workspace not a bot"), a 2×2 grid (desktop) / 1-col (mobile); each is a *text* card (H3 + 2–3 sentences), **no icon**, no tinted circle (`DESIGN_SYSTEM.md §1` "KPIs are type, not tiles" applied to features).
- **Pricing:** a 3–4 col card grid (Free / Developer / Team / Enterprise), each card: a plan name (H3), the price (a 32px tabular number, the `tabular-nums` face check, `DESIGN_SYSTEM.md §1`'s "a figure face with character"), a "per month / per review" meta, the quota (`USAGE_QUOTAS.md` verbatim), a **CTA button** (the one *filled* primary, `DESIGN_SYSTEM.md §5`'s "one filled button"), and a 5-line feature list. **No "most popular" star / ribbon** (a banned tell); the visual differentiation is a *single* border-color on the recommended plan (a 2px `--accent` border, NOT a tinted background).
- **Docs / blog / changelog:** a centered 720px reading column, a *screenshot* or a code block where the page needs one, a **TOC on the right** for docs > 3 sections (the `DESIGN_SYSTEM.md`'s "a right rail" pattern, a 240px TOC, a "on this page" link).
- **FAQ:** a *definition list* layout (a `dl`), **no accordion in P2** (an accordion is a client-side JS + a `details`/`summary` is *allowed* for the JSON-LD `FAQPage` "expanded" state — a `WFR-404` note; the *visible* answer is always expanded, the `details` is *only* a client-side toggle, the JSON-LD carries the full text regardless, `STRUCTURED_DATA.md §4`).
- **Footer:** 4 cols (Product / Resources / Company / Legal) + a *social* row (GitHub, X) — **no** newsletter form in P2 (`PRD.md §6`'s out-of-scope), a "status" link (`PRD.md WFR-406`), a "security" link (`/legal/security`, the public trust page).

## 4. Colour usage on the site

- **The `--accent` data hue** is used on: **the CTA button** (a near-black `--primary` is the *app* rule; the marketing CTA uses the `--accent` hue as the *one* coloured element on the page, a `DESIGN_SYSTEM.md §1` "colour goes on the one primary action" applied to the page), and **the recommended-pricing-card border**.
- **Severity colours** appear on the marketing surface **only** in an embedded screenshot / the verdict-device card (a *representation* of the app, not the site's data).
- **No** severity colour on chrome, no "10,000+ teams" green, no status-paint on a logo.

## 5. Motion

- **A scroll-reveal:** a one-time, 100ms, `opacity` 0→1 + `translateY` 8px on the 4 "capability" cards + the 3 "how it works" steps; a *CSS-only* `@starting-style` or an `IntersectionObserver` (a *restrained* `emil-design-eng` rule — the skill's "the page's motion is a dealt direction", a *single* subtle fade, NOT a cascade of bouncy spring animations).
- **The CTA hover:** a 100ms `opacity` 0.9→1 (a `DESIGN_SYSTEM.md` "a hover is an instant feedback, 100ms" rule).
- **No** other motion in P2 (a page *read* is not a page *worked-in*, `DESIGN_SYSTEM.md §7`).

## 6. The "no tells" checklist (the `DESIGN_SYSTEM.md §9` + the `design-taste-frontend` tells, applied to the *page*)

- [ ] No gradient hero background (a flat `--ground`).
- [ ] No icon-topped feature cards (the "capability" is a numbered list).
- [ ] No eyebrow labels above an H2.
- [ ] No "Trusted by [logo wall]" unless **real** logos (an *empty* section is *omitted*, `PRD.md WFR-202`).
- [ ] No "10,000+ teams" / "John Doe" placeholders (`DESIGN_SYSTEM.md §9`'s ban).
- [ ] No "most popular" star / ribbon on a pricing card.
- [ ] No glassmorphism / neon / glow.
- [ ] The hero is **type** (the `PRD.md WFR-201` "a live, type-set 'Needs changes · 2 high' line as the one large thing").
- [ ] The mono font is **only** for code/SHAs.
- [ ] A single left edge on the docs / blog reading column (the `DESIGN_SYSTEM.md §5` "one left edge" rule).
