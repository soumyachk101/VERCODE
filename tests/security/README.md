# VERCODE — Security Test Suite (focused subset)

The P0 security gate: a focused, runnable subset of the ST-* release-gate
tests from `docs/SECURITY/SECURITY_TEST_PLAN.md`, exercising the code that
EXISTS today. This is the security-review gate — a regression in any P0
security test blocks the release (SECURITY_TEST_PLAN.md §4).

The M8 full-suite agent owns the complete ST-* + IT-* + fixtures library
(`docs/SECURITY/SECURITY_TEST_PLAN.md` §2). These specs are the *security-
critical subset* that runs on every PR today; M8 folds them in without
duplication per the mapping below.

## Run

```
pnpm exec vitest run --project @vercode/security
# or the whole workspace (these run as part of `pnpm test`):
pnpm test
```

The project lives in `tests/vitest.config.ts` and is wired into the root
`vitest.workspace.ts`. It resolves cross-app source imports (the api app
factory, the worker's job handler, the review-engine pipeline) through a
pnpm `resolve.alias` map so the specs run without a hoisted root install.

## The four specs + their test-id / threat-model mapping

| Spec file | ST-* test id (SECURITY_TEST_PLAN.md §1) | Threat-model id (THREAT_MODEL.md) | Release gate? |
| --- | --- | --- | --- |
| `security-webhook.test.ts` | **ST-webhook-forged** (§1.1) — wrong-key / no signature → 401 `WEBHOOK_REJECTED`, NO queue write, an audit row; **ST-webhook-replay** — a seen delivery id → 200 no-op, the pipeline does NOT re-run; **IT-idempotency-01** — a SUCCEEDED same-SHA re-push → 200 dedup no-op | **T-01** (forged / replayed GitHub webhook; ingress integrity) | P0 — a forged event reaching the queue is an integrity loss (High) |
| `security-tenant.test.ts` | **ST-isolation-oracle** / **ST-tenant-cross** (§1.2) — a cross-tenant access → **404, not 403** (no existence oracle, AC-902); an in-tenant capability denial → **403**; the split holds for every role × capability cell | **T-02** (cross-tenant data access — Critical, the #1 SaaS failure) | P0, automatic block, no "known issue" (a tenant leak is Critical) |
| `security-injection.test.ts` | **ST-injection-01..04** (§1.4) — a PR body / a file comment / a README / a PR title each carrying an injection payload; assert (a) no system-prompt leak, (b) no tool call possible, (c) deterministic findings still publish, (d) at most a finding about the injection | **T-06** (prompt injection from repository content) | P0, individually gated (the highest-frequency, highest-trust-damage class) |
| `security-quota.test.ts` | **ST-quota-skip** (AC-402) — a org at 100% of its monthly review quota + a new PR → the job is `skipped:quota_exceeded`, ZERO AI tokens consumed, a notice posted; a under-quota org still runs (the gate is NOT over-blocking); `checkQuotaPlan` is the single enforcement point | **T-11** (API / AI cost abuse — the "over-cap job consumes zero tokens" rule) | P0 (an over-cap job that consumes tokens is a cost-abuse hole) |

### The 404-vs-403 split (ST-isolation-oracle, T-02)

The release-gate rule: *no tenant endpoint ever returns 403 for a
cross-tenant attempt* (only 404); 403 is reserved for in-tenant capability
denial (TENANT_ISOLATION.md §2 "the 404-vs-403 split"). The spec pins that
decision rule + the capability-matrix completeness, and asserts no cross-
tenant cell yields a 403.

### What each spec exercises (the "code that EXISTS today")

- **webhook** — drives the real `@vercode/api` route (`POST /webhooks/github`)
  through the app factory + a mocked Prisma surface (the pattern of
  `apps/api/src/webhooks.test.ts`) + the in-memory queue seam. Signatures are
  pre-computed inline against the committed TEST secret
  (`test-github-webhook-secret`, same value the existing route test uses —
  NEVER a real secret).
- **tenant** — the decision logic (the 404-vs-403 split + the capability
  matrix) as a pure unit, mirroring the in-repo `authz.test.ts` shape. The
  full-app wiring of that gate is broken today (see `KNOWN_ISSUES.md` P1/P2)
  — flagged, not fixed, because it's the M7/M8-owned security-critical path.
- **injection** — runs the real `@vercode/review-engine` pipeline
  (`runReview`) with the `MockAdapter` in the `"steered"` output mode over
  the 4 injection vectors; asserts no system-prompt leak, no tool path,
  statics publish, at most a finding about the injection.
- **quota** — drives the real `@vercode/worker` job handler
  (`runReviewJob`) + `checkQuotaPlan` with a mocked DB + a mocked provider;
  asserts the skip, zero provider calls, zero tokens, a notice posted.

## What is NOT covered here (M8's job)

- The full ST-* battery (§1.1–§1.9): billing forgery/replay/foreign, the
  secret-leak / redaction suite (§3), the malicious-file / sandbox (§1.6,
  Phase-2), the privilege-escalation matrix (§1.8), the oversized /
  malformed (§1.9). These need the `tests/fixtures/` library (§2) that M8
  is building (injection/, malicious-files/, secret-samples/,
  webhook-events/, ai-malformed/, benchmark/). The `tests/fixtures/`
  subdirs exist but are empty today — the specs here generate their
  fixtures inline so they run without depending on M8's fixtures.
- The IT-* integration (testcontainers) + the ST-isolation-oracle
  *endpoint-sweep* across every tenant route (needs the fixed app wiring,
  P1/P2).
- The benchmark precision/FP/cost release gate (§4 "Benchmark regression").

When M8 lands the fixtures + the full suite, fold these four specs in by
their ST-* ids (the table above) — no duplication.
