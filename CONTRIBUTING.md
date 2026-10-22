# Contributing to VERCODE

Thanks for your interest in contributing! This guide explains how to set up
the project, how to contribute changes, and the standards we hold ourselves
to.

## What is VERCODE?

VERCODE is an open-source, AI-powered code-review SaaS monorepo. It reads a
GitHub pull request the way a careful senior engineer would — deterministic
static analysis first, then task-routed LLM reasoning on the bounded,
relevant slice of the diff — and publishes the result back to the PR as
inline findings, plus a summary verdict, backed by a multi-tenant dashboard.

Read the [README](README.md) for the full architecture, and start in
`docs/PRODUCT/` for the product intent before writing code.

## Ways to contribute

There are several ways you can help:

- **Report bugs** — use the issue template (`.github/ISSUE_TEMPLATE/bug_report.md`)
  and include a minimal repro.
- **Suggest features** — use the feature-request issue template.
- **Improve docs** — every module has a doc folder under `docs/`; if a doc
  drifts from the code, open a doc PR (docs keep the roadmap's "docs kept in
  sync with code" gate green).
- **Write code** — fix a bug, or add a Phase 1/2 feature from the [Roadmap](README.md#roadmap).
- **Review PRs** — if you're a maintainer, see
  [docs/TESTING/REVIEW_CHECKLIST.md](docs/TESTING/REVIEW_CHECKLIST.md) (when
  it lands) — until then, use the Definition of Done in
  [docs/IMPLEMENTATION/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION/IMPLEMENTATION_PLAN.md).

## Ground rules (the "guard rails")

These rules are enforced in code and review; violating them is the most
common cause of a rejected PR.

1. **`packages/contracts` is the single source of truth.** New shapes for
   findings, jobs, plans, or webhooks go there — no other package re-declares
   a contract.
2. **No package imports another package's internals.** Cross-package
   communication goes through `contracts` or a package's public export
   (e.g. `packages/github/src/index.ts`), never into `packages/github/src/...`.
3. **`scripts/` and `.agents/` are frozen.** The owner maintains them — new
   tooling goes into a regular package or a top-level script in `scripts/`
   only if it's clearly a one-off.
4. **Tenant isolation is inviolable.** Every new DB query must be scoped by
   `org_id`; the integration suite re-runs on every schema change and a
   cross-tenant regression **blocks the merge**.
5. **`verbatimModuleSyntax` + `NodeNext` means every relative import ends in
   `.js`, even from `.ts` files.** This is the #1 typecheck failure source —
   run `pnpm typecheck` before pushing.

## Development setup

VERCODE is a pnpm 9 monorepo requiring Node.js ≥ 22.

```bash
# 1. Install
corepack enable          # or: npm i -g pnpm@9
pnpm install

# 2. Verify
pnpm typecheck          # pnpm -r typecheck
pnpm lint               # eslint "packages/**/*.ts" "apps/**/*.ts" --max-warnings 0
pnpm test               # vitest run
pnpm build              # pnpm -r build
```

Local services (Postgres 16 + Redis 7) are required for full integration
tests. Phase 0 will ship a Docker Compose dev stack in `infra/docker/`;
until then, run Postgres and Redis locally with your chosen tool.

> **Note:** no external credentials are required for local development. The
> provider layer supports an offline/mock AI adapter, and the dev stack wires
> mock GitHub + mock billing.

## Environment variables

Real credentials live in a secret store. `.env.example` (shipping with Phase 0)
contains **placeholders only**. The full inventory lives in
[docs/OPERATIONS/ENVIRONMENT_VARIABLES.md](docs/OPERATIONS/ENVIRONMENT_VARIABLES.md).

## Code style

- **Language:** TypeScript 5.x strict, ES2022, `NodeNext` module resolution.
- **Linting:** ESLint 9 + `typescript-eslint`; zero warnings allowed
  (`--max-warnings 0`). Run `pnpm lint` before pushing.
- **Formatting:** Match the surrounding files. The repo uses 2-space
  indentation and single quotes; follow the examples in
  [docs/IMPLEMENTATION/DEFINITION_OF_DONE.md](docs/IMPLEMENTATION/DEFINITION_OF_DONE.md)
  when in doubt.

## Testing expectations

Tests live in `tests/` at the root (unit, integration, e2e, security suites).
Every PR is expected to:

- Add or update unit tests in the affected package.
- Not regress the existing suite — `pnpm test` must be green on CI.
- For changes touching `contracts`, `database`, or `github`, run the
  integration suite that exercises cross-tenant behavior.
- For security-related changes, run the security suite from
  [docs/TESTING/SECURITY_TEST_PLAN.md](docs/TESTING/SECURITY_TEST_PLAN.md).

## Pull request process

1. Fork the repo and create a branch off `main`.
2. Make your changes; keep commits small and focused.
3. Write a clear commit message; use Conventional Commits
   (`feat(scope):`, `fix(scope):`, `docs:`, `refactor(scope):`,
   `test(scope):`, `chore:`).
4. Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` and make
   sure all pass.
5. Open a PR using the [pull request template](.github/pull_request_template.md);
   fill in the "Why" and "What" sections.
6. Wait for at least one maintainer review; address feedback by pushing to
   the same branch rather than opening a new PR.

### PR title conventions

- Prefix with the conventional commit type: `feat`, `fix`, `docs`, `refactor`,
  `test`, `chore`.
- Use the scope of the package or app you're changing:
  `feat(contracts): add PlanQuota shape`, `fix(review-engine): drop
  unanchored findings`.

## What we review before merging

Maintainers use the Definition of Done in
[docs/IMPLEMENTATION/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION/IMPLEMENTATION_PLAN.md):

- [ ] `pnpm typecheck` green
- [ ] `pnpm lint` green (`--max-warnings 0`)
- [ ] `pnpm test` green
- [ ] No new cross-tenant data paths (tenant-isolation suite re-run on schema
      changes is green)
- [ ] Docs updated where code drifts (`docs/` mirrors the change)
- [ ] No secrets, API keys, or PII in the diff

## Code of conduct

This project follows the
[Contributor Covenant](https://www.contributor-covenant.org/version/2/1/).
See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Where to ask for help

- **Questions about a specific module:** open a discussion issue — maintainers
  will route it.
- **Security concerns:** follow the process in [SECURITY.md](SECURITY.md).
  Do **not** open a public issue for a vulnerability.
- **Design-level questions:** open a discussion in `docs/PRODUCT/` or
  `docs/TECHNICAL/` and tag a maintainer.

## License

By contributing to VERCODE, you agree that your contributions will be
licensed under the [MIT License](LICENSE.md).
