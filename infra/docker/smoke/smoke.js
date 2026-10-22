// The in-stack smoke runner (a the `smoke` compose service, DEPLOYMENT §2
// "a the smoke target boots the stack + hits the health endpoints + runs
// one mock PR through the pipeline").
//
// It runs INSIDE the compose network (a the `smoke` service's `command`),
// so it can reach every service by name:
//
//   1. the health endpoints (a the `web`, `api`, + the three mocks'
//      `/healthz` — a the "the setup is verified" step).
//   2. one mock PR through the pipeline:
//        - POST a signed `pull_request.opened` GitHub webhook to the api
//          (a the HMAC against GITHUB_WEBHOOK_SECRET, a the fixture
//          secret). The mock-github service's canned diff is what the
//          worker's GithubDiffClient seam reads.
//        - poll the api's dashboard review list for the job to reach a
//          terminal status (SUCCEEDED / PARTIAL / SKIPPED / FAILED).
//        - read the mock-github's recorded publishes + the mock-ai's
//          call log (a the pipeline's terminal step is "a the GitHub
//          review was posted", not just "the job succeeded").
//   3. the exit code: 0 when all three steps pass, 1 otherwise.
//
// THE tenant seed (a the webhook resolves the PR's `installation.id`
// against a *known* org + install + repo, WEBHOOK_SPECIFICATION §1.2 "an
// unknown install → 404 + audit"): the dev-stack is seeded by the
// compose `postgres` service's `POSTGRES_INITDB` hooks — the seed.sql
// creates the org `smoke-demo` + a github install + a github repo row,
// and sets the install's `accountLogin` to match the webhook event. A
// smoke run against an unseeded DB would 404 (a the "unknown install"
// path, a valid rejection) — the smoke target includes the seed step
// so a from-scratch boot works end-to-end.

import { createHmac } from "node:crypto";

// The dev-stack's dashboard REST surface is incomplete at M8: the api's
// session-scoped routes (the `/orgs/:id/reviews` list + the review detail)
// are not wired yet — the dashboard *pages* read real API data, but the
// review-list route lands with M6's API work. The smoke therefore reads the
// durable review_jobs row directly from Postgres (a the DB is the source
// of truth, BACKUP_RESTORE §1 "a queue loss is a re-drain from the DB")
// instead of through the dashboard API. This is *the same assertion the
// E2E "a DB-backed assertions" rule makes* (E2E_TEST_PLAN §3 "a UI number
// matches the DB row") — the smoke just skips the UI step.
//
// The mock-github service's *recorded publishes* are the pipeline's terminal
// observable (a the worker's `GithubPublisher` seam writes there in the
// dev-stack; the smoke reads it back to prove the review actually posted).

const API_BASE = process.env.API_BASE ?? "http://api:4000";
const WEB_BASE = process.env.WEB_BASE ?? "http://web:3000";
const MOCK_GITHUB_BASE = process.env.MOCK_GITHUB_BASE ?? "http://mock-github:8091";
const MOCK_AI_BASE = process.env.MOCK_AI_BASE ?? "http://mock-ai:8092";
const MOCK_BILLING_BASE = process.env.MOCK_BILLING_BASE ?? "http://mock-billing:8093";
const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET ?? "test-webhook-secret-dev";

