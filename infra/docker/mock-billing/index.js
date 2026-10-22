// The mock-billing service (DEPLOYMENT §2 "a the mock-billing produces a
// Stripe test-mode signature"; INTEGRATION_TEST_PLAN §1 "the Stripe
// test-mode webhook — a pre-computed payload + signature (the provider's
// test library, a deterministic signature, no live call)").
//
// It signs billing events with the *Stripe* scheme so the api's billing
// webhook verifier can check them exactly checks a real Stripe
// delivery:
//
//   t=<unix seconds>,v1=<hex hmac_sha256(`${t}.${rawBody}`, STRIPE_WEBHOOK_SECRET)>
//
// The secret is the *test-mode* secret committed in the fixture library
// (tests/fixtures/webhook-events/secret.json) — a fixture, not a
// credential (NFR-31, SECURITY_TEST_PLAN §2).
//
// Endpoints:
//   GET  /healthz     → { ok: true }
//   POST /sign        → { body: "<the event json>", signature: "t=..,v1=.." }
//   GET  /sign?body=  → the same, for a body supplied query param
//   POST /event       → a canned `invoice.paid` event, signed + returned
//   POST /reset       → clears the call log

import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PORT = 8093;

const here = dirname(fileURLToPath(import.meta.url));
const SECRET_FILE = join(here, "fixtures", "stripe-webhook-secret.json");

/**
 * The test-mode webhook secret. It is a FIXTURE (committed on purpose so
 * the signature is reproducible), never a real Stripe secret. The dev-stack
 * sets STRIPE_WEBHOOK_SECRET to the same value.
 */
function loadSecret() {
  try {
    const parsed = JSON.parse(readFileSync(SECRET_FILE, "utf8"));
    if (typeof parsed.secret === "string" && parsed.secret.length > 0) return parsed.secret;
  } catch {
    // fall through to the default below
  }
  return "whsec_test_vercode_dev_stack_secret";
}

/** The Stripe-style signature over `${timestamp}.${rawBody}`. */
export function stripeSign(rawBody: string, secret: string, timestamp: number) {
  const signed = `${timestamp}.${rawBody}`;
  const v1 = createHmac("sha256", secret).update(signed).digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

const calls: Array<Record<string, unknown>> = [];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const CANNED_EVENT = {
  id: "evt_mock_00000001",
  object: "event",
  type: "invoice.paid",
  created: 1735689600,
  livemode: false,
  api_version: "2024-06-20",
  data: {
    object: {
      id: "in_mock_00000001",
      object: "invoice",
      customer: "cus_mock_0001",
      amount_paid: 4900,
      currency: "usd",
      subscription: "sub_mock_0001",
    },
  },
};

async function main(): Promise<void> {
  const server = await (await import("node:http")).createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    const path = url.pathname;
    const secret = loadSecret();
    const send = (status: number, body: unknown): void => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };

    if (req.method === "GET" && path === "/healthz") {
      send(200, { ok: true, service: "mock-billing", livemode: false });
      return;
    }

    if (req.method === "POST" && path === "/reset") {
      calls.length = 0;
      send(200, { ok: true, reset: true });
      return;
    }

    if (req.method === "GET" && path === "/event") {
      const raw = JSON.stringify(CANNED_EVENT);
      const ts = Math.floor(Date.now() / 1000);
      send(200, { body: raw, signature: stripeSign(raw, secret, ts), livemode: false });
      return;
    }

    if (path === "/sign") {
      let raw = url.searchParams.get("body") ?? "";
      if (req.method === "POST") {
        const text = await req.text();
        if (text) {
          try {
            const parsed = JSON.parse(text) as { body?: string; event?: unknown };
            raw = typeof parsed.body === "string" ? parsed.body : JSON.stringify(parsed.event ?? parsed);
          } catch {
            send(400, { error: "invalid json" });
            return;
          }
        }
      }
      const ts = Math.floor(Date.now() / 1000);
      calls.push({ at: new Date().toISOString(), bytes: raw.length });
      send(200, { body: raw, signature: stripeSign(raw, secret, ts) });
      return;
    }

    send(404, { error: "not found", path });
  }).listen(PORT, () => {
    console.log(`mock-billing listening on :${PORT}`);
  });
}

void main();
