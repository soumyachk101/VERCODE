# PR: <!-- short title, prefixed with the conventional type, e.g. feat(contracts): ... -->

## Why

> 1–3 sentences: the problem this solves, and which user / phase it unblocks.
> For features, link the issue: `Closes #123`.

## What

> Bullet list of the concrete changes, grouped by package/app.
> For a change in `contracts`, state which new or modified shape(s).

- `packages/…`:
- `apps/…`:
- `docs/…`:

## Checklist

- [ ] `pnpm typecheck` is green (every relative import ends in `.js`)
- [ ] `pnpm lint` is green (`--max-warnings 0`)
- [ ] `pnpm test` is green
- [ ] `pnpm build` is green
- [ ] No new cross-tenant data path (if touching `database` or `github`)
- [ ] No secrets, keys, or PII in the diff
- [ ] Docs updated in `docs/` where the code drifts

## Security & invariants

> Answer honestly — if "none", write "none". This is what reviewers look at
> before approving.

- [ ] Does this change add a new GitHub webhook surface? (if yes:
      verify + dedup + idempotency check in place?)
- [ ] Does this change touch the prompt builder for the LLM? (if yes:
      bounded context still enforced, no new tool access, outputs still
      schema-validated?)
- [ ] Does this change read another tenant's data? (if yes: explain the
      path and why it's intentional)
- [ ] Does this change log anything that could contain a secret? (if yes:
      redaction gate in place?)

## Testing

> What you added or updated, and what it covers. For a fix, include the
> smallest failing test that proves the bug existed before the fix.

- Unit tests:
- Integration tests:
- Manual / repro steps:

## Screenshots (if UI)

> For `apps/web` changes, before/after screenshots.
