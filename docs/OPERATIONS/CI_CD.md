# VERCODE — CI/CD

The pipeline. GitHub Actions (the brief's tool). The philosophy: *a merge is gated, a release is a lane*, and the security + benchmark + design gates are *release gates*, not optional checks.

## 1. The lanes

| Lane | Trigger | What runs |
| --- | --- | --- |
| **PR** | every push to a branch | `typecheck` + `lint` + `unit` + `integration` (reduced) + `security` (reduced) + a *reduced* E2E (the Compose stack, mock providers) + a docs-drift check. *No external creds; no benchmark gate on a PR (a reduced benchmark sample yes, the full gate is merge+release).* |
| **merge** | on merge to `main` | the *full* integration + *full* security suite + the *full* E2E + the **benchmark gate** + the **design gate** + the **dependency/supply-chain gate**. A merge that can't pass the benchmark gate is *held* (a quality regression isn't merged, `RELEASE_CRITERIA` gate 7). |
| **release** | a tagged release / a release-branch cut | the merge lane + the **live external suite** (`E2E_LIVE`, real GitHub + real AI + Stripe test-mode) in a credentied CI lane + a load/DoS soak + a secret-scanner. *Where the external creds are absent, the live suite is marked blocked, not claimed.* |
| **scheduled** | nightly | a `ST-cost-abuse` soak + a repo-wide secret-scanner + a `pnpm audit` (the T-09/T-16 supply-chain sweep) + a *retention reconciliation* check (a data-present-past-its-window query returns zero, `DATA_RETENTION §7`). |

## 2. The PR job (the fast loop, no external creds)

```yaml
# the conceptual PR workflow (a single matrix + the gate jobs)
on: [pull_request]
jobs:
  checks:            # parallel
    - typecheck      # pnpm typecheck (the verbatimModuleSyntax gate — a .js-extension miss fails here)
    - lint           # pnpm lint --max-warnings 0 (0 warnings)
    - unit           # vitest run (the pure-package coverage gate holds)
    - integration    # the reduced IT-* set against a Postgres+Redis service
    - security       # the reduced ST-* set (the P0 security tests — a P0 regression blocks the *merge*, flagged on the PR)
    - e2e            # the Compose stack + mock providers + Playwright (the journey specs, DB-backed assertions)
    - docs           # the traceability-matrix drift check (an FR whose behavior changed has updated docs, RELEASE_CRITERIA gate 11)
  gate:              # the AND of the above
    needs: [typecheck, lint, unit, integration, security, e2e, docs]
    if: all succeeded
```

**The key property:** a PR can't merge with a red P0 *security* test (gate 5's reduced set runs on the PR, and a security regression is flagged *immediately*, not at release) — the security suite is not "release-only" in the sense that a P0 regression slips through the PR. The *full* security + benchmark are the *merge* + *release* gates (the reduced set on the PR catches the obvious regression early; the full set proves it at the gate).

## 3. The merge gate (the quality + design + supply-chain)

On merge to `main`, the *full* lanes run:

- **The benchmark gate** (gate 7): the `benchmark/vN` harness at the current `(model, promptVersion, routingTable)` → the measured numbers (precision, security-recall, cost, anchor-success) vs the frozen baseline. A regression > 5% precision or > 3% security-recall → the merge is held (a quality regression is not merged).
- **The design gate** (gate 10): the design-taste `lint.mjs --app` + `inspect.mjs --app` on the built dashboard (0 FAIL at 1440/768/390). The anti-slop rules are *checked*, not hoped (the skill's words, `DESIGN_SYSTEM §11`).
- **The supply-chain gate** (gate 12): `pnpm audit` (0 new high/critical CVEs) + the lockfile-vs-manifest check + the `allowBuilds` allowlist check (the discovery placeholder `esbuild: set this to true or false`, D-5/DEV, is *resolved* to a deliberate allowlist — a CI check that the effective set matches the reviewed allowlist, `THREAT_MODEL T-09/T-16`).

## 4. The release lane (the credentialed external run)

A release-tag build runs the merge lane + the **live external suite** in a lane that has the *secrets* (a GitHub secrets store / a vault, injected at run time):

- **`e2e/live.spec.ts`** (`E2E_LIVE=true`): a real GitHub App on a test repo, a real PR (a known-bug fixture diff), a real webhook, a real pipeline, a real publish. **This is the "a real Pull Request webhook is received and verified" step (DEFINITION OF DONE #4)** — and in an environment *without* the external creds, this lane is **marked blocked** (the run isn't claimed, `RELEASE_CRITERIA` gate 13, the "don't claim what you can't verify" rule).
- **The soak + the secret-scanner** (a load/DoS test that the ingress p95 stays flat under a webhook flood, `THREAT_MODEL T-10`; a repo-wide secret-scan).
- **The canary** (the release's bake window, `RELEASE_CRITERIA §3`): the leading indicators (the DLQ depth, the provider error rate, the GitHub 4xx/5xx, the p95 latency) are watched; a spike is a rollback *before* the full promote.

## 5. The build + deploy (the artifacts)

- **The Docker images** (`web`, `api`, `worker`) are built multi-stage (install → build → the runtime image; *no secret in a layer*, `DEPLOYMENT §3`). The image tags are the release id (a rollback re-deploys the previous tag, `DEPLOYMENT §6`).
- **The deploy** is the platform's (K8s/ECS, `DEPLOYMENT §4`): migrate → worker → api → web (a rolling, readiness-gated), then the post-deploy *verify* (the health endpoints + the canary bake). **A deploy that wasn't verified is marked unverified** (the rule).
- **The migration** is a *separate, gated* step (a `db-migrate` job that applies the Prisma migrations + runs the tenant-isolation `EXPLAIN` check *against the new schema* — a schema change that breaks tenancy fails the *migration*, not the deploy, `TENANT_ISOLATION §5`).

## 6. The "verify, don't assume" discipline (the cross-cutting rule)

Every CI artifact that claims a pass is a *measured* pass:

| Claim | The measurement |
| --- | --- |
| "the typecheck passed" | 0 errors (the `verbatimModuleSyntax` gate — a relative import without `.js` is a *named* error, not a silent pass) |
| "the security suite passed" | 0 P0 failures (a named assertion: a forged webhook was rejected, a cross-tenant access 404'd, an injection produced no leak) |
| "the benchmark passed" | the numbers (precision/recall/cost/anchor at the tuple + the run date, `BENCHMARK_DATASET §6`) |
| "the E2E passed" | the DB-backed assertions (a UI number = a DB row, `E2E_TEST_PLAN §3`) |
| "the deploy is live" | the post-deploy health + canary checks (a *verified* deploy, `DEPLOYMENT §7`) |

**A green checkmark is not the claim; the measurement is.** The CI report + the release report state the measurements, so a reviewer can re-run any gate and get the same number (reproducibility, `BENCHMARK_DATASET §6`).

## 7. What CI does NOT do (stated)

- **CI does not run the live external suite** on a PR (no external creds on the PR lane; the live run is the release lane, credentialed + `E2E_LIVE`).
- **CI does not auto-merge on a green PR** (the merge is the *gate* lane; a human or a release cut promotes, the security + benchmark gates being the *blocking* gates). An auto-merge that skips the benchmark gate is a *defect* (the quality gate is the release's integrity).
- **CI does not claim a live integration** that the credentialed lane didn't actually run (a blocked lane is *reported as blocked*, `RELEASE_CRITERIA §1` gate 13 — the "do not fabricate successful… integrations, credentials, or deployments" rule, `PHASE 9`).
