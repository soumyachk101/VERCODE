# VERCODE Monorepo Structure — Prompt

> **Output format:** PNG (rendered from SVG source; keep the SVG on disk as the
> source of truth, export at 2× scale for crispness). Save to
> `docs/assets/repository.png`. The SVG stays at `docs/diagrams/repository.svg`
> (note: this diagram lives under `docs/diagrams/`, not `docs/assets/`).
> **Canvas:** 1020 × 580. PNG export: 2040 × 1160 px.

---

## Title bar

```
VERCODE — Monorepo Structure (pnpm workspaces)
TypeScript strict · Node 22 · shared contracts package as single source of truth
```

---

## Root workspace card (centered, top, x = 380, y = 80, 260 × 60)

- Orange top strip, `#f59e0b` border
- Bold text: `vercode (pnpm workspace root)`
- Sub: `pnpm-workspace.yaml · ESLint 9 · Vitest 3`

Two arrows down from this card:
- Left arrow → Apps column, labeled `deployables`
- Right arrow → Packages column, labeled `shared packages`

---

## Apps column (left, blue top strip, x = 50, y = 196, 310 × 264)

Header badge: `APPS/` (blue)

3 inner cards (each 278 × 48, light grey fill, 1 px border, stacked with 10 px gap):

| Card title | Sub text |
| --- | --- |
| `apps/web` | Next.js 15 App Router · React 19 · Dashboard UI |
| `apps/api` | Fastify 5 · Webhooks · REST · RBAC Auth · Prisma |
| `apps/worker` | BullMQ Consumer · 12-Stage Review Pipeline |

---

## Packages column (right, purple top strip, x = 390, y = 196, 580 × 264)

Header badge: `PACKAGES/` (purple)

4 rows × 3 columns of inner cards (each ~170 × 46, light grey fill):

| Row 1 | `contracts` — Zod schemas (SSOT) | `github` — App auth · diff · publish | `database` — Prisma · tenant repos |
| Row 2 | `diff-engine` — pure diff parser | `static-analysis` — ESLint + Semgrep AST | `ai-providers` — LLM adapters + routing |
| Row 3 | `review-engine` — pipeline orchestration | `policy-engine` — floors · quotas · skip | `billing` — plans · provider webhooks |
| Row 4 | `observability` — logs · traces · redact | `config` — typed env · model routing | *(empty)* |

Title of `contracts` card is purple-filled to mark it as the SSOT.

---

## Bottom row (3 cards, y = 482, 52 px tall)

| Card | Sub text |
| --- | --- |
| `infra/ (Docker · Compose)` | Dev stack & production manifests |
| `tests/` | Unit · integration · e2e · security suites |
| `docs/` | Product · technical · security · operations |

Plus a purple callout card on the far right (190 × 52, x = 780):
- Bold: `CORE ARCHITECTURE RULE`
- Sub: `All packages import from contracts`

---

## Arrows

- Grey 1.5 px lines with arrow markers from the root card to the two columns
- Two labels on the arrows: `deployables` (left) and `shared packages` (right)

---

## Caption to place above the diagram in the README

```
The monorepo is organized as a pnpm workspace. Three deployable apps
(`web`, `api`, `worker`) consume a set of shared packages. The
`contracts` package — holding all Zod schemas — is the single source of
truth that every other package imports from; this prevents silent
schema drift between the API, the worker, and the dashboard.
```
