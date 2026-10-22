# VERCODE — Information Architecture

The dashboard's navigation and page topology, organized around the five persona paths (`USER_PERSONAS.md`). Each screen answers **one question first** (the app-screens §2.2 rule) — the IA is built from the questions, not from a template's stock order.

## 1. The question each top-level destination answers

| Destination (sidebar) | The one question | Persona home |
| --- | --- | --- |
| **Overview** | "What needs my attention *today*?" | Dana (cost/usage), Aisha (quota) |
| **Repositories** | "What's connected, and where's the risk concentrated?" | Marcus (trends) |
| **Reviews** (PR list → detail) | "What did VERCODE find on *this* PR, and is it current?" | Priya (the daily loop) |
| **Security** | "What's the most serious risk in my org right now?" | Marcus (triage) |
| **Usage & billing** | "Am I getting value, and will I hit my cap?" | Aisha / Dana |
| **Rules & AI** | "How is the review tuned for my team?" | Rahul (config) |
| **Team & audit** | "Who did what, and who has access?" | Aisha / Rahul |

The sidebar order is the frequency order (Priya's daily path first, the config/admin paths last). A count appears on a nav item *only* on a queue that needs action, noun-clear: **"Security 4"** (high/critical findings unactioned), **"Failed 2"** (skipped/failed reviews needing a look) — never a bare number.

## 2. The shell & navigation

- **Sidebar (labelled, on the page ground):** the product mark + **org switcher** at the top; the 7 destinations above (each a *screen*, never an anchor into one long page); utilities (Settings) pushed to the bottom; the **user row** (avatar + name + a "sign out" action) at the very bottom.
- **No global top bar** on most screens (9 of 23 in the study have one, but VERCODE's screens recede the chrome). Where a screen has a control row (search, date range, a primary action), it's in the *title row*, not a chrome bar.
- **Org switcher:** switching org re-scopes every screen (the tenancy layer, `TENANT_ISOLATION.md`); the switcher shows the org name + plan badge ("Team"), and a "switch to another org" only when the user has >1.
- **Breadcrumbs:** only on detail pages (Reviews → a PR → a commit's review). The last crumb is the h1.

## 3. Page topology

```
/                        → sign-in / sign-up (the marketing/landing surface is a *separate* app surface, the page-rules of DESIGN_SYSTEM §7)
/orgs/[org]
  /overview               (default landing on first sign-in)
  /repositories
    /repositories/[repo]
  /reviews                (all PRs, filterable by repo/status/severity)
    /reviews/[repo]/[pr]  (a PR: its review job history by commit)
      /reviews/[repo]/[pr]/[commit]   (one review job: findings, summary, cost)
  /security               (org-wide rollup, severity-filtered)
  /usage
  /billing                (plan, invoices, upgrade)
  /settings
    /settings/rules       (org + per-repo custom rules)
    /settings/providers   (AI provider + routing + BYOK)
    /settings/members     (members, roles, invitations)
    /settings/audit       (audit log)
    /settings/account     (profile, sessions, sign-out-everywhere, theme)
```

**Detail pages are where a persona lives** (Priya in a review detail, Marcus in the security rollup). A *list* screen caps its rows and links to the detail ("View all"); a detail page is the deep-work surface.

## 4. The five persona paths (mapped to `USER_JOURNEYS.md`)

- **Priya (J2):** sign-in → default to **Overview** (her open PRs with their review status) → **Reviews** → the PR's latest commit → **review detail** (read the verdict, open a finding, apply the fix) → a "Re-review" action (US-105) enqueues a new job. Her most-frequent job (act on a finding) is one click from the detail screen (the app-screens "most frequent job is one click away" rule).
- **Marcus (J3):** **Security** → filter high/critical → open a finding (→ the PR + diff context) → mark "actioned" (a `finding_action`, feeds the north-star metric) → **Repositories** → a repo's finding-trend chart (category drill) → **Settings → Rules** → suppress a noisy category *for that repo*.
- **Dana/Aisha (J4):** **Usage & billing** → cost/PR + reviews/day trend (the "spike" is annotated with the PR that caused it) → the **quota strip** (a `Charts.plan`-style track: the plan length, the spent part filled, the committed part lighter, an overrun past the end in the negative colour) → an 80% banner → **Billing** → upgrade (a provider flow; the plan shows "Upgrading…" until the verified webhook confirms it).
- **Rahul (J5):** **Team & audit** → audit log (filter "permission changed") → a webhook-health indicator → **Settings → Providers** → rotate a BYOK key (masked display; the old key deactivates). He validates against `SECURITY_TEST_PLAN.md`.
- **New org (J1):** sign-in → **create org** → **Overview**'s empty state: "Connect GitHub to start reviewing PRs" (the first action, where the data will appear — the app-screens first-run rule) → the GitHub install flow → **Repositories** populates → a PR → the first review detail.

## 5. Empty-state IA (a screen with no data is still a designed screen)

Every destination has a **first-run** state (the whole screen empty) and an **in-scope-empty** state (a filter/period with nothing). The frame + title stay; the *first action* sits where the data will appear:

| Screen | First-run empty state | In-scope empty |
| --- | --- | --- |
| Overview | "Connect GitHub to start reviewing PRs" + the install action (the org's one onboarding step) | "No reviews in this period" + the range control |
| Repositories | "No repositories connected yet" + "Install the App" | "No repos match this filter" (the filter, not the frame, is emptied) |
| Reviews | "No pull requests reviewed yet — open a PR on a connected repo" | "No reviews for this repo this period" |
| Security | "No high or critical findings yet" (a designed zero, not an absence of the screen) | "Nothing above *high* this week" (the filter names itself) |
| Usage | A zeroed usage strip + the plan's quota track (the quota is visible even with 0 spend — it's the *plan*, not the data) | "No usage in this range" |

The rule (app-screens §11): **an empty section keeps its frame and its header** + one sentence spanning the block (a 1px dashed box, ~38px tall). A *real zero* prints as a zero ("0 reviews", "$0.00"), never as a dash that reads as loading; a *missing* value is a grey dash.

## 6. What the IA deliberately does NOT do

- **No single "home" that's a wall of KPI cards.** Overview answers *one* question ("what needs attention today") with the severity-lead figure + the attention queues (Security N, Failed N), not a KPI grid (the app-screens "7 screens have no KPI row and put each headline number in the card that explains it" pattern).
- **No pagination under a list.** Cap the rows, "View all" (a link to the full list screen), state the total.
- **No multi-pane complexity in MVP** (a list + detail is the one two-region screen, the Reviews→detail). A list that drives a detail pane: selecting a row *pushes* the detail (mobile) or shows it in a right rail (desktop, a fixed 384px column starting level with the first card — the study's one right-rail pattern).
- **The org switcher is the only scope control that changes the tenancy.** A repo/PR filter *narrowing* within an org is a query, not a scope change.

## 7. Naming & "words of the trade"

Labels use the product's own vocabulary (app-screens §2.3): **"review"**, **"finding"**, **"verdict"**, **"severity"**, **"actioned"**, **"quota"**, **"install"** — never the template nouns "items/records/status". A status is named for its *meaning*: a skipped review shows **"Skipped — quota reached"** (the word of the trade + the reason), not "error"/"skipped". The audit log's actions are verbs of the product ("review.published", "role.changed", "byok.rotated").
