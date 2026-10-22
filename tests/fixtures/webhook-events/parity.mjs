// A the webhook-events fixture parity check (a the `ST-webhook-*` test's
// input is a committed signature + a the `@vercode/github`
// `verifyGitHubWebhook`'s output must match — a a fixture whose signature
// the verifier rejects is a fixture bug, not a test bug).
//
// Run: `pnpm exec tsx tests/fixtures/webhook-events/parity.mjs`
import { readFileSync } from "node:fs";
import { verifyGitHubWebhook } from "../../../packages/github/src/webhook.js";

const DIR = new URL("./", import.meta.url);
const secret = JSON.parse(readFileSync(new URL("secret.json", DIR), "utf8")).secret;

function headersOf(f) {
  return {
    signature: f.headers["x-hub-signature-256"],
    deliveryId: f.headers["x-hub-delivery"],
    timestamp: f.headers["x-hub-timestamp"],
    event: f.headers["x-github-event"],
  };
}

let failures = 0;
function check(id, kind, expectedReason, extraOpts = {}) {
  const f = JSON.parse(readFileSync(new URL(kind + ".json", DIR), "utf8"));
  const res = verifyGitHubWebhook(headersOf(f), f.rawBody, secret, {
    now: extraOpts.now ?? Date.parse(f.timestamp) + 1000 + (f.nowMs ? f.nowMs - Date.parse(f.timestamp) : 0),
    isDeliverySeen: extraOpts.seen ? () => true : undefined,
  });
  const ok =
    expectedReason === null
      ? res.ok === true && res.reason === null
      : res.ok === false && res.reason === expectedReason;
  if (!ok) {
    console.error(`FAIL ${id}: expected reason=${expectedReason} got ok=${res.ok} reason=${res.reason}`);
    failures += 1;
  } else {
    console.log(`ok   ${id} (${kind} → ${expectedReason ?? "accepted"})`);
  }
}

// a the signed event: a valid signature + a fresh delivery + a in-window
// timestamp → a accepted (a reason null).
check("github-signed-001", "github-signed", null, { seen: false });
// a the forged event: a wrong-key signature → a signature reject.
check("github-forged-001", "github-forged", "signature", { seen: false });
// a the replayed event: a valid signature + a seen delivery id → a replay
// reject (a the `isDeliverySeen` returns true).
check("github-replayed-001", "github-replayed", "replay", { seen: true });
// a the malformed event: a valid signature, a in-window timestamp, a fresh
// delivery → a accepted at a the *webhook layer* (a the schema check is a
// the route's, not a the verifier's — a the fixture's `expectedVerdict`
// "rejected_malformed" is a the *route's* verdict, a not a the verifier's).
check("github-malformed-001", "github-malformed", null, { seen: false });
// a the stale event: a valid signature + a out-of-window timestamp → a
// timestamp reject.
check("github-stale-001", "github-stale", "timestamp", { seen: false });

if (failures > 0) {
  console.error(`${failures} fixture parity failure(s)`);
  process.exit(1);
}
console.log("all GitHub webhook fixtures verify as expected");
