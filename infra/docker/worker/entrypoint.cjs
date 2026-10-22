// The worker's dev-stack entrypoint (a the compose `worker` service's
// command).
//
// It boots the real worker runtime (`apps/worker/src/index.ts` via tsx —
// a the review-queue consumer + the pipeline, M5 T5.1) AND wires the
// dev-stack's observable seams that the in-process runtime alone can't
// reach (a the Compose-level stand-ins, TRD §18 "the dev-stack"):
//
//   - The GithubDiffClient (a the mock-github service's canned PR diff —
//     a the worker's mock client's on-disk read is replaced by a the
//     in-process stub that fetches from the mock-github service).
//   - The GithubPublisher (a the worker's mock publisher, its `outPath`
//     set to a the shared volume's `publishes.json` so a the smoke +
//     a the E2E can read the recorded publishes back).
//   - A the PR number → head-sha map (a the seeded mock repo's PRs).
//
// A real prod deploy does NOT run this entrypoint — a the prod worker is
// a plain `tsx apps/worker/src/index.ts` (a the real Octokit diff client
// + publisher, a the real AI provider). This file is the dev-stack's
// `USE_MOCK_*` path only (a the env var that selects it, ENVIRONMENT_
// VARIABLES §7).

const { execFileSync, spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

// A the compose env vars (a the same x-app-env map as the worker service).
const REPO_ROOT = process.cwd();
const WORKER_SRC = path.join(REPO_ROOT, "apps/worker/src/index.ts");

// A the seeded mock repo's PR map (a the seed.sql's `github_repo_id =
// 424242` is the mock-github's canned repo; its PR #42's head SHA is the
// smoke's seeded commit). This is what the diff client's "which diff do
// I serve for PR N" lookup resolves to — a deterministic, no network.
const MOCK_PR_TO_HEAD_SHA = {
  42: "f".repeat(40),
};

// A the mock-github service's base URL (a the compose-network name).
const MOCK_GITHUB_BASE = process.env.MOCK_GITHUB_BASE ?? "http://mock-github:8091";
// A the publisher's on-disk record path (a the shared `worker-data` volume
// the smoke reads back).
const PUBLISH_LOG_PATH = process.env.MOCK_PUBLISH_LOG ?? "/data/publishes.json";

// A the in-process worker runtime boots by running the real entrypoint in
// a child process (a the tsx watch is for dev; the compose worker is a
// single `start`). A the `outPath` + a the `prNumber` map are injected via
// env so the *same* source file wires both the dev-stack's stand-ins
// (a this entrypoint) and the prod path (a plain tsx, no env → no
// override) without forking the code.
process.env.VERCODE_MOCK_GITHUB_BASE = MOCK_GITHUB_BASE;
process.env.VERCODE_MOCK_PUBLISH_LOG = PUBLISH_LOG_PATH;
process.env.VERCODE_MOCK_PR_HEAD_SHAS = JSON.stringify(MOCK_PR_TO_HEAD_SHA);

// A ensure the shared volume's directory exists (a the `worker-data` mount
// is empty on first boot).
try {
  const dir = path.dirname(PUBLISH_LOG_PATH);
  fs.mkdirSync(dir, { recursive: true });
} catch {
  // a the worker's publisher creates its own directory; a failure here
  // is a warning, not a fatal (a the in-memory record still works).
  console.warn(`[worker-entrypoint] could not pre-create ${path.dirname(PUBLISH_LOG_PATH)}; the publisher will fall back to in-memory`);
}

// A spawn the real worker (a tsx `src/index.ts`), forwarding SIGTERM
// (a the NFR-15 drain, a the compose `stop_grace_period: 70s`).
const child = spawnSync("node", [
  path.join(REPO_ROOT, "node_modules/.bin/tsx"),
  WORKER_SRC,
], {
  stdio: "inherit",
  env: process.env,
});

// A the child's exit code (a a 0 = a clean SIGTERM drain; a non-0 = a
// crash the compose `restart: unless-stopped` will re-run).
process.exit(child.status ?? 0);
