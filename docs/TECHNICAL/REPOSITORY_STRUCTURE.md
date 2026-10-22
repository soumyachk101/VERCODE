# VERCODE — Repository Structure

The monorepo layout, mapped to the brief's `PHASE 8` and adapted to what already exists (`packages/contracts`, `scripts/`, `.agents/`).

```
VERCODE/
├── package.json                # monorepo root (exists) — pnpm 9, node>=22
├── pnpm-workspace.yaml         # (exists) apps/* + packages/*
├── tsconfig.base.json          # (exists) strict + NodeNext + verbatimModuleSyntax
├── eslint.config.mjs           # (create) flat config, typescript-eslint, @max-warnings 0
├── .env.example                # (create) placeholders only
│
├── apps/
│   ├── web/                    # Next.js dashboard (create)
│   │   ├── app/                # App Router routes
│   │   ├── components/         # shadcn/ui + app components
│   │   ├── lib/                # api client, hooks, token/theme utils
│   │   ├── styles/             # design tokens (from DESIGN/DESIGN_SYSTEM.md)
│   │   └── package.json
│   ├── api/                    # Fastify API (create)
│   │   ├── src/
│   │   │   ├── server.ts       # Fastify bootstrap + plugin registration
│   │   │   ├── routes/         # grouped by domain (auth, orgs, github, reviews, usage, billing, audit)
│   │   │   ├── middleware/     # auth, tenant, rate-limit, audit, error
│   │   │   ├── services/       # domain services
│   │   │   ├── webhooks/       # github + billing webhook handlers
│   │   │   └── config.ts
│   │   └── package.json
│   └── worker/                 # BullMQ consumer + pipeline runner (create)
│       ├── src/
│       │   ├── index.ts        # worker bootstrap
│       │   ├── queues.ts       # queue + DLQ definitions
│       │   └── jobs/           # review-job, retention-job, billing-rollup-job
│       └── package.json
│
├── packages/
│   ├── contracts/              # (exists, extend) Zod schemas + plans.ts
│   │   ├── src/
│   │   │   ├── index.ts        # (exists)
│   │   │   ├── plans.ts        # (create) Plan, PlanQuota, planQuota, *_QUOTA
│   │   │   ├── findings.ts     # (split out) ReviewFinding/Summary/Job schemas
│   │   │   ├── webhooks.ts     # GitHub + billing event schemas
│   │   │   └── api.ts          # request/response payload schemas
│   │   └── package.json        # (create)
│   ├── database/               # Prisma schema + client + tenant repos (create)
│   │   ├── prisma/schema.prisma
│   │   └── src/ (repositories, migrations)
│   ├── github/                 # App auth, webhook verify, diff fetch, publish (create)
│   ├── diff-engine/            # pure diff parser + line map (create)
│   ├── static-analysis/        # ESLint + Semgrep runners (create)
│   ├── ai-providers/           # provider interface + adapters + routing (create)
│   ├── review-engine/          # orchestration (create)
│   ├── policy-engine/          # confidence/suppression/quota policy (create)
│   ├── billing/                # plan state machine + provider webhooks (create)
│   ├── observability/          # logging/tracing/redaction (create)
│   └── config/                 # env parsing, model routing table, rates (create)
│
├── infra/
│   ├── docker/                 # Dockerfiles + compose (create)
│   └── deployment/            # deploy manifests (create)
│
├── tests/
│   ├── fixtures/              # diff fixtures, injection fixtures, benchmark set
│   │   └── benchmark/         # known-bug + clean examples + scoring
│   ├── integration/           # webhook, queue, provider, tx, publish, payment, tenant
│   ├── e2e/                   # Playwright
│   └── security/              # forged webhooks, cross-tenant, injection, secrets
│
├── docs/                       # (this documentation package)
│
├── scripts/                    # (PRESERVE — owner infra)
│   ├── auto_sync.sh
│   ├── run_loop.sh
│   └── auto_sync.log
│
└── .agents/                    # (PRESERVE — installed skills)
```

## Rules

- **`verbatimModuleSyntax` + `NodeNext`:** every relative import ends in `.js`. This is the #1 typecheck failure source; CI's `typecheck` catches it.
- **No module imports another module's internals.** Cross-package communication is via `packages/contracts` types or a package's public export. A `lint` rule (import-boundary) enforces it.
- **`scripts/` and `.agents/` are frozen.** New tooling goes elsewhere; the auto-sync daemon must keep working.
- **`packages/contracts` is the single source of truth** for finding/job/plan/webhook shapes. Every other package imports *from* it, never re-declares.

## Package dependency graph

```
contracts ──▶ (everyone)
config ────▶ observability, ai-providers, policy-engine
github ────▶ contracts, config
diff-engine (pure)
static-analysis ─▶ contracts
ai-providers ───▶ contracts, config
review-engine ──▶ diff-engine, static-analysis, ai-providers, policy-engine, contracts
billing ───────▶ contracts, config
database ──────▶ contracts
worker ────────▶ review-engine, github, database, config, observability
api ───────────▶ database, github, billing, config, observability, contracts
web ───────────▶ contracts (types only)
```

A cycle here is a defect; CI fails on it.
