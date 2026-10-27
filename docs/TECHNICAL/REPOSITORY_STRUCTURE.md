# VERCODE — Repository Structure

The monorepo layout, mapped to the brief's `PHASE 8` and adapted to what already exists.

```
VERCODE/
├── package.json                # monorepo root — pnpm 9, node>=22
├── pnpm-workspace.yaml         # apps/* + packages/* + website
├── tsconfig.base.json          # strict + NodeNext + verbatimModuleSyntax
├── eslint.config.mjs           # flat config, typescript-eslint, @max-warnings 0
├── vitest.workspace.ts         # root vitest config (per-package suites)
├── Makefile                    # dev/CI task entry points
├── auto_sync_worker.sh         # owner sync-daemon launcher (frozen)
├── skills-lock.json            # installed design skills (frozen)
├── lockfile-diff.json          # pnpm-workspace allowBuilds drift record
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── SECURITY.md
├── LICENSE.md
├── README.md
│
├── apps/
│   ├── web/                    # Next.js dashboard (App Router)
│   │   ├── app/                # routes (signin, overview, reviews, repositories,
│   │   │   │                    #   usage, settings/{github,account,providers,rules,
│   │   │   │                    #   members,audit}, …)
│   │   │   ├── components/     # shadcn/ui + app components
│   │   │   ├── lib/            # api client, hooks
│   │   │   └── styles/         # design tokens (from DESIGN/DESIGN_SYSTEM.md)
│   │   └── package.json
│   ├── api/                    # Fastify API
│   │   ├── src/
│   │   │   ├── main.ts         # Fastify bootstrap
│   │   │   ├── server.ts       # app wiring
│   │   │   ├── queue.ts        # BullMQ enqueue side
│   │   │   ├── routes/         # grouped by domain: account, audit, auth, github,
│   │   │   │                    #   health, orgs, repos, reviews, settings, usage,
│   │   │   │                    #   webhooks (GitHub only)
│   │   │   ├── plugins/        # auth, tenant
│   │   │   └── webhooks/       # GitHub webhook handler
│   │   └── package.json
│   └── worker/                 # BullMQ consumer + pipeline runner
│       ├── src/
│       │   ├── index.ts        # worker bootstrap
│       │   ├── queues.ts       # queue + DLQ definitions (review, retention,
│       │   │                    #   review-dead-letter)
│       │   ├── dlq.ts
│       │   ├── adapters/       # local + github-mock adapters
│       │   └── jobs/           # review, policy
│       └── package.json
│
├── packages/
│   ├── contracts/              # Zod schemas + inferred types
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── api.ts          # request/response payload schemas
│   │   │   ├── findings.ts     # ReviewFinding/Summary/Job schemas
│   │   │   └── webhooks.ts     # GitHub event schemas
│   │   └── package.json
│   ├── database/               # Prisma schema + client + tenant repos
│   │   ├── prisma/schema.prisma
│   │   └── src/
│   ├── github/                 # App auth, webhook verify, diff fetch, publish
│   ├── diff-engine/            # pure diff parser + line map
│   ├── static-analysis/        # ESLint + Semgrep runners
│   ├── ai-providers/           # provider interface + adapters + routing
│   ├── review-engine/          # orchestration
│   ├── policy-engine/          # confidence/suppression/file-budget policy
│   ├── observability/          # logging/tracing/redaction
│   └── config/                 # env parsing, model routing table, rates
│
├── infra/
│   └── docker/                 # Dockerfiles + compose (postgres, redis, web, api,
│                                #   worker, mock-github, mock-ai) + mock services
│
├── tests/
│   ├── fixtures/              # diff fixtures, injection fixtures, benchmark set
│   │   └── benchmark/         # known-bug + clean examples + scoring
│   ├── integration/           # webhook, queue, provider, tx, publish, tenant
│   ├── e2e/                   # Playwright
│   └── security/              # forged webhooks, cross-tenant, injection, secrets
│
├── docs/                       # (this documentation package)
│
├── website/                    # top-level Next.js marketing site (in pnpm-workspace)
│
├── vercode-diagrams/           # architecture diagram sources
│
├── scripts/                    # (PRESERVE — owner infra)
│   ├── auto_sync.sh
│   ├── run_loop.sh
│   ├── auto_sync.log
│   └── …
│
├── .github/                    # agents, hooks, ISSUE_TEMPLATE, skills, PR template
│
└── .agents/                    # (PRESERVE — installed skills)
```

## Rules

- **`verbatimModuleSyntax` + `NodeNext`:** every relative import ends in `.js`. This is the #1 typecheck failure source; CI's `typecheck` catches it.
- **No module imports another module's internals.** Cross-package communication is via `packages/contracts` types or a package's public export. A `lint` rule (import-boundary) enforces it.
- **`scripts/` and `.agents/` are frozen.** New tooling goes elsewhere; the auto-sync daemon must keep working.
- **`packages/contracts` is the single source of truth** for finding/job/webhook shapes. Every other package imports *from* it, never re-declares.

## Package dependency graph

```
contracts ──▶ (everyone)
config ────▶ observability, ai-providers, policy-engine
github ────▶ contracts, config
diff-engine (pure)
static-analysis ─▶ contracts
ai-providers ───▶ contracts, config
review-engine ──▶ diff-engine, static-analysis, ai-providers, policy-engine, contracts
database ──────▶ contracts
worker ────────▶ review-engine, diff-engine, static-analysis, ai-providers, policy-engine, github, database, config, observability, contracts
api ───────────▶ database, github, config, observability, contracts
website ───────▶ contracts (types only)
web (dashboard) ─▶ api only (no direct package deps)
```

A cycle here is a defect; CI fails on it.
