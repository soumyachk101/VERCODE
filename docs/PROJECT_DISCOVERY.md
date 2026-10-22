# Project Discovery — VERCODE

> Phase 0 artifact. Captured before any feature development begins.
> Discovery date: 2026-10-22.

## 1. Repository State

The repository is a **scaffold-stage project**, not an empty repo and not a finished app.

What exists:

| Path | Status | Notes |
| --- | --- | --- |
| `package.json` | Present | Monorepo root, pnpm 9, Node >= 22, `verbatimModuleSyntax` toolchain |
| `pnpm-workspace.yaml` | Present | `apps/*` and `packages/*` workspaces; both directories are empty |
| `pnpm-lock.yaml` | Present | Root dev deps only: eslint, typescript, vitest, @types/node |
| `tsconfig.base.json` | Present | Shared compilerOptions (strict, ES2022, NodeNext) |
| `packages/contracts/` | Present, partial | Only `src/index.ts` — shared Zod schemas for findings/jobs + re-export of a **missing** `./plans.js` module |
| `scripts/auto_sync.sh` | Present | Auto-PR sync daemon (user infrastructure, **preserve**) |
| `scripts/run_loop.sh` | Present | Loop runner for the sync daemon (**preserve**) |
| `scripts/auto_sync.log` | Present | Log artifact of the daemon |
| `.agents/skills/**` | Present | 16 installed agent skills (design-taste-frontend, emil-design-eng, animation skills, etc.) — these are the design tooling the owner explicitly wants used for UI work |
| `.gitignore` | Present | Covers node_modules, dist, .env, logs, agent workspaces |

What does **not** exist yet:

- No `apps/` (web, api, worker) — empty.
- No `packages/` beyond `contracts` — no database, review-engine, github, ai-providers, static-analysis, policy-engine, billing, observability, config packages.
- No `docs/` prior to this package (this directory tree is being created now).
- No `infra/`, no `tests/`.
- No GitHub App, no CI workflows, no Dockerfiles.

## 2. Framework / Runtime / Tooling

- **Runtime:** Node.js >= 22 (per `engines`).
- **Package manager:** pnpm 9 workspaces (`pnpm-workspace.yaml`), lockfile v9.
- **Language:** TypeScript strict mode, `module: NodeNext`, `verbatimModuleSyntax: true` — all imports must use explicit `.js` extensions for relative paths (ESM-style). This is a hard constraint that every package must respect.
- **Linting:** ESLint 9 + typescript-eslint, root script `lint` targets `packages/**/*.ts` and `apps/**/*.ts` with `--max-warnings 0`.
- **Testing:** Vitest 3 at root; Playwright not yet installed.
- **Frontend stack:** Not yet chosen in code, but the project brief prescribes Next.js App Router + Tailwind + shadcn-style components + Zod + Recharts. No package.json entries exist for this yet — it must be created under `apps/web`.
- **Backend stack:** Prescribed Fastify + Prisma + PostgreSQL + Redis/BullMQ. No code yet.

## 3. Existing Application Behavior

There is no running application. The only executable behavior in the repo is `scripts/run_loop.sh` → `scripts/auto_sync.sh`, which polls the working tree every 60 s and opens+merges a PR if `git status --porcelain` is non-empty. **This is the owner's sync infrastructure and must not be modified or deleted.**

The `packages/contracts/src/index.ts` file defines the shared vocabulary the rest of the system will speak:

- `FindingSeverity` ∈ {low, medium, high, critical}
- `FindingCategory` ∈ {logic-bug, security, performance, race-condition, resource-leak, api-contract, db-consistency, edge-case, assumption}
- `ReviewFinding`, `ReviewSummary`, `ReviewJob` (statuses: queued/running/succeeded/failed/skipped), `ReviewRequestPayload`
- Re-export plan quotas: `FREE_QUOTA`, `DEVELOPER_QUOTA`, `TEAM_QUOTA`, `ENTERPRISE_QUOTA` — **these live in `./plans.js`, which does not exist yet.** This is the first concrete gap to close.

## 4. Technical Debt and Constraints

