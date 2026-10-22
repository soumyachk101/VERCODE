# VERCODE — Accessibility

WCAG 2.1 AA as a hard requirement (NFR-24). Accessibility is not a late pass — it's a gate (the `inspect.mjs --app` + a separate axe/keyboard audit in CI) and it's baked into the tokens (`DESIGN_SYSTEM §10`).

## 1. Contrast (the first and most measurable rule)

- **Every text tier reaches 4.5:1 on its surface.** The design system's default greys were *moved to pass 4.5:1* (the app-screens study did this: `--muted`/`--faint` are tuned to this floor, `DESIGN_SYSTEM §4.2`). A 2.5–3:1 grey that *looks* fine but fails is a defect, not a judgment call.
- **Placeholders** (the `--faint` tier, ~#6b6b6b on white) hold at 4.5:1 — a placeholder that a screen reader / low-vision user can't read fails.
- **Status pill pairs** are *dark-same-hue-ink-on-pale-tint* (the study's pairs already pass 4.5:1: `#04250e` on `#dcfae5`, `#831c1e` on `#ffedea`). A saturated fill with white text is reserved for the one CTA (the rare, high-contrast case).
- **The severity ramp** (the product's signature, `DESIGN_SYSTEM §4.1`) is an *intensity* ramp of one hue family, so severity is distinguishable by *lightness* as well as hue (a red-green deficient user still sees the critical→low step). And **severity is never colour-only** — the SeverityMark square is always *paired with the word* "critical"/"high"/"medium"/"low" (the mark is the glance signal; the word is the accessible signal).
- **Dark theme:** `--text: #fff` on `#000` (21:1), `--muted: #b4b4b4` / `--faint: #949494` (two greys that *read apart*, the app-screens "two greys at most, far enough apart" rule). A #4c4c4f (~2:1) tertiary is *banned* in the dark theme (it's a flagged tell).

## 2. Keyboard (the whole app is keyboard-usable)

- **Tab order** is logical (the DOM order = the visual order; no `tabindex` greater than 0, no positive tab indices).
- **A visible focus ring** on every focusable (the app's `--control`-step ring, ~2px, offset 1px — a resting card's border is not the focus ring, so the two are distinguishable). A focus ring that's only a *colour* change (no outline) fails.
- **Focus management on async data:** when a new set of findings loads into the review detail, focus moves to a focusable region (the list) that announces "N findings loaded" (a `role="status"` / `aria-live="polite"` region — a screen reader is told the data arrived, not just re-scrolled).
- **No keyboard traps** (a dialog traps focus inside; Esc closes it; focus returns to the trigger on close). A dropdown/command palette (⌘K) is fully keyboard-driven (arrow to move, Enter to select, Esc to close) — and a keyboard-initiated action (⌘K toggle) is *never* animated (Emil's rule, `RESPONSIVE_BEHAVIOR §2`), which is also the *faster* keyboard experience.
- **Skip-to-content:** the org shell (the sidebar) has a skip link to the canvas (a screen reader user doesn't tab through the entire sidebar on every page).

## 3. Screen readers (semantics, not just labels)

- **Real HTML semantics:** a `<nav>` for the sidebar, a `<main>` for the canvas, a `<table>` with `<caption>` + `scope` for data tables, a real `<form>` for settings, a `<button>` (not a styled `<div>`) for every action. A *styled* control that isn't a `<button>`/`<a>` in the DOM is an axe failure.
- **Announcements:**
  - The **actioned-finding** toggle ("Accept · Dismiss · Mark fixed") announces the state change ("Finding 'Unvalidated SQL input' marked fixed" via `aria-live`).
  - A **quota change** (the 80% banner appearing) is a polite live region ("Usage is now 80% of this month's quota").
  - A **skip/skipped-review notice** is announced (a "review skipped — quota reached" row is not a silent absence; the screen reader gets the reason).
- **Labels:** every input has a `<label>` (the "label above the field, 14px/500" rule, `COMPONENT_CATALOG §1`). An icon-only control (the kebab, the copy) has an `aria-label` ("Copy commit SHA").
- **Chart access:** Recharts exposes a data table alternative — a chart that says "reviews/day, rising then flat" has an equivalent text/table for a screen reader (a "View data as a table" toggle, or a `<figure>` with a `figcaption` + an adjacent visually-hidden data table). **A number that's only in a chart is not accessible** — the KPI/figure is always in the DOM text (it *is* the text, the chart is the visualization).
- **The severity word** is in the DOM (the SeverityMark square is decorative + aria-hidden; the "critical"/"high" text carries the meaning).

## 4. Motor / touch / reduced-motion

- **44px min touch targets** on phone (the control can be 32px, the hit area is 44px, `RESPONSIVE_BEHAVIOR §8`). No hover-only interactions (a hover-gated hover state is *supplemented* by a focus state, so a touch user has the equivalent).
- **`prefers-reduced-motion`:** all motion collapses to opacity-only crossfades (NFR-25, `DESIGN_SYSTEM §8`). The "final layout with a grey bar" loading state works without motion (it's a *layout*, not an animation). A reduced-motion user still gets *content* (a "no travel, just fade" mode), not a broken blank screen (Emil: "reduced motion = fewer and gentler animations, not zero — keep opacity and colour transitions that aid comprehension").
- **No motion-required interaction:** a drag-to-dismiss, a swipe-gesture, or a timed interaction has a non-gestural alternative (a button, a tap). The finding-list's stagger enter is *decorative* (never blocks interaction, Emil "stagger is decorative").

## 5. The forms & settings (the highest-error surface)

- **Error messages name the field + the fix** ("Password must be at least 8 characters", associated via `aria-describedby`, not a colour-only red border — a red border *with* the message). A form that only shows a red border is inaccessible.
- **The save model is announced:** an autosave control's "Saved" stamp is a polite live region (a screen reader user hears the save, not just sees a stamp). The "one save model per view" rule (`COMPONENT_CATALOG §2`) keeps the announcement consistent (either every control autosaves-and-stamps, or one Save per panel — not both, which would confuse the announcement timing).
- **A disabled control says *why*** (the tier-gated "Upgrade to use" row: `aria-disabled` + a visible "Upgrade to use" text, not a 30%-opacity wash that a screen reader reads as "disabled, no reason"). The app-screens "a disabled control says why it's disabled" rule is also an a11y rule.
- **The destructive-action confirmation** (delete org, cancel, revoke BYOK) is a *named* confirmation ("Confirm you want to cancel your subscription — your plan ends at period end") in a real dialog (a `role="alertdialog"`, focus-trapped, a confirm button labelled with the action).

## 6. The CI gates (accessibility is *checked, not hoped*)

| Gate | Tool | Rule |
| --- | --- | --- |
| **Static a11y** | axe-core (Playwright `@axe-core/playwright` or the `jest-axe`/vitest-axe) on every page + component | 0 critical/serious violations on the rendered dashboard (contrast, labels, roles, focus) |
| **Keyboard-only** | A Playwright spec that navigates + acts on the top 5 journeys (J1–J5) using *only* keyboard + a screen-reader-equivalent (focus order + `aria-live` announcements asserted) | A journey that's unreachable by keyboard fails |
| **Reduced motion** | A Playwright run with `prefers-reduced-motion: reduce` emulated | Content still appears (no blank/hidden-on-reduced-motion state); a motion-gated interaction has its alternative |
| **Screen-reader data** | An axe + a manual `aria-live` assertion on the key announcements (findings-loaded, actioned, quota-change) | A data change the screen reader can't perceive fails |

## 7. The "what we don't do" list (the a11y anti-patterns)

- **No colour-only signal** (severity, status, an error) — always paired with a word/shape/icon.
- **No `title`-attribute-only labels** (a `title` on an icon with no `aria-label`/`<label>` is a common axe miss).
- **No auto-playing motion** (a "one moving picture" on the marketing page is a *paused* loop with a poster, not an autoplay; on the dashboard, no ambient motion at all — app screens have no motion floor, `DESIGN_SYSTEM §8`).
- **No a table whose only structure is visual** (a data table is a real `<table>`; a "card grid" of data is a list with `role` + a data-table alternative).
- **No an alt text that's "image of" or "logo"** (an alt describes the *content*; a logo's alt is the product name, "VERCODE").

## 8. The release gate

A release candidate passes only with: axe 0 critical/serious, the keyboard journey green, the reduced-motion run green, and the key announcements asserted. Accessibility regressions are **P0** (a screen reader user who can't complete a journey is a *product* failure, not a polish item) — a regression blocks the release the same as a security test.
