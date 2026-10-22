# VERCODE — tests/ (a the shared test-suite + a the fixture library)

The `tests/` tree is a the M8 "a the security suite + a the observability +
a the Docker/CI" deliverable (a the TASK_BREAKDOWN.md's M8, a the T8.1–T8.3
verified state). It's a the "a the test pyramid + a the suite layout"
(a the TEST_STRATEGY.md §1) + a the "a the fixture library" (a the
SECURITY_TEST_PLAN §2) + a the "a the benchmark dataset" (a the
BENCHMARK_DATASET §1) + a the E2E suite (a the E2E_TEST_PLAN §2).

## A the suite layout

```
tests/
├── fixtures/                 # a the shared fixture library (a the SECURITY_TEST_PLAN §2)
│   ├── injection/            #   a the 4 prompt-injection vectors (a the SECURITY_TEST_PLAN §1.4)
│   ├── secret-samples/       #   a the 6 key shapes (a the redaction test fixtures)
│   ├── malicious-files/      #   a the postinstall-bearing manifest + a the generated/lockfile diff
│   ├── webhook-events/       #   a the signed + a the forged + a the replayed + a the malformed event bodies
│   ├── ai-malformed/         #   a the schema-invalid + a the out-of-enum + a the "steered" under-reporting
│   └── benchmark/
│       └── v1/               #   a the starter set (~20 cases, a the BENCHMARK_DATASET §3)
│           ├── manifest.json
│           ├── cases/<class>/<id>.json
│           └── baseline-report.json   # a the first run's report (a the frozen baseline)
├── benchmark/
│   ├── harness.ts            # a the scoring harness (a the BENCHMARK_DATASET §4)
│   └── (run via `pnpm benchmark`)
├── e2e/                      # a the Playwright journey specs (a the E2E_TEST_PLAN §2)
│   ├── playwright.config.ts
│   ├── onboarding.spec.ts    #   a the J1 journey (a the auth → a the org → a the mock GitHub connect → a the first review)
│   └── README.md             #   a the E2E suite's layout + a the mock-vs-real boundary
├── integration/              # a the Vitest integration seams (a the INTEGRATION_TEST_PLAN §10)
│   └── mock-ai-parity.test.ts #   a the mock-AI service's fixture + a the MockAdapter's output parity
└── vitest.config.ts          # a the security-suite vitest project (a the T8.1's ST-* gate)
```

## A the mock-vs-real boundary (a the INTEGRATION_TEST_PLAN §10 rule)

The "a test that mocks a the DB or a the queue is not an integration test and is
rejected in review" rule (a the INTEGRATION_TEST_PLAN §10 "a test is an
integration test iff it: (a) uses a the real Postgres + a the Redis
(testcontainers), (b) exercises a cross-boundary behavior, (c) mocks *only*
a the network outer edge (a the GitHub transport, a the AI provider, a the
provider-webhook signature — a the mocks being *deterministic* + a the
assertion targets being *recorded side-effects*). A test that fails any of
(a)–(c) is either a unit test (a move it to a the package) or a defect
(a a mocked DB/queue, rejected in review)").

The concrete application here:

- **a the mock providers' state is reset between test files** (a the
  E2E_TEST_PLAN §4 "a the mock-github's recorded publishes + a the mock-ai's
  call log + a the DB truncate of a the test org's rows, a the re-seed
  per test"): a the `beforeAll`/`afterAll` in a the spec clears a the
  mock's recorded state, a the no cross-test contamination.
- **a the mocks are at the outer edge only** (a the INTEGRATION_TEST_PLAN
  §1 "a the seams are real, a the outer edge is mocked"): a the
  review-engine, a the diff-engine, a the static-analysis, a the queue
  + a the DB are real; a the GitHub transport + a the AI provider + a
  the Stripe signature are the deterministic stand-ins.
- **a the "live" lane is a separate, credentialed run** (a the
  E2E_TEST_PLAN §5 "a the `e2e/live.spec.ts` (gated on
  `E2E_LIVE=true` + a the real secrets) that runs in a the *release*
  CI lane, a the not on every PR. In this build environment it's
  **explicitly marked 'requires external credential — blocked'"** —
  a the CI does not claim a the live integration that a the
  credentialed lane didn't actually run, a the CI_CD §7 "a the CI does
  not claim a the live integration that a the credentialed lane didn't
  actually run").

## A the "a a test that asserts against a fixture, not inline data" rule

The fixture library (a the `tests/fixtures/`) is a the shared input
(a the SECURITY_TEST_PLAN §2 "a the fixture library is the shared
input: diff fixtures, injection fixtures, secret samples, webhook
event bodies, malformed-AI outputs, and a the benchmark set. A
fixture is versioned; a the test asserts against a fixture, not
against inline data (a the fixture change is a *reviewed* change)").
A the ST-* tests, a the IT-* tests, + a the benchmark harness all
read a the fixtures from a the `tests/fixtures/` dir, a not a
inline literals (a the BENCHMARK_DATASET §5 "a the set is versioned
+ a the immutable: a the v1 is frozen; a new case is a v2 (a the
back-reference). A the mid-version case *edit* is a new version (a
the silent label change would make a the 'no regression' comparison
meaningless)").
