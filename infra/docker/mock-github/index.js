// The mock-GitHub HTTP stub (DEPLOYMENT §2 "a the mock-github is an HTTP
// stub: a canned PR diff + a install-token exchange + a review-publication
// recorder"; INTEGRATION_TEST_PLAN §1 "the mock providers' state: a reset
// endpoint").
//
// Endpoints:
//   GET  /healthz                      → { ok: true }
//   POST /events                       → { ok: true } (a GitHub-App webhook
//                                          dispatch simulator — real deploys
//                                          don't need it; it's here for the
//                                          smoke test to trigger a mock PR
//                                          without hand-POSTing a signed
//                                          event)
//   POST /review-publish               → records + returns the publish (the
//                                          worker's mock publisher target —
//                                          the E2E "a the mock side-effect
//                                          is recorded" assertion, E2E_TEST_PLAN §3)
//   GET  /recorded-publishes           → the recorded publish log (a the test
//                                          reads this to assert the pipeline
//                                          ran end-to-end)
//   GET  /token                        → { token: "ghs_mock_install_token" }
//                                          (a the install-token exchange
//                                          stand-in, INTEGRATION_DESIGN §1.4 —
//                                          a deterministic token, never a
//                                          credential)
//   GET  /pr-diff/:prNumber?repo=..    → a canned unified diff (a the
//                                          worker's GithubDiffClient stand-in)
//   POST /reset                        → clears the recorded state
//
// Node's built-in fetch (Node 22) makes this a zero-dependency stub.

const PORT = 8091;

// The canned PR diff (a two-file PR: a SQL-concatenation security bug + a
// clean util file — a pipeline run against it produces a deterministic
// static finding + a deterministic mock-AI finding, no external calls).
const CANNED_PR_DIFF = `diff --git a/src/db/queries.ts b/src/db/queries.ts
index 1a2b3c4..5d6e7f8 100644
--- a/src/db/queries.ts
+++ b/src/db/queries.ts
@@ -10,3 +10,8 @@
 function runQuery(sql) {
   return db.query(sql);
 }
+export function findUserById(id) {
+  const query = "SELECT * FROM users WHERE id = " + id + ";";
+  return db.query(query);
+}
+
diff --git a/src/util/format.ts b/src/util/format.ts
index 9a8b7c6..0f1e2d3 100644
--- a/src/util/format.ts
+++ b/src/util/format.ts
@@ -1,4 +1,7 @@
 export function pad(n: number): string {
   return String(n).padStart(2, "0");
 }
+export function truncate(s: string, n: number): string {
+  return s.length > n ? s.slice(0, n - 1) + "…" : s;
+}
`;

const recordedPublishes: Array<Record<string, unknown>> = [];
let eventCount = 0;

function readBody(req: Request): Promise<Record<string, unknown>> {
  return req
    .text()
    .then((t) => (t ? (JSON.parse(t) as Record<string, unknown>) : {}));
}

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

    if (req.method === "GET" && path === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, service: "mock-github" }));
      return;
    }

    if (req.method === "GET" && path === "/token") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ token: "ghs_mock_install_token", installationId: "1" }));
      return;
    }

    if (req.method === "GET" && path === "/recorded-publishes") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ count: recordedPublishes.length, publishes: recordedPublishes }));
      return;
    }

    if (req.method === "POST" && path === "/reset") {
      recordedPublishes.length = 0;
      eventCount = 0;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, reset: true }));
      return;
    }

    if (req.method === "POST" && path === "/events") {
      eventCount += 1;
      const body = await readBody(req);
      res.writeHead(202, { "content-type": "application/json" });
      // A the smoke test reads this: a the dispatch is logged + a the
      // pipeline's outcome is what to poll on the api/dashboard, not a
      // response from this stub (a GitHub itself answers 200 fast + works
      // asynchronously).
      res.end(JSON.stringify({ ok: true, event: "pull_request.opened", seq: eventCount, body }));
      return;
    }

    if (req.method === "POST" && path === "/review-publish") {
      const body = await readBody(req);
      recordedPublishes.push({
        ...body,
        recordedAt: new Date().toISOString(),
        recordedBy: "mock-github",
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, recorded: recordedPublishes.length }));
      return;
    }

    if (req.method === "GET" && path.startsWith("/pr-diff/")) {
      const prNumber = path.split("/")[2] ?? "1";
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          prNumber: Number(prNumber),
          diff: CANNED_PR_DIFF,
          title: `Mock PR #${prNumber}`,
          headSha: "mock".padEnd(40, "0"),
          baseRef: "main",
        })
      );
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found", path }));
  }).listen(PORT, () => {
    console.log(`mock-github listening on :${PORT}`);
  });
}

void main();
