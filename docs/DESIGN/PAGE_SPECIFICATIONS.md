# VERCODE — Page Specifications

Page-by-page design spec. Each page: its **one question** (the app-screens §2.2 rule), its blocks (each block answers a next question; a block with no question is deleted), its data source (real API, no fabricated data — FR-5xx), and its primary state. Design tokens per `DESIGN_SYSTEM.md`; the tell-checklist gate per `DESIGN_SYSTEM.md` §9.

Every page follows the shell: the sidebar (with the org switcher + attention counts) is constant; the canvas holds a **noun h1 at 24px** + an optional 14px grey finding/period line + the right-side actions (freshness stamp / the one primary). One left edge from header to last row; the grid's sums close.

---

## 1. Overview — `orgs/[org]/overview`

**Question:** "What needs my attention *today*?"

**Blocks (top → bottom, reading order):**

1. **The verdict-lead figure (the answer, biggest thing):** the *current* risk posture of the org — a single large figure: **"4 high, 2 critical"** (open findings above the floor, unactioned), set 30–36px, with the org's **verdict** word ("Needs attention" / "Clear") beside it and the severity-marks counted (the product's signature, `DESIGN_SYSTEM §3`). This is the *only* largest number on the screen.
   - *Data:* `GET /orgs/:id/security?since=now-24h` (open high/critical).
2. **The attention queues (the things to do):** two capped lists side by side (or stacked on a narrow canvas): **"Security"** (top unactioned high/critical, each a severity-mark + title + repo + a "View" that pushes the finding) and **"Failed reviews"** (skipped/failed jobs with their `skip_reason` — "quota reached", "GitHub rate-limited", the *word of the trade + reason*, app-screens §7). Each list ≤ 5 rows + "View all" + the total ("3 tracks").
   - *Data:* `GET /orgs/:id/security`, `GET /orgs/:id/reviews?status=skipped|failed`.
3. **The plan's quota strip (the "will I hit my cap" answer, the app-screens plan pattern):** a `Charts.plan`-style track — the plan length (the quota), the **spent part filled**, the **already-committed** part (queued reviews) as a lighter segment, an **overrun past the track's end** in the negative colour. Both ends labelled ("1,240 of 5,000 reviews"). This is where J4's "quota warning" lives (80% → a quiet `--pill-warning` strip above it, "Quota 80% — you've used 4,000 of 5,000 reviews this month").
   - *Data:* `GET /orgs/:id/usage?range=month` → `quota { used, limit, percentUsed }`.
