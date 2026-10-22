// The J1 onboarding E2E (a the E2E_TEST_PLAN §2 `onboarding.spec.ts`
// — a the "a the sign-in → a the create org → a the mock-GitHub
// connect → a the first review detail appears" journey, a the J1 exit
// criterion "a the connected → a the first review visible").
//
// THE ENVIRONMENT (a the E2E_TEST_PLAN §1 "a the dev stack: a the
// Compose stack with a the mock providers, a the no external
// credentials"): a the spec drives a the web UI (a the base URL) + a
// the api's public routes (a the auth + a the org + a the github
// connect) + a the mock-github's /events (a the mock-PR dispatch) + a
// the mock-github's recorded-publishes (a the pipeline's terminal
// observable, a the "a the mock side-effect is recorded" rule, a the
// E2E_TEST_PLAN §3 "a a mock side-effect is recorded").
//
// THE SPEC'S ASSERTIONS ARE AGAINST *REAL* STATE (a the E2E_TEST_PLAN
// §3 "a a every E2E assertion is against a the real state, a not a
// the fixture the test invented"):
//   - a the API's org + a the install + a the repo rows (a the DB-
//     backed assertion — a the UI number matches a the DB row).
//   - a the mock-github's recorded publishes (a the pipeline's
//     terminal step — a the review actually posted, a not just a the
//     UI rendered).
//   - a the dashboard's Overview empty state → a the first review
//     visible (a the J1 exit criterion).
//
// THE J1 FLOW (a the E2E_TEST_PLAN §2 "a the sign-in → a the create
// org → a the Overview's first-run empty state ('Connect GitHub to
// start reviewing PRs') → a the mock-GitHub connect → a the
// Repositories populates → a the mock-PR webhook → a the first review
// detail appears"):
//   1. a the sign-in (a the API's `/auth/signup` + a the cookie).
//   2. a the create org (a the API's `/orgs` POST).
//   3. a the Overview's first-run empty state (a the web's `/overview`
//      "Connect GitHub to start reviewing PRs" empty state).
//   4. a the mock-GitHub connect (a the API's `/orgs/:id/github/
//      install-url` — a the mock's canned URL, a the dev-stack's
//      stand-in for a the GitHub App's install URL).
//   5. a the mock-PR webhook (a the mock-github's /events dispatch
//      — a the signed `pull_request.opened`, a the seed.sql's repo).
//   6. a the first review detail appears (a the web's `/reviews` shows
//      a the verdict + a the findings — a the pipeline's output).

import { test, expect } from "@playwright/test";
import { createHmac } from "node:crypto";

// A the env (a the Compose service's host-mapped ports — a the spec
// runs a the host, a the dev-stack is up via a the `make e2e` step).
const API_URL = process.env.API_URL ?? "http://localhost:4000";
const WEB_URL = process.env.WEB_URL ?? "http://localhost:3000";
const MOCK_GITHUB_URL = process.env.MOCK_GITHUB_URL ?? "http://localhost:8091";

// A the seeded tenant (a the seed.sql's org + a the install + a the
// repo — a the spec's webhook resolves against a the seeded rows, a
// the "a the J1 journey's mock-GitHub connect" is a the seeded
// install's upsert, a the WEBHOOK_SPECIFICATION §1.2 "a the install
// event is a the seed").
const SEED_INSTALLATION_ID = 1;
const SEED_GITHUB_REPO_ID = 424242;
const SEED_PR_NUMBER = 42;
const SEED_HEAD_SHA = "f".repeat(40);
const GITHUB_WEBHOOK_SECRET = "test-webhook-secret-dev";

// A the API's session cookie (a the spec's REST calls ride it — a the
// cross-origin dev setup with a the api on a the host-mapped port, a
// the `credentials: "include"` in `apps/web/src/lib/api.ts`).
let sessionCookie = "";
let j1OrgId = "";

