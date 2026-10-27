# VERCODE Website — Unresolved Decisions (tracking)

The *live* open decisions for the VERCODE public website, the ones `PRD.md §8` ("Unresolved Decisions (Carried into `UNRESOLVED_DECISIONS.md`)") names and the `ROADMAP_AND_ACCEPTANCE_CRITERIA.md`'s **Part C decision log** formalizes. This file is the *tracking* artifact (owner + deadline + the state), not the *roadmap* — the U1–U7 table with the options/leaning/owner/due-gate columns is in `ROADMAP_AND_ACCEPTANCE_CRITERIA.md` Part C; this file holds the *decision state* each U-item needs to close.

> **The two-file split, and why it's not a duplication.**
> - `ROADMAP_AND_ACCEPTANCE_CRITERIA.md` Part C = the **decision log** (a *formal table* of the 7 open decisions, mirrored from `docs/TECHNICAL/ARCHITECTURE_DECISIONS.md`'s ADR structure). It answers *"what is the decision, and when must it close?"*
> - This file (`UNRESOLVED_DECISIONS.md`) = the **tracking sheet** (one entry per U, its owner + deadline + the *exact* ADR number that will record it when it's decided). It answers *"who owns it, and when does it unblock the build?"*
>
> `PRD.md §8` is the *source of truth for the questions*; this file is the *source of truth for the state*; the *resolved* decision lands in `docs/TECHNICAL/ARCHITECTURE_DECISIONS.md` as the next `ADR-0xx` (`TECHNICAL_ARCHITECTURE.md §7`, `ADR-0xx-1`–`-6`), and only then is the U-item *removed* from this tracking sheet.

## The U-item → ADR → gate map

| U | The decision | ADR (to be recorded) | Owner | Due gate (`SAAS_LAUNCH_PLAN §5`) | State |
| --- | --- | --- | --- | --- | --- |
| **U1** | Hosting topology: a separate `website` vs. a route inside `apps/web` | `ADR-0xx-1` (`TECHNICAL_ARCHITECTURE.md §7`) | infra | before P2 build start (WP1 entry gate) | **open, leaning yes** (a separate app) |
| **U2** | Content store: `content/` + `next-mdx` vs. an `Astro` collection | `ADR-0xx-2` | frontend | before P2 build (WP1 entry gate) | **open, leaning yes** (`content/` + `next-mdx`) |
| **U3** | Status page: an external link + thin `/legal/status` vs. a self-hosted `/status` | a one-line infra decision (`TECHNICAL_ARCHITECTURE.md §8`'s "deliberately does not decide") | infra | before P2 (WP3 entry gate) | **open, leaning (a)** (external link + thin page) |
| **U4** | Analytics: a first-party cookieless beacon only vs. a self-hosted Plausible/Matomo | a one-line data decision (`TECHNICAL_ARCHITECTURE.md §8`) | data | P2 (WP4 entry gate) | **open, leaning (a)** (cookieless first-party only; Plausible is P3) |
| **U5** | The *exact* prod domain (`vercode.com`) | a one-line infra decision (`TECHNICAL_ARCHITECTURE.md §8`, `VERCODE_WEBSITE_BASE_URL` in §6) | infra | P2 (the launch prereq, `SAAS_LAUNCH_PLAN §7`) | **open** (a placeholder `*.vercode.dev` dev + `vercode.com` prod; the *exact* domain not yet in the repo) |
| **U6** | The `llms.txt` scope: a minimal fact-list vs. a full product-fact graph | `ADR-0xx-5` | SEO | P2 (WP4, `W-AC-09`) | **open, leaning (a)** (a minimal `/llms.txt` + a `/llms-full.txt` concatenation) |
| **U7** | The AEO test lane: a manual monthly sample vs. an automated CI job | `ADR-0xx-6` | data | P3 (post-launch, `SAAS_LAUNCH_PLAN §8`) | **open, leaning (b)** (an automated nightly GCP-hosted LLM call + a JSON snapshot, P3; a P1 decision per `PRD.md §8`, a P3 due-gate per `TECHNICAL_ARCHITECTURE.md §7` + the PRD's `Owner/due: P3`) |

> **The `ADR-0xx` numbers.** The exact `ADR-0xx` index (the next free number after `ADR-011`, `docs/TECHNICAL/ARCHITECTURE_DECISIONS.md`) is assigned *at resolution time*; `TECHNICAL_ARCHITECTURE.md §7` lists them as `ADR-0xx-1`–`-6` placeholders. U3 + U4 + U5 are *one-line infra/data decisions* (the `TECHNICAL_ARCHITECTURE.md §8` "deliberately does not decide" list) and may close without a formal ADR; U1/U2/U6/U7 *record* into the `ADR-0xx` set.

## The per-U entries (the state, one per open decision)

**U1 — Hosting topology.** Options: (a) a *separate* `website` Next.js 15 static-export app; (b) a *marketing* segment inside the existing `apps/web`. **Leaning: (a)** — a separate app decouples the two surfaces' perf budgets (the dashboard `NFR` budget ≠ the website `WNFR` budget, `PERFORMANCE_AND_ACCESSIBILITY.md` + `PERFORMANCE_AND_ACCESSIBILITY.md`) and lets the website *fail independently* (a website deploy doesn't touch the dashboard; the `OPERATIONS/DEPLOYMENT.md` "the 3 independently-deployable units" become 4, `TECHNICAL_ARCHITECTURE.md §1`). **Blocker:** this is the **WP1 entry gate** — `website` can't be scaffolded (WT1.1, `ROADMAP_AND_ACCEPTANCE_CRITERIA.md` Part A) until U1 is closed. **Due:** before P2 build start. **Owner:** infra.

**U2 — Content store.** Options: (a) `content/` repo dir + `next-mdx-remote` + a `zod` contract (`CONTENT_SCHEMAS.md`); (b) a static `Astro` content collection. **Leaning: (a)** — pins the stack to `TECHNICAL_ARCHITECTURE.md §3` (a single Next.js app, a new `packages/contracts` file); a *live* CMS is explicitly P3 (`PRD.md §6`'s "no CMS in MVP"). **Blocker:** this gates WT1.3 (the `content/` store + the `CONTENT_SCHEMAS.md` contracts) — the content pipeline (WP3) is impossible until U2 is closed. **Due:** before P2 build. **Owner:** frontend.

**U3 — Status page.** Options: (a) an external status service (a Statuspage-style, a launch prereq, `SAAS_LAUNCH_PLAN §5`) + a thin `/legal/status` that embeds the dashboard; (b) a self-hosted `/status` page. **Leaning: (a)** — a status page is a *separate service* (`PRD.md §6`'s "a status page — a link to one is P2; the page is a separate service"), and a self-hosted `/status` is out of the website's P2 scope. **Blocker:** this is the **WP3 entry gate** — `/legal/status` (`WFR-406`) needs a target URL. **Due:** before P2 (WP3). **Owner:** infra.

**U4 — Analytics.** Options: (a) a first-party cookieless beacon only (`WFR-504`); (b) a self-hosted Plausible/Matomo. **Leaning: (a)** — the DPDP posture (`SECURITY/PRIVACY.md`) + a cookieless first-party beacon is the P2 default; a self-hosted Plausible is a **P3** option. **Blocker:** this gates WT4.2 (the `/api/track` beacon) — the beacon's *design* (cookieless vs. Plausible) can't be locked until U4 is closed. **Due:** P2 (WP4). **Owner:** data.

**U5 — Domain.** The *exact* prod domain. **State:** not in the repo yet; P2 assumes a `*.vercode.dev` (dev) + `vercode.com` (prod), both owned by the infra team. `VERCODE_WEBSITE_BASE_URL` (`TECHNICAL_ARCHITECTURE.md §6`) is the env var that consumes the decision; it's a `SAAS_LAUNCH_PLAN §3` launch prereq (the domain is a P2 gate, `SAAS_LAUNCH_PLAN §7`). **Blocker:** a launch prereq — a `vercode.com` that's not owned is a *blocked* launch (a "blocked — requires [external]", `SAAS_LAUNCH_PLAN §7`'s honest mark). **Due:** P2. **Owner:** infra.

**U6 — The `llms.txt` scope.** Options: (a) a minimal `WFR-401` fact-list; (b) a `llms-full.txt`-style full product-fact graph (a file per domain). **Leaning: (a)** — a minimal `/llms.txt` + a `/llms-full.txt` that *concatenates* the full product facts (the `SEO_AEO_GEO.md §4` decision; the `W-AC-09` triple-source rule is *satisfied* by the minimal file, not the full graph). **Blocker:** this gates WT4.3 (the `llms.txt` + `llms-full.txt` builders). **Due:** P2 (WP4). **Owner:** SEO.

**U7 — The AEO test lane.** Options: (a) a manual monthly LLM-answer sample (`PRD.md §7` KPI #3, "manual sampling, monthly"); (b) an automated CI job that calls a named LLM + checks its answer for VERCODE-correct facts. **Leaning: (b)** — an automated nightly GCP-hosted LLM call + a JSON snapshot, a **P3** decision (a post-launch addition, `SAAS_LAUNCH_PLAN §8`; the `ADR-0xx-6` ADR, `TECHNICAL_ARCHITECTURE.md §7` "a P3"). **Blocker:** none in P2 (the P2 KPI #3 measurement is the manual sample, `PRD.md §7`; U7 is the P3 automation). **Due:** P3. **Owner:** data.

## The closing rule (how an U-item leaves this file)

- An U-item is **removed** from this file only when its decision is *recorded*: U1/U2/U6/U7 as an `ADR-0xx` in `docs/TECHNICAL/ARCHITECTURE_DECISIONS.md` (the `TECHNICAL_ARCHITECTURE.md §7` list, `ADR-0xx-1`–`-6`); U3/U4/U5 as a one-line decision in `TECHNICAL_ARCHITECTURE.md §8`'s "deliberately does not decide" list.
- A U-item that's **past its due gate** without a recorded decision is a **measured P2/P3 blocker** (`SAAS_LAUNCH_PLAN §7`'s "a launch that's blocked on a prerequisite is marked blocked, not claimed launched"); it is *reported* in the launch report as a blocker, not silently deferred.
- **No out-of-band resolution** — an U-item that's "decided in the standup" but not in an ADR or in `TECHNICAL_ARCHITECTURE.md §8` is *still open* (a `RELEASE_CRITERIA`'s "a decision that's not in a doc is a deviation, `TECH_STACK.md`'s own honest rule" applied to U-items).

## The next concrete task

The next concrete task for *this file* is not a build task (it's a tracking doc); it's: **the P1 live-integration gate (gate-13, `SAAS_LAUNCH_PLAN §5 P1`) turning green** — the moment that happens, WP1/WT1.1 starts, and **U1 + U2 must be closed** (they're the WP1 entry gates, this file's "Blocker" rows). The build sequence itself is `ROADMAP_AND_ACCEPTANCE_CRITERIA.md` Part A + D (the WP1–WP4 tasks + the status + the next-concrete-task block).