4. **The cost/usage mini (the "am I getting value" answer):** one small line chart of **reviews/day** over the last 30 days (a `Charts.line`, the data hue on the line; a flat period drawn flat, a spike annotated with the PR that caused it — "PR #412: 200-file migration"). ⅔ width (a flat line doesn't earn the full width, app-screens §6.1); the **cost/PR blended** figure sits beside it (the KPI-in-its-card pattern, not a KPI tile).
   - *Data:* `GET /orgs/:id/usage?range=30d`.

**States:** first-run = "Connect GitHub to start reviewing PRs" (the install action, where the data will appear). In-scope-empty (no activity today) = "All clear today" with the verdict-lead figure a zero ("0 open findings above the floor") and the queues their designed zeros.

**The finding (the one line under the title, the thing that most needs attention):** e.g., "The last failed review was a quota skip — 4 reviews are queued behind your cap." (the screen's *finding*, not the interface, app-screens §2.2).

---

## 2. Repositories — `orgs/[org]/repositories` (+ `/[repo]`)

**Question:** "What's connected, and where's the risk concentrated?"

**List screen:** a table (the app-screens table rules: 12px grey headers, no zebra, numbers right-aligned tabular). Columns: **Repository** (the identity column, widest, the repo's full_name) | **Reviews (30d)** (right) | **Open high/critical** (right, the severity-mark next to a count) | **Last reviewed** (a relative date, "6 days") | **Status** (a pale pill: `connected` / `disconnected`). Cap 8 rows + "View all" + total ("12 repositories"). A **search** (30–36px tall) + a **status filter** (chips, one row) above the table; the first list row starts in the top 60% of the screen.

**Detail screen (`/[repo]`):**
1. **The repo's risk trend (the answer):** a finding-trend chart by category over 30 days (the *Marcus* path — "race conditions in `worker-service` trending up" reads as a rising category line, annotated at the spike). Data hue on the top category's line.
2. **This repo's open findings:** a capped list (≤6) of the repo's unactioned findings, each a severity-mark + title + PR link + a relative date, "View all" to the Reviews screen filtered to this repo.
3. **The last 5 reviews:** a compact list (PR #, verdict word, a date, a status mark), "View" → the review detail.
4. **The repo's rule state:** a quiet line naming its active custom rules (if any; "No repo-specific rules — using the org default" otherwise) + a "Manage rules" link (J3's "suppress a category for this repo" lands here → Settings → Rules, scoped to this repo).

---

## 3. Reviews — `orgs/[org]/reviews` (+ `/[repo]/[pr]` + `/[repo]/[pr]/[commit]`)

**Question:** "What did VERCODE find on *this* PR, and is it current?" (Priya's home)

**List screen:** a table of PRs (the identity column = the PR, "repo + #number + a short title"). Columns: **PR** | **Repo** | **Verdict** (the verdict *word*, not a chip: "Likely mergeable" / "Needs changes" / "High risk", set in the data-ink, the severity-marks counted) | **Findings** (a count + the severity-marks) | **Status** (a pale pill: `published` / `skipped — reason` / `failed — reason` — the *word of the trade + reason*, app-screens) | **Cost** (a right-aligned tabular `$0.18`) | **Updated** (relative). Filters: repo, status, severity, a date range (one row of chips, the app-screens "at most one row of controls above the list" rule).

**PR detail (`/[repo]/[pr]`):** the PR's **review job history by commit** — a vertical list of commits (a monospace SHA, 8-char truncated + copy icon, 12px after, app-screens §7.4), each with its verdict + findings count + cost + a status mark. The **latest commit's job** is expanded by default (the current review); older commits are collapsed ("This commit was re-reviewed after a force-push"). The most-frequent job (**Re-review**, US-105) is a primary button in the title row (one click away, app-screens §2.2) — it enqueues a new job for the head SHA; a same-SHA re-review is an idempotent no-op (a quiet "Already reviewed at this commit" note).

**Review detail (`/[repo]/[pr]/[commit]`):** the deep-work screen.
1. **The verdict header (the answer, biggest thing):** the verdict word at 24px + the severity-marks counted + a one-line **finding** ("2 high findings — an SQL injection and an unhandled null") + the **cost** + a **published-to-GitHub** link ("View on GitHub"). The verdict is *never* a coloured banner (a tell); it's type + the severity marks.
2. **The findings list (the core, the product's signature):** each finding is a **row** (48px pitch): the **severity mark** (a small square, the product's identity) + **title** (ink) + a **category** (a 12px grey, "security", "logic-bug") + **file:line** (a monospace, "payments.ts:84", with a copy) + **confidence** (a 12px grey "0.82") + a **suggested-fix** (an expandable `<details>` or a toggle that reveals the fix code block, in the mono). A **diff-context** toggle reveals the finding's diff hunk (the 2-line "expand to see the diff context" US-210). A filter row (severity / category chips) above the list; the list shrinks to its filtered rows (app-screens §11 — a filtered block keeps its frame, one sentence in the empty cells).
   - **The action (the north-star, one click away):** each finding row has a **kebab / text action** "Accept · Dismiss · Mark fixed" (the `finding_action`, app-screens §7.8 — one trailing action column, at the same pitch, never muted grey, never stacked under the amount). This is what feeds the actioned-finding metric (SUCCESS_METRICS north-star).
3. **The static-vs-AI split (the deterministic-first story):** the findings are grouped or tagged by `source` (a quiet "from static analysis" / "from AI" mark — *not* a coloured chip, a 12px grey note). This shows *why* the review is trustworthy (ADR-005's product story): the deterministic findings are there even if the AI stage degraded (a `partial` job shows "AI stage degraded — static findings still published", the error state *inside the block*, app-screens §11).
4. **The summary narrative:** the AI's top-risks list + verdict narrative (a `<p>` at statement size, ≤36px, ~25 words, app-screens §8 "statements are paragraphs").

**States:** a `skipped` job shows its **reason** prominently (the quota notice, "Quota reached this month — this review was skipped. Upgrade or reduce review volume." + a "View usage" link) — a skip is *never silent* (NFR-18, the "failures are observable" rule, DEFINITION OF DONE #12). A `partial` job shows which stages degraded. A "Loading" state = the final layout with each value a flat grey bar at its real size (no shimmer, no layout shift).

---

## 4. Security — `orgs/[org]/security`

**Question:** "What's the most serious risk in my org right now?" (Marcus's home)

1. **The severity ladder (the answer):** a compact **severity-marks count** — critical / high / medium / low open findings, each a severity-mark + a big tabular number + a "since" window selector (the app-screens "count follows the view" rule — recompute on the window switch). The *lead* figure is the critical+high count (30–36px).
2. **The rollup table:** the open high/critical findings, columns: **Severity** (the mark) | **Title** (ink, widest) | **Category** (grey) | **Repo** | **PR** (a link to the review detail) | **Actioned?** (a pale pill: `actioned` / `waiting on reviewer` — the *word of the trade*) | **Found** (relative date). Cap 8 + "View all". **Red is a signal, not a texture** (app-screens §11): one red mark per object, on the *overdue/failing* fact; the table doesn't repaint every high row in red.
3. **The trend:** a 30-day line of high/critical findings (the *rising-trend* Marcus sees, annotated at the spike).
4. **The "actioned" rate (the north-star, shown):** a small figure + a delta-in-words ("Actioned rate 21% — up 4 pts vs prior 30 days", the delta's window named, app-screens §5) — the metric the product is actually optimizing for.

**States:** "No high or critical findings yet" (a designed zero, not the absence of the screen — app-screens §11). An empty window ("Nothing above *high* this week" — the filter names itself).

---

## 5. Usage & billing — `orgs/[org]/usage` + `/billing`

**Question:** "Am I getting value, and will I hit my cap?" (Aisha/Dana)

**Usage screen:**
1. **The cost/PR blended (the answer, the lead figure):** a big tabular "$0.14 / review" + a delta-in-words ("down 8¢ vs prior 30 days", cost falling = *good* → `--positive`/grey; the app-screens "colour says good-or-bad, not up-or-down" rule).
2. **The reviews/day + cost/day dual view:** one line chart (reviews) with a *secondary* tone for cost (or a toggle to switch the metric, app-screens §6.1 "to show another metric, switch it with a control" — don't overlay two hues for one subject). A spike is annotated with the PR ("200-file migration, +40 reviews").
3. **The by-provider breakdown (a `Charts.barList`):** reviews by model/provider, thin grey bars, the top in the data hue.
4. **The quota track (the cap):** the `Charts.plan` track (the Overview's, repeated here in full), both ends labelled.

**Billing screen:**
1. **The plan state (the answer):** the current plan + status (a pale pill: `active` / `past_due` / `canceled`), the renewal date, the "effective" note (a "Upgrading to Team — confirmed at next invoice" state persists until the verified webhook confirms it — the AC-403 rule surfaced in the UI).
2. **The invoices list:** a table (date, amount, a right-aligned tabular amount, a status pill, a "Download" text action).
3. **The upgrade/downgrade/cancel controls:** a segmented plan selector + an "Upgrade" primary + a "Cancel at period end" (a destructive action, *last*, in its own section, the consequence in words + a confirmation that names the object — app-screens §8.2). **A client request initiates the provider flow; the plan change only lands on the verified webhook** (the "Upgrading…" state is honest, never claimed complete from a client claim, AC-403).

**States:** a zero-spend month shows a **$0.00** (a real zero, app-screens §11), not a dash. A `past_due` state is a quiet notice strip (a pale amber *border*, never an amber ground — app-screens §11 "a notice tint is never a ground").

---

## 6. Rules & AI — `orgs/[org]/settings/rules` + `/settings/providers`

**Question:** "How is the review tuned for my team?" (Rahul)

**Rules screen (settings layout, app-screens §8.2: a label column ~450px + a panel ~700px, split by 1px rules):**
1. **The confidence floor** (a labelled control + a live-preview: "Findings below 0.6 are hidden — preview: 3 findings in your last 20 reviews fall below this"). A range/slider (a 28–40px control) + the preview (the app-screens "show what the setting produces" rule).
2. **The suppressed categories** (a toggle list, one per `FindingCategory`; a toggle 28–32px, the on colour a semantic green/near-black, *not* the brand accent — app-screens §8.1).
3. **The per-repo overrides** (a table: repo | the overrides in force | "Manage" — versioned, audit-logged on change).
4. **The save model:** one "Saved" stamp per control that autosaves (quiet, not a toast storm), or one Save per panel — *one model per view* (app-screens §8.2).

**Providers screen:**
1. **The provider + task routing** (a table: task | provider | model | max-tokens; a "routing" that's admin-set within the plan tier — a team-plan org *can't* pin `security-review` to an Enterprise-only model, the tier gate surfaced as a disabled row + a "Upgrade to use" note).
2. **The BYOK key** (a masked field "sk-…abcd", active/inactive, a "Rotate" + a "Revoke" — the raw key is *never* shown, FR-313; the "set a new key" flow is a single-entry field that's KMS-wrapped on save).
3. **The "fallback" state** (a quiet note naming the configured fallback provider).

**States:** a tier-gated control is *legibly* disabled + says why (the app-screens "a disabled control says why it's disabled" rule — a 30%-opacity locked panel is a flagged tell; VERCODE's is readable + named).

---

## 7. Team & audit — `orgs/[org]/settings/members` + `/settings/audit` + `/settings/account`

**Question:** "Who did what, and who has access?" (Aisha/Rahul)

**Members screen:** a table (the identity column = the member, a stable initial + a pale per-person hue tint, app-screens §2.3 "people as themselves" — two people ≥60° apart in hue), | Email | **Role** (a pale pill; the owner's role is the one-owner, transfer is atomic + named) | **Last active** | **Actions** (a "Change role" + a "Remove" — the owner's removal is guarded by the LAST_OWNER rule, surfaced as a 409 → "Transfer ownership first" note). The **invite** action is a primary in the title row (US-003).

**Audit screen:** a table (the timestamp, the actor, the **action verb** ("review.published", "role.changed", "byok.rotated"), the target, the source IP (a monospace, 8-char truncated + copy)). Filters: action-type, actor, a date range. **Append-only, no delete path** (the integrity rule, `DATABASE_DESIGN §7` — the UI reflects it: there's no delete on an audit row).

**Account screen:** the profile (name, email), the **sessions list** (device, IP, last-active, a "Sign out" per row + a "Sign out everywhere"), the **theme** (light/dark/system, a segmented control), the **password** (a change that revokes sessions, `AUTHENTICATION §4`), the **deactivate** (a destructive, last, consequence-named).

---

## 8. Cross-page invariants (the gate, `DESIGN_SYSTEM §9` + `§11`)

- One left edge per screen; the grid's sums close; no dead strip; cards in a row share a bottom edge (a stretched card fills with content top + a footer action pinned to its foot, *not* a blank band).
- Numbers right-aligned, tabular, fixed decimals, a sign on a change, a unit in grey.
- Colour only on data/status/one-primary; a screen with charts carries the data hue on its main element (`no-data-hue` is a FAIL).
- A real zero prints, a missing value is a dash, an empty section keeps its frame.
- The *finding* (the thing that most needs attention) is the line under the title, not a 14px caption at the bottom (app-screens §2.2).
- **The `inspect.mjs --app` gate** (a CI job): 0 FAIL at 1440/768/390; the app-screens §2.7 seven questions answered in writing per screen; three critique rounds max. A screen that only renders correctly with full data is half-built (the states are built + looked at, app-screens §2.6).
