// The Playwright E2E config (a the TEST_STRATEGY §4 "the E2E tests
// (Playwright, a the journeys)" + a the E2E_TEST_PLAN §4 "a the
// Playwright config").
//
// THE ENVIRONMENT (a the E2E_TEST_PLAN §1 "a the dev stack: a the
// Compose stack (a the Postgres, Redis, web, api, worker, a the
// mock-github, a the mock-ai, a the mock-billing)"): a the base URL is
// a the Compose `web` service (a the `WEB_URL` env var, a the default
// `http://localhost:3000`). A the live external suite (a the release
// lane, a the credentialed run) is a separate `live.spec.ts` gated on
// `E2E_LIVE=true` + a the real secrets (a the E2E_TEST_PLAN §5 "a the
// live lane" — a the CI does not claim a the live integration that a
// the credentialed lane didn't actually run, CI_CD §7).
//
// THE AUTH (a the E2E_TEST_PLAN §4 "a each test signs in fresh — a
// the session path is exercised"): a the spec creates a the user + a
// the org via a the API's public routes (a the J1 onboarding flow),
// not a the seeded cookie. A the mock providers' state is reset
// between test files (a the `beforeAll` clears a the mock-github's
// recorded publishes + a the mock-ai's call log + a the DB truncate of
// a the test org's rows).
//
// THE TRACES + A THE SCREENSHOTS ON FAILURE (a the E2E_TEST_PLAN §4
// "a the traces + a the screenshot on failure — a the failed E2E is
// debuggable without re-running"): a the Playwright trace viewer.

import { defineConfig, devices } from "@playwright/test";

const WEB_URL = process.env.WEB_URL ?? "http://localhost:3000";
const API_URL = process.env.API_URL ?? "http://localhost:4000";

export default defineConfig({
  testDir: "./",
  // A the journey specs run on Chromium (a the E2E_TEST_PLAN §4 "a the
  // journey specs on Chromium; a the a11y/keyboard spec on all three").
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // A the a11y/keyboard spec (a the E2E_TEST_PLAN §4 "a the top 5
    // journeys (J1–J5) navigable + a the actionable keyboard-only; a
    // a `prefers-reduced-motion` run still shows all content") runs on
    // all three.
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  ],
  use: {
    baseURL: WEB_URL,
    // A the API base (a the spec's REST calls hit a the api's origin, a
    // not a the web's — a the session cookie is a the cross-origin dev
    // setup with a the api on a the host-mapped port, a the
    // `credentials: "include"` in `apps/web/src/lib/api.ts`).
    extraHTTPHeaders: {
      "x-api-base": API_URL,
    },
    // A the traces + a the screenshots on failure.
    trace: "on-firstFailure",
    screenshot: "only-on-failure",
  },
  // A the web stack is up before the spec (a the Compose service's
  // healthcheck — a the `web` service's `HEALTHCHECK` in
  // `infra/docker/compose.yaml`; a the spec waits for a the
  // healthendpoint via a the `globalSetup` step).
  webServer: {
    // A the Compose stack is up (a the `docker compose up` is a the
    // `make e2e` step, not a the spec's `webServer` — a the `webServer`
    // here is a no-op placeholder, a the real `web` is a the Compose
    // service). A the Playwright config's `webServer` runs *inside*
    // a the `testDir`; a the dev-stack's boot is a the *host-side*
    // `make e2e` step (a the `tests/e2e/README.md`).
    command: "echo 'the dev-stack is up (a the make e2e step)' && sleep 0.1",
    url: WEB_URL,
    reuse: true,
    timeout: 120_000,
  },
  reporter: [
    ["list"],
    // A the traces (a the "a the failed E2E is debuggable without
    // re-running" rule).
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  // A the mock providers' state is reset between test files (a the
  // `globalTeardown` — a the mock-github's `/reset` + a the mock-ai's
  // `/reset` + a the mock-billing's `/reset`).
  //
  // A the parallelism (a the `workers: 1` — a the journey specs share
  // a the same seeded org, a the mock state reset is a the
  // `beforeAll`, a the parallel specs would race on a the reset).
  workers: 1,
  retries: 0,
});
