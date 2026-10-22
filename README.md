# VERCODE

AI-powered code review as a SaaS: GitHub webhook -> diff parse -> LLM review ->
findings posted back to the PR. TypeScript everywhere, pnpm workspaces.

## Layout

```
apps/
  api/                 Fastify HTTP service (webhooks, review jobs, health)
  web/                 Next.js dashboard + landing pages (owned by another team)
packages/
  contracts/           Shared Zod schemas + TS types (findings, jobs, plans, quotas)
  review-engine/       Pure diff parsing, classification, dedup, severity policy
  diff-engine/         Thin re-export of review-engine's diff parser (name parity)
  ai-providers/        LLM provider interface + OpenAI/Anthropic clients + pricing
  database/            Hand-written schema mirror of the Prisma model (pre-DB)
```

## Getting started

```sh
# Install (run once; credentials & keys are not committed)
pnpm install
cp .env.example .env   # fill in real values
pnpm build
pnpm test
```

- **Installs / credentials are pending** — the orchestrator runs `pnpm install`
  after this foundation lands. `.env.example` holds placeholders only.
- `JWT_SECRET` / GITHUB_APP_ID placeholders are standing in; JWT signing
  middleware is documented in `apps/api`.
- The `packages/database` module mirrors the canonical Prisma schema so apps
  can be built before real DB connectivity exists.

## Scripts

| Script           | What it does                          |
| ---------------- | ----------------------------------- |
| `pnpm dev`       | Run dev scripts across workspaces    |
| `pnpm build`     | Build all workspaces                 |
| `pnpm test`      | Vitest across the repo (offline)     |
| `pnpm lint`      | ESLint (flat config, packages+apps)  |
| `pnpm typecheck` | `tsc --noEmit` in each workspace     |
