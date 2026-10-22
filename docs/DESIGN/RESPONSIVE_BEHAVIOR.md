# VERCODE — Responsive Behavior

The app screens are worked-in at desktop-first (the study's 23 screens are all desktop). The phone is a *house rule* (the study has none), built from the skill's phone rules + what the desktop implies. The inspector (`inspect.mjs --app`) fails a sidebar that takes > 30% of a phone's width, so the fold is a hard gate.

## 1. The breakpoints

| Band | Width | Shell | Notes |
| --- | --- | --- | --- |
| **Desktop** | ≥ 1280 | Labelled sidebar (224–240px) + fluid canvas (gutter 24–40px, content 1120–1312px) | The reference width (1440) |
| **Laptop / MD** | 1024–1279 | Sidebar stays, canvas narrows; 2-column layouts hold until each would be < 340px, then **stack once** | |
| **Tablet** | 641–1100 | The sidebar **folds to a top bar** (a 48px bar: the screen's name + a menu button that opens a full-screen sheet: nav + org switcher + account + at most one action). Tables keep 4–5 columns with secondary fields as sublines. **Its own band** (a distinct composition, not a squashed desktop) | |
| **Phone** | ≤ 640 | The folded top bar (or a bottom bar of 4–5 short-label destinations); a 48px menu sheet; full-width blocks, 16–20px margins | |

**The rule (app-screens §12):** at every band, the *question* the screen answers is still answered, and the *primary action* stays reachable (44px min touch target). The tablet is *not* a phone-wider and *not* a desktop-narrower — it's its own composition.

## 2. The navigation fold

- **The labelled sidebar** (desktop) → **a 48px top bar + a full-screen sheet** (tablet/phone): the sheet holds the nav, the **org switcher**, the account row, and at most one action; it opens/closes on the menu button (a ⌘K-style keyboard toggle is *never* animated — Emil "never animate keyboard-initiated actions").
- **An icon rail** (if used for a 5-destinations monitoring view) → **a bottom bar** of 4–5 short labels.
- The fold is a **CSS transition on `transform`/`opacity`** (the sheet slides in from the left on the `--ease-drawer` curve, `cubic-bezier(0.32,0.72,0,1)`, 200–300 ms), never a layout shift (no `width`/`margin` animation, Emil "only animate transform and opacity").

## 3. The KPI / data strips

- A **divided KPI strip** (desktop, equal columns) → on phone: a **2-column grid** (an even count after any full-width lead) or a **divided list** (label left, value right). **Never four squeezed columns.** A lone "Sold 3.18 kWh" beside an empty half-row is a flagged tell — the last cell takes the full width for an odd count.
- **At most one row of controls above a chart** (an office select + a week switch share one row). Two stacked full-width segmented controls push the data down (a flagged tell).

## 4. Tables → lists (below ~640px)

A data table becomes a **list of two-line rows** (app-screens §12): the **identity + the key number on line 1**, the other fields the brief names in 13px grey on line 2 ("fra1 · 1m 38s"), the one action at the right. **Fields move to line 2; they're never dropped.** A table that *must* stay a table (the audit log, the rules table) **scrolls inside its own frame with the first column fixed; the page never scrolls sideways.**

| Screen | Desktop table | Phone list |
| --- | --- | --- |
| Reviews | PR · Repo · Verdict · Findings · Status · Cost · Updated | line1: PR + verdict-word; line2: repo · cost · status-reason (grey) |
| Members | Member · Email · Role · Last active · Actions | line1: initial+name + role-pill; line2: email · last-active |
| Findings | severity-mark · title · category · file:line · confidence · action | line1: severity-mark + title + file:line (mono); line2: category · confidence · action |

## 5. Filters & tabs on phone

- **Filters collapse** into one row of chips or a Filters sheet. **Tabs scroll sideways inside their own row, never the page.**
- **The first list row starts in the top 60% of the phone screen** (three rows of filter controls above it push the list off-screen — a flagged tell).
- **A chart** goes full width, 160–200px tall, 3–4 x-labels, a legend of dots above (a 2-column grid or a "Key" disclosure when it'd wrap to three lines). The y-ticks keep their own left lane (a tick label never sits on the line).

## 6. Blocks that carry an action

**Move up, not down, when they collapse:** a right rail with an action (the "failed reviews" queue, the "low stock / Reorder" analog) becomes **a one-line summary row above the list** ("5 reviews need attention · Review"), never a block twenty rows down. A detail region (a list + detail, the Reviews→detail) shows **one region at a time on phone**: choosing a row *pushes* the detail; back returns to the list at its scroll position.

## 7. Settings on phone

The **label column stacks above its panel** (the settings two-column → single column). A settings view (one area per route, the app-screens "one view per area" rule) keeps its h1 (the area's name) at 20–24px.

## 8. Touch targets & motion on phone

- **44px min touch targets** (a 32px control on desktop is a 44px hit area on phone — the *control* can stay 32px, the *hit area* is 44px).
- **Hover is gated** behind `(hover:hover) and (pointer:fine)` (no false hover on a touch tap, Emil).
- **A press is still `:active { scale(0.97) }`** (the feedback survives the fold).
- **`prefers-reduced-motion`** collapses the sheet/panel entrances to opacity-only (NFR-25), keeping the content.
- **The first row of a list** is reachable without a horizontal scroll; a horizontally-scrolling element (the review job history, the findings list) scrolls *within* its region, and the scroll is a native, non-animated swipe (no keyframe on a scrollable list).

## 9. The inspector's phone gate (1440 / 768 / 390)

`inspect.mjs --app` is run at all three widths on the *final* build; a FAIL at 390 (the sidebar > 30% of the width, a page that scrolls sideways, a first-row-pushed-off-screen) is a release gate (a `design` CI job, `DESIGN_SYSTEM §11`). The three screenshots are *looked at* (every width, every round, the app-screens §2.7 "judge the pictures" rule): a problem visible in a 390px screenshot is real, whatever the code says.

## 10. What does NOT change across breakpoints

- **The question the screen answers** (the verdict-lead on Overview, the severity-ladder on Security) — the *block* reflows, the *answer* doesn't move down the page as the width shrinks.
- **The data-honesty rules** (a zero prints, a missing value is a dash, a total is computed from the rows as shown) — the fold changes the *layout*, never the *truth*.
- **The token set** (one palette, one type, the tight radius, the severity ramp, the data hue) — responsive is a *composition* change, not a *style* change (the app-screens "keep the move to where it carries meaning" rule).
