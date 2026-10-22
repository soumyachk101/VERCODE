// The GitHub diff client + publisher seams (INTEGRATION_DESIGN.md §1.5/§1.6).
//
// The mock diff client (USE_MOCK_GITHUB=true, TRD.md §18 "a mock-GitHub
// provider for pipeline tests") reads a unified-diff fixture from
// tests/fixtures/ — deterministic, no network. The real Octokit client is a
// later leaf behind the same GithubDiffClient interface (@vercode/github).
//
// The mock publisher records publishes in-memory (dev) or to a JSON file; the
// real Octokit publisher is a later leaf behind GithubPublisher.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  type FetchPRDiffRequest,
  type GithubDiffClient,
  type PRDiff,
} from "@vercode/github";
import type { GithubPublisher } from "./config.js";

// ---------------------------------------------------------------------------
// The mock diff client — reads a fixture per (repoFullName, prNumber, headSha).
// ---------------------------------------------------------------------------

export interface MockGithubDeps {
  /** The fixtures directory (tests/fixtures by default). */
  fixturesDir?: string;
  /** The PR metadata to attach to the fixture diff (defaults to sensible). */
  prMetadata?: Partial<Record<number, { title: string; baseRef: string; author?: string }>>;
}

export function makeMockGithubClient(deps: MockGithubDeps = {}): GithubDiffClient {
  const fixturesDir =
    deps.fixturesDir ??
    new URL("../../tests/fixtures", import.meta.url).pathname;

  return {
    async fetchPRDiff(req: FetchPRDiffRequest): Promise<PRDiff> {
      // A fixture is keyed by repo + pr: `<repoFullName>__pr-<n>.diff`.
      const safeRepo = req.repoFullName.replace(/[^a-zA-Z0-9._-]+/g, "-");
      const file = `${fixturesDir}/${safeRepo}__pr-${req.prNumber}.diff`;
      const diff = existsSync(file) ? readFileSync(file, "utf8") : DEFAULT_FIXTURE_DIFF;
      const meta = deps.prMetadata?.[req.prNumber] ?? {};
      return {
        diff,
        prNumber: req.prNumber,
        title: meta.title ?? `Mock PR #${req.prNumber}`,
        headSha: req.headSha,
        baseRef: meta.baseRef ?? "main",
        author: meta.author,
      };
    },
  };
}

// A fallback diff (a two-file PR) if a fixture is missing — the pipeline still
// runs deterministically. A test that asserts on specific findings supplies
// its own fixture.
export const DEFAULT_FIXTURE_DIFF = `diff --git a/src/alpha.ts b/src/alpha.ts
index 0000000..1111111 100644
--- a/src/alpha.ts
+++ b/src/alpha.ts
@@ -1,3 +1,6 @@
 line one
+const leaked = getSecret();
+console.log(leaked);
 line two
 line three
diff --git a/src/beta.ts b/src/beta.ts
index 2222222..3333333 100644
--- a/src/beta.ts
+++ b/src/beta.ts
@@ -5,2 +5,4 @@
 keep
+const maybe = parse(x);
 keep2
`;

// ---------------------------------------------------------------------------
// The mock publisher — records publishes in-memory + optionally to a JSON
// file (dev). A real Octokit publisher is a later seam.
// ---------------------------------------------------------------------------

export interface PublishRecord {
  repoId: string;
  repoFullName: string;
  prNumber: number;
  commitSha: string;
  publishedGithubReviewId: string;
  summary: string;
  inlineComments: Array<{ path: string; side: "RIGHT" | "LEFT"; line: number; body: string }>;
  publishedAt: string;
}

export class MockGithubPublisher implements GithubPublisher {
  readonly records: PublishRecord[] = [];
  private counter = 0;
  /** A fail-toggle: when set to a function/true the next publish throws (test the persist-then-publish invariant). */
  failNext?: () => Error | undefined;
  /** The on-disk record path (dev). */
  private readonly outPath?: string;

  constructor(opts?: { outPath?: string }) {
    this.outPath = opts?.outPath;
  }

  async publish(params: {
    repoId: string;
    repoFullName: string;
    prNumber: number;
    commitSha: string;
    summary: string;
    inlineComments: Array<{ path: string; side: "RIGHT" | "LEFT"; line: number; body: string }>;
  }): Promise<{ publishedGithubReviewId: string }> {
    const injected = this.failNext?.();
    if (injected) throw injected;

    this.counter += 1;
    const rec: PublishRecord = {
      ...params,
      publishedGithubReviewId: `mock-review-${this.counter}`,
      publishedAt: new Date().toISOString(),
    };
    this.records.push(rec);
    if (this.outPath) {
      mkdirSync(dirname(this.outPath), { recursive: true });
      const prev = existsSync(this.outPath) ? readFileSync(this.outPath, "utf8") : "[]";
      const arr = JSON.parse(prev) as PublishRecord[];
      arr.push(rec);
      writeFileSync(this.outPath, JSON.stringify(arr, null, 2));
    }
    return { publishedGithubReviewId: rec.publishedGithubReviewId };
  }
}