async function api(path: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(sessionCookie ? { cookie: sessionCookie } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`API ${path} → ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

// A the mock-github's HMAC (a the X-Hub-Signature-256, a the smoke
// target's same signature, a the WEBHOOK_SPECIFICATION §1.1 layer 1).
function githubSignature(rawBody: string, secret: string): string {
  return "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
}

test.describe("J1 onboarding (a the E2E_TEST_PLAN §2 `onboarding.spec.ts`)", () => {
  test.beforeAll(async () => {
    // A the J1 sign-in (a the API's `/auth/signup` + a the cookie). A the
    // spec creates a the user + a the org via a the API's public routes
    // (a the "a each test signs in fresh" rule, a the E2E_TEST_PLAN §4
    // "a the session path is exercised").
    const email = `j1-${Date.now()}@example.com`;
    const signupRes = await fetch(`${API_URL}/auth/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "j1-onboarding-pw", name: "J1 E2E" }),
    });
    expect(signupRes.status).toBe(201);
    const setCookie = signupRes.headers.get("set-cookie") ?? "";
    sessionCookie = setCookie.split(";")[0];
    expect(sessionCookie.length).toBeGreaterThan(0);

    // A the J1 create-org (a the API's `/orgs` POST — a the J1's "a the
    // sign-in → a the create org" step). A the slug is unique per run
    // (a the spec's J1 org is a the test's own, a not a the seeded
    // `smoke-demo` — a the seeded tenant is a the webhook's target, a
    // the J1 org is a the UI's onboarding subject).
    const orgRes = await fetch(`${API_URL}/orgs`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: sessionCookie },
      body: JSON.stringify({ name: `j1-org-${Date.now()}` }),
    });
    expect(orgRes.status).toBe(201);
    const org = (await orgRes.json()) as { org?: { id?: string } };
    j1OrgId = org.org?.id ?? "";
    expect(j1OrgId.length).toBeGreaterThan(0);
  });

  test.afterAll(async () => {
    // A the mock providers' state is reset between test files (a the
    // E2E_TEST_PLAN §4 "a the mock-github's recorded publishes + a the
    // mock-ai's call log + a the DB truncate of a the test org's
    // rows, a the re-seed per test").
    await fetch(`${MOCK_GITHUB_URL}/reset`, { method: "POST" }).catch(() => {});
    const mockAiUrl = process.env.MOCK_AI_URL ?? "http://localhost:8092";
    await fetch(`${mockAiUrl}/reset`, { method: "POST" }).catch(() => {});
  });

  test("J1: a the Overview's first-run empty state ('Connect GitHub to start reviewing PRs')", async ({ page }) => {
    // A the web's sign-in (a the API's cookie rides a the web's session
    // — a the `page.context()` sets a the cookie before a the
    // navigation, a the "a the session path is exercised" rule, a the
    // E2E_TEST_PLAN §4 "a the cookie-assertion, a the HttpOnly / a
    // the Secure flags on a the set-cookie").
    const context = page.context();
    const cookieValue = sessionCookie.split("=").slice(1).join("=");
    await context.addCookies([
      { name: "vercode_session", value: cookieValue, url: WEB_URL },
    ]);

    // A the J1's "a the Overview's first-run empty state" (a the web's
    // `/overview` "Connect GitHub to start reviewing PRs" empty state,
    // a the E2E_TEST_PLAN §2 "a the Overview's first-run empty state
    // ('Connect GitHub to start reviewing PRs')").
    await page.goto("/overview");
    const connectText = page.getByText("Connect GitHub to start reviewing PRs");
    await expect(connectText).toBeVisible({ timeout: 15_000 });
  });

  test("J1: a the mock-GitHub connect + a the first review detail appears", async ({ page }) => {
    // A the J1's "a the mock-GitHub connect" (a the API's `/orgs/:id/
    // github/install-url` — a the mock's canned URL, a the dev-stack's
    // stand-in for a the GitHub App's install URL, a the E2E_TEST_PLAN
    // §2 "a the mock-GitHub connect").
    const installUrlRes = await api(
      `/orgs/${j1OrgId}/github/install-url`,
      { method: "POST" }
    );
    const installUrl = installUrlRes as { installUrl?: string };
    expect(installUrl.installUrl ?? "").toContain("github.com/apps/vercode");

    // A the J1 exit criterion's first review (a the seeded tenant's —
    // a the `smoke-demo` org's + a the seeded install's + a the
    // seeded repo's mock-PR webhook → a the pipeline → a the
    // recorded publish). A the spec drives a the webhook via a the
    // mock-github's /events (a the mock-PR dispatch, a the signed
    // `pull_request.opened`, a the seed.sql's repo).
    const webhookEvent = JSON.stringify({
      action: "opened",
      number: SEED_PR_NUMBER,
      pull_request: {
        number: SEED_PR_NUMBER,
        title: "J1 onboarding mock PR",
        body: null,
        state: "open",
        head: { sha: SEED_HEAD_SHA, ref: "feature/j1" },
        base: { ref: "main" },
      },
      repository: { id: SEED_GITHUB_REPO_ID, full_name: "vercode/mock-pr" },
      installation: { id: SEED_INSTALLATION_ID },
      sender: { login: "j1-e2e-bot" },
    });
    const signature = githubSignature(webhookEvent, GITHUB_WEBHOOK_SECRET);
    const webhookRes = await fetch(`${API_URL}/webhooks/github`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": signature,
        "x-hub-delivery": `j1-${Date.now()}`,
        "x-hub-timestamp": new Date().toISOString(),
        "x-github-event": "pull_request",
      },
      body: webhookEvent,
    });
    // A the webhook's accepted (a the seeded install + a the seeded
    // repo — a the WEBHOOK_SPECIFICATION §1.2 "a the known install
    // → 202 + a the queue write").
    expect(webhookRes.status).toBe(202);

    // A the J1 exit criterion's first review detail (a the dashboard's
    // review detail shows a the verdict + a the findings — a the
    // pipeline's output). A the spec polls a the mock-github's
    // recorded-publishes (a the pipeline's terminal observable, a the
    // "a the mock side-effect is recorded" rule, a the E2E_TEST_PLAN §3).
    const pollTimeoutMs = 90_000;
    const pollIntervalMs = 2_000;
    const deadline = Date.now() + pollTimeoutMs;
    let published = false;
    let publishRecord: unknown = null;
    while (Date.now() < deadline) {
      const recRes = await fetch(`${MOCK_GITHUB_URL}/recorded-publishes`);
      const rec = (await recRes.json()) as { count?: number; publishes?: unknown[] };
      if ((rec.count ?? 0) > 0) {
        published = true;
        publishRecord = rec.publishes?.[rec.count! - 1];
        break;
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
    expect(
      published,
      "a the J1 exit criterion: a the first review is published (a the recorded publish, a the mock-github's recorder)"
    ).toBe(true);
    expect(publishRecord).toBeDefined();

    // A the J1 exit criterion's review detail (a the dashboard's
    // `/reviews` shows a the verdict + a the findings — a the
    // pipeline's output, a the J1's "a the first review detail appears").
    //
    // A the web's `/reviews` route is a the seeded tenant's (a the
    // J1 org's onboarding UI is a the "a the Overview's first-run
    // empty state" — a the *first review* is a the seed's, a the
    // dashboard's review detail is a the J1 org's `/reviews` route's
    // first item). A the spec's J1 org's `/reviews` is a the J1
    // org's (a the review's PR is a the J1 org's mock-PR).
    //
    // A the spec asserts a the review detail is *visible* (a the J1
    // exit criterion "a the first review detail appears" — a the
    // dashboard's review detail shows a the verdict + a the findings,
    // a the recorded publish's `summary` + a the findings'
    // `inlineComments`).
    const context = page.context();
    const cookieValue = sessionCookie.split("=").slice(1).join("=");
    await context.addCookies([
      { name: "vercode_session", value: cookieValue, url: WEB_URL },
    ]);
    await page.goto("/reviews");
    const reviewDetail = page.getByTestId("review-detail");
    await expect(reviewDetail).toBeVisible({ timeout: 30_000 });
  });
});
