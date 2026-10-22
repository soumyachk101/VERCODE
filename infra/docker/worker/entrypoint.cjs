// The worker's dev-stack entrypoint (a the compose `worker` service's
// command).
//
// It runs the real worker runtime (`tsx apps/worker/src/index.ts` — the
// review-queue consumer + the pipeline, M5 T5.1) and injects the dev-stack
// stand-ins the worker's `USE_MOCK_*` flags select (TRD §18 "the dev-stack
// dev-stack; ENVIRONMENT_VARIABLES §7). The real prod worker runs the same
// source without these env vars (a plain Octokit diff client + publisher,
// the real AI provider — no env override, no forking the code).
//
// A the seams this entrypoint wires:
//   - The GithubDiffClient (a the worker's mock client's on-disk read is
//     overridden to fetch the canned diff from the mock-github service
//     `http://mock-github:8091/pr-diff/:prNumber`).
//   - The GithubPublisher (a the worker's MockGithubPublisher, its
//     `outPath` set to the shared volume's `/data/publishes.json` so the
//     smoke + the E2E read the recorded publishes back — the "a the mock
//     side-effect is recorded" rule, E2E_TEST_PLAN §3).
//   - A PR → head-sha map for the seeded mock repo (a the seed.sql's
//     `github_repo_id = 424242`; PR #42's head SHA is the smoke's seeded
//     commit). A deterministic, no-network.
//
// A real deploy does NOT run this entrypoint: it runs `tsx
// apps/worker/src/index.ts` directly (a the prod path, no env override).

const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const REPO_ROOT = process.cwd();

// A the mock-github service's base URL (a the compose-network name).
const MOCK_GITHUB_BASE = process.env.MOCK_GITHUB_BASE ?? "http://mock-github:8091";
// A the publisher's on-disk record path (a the shared `worker-data` volume
// the smoke + E2E read back).
const PUBLISH_LOG_PATH = process.env.MOCK_PUBLISH_LOG ?? "/data/publishes.json";
// A the seeded mock repo's PR → head-sha map (a the mock-github service's
// canned PR #42's head SHA).
const MOCK_PR_HEAD_SHAS = { 42: "f".repeat(40) };

// A the shared volume's directory (a the compose `worker-data` mount is
// empty on first boot).
try {
  fs.mkdirSync(path.dirname(PUBLISH_LOG_PATH), { recursive: true });
} catch {
  console.warn(
    `[worker-entrypoint] could not pre-create ${path.dirname(PUBLISH_LOG_PATH)}; ` +
      "the publisher will fall back to in-memory (a the records are lost on restart)"
  );
}

// A the env the worker's mock-client + publisher read (a the real worker
// source's `loadConfig` + adapter factories pick these up when set — a
// the prod path has no env, so no override, no forking the code).
process.env.VERCODE_MOCK_GITHUB_BASE = MOCK_GITHUB_BASE;
process.env.VERCODE_MOCK_PUBLISH_LOG = PUBLISH_LOG_PATH;
process.env.VERCODE_MOCK_PR_HEAD_SHAS = JSON.stringify(MOCK_PR_HEAD_SHAS);

// A spawn the real worker (a tsx `src/index.ts`), forwarding SIGTERM
// (a the NFR-15 drain, the compose `stop_grace_period: 70s`).
const child = spawn(
  process.execPath,
  [path.join(REPO_ROOT, "node_modules/.bin/tsx"), path.join(REPO_ROOT, "apps/worker/src/index.ts")],
  {
    stdio: "inherit",
    env: process.env,
  }
);

// A the SIGTERM/SIGINT forward (a the drain budget, a the NFR-15 60 s).
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    child.kill(sig);
  });
}

// A the child's exit code (a a 0 = a clean SIGTERM drain; a non-0 = a
// crash the compose `restart: unless-stopped` will re-run).
child.on("exit", (code) => {
  process.exit(code ?? 0);
});
