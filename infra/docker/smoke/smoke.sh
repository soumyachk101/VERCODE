#!/usr/bin/env bash
# The Compose smoke target (DEPLOYMENT §2 "a the smoke target boots the
# stack + hits the health endpoints + runs one mock PR through the
# pipeline → the setup + deployment instructions are verified").
#
# This script is the *host-side* entry point. It boots the stack (the
# `migrate` + `up` steps, wait-for-healthy), then runs the in-stack smoke
# runner (`compose run smoke`, a node container that curls the health
# endpoints + POSTs a signed mock PR + polls the pipeline's outcome).
#
# Usage (from the repo root):
#   ./infra/docker/smoke/smoke.sh
#
# It is idempotent: a `smoke` run against an already-up stack just re-runs
# the smoke test (a the `up -d` is a no-op when the services are running).
#
# It exits non-zero on any failure (a the CI smoke gate's "the verified
# state" — a smoke that fails is a *blocked* deploy, DEPLOYMENT §4 step 7).

set -euo pipefail

# A the repo root (a the script lives at infra/docker/smoke/smoke.sh).
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
COMPOSE_FILE="${REPO_ROOT}/infra/docker/compose.yaml"

# A parse the compose project name (default: the directory name, "vercode"
# via the top-level `name:` key).
COMPOSE_PROJECT="vercode"

log() { printf '\033[1;34m[smoke]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[smoke]\033[0m %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null || fail "docker is not on PATH — start Docker Desktop / the docker daemon"
docker info >/dev/null 2>&1 || fail "the docker daemon is not reachable (a the smoke target is BLOCKED in this environment, DEPLOYMENT §4 step 7)"

# A `docker compose` (the v2 subcommand) + a fallback to the legacy binary.
if docker compose version >/dev/null 2>&1; then
  DC=(docker compose -f "${COMPOSE_FILE}")
elif command -v docker-compose >/dev/null; then
  DC=(docker-compose -f "${COMPOSE_FILE}")
else
  fail "neither 'docker compose' nor 'docker-compose' is available"
fi

# ---------------------------------------------------------------------------
# 1. the migrate service (a the one-shot schema apply; DEPLOYMENT §4 step 2).
# ---------------------------------------------------------------------------
log "running the migrate service (a one-shot schema apply)..."
"${DC[@]}" --profile migrate run --rm migrate || fail "the migrate service failed"

# ---------------------------------------------------------------------------
# 2. the app stack (a postgres + redis + web + api + worker + the mocks).
# ---------------------------------------------------------------------------
log "booting the dev stack..."
"${DC[@]}" up -d postgres redis web api worker mock-github mock-ai || fail "the stack did not come up"

# A wait for a healthiness (a the compose healthchecks; a bounded wait so
# the smoke doesn't hang forever).
log "waiting for the services to be healthy..."
for i in $(seq 1 60); do
  if [ "$("${DC[@]}" ps --status healthy --quiet | grep -c .)" -ge 5 ]; then
    log "all five healthchecked services are up"
    break
  fi
  if [ "$i" -eq 60 ]; then
    "${DC[@]}" logs --tail 40 || true
    fail "the stack did not become healthy within 5 minutes"
  fi
  sleep 5
done

# ---------------------------------------------------------------------------
# 3. the smoke run (a one-shot container that hits the health endpoints +
#    POSTs a signed mock PR + polls the pipeline's outcome).
# ---------------------------------------------------------------------------
log "running the in-stack smoke (a health + a mock PR through the pipeline)..."
"${DC[@]}" run --rm smoke || fail "the smoke check failed"

log "smoke target PASSED (a health + a mock PR through the pipeline, DEPLOYMENT §2)"
log "the stack is running: web=http://localhost:3000 api=http://localhost:4000 mock-github=http://localhost:8091 mock-ai=http://localhost:8092"
log "tear down with: docker compose -f ${COMPOSE_FILE} down"
