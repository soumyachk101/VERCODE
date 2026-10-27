# VERCODE — Design System

VERCODE's dashboard is an **app screen** (a workspace people work in), not a marketing page. The visual system is derived from the installed **design-taste-frontend** skill's app-screen chapter (`.agents/skills/design-taste-frontend/references/app-screens.md` — the study of 23 real product screens) and its anti-slop house rules, with motion/interaction per the **emil-design-eng** skill. The brief's direction: *premium, restrained, modern, developer-focused; no generic AI-dashboard aesthetic, no excessive gradients, no decorative empty space, no inconsistent spacing, no oversized cards.*

## 1. Design philosophy

The three rules that decide everything else (from the app-screens study's findings):

1. **Colour goes on data, not chrome.** The chrome (sidebar, panels, text) is near-achromatic; colour appears on the data that matters (severity, the usage figures, a delta), on status, and on the one primary action. Median screen: ~3% coloured pixels.
2. **KPIs are type, not tiles.** No icon-in-a-tinted-circle on a KPI, no sparkline on a KPI, no tinted tile. A KPI is a label over a number, in one container split by hairlines (or bare text).
3. **Surfaces are flat.** A 1px line or a one-tone step separates surfaces. No shadow on a resting card. No gradients (except an optional ≤14% area fade under one line chart). No glass, no glows.

**The face rule (the "not a kit" test):** a screen built from tokens alone reads as a template. VERCODE's face comes from the *product's own things* (the app-screens §2.3 warning):
- **One data hue.** VERCODE's accent is a single, deliberate hue reserved for *review-risk / usage-cost / the primary action* — the one data element a glance should land on. (Hue chosen in §4.)
- **One element only VERCODE has:** the **finding-severity ladder** — severity is the product's signature mark. A finding row encodes severity as a small square mark (a 3×3 px filled square in the severity colour) to the left of the title, never a coloured chip with white text. This mark, repeated in the rollup, the detail page, and the GitHub comment, is the product's visual identity. The competitor test: no other review tool encodes severity this way as its *primary* mark.
- **A figure face with character:** numbers are set in a real grotesk with **tabular figures** (the `tabular-nums` check is a release gate — a face whose digits don't actually align is rejected).
- **Words of the trade** in labels/empty states: "Waiting on reviewer", "Skipped — same SHA already reviewed", "No high-severity findings this week" — never the generic "Items", "Records", "Status".

## 2. Type

**One neo-grotesk** (the study: 14 of 23 screens use a single family). VERCODE: **Inter** (or the dealt typeface if a direction is dealt via the skill's `draw.mjs --app`), 400/500/600, plus **one monospace for IDs, SHAs, and code** (JetBrains Mono / the system mono) — the mono's *only* jobs are code and identifiers, never for axis ticks or prose.

App type is *not* display type:

| Role | Size (median from the study) | Weight |
| --- | --- | --- |
| Page title (h1, a **noun**, not a greeting) | **24** (range 18–32) | 600–700 |
| KPI / headline value | 24 (lead figure 30–36, ≥1.3× its siblings) | 400–600 |
| Card / section title | 16 | 500–600 |
| Body, nav, cells | 14 | 400 |
| Labels, meta, axis ticks | 12 | 400–500 |
| Pills / badges | 11–12 (house floor 11) | 500 |

A screen uses 4–9 sizes (median 6). No figure reaches 48px (that reads as a landing page — a flagged tell). Sentence case throughout; uppercase is banned for content labels and table headers.

## 3. The face & signature (VERCODE-specific)

- **Face:** a near-achromatic light ground (a cool off-white, not cream/terracotta — the "assistant palette" is banned) with a **single data hue** reserved for the main data element. VERCODE's hue is chosen to sit *outside* the severity palette (see §4) so it can't be confused with a severity.
- **Signature element:** the **severity mark** — a small square (3×3 px, or a 6px square for the rollup) in the severity colour, the product's identity mark, repeated wherever severity is shown. A review's *verdict* is also a signature: the verdict is set as a single large word (`Likely mergeable` / `Needs changes` / `High risk`) with its severity-marks counted beside it — not a coloured banner.
- **The product's mark** (top of the shell): a simple VERCODE monogram / symbol in the accent hue, never a black square with a letter; the org/workspace name sits beside it as the scope switcher.

## 4. Colour tokens

From the app-screens default tokens (the study's medians, with the greys moved to 4.5:1). VERCODE adopts the *tight* radius family (4–8px — developer tooling is crisp, not soft) and a **single data hue** to be finalized at build (a strong, non-violindigo hue; the banned families are violet/indigo and cream/terracotta).

### 4.1 Severity palette (data — the product's signature)

Severity is a 4-step **intensity ramp of one hue family** for the *risk* axis, plus a distinct *safe* green for "no issues". This keeps severity legible as a ladder, not a rainbow:

| Severity | Light | Dark | Mark |
| --- | --- | --- | --- |
| critical | `#c4242a` | `#e5566f` (on `#2c1a20` tint) | filled square |
| high | `#d97706` (amber-600, 4.5:1 ok) | `#f59e0b` | filled square |
| medium | `#2563eb` (a neutral-blue data mark) | `#3b82f6` | filled square |
| low | `#6b7280` (grey) | `#9ca3af` | filled square |
| no-issues / positive | `#247b50` | `#3fc07a` | filled square |

> **The rule:** severity colours are *data* marks — they appear only on findings and the verdict count, never on chrome. A screen with findings is the only place you'll see red.

### 4.2 Light theme (default)

```css
:root {
  --ground:   #f9fafb;   /* page */
  --surface:  #ffffff;   /* cards/panels */
  --raised:   #f9f9f9;   /* nested panel / well */
  --active:   #eeeeee;   /* nav pill / selected row */
  --border:   #e8e8e8;   /* card edges */
  --rule:     #f2f2f2;   /* row rules (one step lighter than border) */
  --control:  #d1d5db;   /* control borders (one step darker) */
  --text:     #111111;   /* primary ink */
  --muted:    #5f6368;   /* secondary (4.5:1) */
  --faint:    #6b6b6b;   /* placeholders (the lightest grey that holds on white) */
  --primary:  #1d1f20;   /* the one filled button: near-black, white label */
  --accent:   /* VERCODE's single data hue (finalized at build); ~3% of pixels */
  --grid:     #e5e5e5;   /* chart gridlines */
  /* severity ramp (4.1): --sev-critical --sev-high --sev-medium --sev-low --sev-positive */
  /* status pill pairs (pale tint + dark same-hue ink): */
  --pill-positive-bg: #dcfae5;  --pill-positive-ink: #04250e;
  --pill-negative-bg: #ffedea;  --pill-negative-ink: #831c1e;
  --pill-warning-bg:  #fffbeb;  --pill-warning-ink:  #92400e;  /* notice border #fde68a */
  /* radii (tight family): */
  --radius-card: 8px; --radius-control: 6px; --radius-chip: 4px;
  /* spacing (4px base): */
  --gap: 16px; --card-pad: 20px; --pad: 24px;
  --nav-row: 34px; --control-height: 32px; --row-height: 48px;
  /* type: */
  --font: "Inter", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
  --fs-title: 24px; --fs-section: 16px; --fs-kpi: 24px; --fs-body: 14px; --fs-small: 12px;
}
```

### 4.3 Dark theme (developer-first, supported)

```css
:root[data-theme="dark"] {
  --ground: #000000; --surface: #111111; --raised: #222222; --active: #222222;
  --border: #1a1a1a; --rule: #161616; --control: #444444;
  --text: #ffffff;   --muted: #b4b4b4;   --faint: #949494;   /* two greys that read apart */
  --primary: #ffffff;                     /* inverted: white fill, black label */
  --grid: #2b2b2b;
  /* severity + status tints per 4.1 dark column */
}
```

Dark is a **true neutral** (black + greys, lightness steps) — *not* a navy/slate tint (banned). Colour share ≤ 3%; colour is on data only.

## 5. Layout: the shell

**Archetype: "Open plane" or "Tinted frame, white sheet"** (the two most-studied shells, 13 of 23 screens). VERCODE uses a **labelled sidebar on the page ground** (no top bar, or a minimal 48px top bar that carries the search + scope switcher):

- **Sidebar:** 224–240px wide, on the page ground (never dark/saturated on a light screen). Rows: a 32px hit area on a 34px pitch (34px, median from the study), 16px outline icons (~1.5px stroke), a 14px/400 label 8–10px after the icon. **Active item:** a neutral grey pill (`--active`), radius 8, inset 8–14px — *not* a coloured left bar (a left bar appears once in 23 screens; it's a tell). Group labels: 12–13px sentence-case grey, 22–56px of air above. The **product mark + org/workspace switcher** at the top; a **user row** (or one quiet upsell) at the bottom.
- **Count on a nav item** only on a queue that needs action, with its noun clear: "Security 4", "Failed reviews 2" — never a bare number.
- **Canvas:** fluid, a 24–40px gutter, content ~1120–1312px wide. **One left edge** from header to last row (the strongest screens run a single left edge). The grid's arithmetic closes (write the sum in a comment: `3×372 + 2×17 = 1152`). No dead strip on one side, no card stopping short of the right edge.
- **Title row:** the screen's **noun** h1 at 24px/600, an optional 14px grey second line (the *finding* / the period / the scope — *never* "this page shows…"), actions on the right only when real (a freshness stamp "Reviewed 4:09 PM" + refresh, or the one primary). **One primary action per screen** (near-black fill); 12 of 23 screens have *no* filled primary at all — VERCODE's overview is read-first, its job-driven screens have one.

## 6. Component tokens & behavior

### 6.1 Buttons (the one filled primary)
- 32px tall (median 34; 32 is the commonest), 6px radius (tight family). One filled primary per screen (near-black `--primary`); a secondary is white + 1px border; a tertiary is a text action. Controls in one row share one height.
- **Press feedback (emil-design-eng):** `:active { transform: scale(0.97) }` on a 160 ms ease-out transition — a button must feel like it heard the press. *Hover* is gated behind `@media (hover:hover) and (pointer:fine)` (no false hover on touch).

### 6.2 Status pills / chips
- 16–24px tall (median 20), 11–12px text at 500, a **pale tint with dark text of the same hue** (the study's pairs, §4.2), optionally a 1px border one step darker. Neutral states are monochrome with a glyph. **`flex:none; white-space:nowrap`** (a chip must never squeeze to 12px). One status mark per row (a tag and a badge saying the same thing is a tell). A full filled pill with white text is reserved for the *one* call-to-action and used sparingly (when > ⅕ of rows carry it, it becomes a stripe of black blobs — use the pale pair instead).

### 6.3 Tables & lists
- **No zebra, no header band.** 12px grey sentence-case headers (regular weight); a rule under the header is the *strongest* line in the table. Row pitch: 45px (single-line data), 72px (two-line with media). **Numbers right-aligned, tabular figures**, fixed decimals (money 2, counts none), thousands separators, a sign on every change, units as a smaller grey suffix. The identity column gets the most width (⅓–½), never the truncated one at desktop. **Missing value = a grey dash; a real zero is printed.** "View all", never pagination, under an overview list; state the total ("3 tracks").

### 6.4 KPIs
- **No tile** — one container split by 1px hairlines into equal columns, label (12–14px grey, above) over value (24px, ink, tabular). The **lead figure** (the screen's answer) is 30–36px, ≥1.3× its siblings, and is the only largest number on the screen. **No icon in a coloured circle (0 of 23), no sparkline (0 of 23).** Deltas: optional, in words with the window ("vs prior 30 days"); **colour says good-or-bad, not up-or-down** (cost/latency/error falling is *good* → `--positive`/grey; rising → `--negative`); a zero/undefined change is grey or "+4 (new)", never a green "+0".

### 6.5 Charts (Recharts, configured to the study's rules — never library defaults)
- One hue per chart; the accent (data hue) on the *main data element* (today's series, the current period, the month's cost), not a secondary series. One series per chart; switch metrics with a control, don't overlay. 2px straight lines, no markers (a hover dot ok), no fill on most (or a ≤14% flat tint), 3–5 faint gridlines, no y-axis line, round even ticks *above* the max, x-labels flat (never rotated) on one step that lands on the end. No legend for a single series. **Annotate the event that matters** (a spike gets a 1px marker + a 12px label naming its cause, e.g. "PR #412 merge"). Data that tells the truth: a flat line is drawn flat (a 1-point history is a lone dot, not the screen's largest plot); a forecast is dashed after today.

### 6.6 Empty / zero / loading / error states (the study's §11, the states that build trust)
- **Real zero** prints in normal style ("0", "$0", "0%"). **Missing** = a grey dash (never a 24px "--" that reads as loading). **Empty section keeps its frame + header** + one sentence spanning the block (a 1px dashed box, radius 8, ~38px, "No high-severity findings this week"), never a dashed box in 400px of white. **Loading:** the final layout with each value a flat grey bar at its real size (no shimmer, no layout shift when data lands). **Error:** *inside the block that failed*, never a full-screen banner — one line ("Couldn't load usage. Last updated 09:14.") + a Retry text button; the negative colour only on a small icon. **Stale data:** a freshness stamp + refresh; a snapshot that can't refresh says so in a quiet notice (a pale amber *border*, never an amber *ground* — the inspector reads a pale amber ground as cream). **A first-run (whole screen empty):** keep the frame + title, put the first action where the data will appear (a "Connect GitHub to start reviewing PRs" state), with a true setup-progress if there are steps.

## 7. The marketing/landing surface (the *page* rules, not the app rules)

The sign-up/marketing pages (a page that's *read*, not worked-in) follow the skill's *page* run (`SKILL.md`), *not* the app rules: a dealt direction, a real idea from the subject (VERCODE's own thing: the **review verdict** as the hero device — a live, type-set "Needs changes · 2 high" line as the one large thing on the first screen), no icon-topped feature cards, no gradients, no eyebrow labels, no monospace outside code, no thin rules. The app and the page share *one palette and one typeface* (the skill's "a product site that shows its app" rule). These pages are out of the MVP's dashboard scope but the tokens stay shared.

## 8. Motion (emil-design-eng rules, the interaction layer)

Per the app-screens house rule: **app screens have no motion floor; motion is *feedback*, not entrance** (press, hover, focus, a menu/sheet opening, a row arriving — nothing *performs* an entrance). Still, every motion that exists obeys Emil's rules:

- **Only `transform` + `opacity`** animate (GPU; no layout/paint). No `transition: all` — specify the property (`transition: transform 160ms ease-out`).
- **Custom ease-out curves** (the built-ins are too weak): `--ease-out: cubic-bezier(0.23,1,.32,1)` for UI interactions; **never `ease-in`** on UI (it feels sluggish); a 125–200ms tooltip/dropdown, 200–500ms modal. **UI motion < 300ms** (a 180ms select feels faster than a 400ms one).
- **Nothing appears from `scale(0)`** (the real world has no zero-scale) — enter from `scale(0.95)` + `opacity:0`, via `@starting-style` where supported (replacing the `useEffect mounted` pattern).
- **`:active { scale(0.97) }`** on every pressable element (a button that doesn't respond to press feels dead).
- **Interruptible UI uses CSS transitions, not keyframes** (a toast list, a state toggle retargets smoothly; keyframes restart from zero).
- **Stagger** 30–80ms for multi-element enters (a finding list cascading in); stagger is decorative and never blocks interaction.
- **`prefers-reduced-motion`:** collapse to opacity-only crossfades (NFR-25); keep the colour/status transitions that aid comprehension, drop the travel.
- **Hardware-acceleration caveat:** if a motion library (Motion) is used for a genuinely interruptible spring, animate the full `transform` string (not the `x`/`y` shorthands, which run on the main thread and drop frames under load).

## 9. What this system forbids (the tell checklist, `lint.mjs` + review)

The design-taste skill's `lint.mjs` (run `--app`) and the app-screens "tells of generated dashboards" table (§14) are the gate. VERCODE's forbidden tells, checked in the design review + the CI lint:

- No dark-navy/tinted sidebar with a coloured active pill + left bar. No "Welcome back, Alex" greeting with an emoji. No four KPI cards each with an icon in a tinted circle + a green "+12.5%" + a sparkline. No gradient area chart with a smoothed spline + a dot per point. No rainbow palette / a hue per bar. No fat donut with slice labels. No card with a 16–24px radius + 1px border + a large soft shadow. No zebra table under uppercase tracked headers. No left-aligned proportional numbers. No saturated status chips with white text. No accent on every button/tab/link. No top bar with a search+bell+avatar on every screen (or one left 70% empty). No placeholder people/companies ("Acme", "John Doe"), no vanity totals ("10,000+ teams"), no totals that don't add up. No pagination under a short list. No orphaned four-up grid. No neon on dark / glows / glass. No violet/indigo accent, no cream+terracotta. No landing-page title (>32px) on an app screen, no 48px figure. No a screen that names no product and offers no action.
- **The positive floor (the other half of de-sloppifying):** removing the tells must *fill* the space with the product's real data, a screen that answers its one question first, and a grid whose arithmetic closes — not with more ornament. A clean-but-thin screen loses to a clean-rich one.

## 10. Accessibility (WCAG 2.1 AA, NFR-24)

- **Contrast:** every text tier reaches 4.5:1 on its surface (the study moved the default greys to 4.5:1 — `--muted`/`--faint` are tuned to this floor; a 2.5–3:1 grey that fails is a defect). Status pill pairs are dark-same-hue-ink-on-pale-tint (the study's pairs already pass).
- **Keyboard:** a visible focus ring (the app's `--control`-step ring), logical tab order, focus management on async data (a focusable region announces new findings).
- **`prefers-reduced-motion`** honored (NFR-25, §8).
- **Tables/lists:** real `<table>` semantics, a caption, `scope` on headers; numbers are screen-reader-readable (tabular figures don't affect the spoken value).
- **The severity mark is not colour-only:** a severity square is paired with the *text* "critical"/"high" (a colour-blind reader gets the word; the square is the glance mark, not the sole signal).

## 11. The "measure, don't hope" gate

The design-taste skill's `inspect.mjs --app` opens each screen at 1440/768/390 in a real browser and *measures* the app rules (h1 present, sidebar folds on phone, canvas used to the right edge, panel shadows/borders, corner-radius count, ragged rows, panel voids, icons-in-tinted-squares, numeric alignment + tabular figures, chart hues, colour share, `no-data-hue`, placeholder data, text under 11px). **Every FAIL is fixed; every WARN is defended in one sentence or fixed.** The run: build with motion off → inspect → fix → look at the screenshots (every width) → critique against the app-screens §2.7 seven questions → three rounds max. This gate is a CI step on the web app (a `design` job that runs `lint.mjs --app` + `inspect.mjs --app` against the built dashboard) so the anti-slop rules are *checked, not hoped* (the skill's own words).