1. **Broken import in `contracts/src/index.ts`:** `import ... from "./plans.js"` — module missing. Must create `packages/contracts/src/plans.ts` (compiled as `.js` under NodeNext) defining `Plan`, `PlanQuota`, `planQuota`, and the four quota constants.
2. **No `package.json` inside `packages/contracts`** — the workspace entry exists in the lockfile implicitly only because the root covers `packages/*`, but the package itself has no manifest, no tsconfig, no entry exports.
3. **`tsconfig.base.json` uses NodeNext + verbatimModuleSyntax** — every relative import in all packages/apps must end in `.js`. This is the single most common cause of typecheck failures; the implementation plan encodes it explicitly.
4. **Auto-sync daemon** can create merge commits on top of work-in-progress. All implementation must be committed to `main` in logical units; in-flight work that sits in the tree for minutes may be auto-merged. Prefer small, frequently-saved commits.
5. **`pnpm-workspace.yaml` has `allowBuilds: esbuild: set this to true or false`** — a placeholder comment that should be resolved to a real boolean (likely `true`, since Next.js/esbuild postinstalls need to run) before any heavy install.

## 5. External Services Requiring Credentials

| Service | Purpose | Credential | Blocking? |
| --- | --- | --- | --- |
| GitHub | GitHub App + webhooks + Octokit | `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET` | Blocks live webhook flow; development possible with mocked GitHub |
| PostgreSQL | Primary store | Managed DB URL | Blocks persistence; SQLite fallback not acceptable per spec |
| Redis | BullMQ queue | Managed Redis URL | Blocks async review pipeline |
| OpenAI | AI provider (primary) | `OPENAI_API_KEY` | Blocks live AI review; provider layer supports offline/mock mode |
| Stripe (or Rajatko/Razorpay for INR market) | Billing | Provider keys | Billing can be stubbed in dev; webhook endpoint needed for real payments |
| Sentry / OpenTelemetry Collector | Observability | DSNs | Non-blocking |

No credentials currently exist in the repo. `.env.example` must be created with placeholders only (no secrets), per Phase 7.

## 6. Design Tooling Installed (Owner-Explicit)

The owner's instruction calls out using the installed skills for UI work:

- `design-taste-frontend` — full design-taste system: references (layout, type, color, critique, tells, scenes), a library JSON corpus (palettes, heroes, sections, motions, app screens), plus scripts (`lint.mjs`, `draw.mjs`, `inspect.mjs`, `assets.mjs`, `scenes.mjs`). The web app's visual identity should be derived from this system rather than generic SaaS defaults.
- `emil-design-eng` — Emil Kowalski's motion/interaction craft rules: animation decision framework, custom easing curves, duration budgets (<300 ms UI motion), hardware-acceleration rules (`transform`/`opacity` only), `@starting-style`, `clip-path` patterns, `prefers-reduced-motion`, and a review format (Before/After tables). All frontend motion and micro-interaction work must follow this.
- Supporting skills: `apple-design`, `break-ui` (destructive-pattern catalog), `improve-animations`, `review-animations`, `animation-performance`, `pick-ui-library`, `ask-sonner`, `prototype`, `write-swift` (irrelevant for web), `mobile-native` (irrelevant for web), `find-animation-opportunities`.

These are used during Phase 2+ design-system work and throughout frontend implementation.

## 7. Decisions Recorded at Discovery

| # | Decision | Rationale |
| - | --- | --- |
| D-0 | **Preserve** `scripts/auto_sync.sh`, `run_loop.sh`, `.agents/**`, `skills-lock.json` | Owner's sync daemon + installed skill set; deletion is explicitly forbidden |
| D-1 | Brand name **VERCODE** is already established in `package.json` (`"name": "vercode"`, description "AI-powered code-review SaaS (monorepo root)") | Original brand per brief; keep it |
| D-2 | Monorepo layout: `apps/{web,api,worker}`, `packages/{contracts,database,github,review-engine,diff-engine,ai-providers,static-analysis,policy-engine,billing,observability,config}`, `infra/`, `tests/` | Matches brief; `packages/contracts` already exists |
| D-3 | Modular monolith + async workers; no microservices | Per brief Phase 2 |
| D-4 | UI motion and visual system sourced from `design-taste-frontend` + `emil-design-eng` skills | Owner's explicit instruction |
| D-5 | Node 22, pnpm 9, TS strict/NodeNext, ESLint 9, Vitest 3 | Already pinned in the repo |

## 8. Next Concrete Step

Create `packages/contracts/src/plans.ts` to fix the broken import, then the full documentation package under `docs/`.
