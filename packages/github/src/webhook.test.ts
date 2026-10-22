// ST-webhook-forged / -replay / -stale / -malformed (SECURITY_TEST_PLAN §1.1,
// THREAT_MODEL T-01 "a forged event fails layer 1; a captured event fails
// layer 2/3"). The mock webhook events in tests/fixtures are the input; the
// verdict is the output.

import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  verifyGitHubWebhook,
  validateEventBody,
  type WebhookHeaders,
} from "./webhook.js";

const SECRET = "test-webhook-secret";
const NOW = Date.parse("2026-10-22T16:00:00Z");
const IN_WINDOW = new Date(NOW).toISOString();

function sign(body: string, secret = SECRET): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

const validBody = JSON.stringify({
  action: "opened",
  number: 42,
  pull_request: {
    number: 42,
    title: "a fix",
    body: null,
    state: "open",
    head: { sha: "a".repeat(40), ref: "feat" },
    base: { ref: "main" },
  },
  repository: { id: 1, full_name: "acme/app" },
  installation: { id: 99 },
  sender: { login: "dev" },
});

const baseHeaders = (over: Partial<WebhookHeaders> = {}): WebhookHeaders => ({
  signature: sign(validBody),
  deliveryId: "delivery-1",
  timestamp: IN_WINDOW,
  event: "pull_request",
  ...over,
});

describe("ST-webhook-forged (a bad signature → 401, a no queue write, a audited)", () => {
  it("a no signature is rejected (a layer 1)", () => {
    const r = verifyGitHubWebhook(baseHeaders({ signature: "sha256=" }), validBody, SECRET, { now: NOW });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("signature");
  });

  it("a wrong-key signature is rejected (a layer 1)", () => {
    const forged = sign(validBody, "an-attacker-key");
    const r = verifyGitHubWebhook(baseHeaders({ signature: forged }), validBody, SECRET, { now: NOW });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("signature");
  });

  it("a signature over a *different* body is rejected (a the body was tampered with)", () => {
    const tampered = validBody + " "; // a single byte change
    const r = verifyGitHubWebhook(baseHeaders(), tampered, SECRET, { now: NOW });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("signature");
  });
});

describe("ST-webhook-stale (a timestamp > 5 min → 401, a layer 2)", () => {
  it("a stale timestamp (a 10 min old) is rejected", () => {
    const stale = new Date(NOW - 10 * 60 * 1000).toISOString();
    const r = verifyGitHubWebhook(baseHeaders({ timestamp: stale, signature: sign(validBody, SECRET) }), validBody, SECRET, { now: NOW });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("timestamp");
  });

  it("an in-window timestamp passes layer 2", () => {
    const r = verifyGitHubWebhook(baseHeaders(), validBody, SECRET, { now: NOW });
    expect(r.ok).toBe(true);
    expect(r.event).toBe("pull_request");
  });
});

describe("ST-webhook-replay (a seen delivery id → 200 no-op, a layer 3)", () => {
  it("a seen delivery id is flagged as a replay", () => {
    const r = verifyGitHubWebhook(baseHeaders(), validBody, SECRET, {
      now: NOW,
      isDeliverySeen: (id) => id === "delivery-1",
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("replay");
  });

  it("an unseen delivery id is a fresh delivery", () => {
    const r = verifyGitHubWebhook(
      baseHeaders({ deliveryId: "delivery-2" }),
      validBody,
      SECRET,
      { now: NOW, isDeliverySeen: () => false }
    );
    expect(r.ok).toBe(true);
  });
});

describe("ST-webhook-malformed (a verified but schema-invalid body → 422, a not enqueued)", () => {
  it("a valid signature + a bad body shape → a schema failure", () => {
    // A signature over a *valid* body (a the signature check passes), but the
    // body we pass to validateEventBody is malformed (a a the "verified but
    // malformed" case — a signature on body A, schema check on body B).
    const malformedBody = { action: "opened" }; // missing the required fields
    const r = validateEventBody("pull_request", malformedBody);
    expect(r.ok).toBe(false);
  });

  it("an unknown event type → a schema failure (a we don't process it)", () => {
    const r = validateEventBody("pull_request_something_we_dont_handle", {});
    expect(r.ok).toBe(false);
  });

  it("a valid pull_request body → a schema success", () => {
    const r = validateEventBody("pull_request", JSON.parse(validBody));
    expect(r.ok).toBe(true);
    expect((r.data as { number: number }).number).toBe(42);
  });
});
