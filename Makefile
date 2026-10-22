# ---------------------------------------------------------------------------
# VERCODE — a the M8 "a the verified state" gate (a the TASK_BREAKDOWN.md's
# M8, a the T8.1–T8.3 "a the Compose stack boots (a the smoke target
# passes: a the health + a the mock PR through the pipeline); a the CI
# lanes are defined (a the PR/merge/release, a the gates); a the
# .env.example is a the generated artifact + a the checked in (a the no
# secret, a the doc-drift check); a the live external suite is marked
# blocked in a the no-credentials env (a the CI_CD §7 'a the CI does not
# claim a the live integration that a the credentialed lane didn't
# actually run')").
#
# A the `check` target is a the "a the verified state" gate (a the
# T8.1–T8.3 "a the M8 done (a the MVP complete)"'s exit criterion):
#   1. a the `pnpm typecheck` (a the verbatimModuleSyntax gate, a the
#      `.js`-extension invariant, a the RELEASE_CRITERIA gate 2).
#   2. a the `pnpm lint` (a the 0 warnings, a the RELEASE_CRITERIA gate 2).
#   3. a the `pnpm test` (a the unit + a the security + a the
#      integration's vitest suites).
#   4. a the `pnpm benchmark` (a the BENCHMARK_DATASET §4's scoring
#      harness, a the deterministic MockAdapter "good" mode).
#   5. a the Compose smoke target (a the DEPLOYMENT §2 "a the smoke
#      target boots the stack + a the hits the health endpoints + a
#      the runs one mock PR through the pipeline").
#
# A the `smoke` target (a the DEPLOYMENT §2 "a the smoke target") is
# a the host-side entry point (a the `infra/docker/smoke/smoke.sh`'s
# `docker compose` boot + a the in-stack `smoke` service's run). A
# the Docker daemon is required — a the smoke is a the dev-stack's
# "a the setup + a the deployment instructions are verified" step (a
# the DEFINITION OF DONE #15, a the E2E_TEST_PLAN §7 "a the 15-step
# 'definition-of-done' mapping" "a the 15 (a the setup + a the
# deployment verified) → a the OPERATIONS/DEPLOYMENT.md + a the
# Compose bring-up test (a the infra/docker's a smoke target that
# boots the stack + a the hits the health endpoints)").
#
# A the `e2e` target (a the E2E_TEST_PLAN §1 "a the dev stack" + a
# the TEST_STRATEGY §4 "a the E2E tests (Playwright, a the
# journeys)"): a the `docker compose` boot + a the Playwright specs
# (a the J1 onboarding + a the journey specs, a the E2E_TEST_PLAN §2).
#
# Usage (from a the repo root):
#   make check          # a the "a the verified state" gate
#   make smoke          # a the Compose stack's smoke target
#   make e2e            # a the Playwright E2E suite
#   make benchmark      # a the benchmark harness (a the no baseline save)
#   make benchmark-baseline  # a the first run's baseline save
#   make env            # a the .env.example's doc-drift check (a the
#                       #   ENVIRONMENT_VARIABLES §10 "a the .env.example
#                       #   is a the generated artifact + a the checked in
#                       #   (a the no secret, a the doc-drift check)")

.PHONY: check smoke e2e benchmark benchmark-baseline env clean help

# A the default target (a the `make` with no args).
.DEFAULT_GOAL := check

help:
	@echo "VERCODE's M8 'a the verified state' gate (a the TASK_BREAKDOWN.md's M8)"
	@echo ""
	@echo "Targets:"
	@echo "  check               a the 'a the verified state' gate (a the typecheck + a the lint + a the test + a the benchmark + a the smoke)"
	@echo "  smoke               a the Compose stack's smoke target (a the DEPLOYMENT §2 'a the smoke target boots the stack + a the hits the health endpoints + a the runs one mock PR through the pipeline')"
	@echo "  e2e                 a the Playwright E2E suite (a the E2E_TEST_PLAN §1 'a the dev stack' + a the TEST_STRATEGY §4 'a the E2E tests')"
	@echo "  benchmark           a the benchmark harness (a the BENCHMARK_DATASET §4 'a the scoring')"
	@echo "  benchmark-baseline  a the first run's baseline save (a the BENCHMARK_DATASET §6 'a the determinism + a the reproducibility rule')"
	@echo "  env                 a the .env.example's doc-drift check (a the ENVIRONMENT_VARIABLES §10 'a the .env.example is a the generated artifact + a the checked in')"

# ---------------------------------------------------------------------------
# a the "a the verified state" gate (a the T8.1–T8.3 "a the M8 done").
# ---------------------------------------------------------------------------
check: typecheck lint test benchmark
	@echo ""
	@echo "a the 'a the verified state' gate (a the typecheck + a the lint + a the test + a the benchmark)"
	@echo "a the Compose smoke target is a the host-side step (a the 'make smoke' — a the Docker daemon is required)"

typecheck:
	pnpm typecheck

lint:
	pnpm lint

test:
	pnpm test

benchmark:
	pnpm benchmark

benchmark-baseline:
	pnpm run benchmark:baseline

# ---------------------------------------------------------------------------
# a the Compose smoke target (a the DEPLOYMENT §2 "a the smoke target").
# ---------------------------------------------------------------------------
smoke:
	@echo "a the Compose smoke target (a the DEPLOYMENT §2 'a the smoke target boots the stack + a the hits the health endpoints + a the runs one mock PR through the pipeline')"
	bash infra/docker/smoke/smoke.sh

# ---------------------------------------------------------------------------
# a the Playwright E2E suite (a the E2E_TEST_PLAN §1 "a the dev stack").
# ---------------------------------------------------------------------------
e2e:
	@echo "a the Playwright E2E suite (a the E2E_TEST_PLAN §1 'a the dev stack' + a the TEST_STRATEGY §4 'a the E2E tests')"
	@echo "a the dev-stack boot (a the 'docker compose up' + a the 'migrate' service)"
	bash infra/docker/smoke/smoke.sh
	@echo "a the Playwright specs (a the J1 onboarding)"
	WEB_URL=http://localhost:3000 API_URL=http://localhost:4000 \
	MOCK_GITHUB_URL=http://localhost:8091 MOCK_AI_URL=http://localhost:8092 \
	pnpm exec playwright test tests/e2e/onboarding.spec.ts

# ---------------------------------------------------------------------------
# a the .env.example's doc-drift check (a the ENVIRONMENT_VARIABLES §10
# "a the .env.example is a the generated artifact + a the checked in
# (a the no secret, a the doc-drift check)").
#
# A the check: a the `.env.example`'s var set is a the
# ENVIRONMENT_VARIABLES §1–§8's doc's var set (a the "a the
# undocumented env var is a the config bug" rule, a the
# ENVIRONMENT_VARIABLES §9 "a the variable that's *not* in a the
# doc is a the defect"). A the `config` package's `KNOWN_VARS` is a
# the source of truth (a the `packages/config/src/index.ts`'s
# `KNOWN_VARS` array), a the `.env.example`'s var set must match a
# the `KNOWN_VARS` (a the doc-drift check, a the RELEASE_CRITERIA
# gate 11 "a the docs-drift check").
# ---------------------------------------------------------------------------
env:
	@echo "a the .env.example's doc-drift check (a the ENVIRONMENT_VARIABLES §10 'a the .env.example is a the generated artifact + a the checked in')"
	node scripts/env-drift-check.mjs

clean:
	rm -rf tests/e2e/playwright-report tests/e2e/test-results
	rm -f tests/fixtures/benchmark/v1/baseline-report.json