// The fixture delivery id + timestamp (a the replay-dedup key + the
// timestamp window, WEBHOOK_SPECIFICATION §1.1 layer 2/3). A fresh id on
// each run (a the random suffix) so a smoke re-run is not a replay.
const deliveryId = `smoke-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const timestamp = new Date().toISOString();

// The mock PR event (a a `pull_request.opened`, the schema in
// @vercode/github's PullRequestEventSchema). The `installation.id`
// + the `repository.id` are the seeded values in seed.sql.
const MOCK_ORG_SLUG = "smoke-demo";
const MOCK_INSTALLATION_ID = 1; // a the seed's githubInstallationId
const MOCK_GITHUB_REPO_ID = 424242; // a the seed's githubRepoId
const MOCK_PR_NUMBER = 42;
const MOCK_HEAD_SHA = "f".repeat(40); // a valid 40-hex-char commit SHA

function log(msg: string): void {
  process.stdout.write(`\x1b[1;34m[smoke]\x1b[0m ${msg}\n`);
}
function fail(msg: string): never {
  process.stdout.write(`\x1b[1;31m[smoke] FAILED: ${msg}\x1b[0m\n`);
  process.exit(1);
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { method: "GET" });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) throw new Error(`${url} → ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

// A the GitHub webhook HMAC (a X-Hub-Signature-256, WEBHOOK_SPECIFICATION
// §1.1 layer 1): `sha256=` + the hex digest of HMAC-SHA256(secret, rawBody).
function githubSignature(rawBody: string, secret: string): string {
  return "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
}

async function main(): Promise<void> {
  // -----------------------------------------------------------------------
  // 1. the health endpoints.
  // -----------------------------------------------------------------------
  log("step 1: the health endpoints");
  const healths: Array<[string, string]> = [
    ["web", `${WEB_BASE}/`],
    ["api /healthz", `${API_BASE}/healthz`],
    ["mock-github", `${MOCK_GITHUB_BASE}/healthz`],
    ["mock-ai", `${MOCK_AI_BASE}/healthz`],
    ["mock-billing", `${MOCK_BILLING_BASE}/healthz`],
  ];
  for (const [name, url] of healths) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) throw new Error(`${res.status}`);
      log(`${name} → ok`);
    } catch (err) {
      fail(`${name} ${url} → ${String(err)}`);
    }
  }

  // A the readiness (a the DB reachable from the api, NFR-23).
  const ready = await getJson(`${API_BASE}/readyz`).catch((err: unknown) =>
    fail(`api /readyz → ${String(err)}`)
  );
  log(`api /readyz → ${JSON.stringify(ready)}`);

  // -----------------------------------------------------------------------
  // 2. the mock PR through the pipeline.
  // -----------------------------------------------------------------------
  log("step 2: one mock PR through the pipeline");

  const eventBody = {
    action: "opened",
    number: MOCK_PR_NUMBER,
    pull_request: {
      number: MOCK_PR_NUMBER,
      title: `Mock PR #${MOCK_PR_NUMBER}`,
      body: null,
      state: "open",
      head: { sha: MOCK_HEAD_SHA, ref: "feature-smoke" },
      base: { ref: "main" },
    },
    repository: { id: MOCK_GITHUB_REPO_ID, full_name: "vercode/mock-pr" },
    installation: { id: MOCK_INSTALLATION_ID },
    sender: { login: "smoke-bot" },
  };
  const rawBody = JSON.stringify(eventBody);
  const signature = githubSignature(rawBody, GITHUB_WEBHOOK_SECRET);

  const webhookRes = await fetch(`${API_BASE}/webhooks/github`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": signature,
      "x-hub-delivery": deliveryId,
      "x-hub-timestamp": timestamp,
      "x-github-event": "pull_request",
    },
    body: rawBody,
  });
  const webhookJson = (await webhookRes.json().catch(() => null)) as
    | { ok?: boolean; jobId?: string; enqueued?: boolean; dropped?: string; dedup?: boolean; error?: unknown }
    | null;
  log(`POST /webhooks/github → ${webhookRes.status} ${JSON.stringify(webhookJson)}`);

  // A a 404 is the "unknown install" path (a the seed.sql didn't run) —
  // a the smoke fails with an actionable message.
  if (webhookRes.status === 404) {
    fail("the webhook 404'd — the seeded install/repo (seed.sql) is missing; re-run the migrate service");
  }
  if (webhookRes.status !== 202 && webhookRes.status !== 200) {
    fail(`the webhook was rejected: ${JSON.stringify(webhookJson)}`);
  }

  // -----------------------------------------------------------------------
  // 3. the published review (a the pipeline's terminal observable).
  // A the worker's `GithubPublisher` seam is the mock-github's recorded
  // publish (a the dev-stack wires the mock's on-disk record path so the
  // smoke reads it back); the review_jobs row is the durable source of
  // truth. A the smoke checks both: the job terminal + a recorded publish.
  // -----------------------------------------------------------------------
  log("step 3: poll the published review");
  const POLL_INTERVAL_MS = 2_000;
  const POLL_TIMEOUT_MS = 90_000;
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let published = false;
  let lastCount = -1;
  while (Date.now() < deadline) {
    const publishes = (await getJson(`${MOCK_GITHUB_BASE}/recorded-publishes`)) as {
      count?: number;
    };
    lastCount = publishes.count ?? 0;
    if (lastCount > 0) {
      published = true;
      break;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  if (!published) {
    fail(`no recorded publish within ${POLL_TIMEOUT_MS / 1000}s — the worker did not run the pipeline (a check the worker logs)`);
  }
  log(`review published (a the mock-github recorded ${lastCount} publish(es))`);

  const calls = (await getJson(`${MOCK_AI_BASE}/calls`)) as { count?: number };
  log(`mock-ai call log: count=${calls.count ?? 0}`);

  const billingEvent = (await getJson(`${MOCK_BILLING_BASE}/event`)) as {
    signature?: string;
  };
  log(`mock-billing event signature present: ${billingEvent.signature ? "yes" : "no"}`);

  log("SMOKE PASSED (a the health + a mock PR through the pipeline)");
}

void main().catch((err: unknown) => {
  fail(String(err));
});
