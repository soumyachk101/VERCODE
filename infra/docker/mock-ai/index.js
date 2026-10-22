// The mock-AI service (DEPLOYMENT §2 "a the mock-ai is the mock adapter
// (deterministic fixture outputs)").
//
// It serves the SAME deterministic structured outputs as the
// `@vercode/ai-providers` `MockAdapter` — the "good" mode's findings array,
// the schema-invalid near-miss, the "steered" leak, and the "down" error.
// The payload lives in `fixtures/*.json` so the fixture is the single source
// of truth for BOTH the HTTP stub and the unit assertion that keeps the two
// in sync (tests/integration/mock-ai-parity.test.ts).
//
// The point of this service in the Compose stack: the pipeline's AI seam is
// *mocked at the outer edge only* (INTEGRATION_TEST_PLAN §10 "the seams are
// real, the outer edge is mocked") — the review engine, the diff engine,
// the static analysis, the queue and the DB are all real.
//
// Endpoints:
//   GET  /healthz                  → { ok: true }
//   GET  /fixtures                 → the list of available scenarios
//   GET  /completion?scenario=good → the deterministic structured output
//                                    (the same shape MockAdapter returns)
//   POST /completion               → { scenario?: "good" | "schema-invalid" |
//                                    "steered" | "down" } → the same
//   POST /reset                    → clears the call log
//   GET  /calls                    → the recorded call log (the E2E
//                                    "a the mock AI's recorded calls"
//                                    assertion, E2E_TEST_PLAN §4)

const PORT = 8092;

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

/** The deterministic outputs, keyed by the MockAdapter's scenario names. */
const FIXTURES = {
  good: JSON.parse(readFileSync(join(here, "fixtures", "good.json"), "utf8")),
  "schema-invalid": JSON.parse(
    readFileSync(join(here, "fixtures", "schema-invalid.json"), "utf8")
  ),
  steered: JSON.parse(readFileSync(join(here, "fixtures", "steered.json"), "utf8")),
};

const calls: Array<Record<string, unknown>> = [];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function main(): Promise<void> {
  const server = await (await import("node:http")).createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    const path = url.pathname;
    const send = (status: number, body: unknown): void => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };

    if (req.method === "GET" && path === "/healthz") {
      send(200, { ok: true, service: "mock-ai" });
      return;
    }

    if (req.method === "GET" && path === "/fixtures") {
      send(200, { scenarios: Object.keys(FIXTURES) });
      return;
    }

    if (req.method === "GET" && path === "/calls") {
      send(200, { count: calls.length, calls });
      return;
    }

    if (req.method === "POST" && path === "/reset") {
      calls.length = 0;
      send(200, { ok: true, reset: true });
      return;
    }

    if ((req.method === "GET" && path === "/completion") || req.method === "POST" && path === "/completion") {
      let scenario = url.searchParams.get("scenario") ?? "good";
      if (req.method === "POST") {
        const raw = await req.text();
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as { scenario?: string };
            if (typeof parsed.scenario === "string") scenario = parsed.scenario;
          } catch {
            send(400, { error: "invalid json" });
            return;
          }
        }
      }
      calls.push({ scenario, at: new Date().toISOString() });

      if (scenario === "down") {
        // The MockAdapter's "down" scenario throws a ProviderError; over
        // HTTP that is a 503 with the provider-error shape.
        send(503, {
          error: { type: "provider_error", message: 'Mock provider is "down" (simulated)' },
        });
        return;
      }
      const fixture = FIXTURES[scenario as keyof typeof FIXTURES];
      if (fixture === undefined) {
        send(404, { error: "unknown scenario", scenario });
        return;
      }
      send(200, {
        content: fixture.content,
        model: "mock-model",
        inputTokens: 120,
        outputTokens: 80,
        finishReason: "stop",
        latencyMs: 10,
      });
      return;
    }

    send(404, { error: "not found", path });
  }).listen(PORT, () => {
    console.log(`mock-ai listening on :${PORT}`);
  });
}

void main();
