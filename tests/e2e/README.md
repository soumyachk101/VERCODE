# VERCODE — a the E2E suite (a the E2E_TEST_PLAN §2 + a the TEST_STRATEGY §4)

The Playwright journey specs drive a the *actual* dev stack (a the
`docker-compose` dev-stack with a the mock GitHub + a the mock AI —
a the E2E_TEST_PLAN §1 "a the dev stack: a the Compose stack (a the
Postgres, Redis, web, api, worker, a the mock-github, a the mock-ai,
a the mock-billing) — a the no external credentials needed; a the
full end-to-end run is local").

## A the specs

| Spec | Journey | What it covers (a the E2E_TEST_PLAN §2) |
| --- | --- | --- |
| `onboarding.spec.ts` | J1 | a the sign-in → a the create org → a the Overview's first-run empty state ("Connect GitHub to start reviewing PRs") → a the mock-GitHub connect → a the mock-PR webhook → a the first review detail appears (a the J1 exit criterion: a the connected → a the first review visible) |

A the remaining journey specs (`daily-loop.spec.ts`, `security-triage.spec.ts`,
`cost.spec.ts`, `audit.spec.ts`, `auth.spec.ts`, `a11y-keyboard.spec.ts`)
are a the E2E_TEST_PLAN §2's full list — a they land with a the M8
follow-up (a the onboarding spec is a the M8's "a the minimal onboarding
E2E spec", a the task's deliverable #5).

## A the environment

- **a the dev stack:** a the Compose stack (`infra/docker/compose.yaml`) —
  a the Postgres, a the Redis, a the `web`, a the `api`, a the `worker`,
  a the mock-github, a the mock-ai, a the mock-billing. A the no external
  credentials needed — a the full end-to-end run is local.
- **a the live lane:** a the separate, credentialed run (a the
  `E2E_LIVE=true`, a the real GitHub App + a the real AI + a the Stripe
  test-mode) that runs on a the *release* CI lane. In this build
  environment it's **explicitly marked "requires external credential —
  blocked"** (a the MVP_SCOPE, a the PHASE 10 rule) — a the no claim of a
  the live integration that wasn't actually executed.
- **a the test data:** each E2E test creates a the own org + a the user
  (a the fixture), a the uses a the mock GitHub to drive a the webhook,
  a the asserts against a the *real* API + a the DB (a the "a the data
  that tells a the truth" check, a the UI number matches a the stored
  number).

## A the mock-vs-real boundary

a the same rule as a the `tests/README.md`'s "a the mock-vs-real
boundary" section (a the INTEGRATION_TEST_PLAN §10 "a a test that
mocks a the DB or a the queue is not an integration test and is
rejected in review"): a the E2E suite mocks *only* a the network
outer edge (a the GitHub transport, a the AI provider, a the Stripe
signature), a the DB + a the queue are real (a the Compose stack's
Postgres + a the Redis).

## A the running a the suite

A the `make e2e` (a the `tests/Makefile`'s `e2e` target) boots a
the dev stack (a the `docker compose up` + a the `migrate` service),
a the runs a the Playwright specs, a the tears down a the stack.

```bash
make e2e
# or, manually:
docker compose -f infra/docker/compose.yaml --profile migrate run --rm migrate
docker compose -f infra/docker/compose.yaml up -d
WEB_URL=http://localhost:3000 API_URL=http://localhost:4000 \
MOCK_GITHUB_URL=http://localhost:8091 \
pnpm exec playwright test tests/e2e/onboarding.spec.ts
docker compose -f infra/docker/compose.yaml down
```

A the Playwright config (`playwright.config.ts`) reads a the
`WEB_URL`/`API_URL`/`MOCK_GITHUB_URL` env vars (a the Compose service's
host-mapped ports, a the dev-stack's host-side entry points).
