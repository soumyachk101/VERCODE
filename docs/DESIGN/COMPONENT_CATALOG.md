# VERCODE — Component Catalog

The component inventory, with each component's variant/states and the design-system rules it must obey (`DESIGN_SYSTEM.md`). Components are built on **shadcn/ui** (Radix primitives) + **Lucide** icons, restyled to the VERCODE tokens; the shadcn defaults are a *starting point* that the anti-slop gate (`DESIGN_SYSTEM §9`) rewrites (shadcn's default shadow + 16px-radius + violet-ish accent are exactly the tells the gate removes).

**The two governing rules:** (a) colour on data, not chrome; (b) the motion/interaction layer follows `emil-design-eng` (only `transform`/`opacity`, custom ease-out, `:active` scale, `@starting-style`, `prefers-reduced-motion`).

## 1. Primitives (shadcn, restyled)

| Component | Variants / states | Rules VERCODE applies |
| --- | --- | --- |
| **Button** | `default` (near-black fill, white label, the one primary per screen), `secondary` (white + 1px border), `ghost` (a text action), `destructive` (a text/outline in the negative colour, consequence-named). Sizes: `sm`/`default`/`lg` (32px median). | One filled primary per screen. `:active { scale(0.97) }` 160 ms ease-out (Emil). Hover gated behind `(hover:hover) and (pointer:fine)`. A disabled control says *why* (the tier-gated "Upgrade to use" case). |
| **Badge / Pill** | A pale tint + dark same-hue ink (`--pill-*` pairs), 16–24px tall, 11–12px/500 text. A neutral monochrome chip with a glyph. | `flex:none; white-space:nowrap` (never squeezes). One status mark per row. A filled-white-text pill is reserved for the one CTA. |
| **Input / Select / Slider / Toggle / Switch** | 32–40px tall (forms 38–40, toolbar 28–40), 6–10px radius, 1px `--control` border, white fill even on a grey panel. A 28–32px toggle; on-colour a semantic green/near-black, *not* the brand accent. | A label above the field (14px/500), 8–10px gap, no floating labels. A leading 14px icon 13px in. One control height per context. |
| **Tabs (underline)** | On a full-width 1px rule; the indicator 1–4px (median 2), as wide as the label or running 8–11px past. | Sentence-case 12–14px, grey. Used for metric-switching ("reviews / cost"), not for navigation. |
| **Dialog / Popover / Tooltip** | A floating surface (a real shadow is allowed here — it's what *floats*), a 8–10px radius. | `:active` scale on the trigger; `@starting-style` enter from `scale(0.95)`+`opacity:0` (never `scale(0)`); a tooltip's transform-origin is its trigger (Emil "origin-aware popovers"). Skip the delay on a subsequent hover (Emil "tooltips: instant after the first"). |
| **Table** | A 12px grey sentence-case header (no band, no zebra), a 45px single-line / 72px two-line row pitch, 1px `--rule` dividers (one choice per screen). | Numbers right-aligned + tabular + fixed decimals + a sign on a change + a grey unit. The identity column is the widest, never the truncated one. Missing = a grey dash; a zero prints. |
| **KPI (the split strip)** | One container split by 1px hairlines into equal columns; label (12–14px grey, above) over value (24px ink tabular). The lead figure 30–36px (≥1.3× siblings). | **No icon in a coloured circle, no sparkline, no tinted tile** (the study: 0 of 23). A delta in words with the window; a zero/undefined change is grey / "+N (new)", never a green "+0". |
| **Card / Panel** | 1px `--border` (or a one-tone step) — a border OR a shadow, never both; a resting card has **no shadow** (shadows are for what floats). | Radius 8px (the tight family), 20px pad. A row of cards shares a bottom edge; a stretched card fills with content top + a footer action pinned to its foot (no blank band >40px, the inspector's `panel-void`). |
| **Chart (Recharts, configured)** | line / bars / ring / progress / bullet / barList / plan / diverging. | One hue per chart; the accent (data hue) on the main data element only. 2px straight lines, no markers (hover dot ok), ≤14% flat fill, 3–5 faint gridlines, no y-axis line, round even ticks above the max, no legend for a single series. Annotate the event that matters (a spike's 1px marker + 12px cause label). Data that tells the truth (a flat line drawn flat; a lone dot for a 1-point history). |
| **Empty state** | A 1px dashed box (radius 8, ~38px) or a frame + one sentence spanning the block. | Keeps the section's frame + header; "in-scope empty" keeps a fixed row count with one sentence in the empty cells; a first-run puts the first action where the data will appear. |
| **Toast / Banner** | A quiet notice (a pale amber *border*, never a ground — the inspector reads a pale amber ground as cream). | Interruptible (a CSS transition, not a keyframe, so a rapid stack retargets — Emil). A "Saved" stamp is quiet, not a toast storm. |
| **Command / Search** | A 30–36px search, a shortcut hint; a command palette (⌘K) over the org's actions. | A keyboard action (⌘K) is *never* animated (Emil's "never animate keyboard-initiated actions" — 100+/day actions get no entrance motion). |

## 2. The product-specific components (VERCODE's own)

These are the "one element only this product has" set (the face rule, `DESIGN_SYSTEM §3`):

| Component | What it is | Rules |
| --- | --- | --- |
| **SeverityMark** | The product's signature: a small filled square (3×3px inline, 6px in the rollup) in the severity colour. **The glance mark, not the sole signal** — always paired with the severity *word* (accessibility, colour-blind). | A 4-step intensity ramp (critical/high/medium/low + a distinct positive green, `DESIGN_SYSTEM §4.1`). Never a coloured chip with white text. Repeats wherever severity is shown (rollup, detail, the GitHub comment) — the identity. |
| **VerdictBlock** | The verdict word (a single large word: `Likely mergeable` / `Needs changes` / `High risk`) + the severity-marks counted + a one-line finding. | *Never* a coloured banner (a tell). Type + marks. Set 24px, the only large element on a review detail. |
| **PlanTrack (quota)** | The `Charts.plan`-style track: the plan length, the spent part filled, the committed part lighter, an overrun past the end in the negative colour, both ends labelled. | The cap the J4 journey warns about. The overrun is the *negative* colour (over-budget = bad, a "colour says good-or-bad" application). |
| **FindingRow** | The core list row: SeverityMark + title (ink) + category (grey) + file:line (mono, copy) + confidence (grey) + a suggested-fix toggle + a diff-context toggle + the action kebab (Accept/Dismiss/Mark fixed). | 48px pitch. The **action is one click away** (the north-star `finding_action`). The source tag (a quiet "static" / "AI" 12px grey note, *not* a coloured chip). |
| **JobStatusPill** | A review job's status as a pale pill + the *word of the trade + reason*: `published` / `skipped — quota reached` / `failed — GitHub rate-limited`. | A skip/failure is *never* silent (NFR-18); the reason is shown, not just "skipped". |
| **CommitHistory** | A PR's review job history by commit: a monospace SHA (8-char + copy), the verdict, the findings count, the cost, a status mark. | The idempotency story (a same-SHA re-review is an "Already reviewed at this commit" note, a new SHA is a new row). |
| **ProviderRoutingTable** | task | provider | model | max-tokens, with tier-gated rows (a disabled row + "Upgrade to use"). | The routing is admin-set within the plan tier; a gated control is legibly disabled + named. |
| **BYOKField** | A masked key field ("sk-…abcd"), active/inactive, Rotate + Revoke. | **The raw key is never shown** (FR-313); the set-key is a single-entry field KMS-wrapped on save; the last-4 is the only display. |
| **AuditRow** | timestamp | actor | action-verb | target | source IP (mono, 8-char + copy). | Append-only (no delete control in the UI, the integrity rule). |

## 3. Form-field & control tokens (the shared set)

```css
/* the control heights + the one-height-per-context rule */
--control-height: 32px;            /* toolbar / filter */
--control-height-form: 38px;       /* forms */
--control-radius: 6px;            /* tight family */
/* the toggle */
--toggle: 28px/16px on a 1.5px track; on-colour = --positive or --primary (a semantic, not the brand accent)
/* the focus ring (accessibility, a --control-step ring, always visible) */
/* the disabled (a legible, why-named state, not a 30%-opacity wash) */
```

## 4. Data-honesty rules every component follows (the trust builders)

From the app-screens "data that tells the truth" set (§2.1):
- **A fact shown twice is one variable** (a quota used in a banner + the PlanTrack is the *same* value, built from one source — two cards that disagree by a hair cost trust).
- **Totals and deltas come from the parts as shown** (sum the rounded pennies the screen displays; a change is the difference of the two on-screen values).
- **Every relative figure names its baseline** ("vs prior 30 days", not a bare "↑").
- **One name per time** (a "last reviewed" in two places uses the same words).
- **If a caption has to say which bars are which, encode it in the chart** (a marked period in a second tone + a legend entry, not a caption).

## 5. The build & gate

- shadcn/ui components are **restyled to the tokens** in a one-off pass (the shadcn defaults carry the tells the gate removes — the 16px radius, the soft shadow, the generic accent); the restyle is a *restyle* (the layout + the Radix primitives survive, the look changes, `design-taste` "reskin keeps the stack" rule).
- The `design-taste` `lint.mjs --app` (banned patterns + stock phrases) + `inspect.mjs --app` (the measured app rules, 1440/768/390) run as a **CI `design` job** on the built dashboard — the anti-slop rules are *checked, not hoped* (the skill's own words, `DESIGN_SYSTEM §11`).
- A new component that isn't in this catalog is a *design-review* item (it's added to the catalog + the tell-checklist before it ships).
