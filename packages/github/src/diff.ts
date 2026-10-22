// The PR diff + bounded-context fetch (INTEGRATION_DESIGN.md §1.5 "the diff
// fetch: a `GET /repos/{o}/{r}/pulls/{n}` with `Accept: application/vnd.github.diff`"
// + the bounded context, a FR-401 "a fetch only the changed files + their
// direct import graph, a not the whole repo").
//
// This module is a *thin transport wrapper* — it defines the request + the
// response shape, and a `fetchPR` interface the worker uses. The *actual*
// GitHub REST call goes through a `GithubHttpClient` (a the mock transport
// in the dev-stack, a the Octokit transport in prod). The diff is cached in
// Redis under an org-scoped key (a CONTEXT_RETRIEVAL.md §4 "a fetched diffs
// are cached in Redis under an org-scoped key, a 24 h TTL").

import { z } from "zod";

// The diff fetch request (a what the worker asks for).
export const FetchPRDiffRequestSchema = z.object({
  orgId: z.string().min(1),
  githubRepoId: z.number().int(),
  repoFullName: z.string(),
  prNumber: z.number().int().positive(),
  headSha: z.string().min(40),
});
export type FetchPRDiffRequest = z.infer<typeof FetchPRDiffRequestSchema>;

// The diff response (a the unified diff + the PR metadata the pipeline needs).
export const PRDiffSchema = z.object({
  diff: z.string(),
  prNumber: z.number().int().positive(),
  title: z.string(),
  headSha: z.string(),
  baseRef: z.string(),
  author: z.string().optional(),
});
export type PRDiff = z.infer<typeof PRDiffSchema>;

// The transport interface (a the mock + the real Octokit both implement this).
export interface GithubDiffClient {
  /**
   * Fetch the PR's unified diff + metadata at the head SHA.
   *
   * In the dev-stack this is the mock-github stub (a canned diff, a no
   * network, a deterministic). In prod this is Octokit with the
   * installation token + a rate-limit backoff (a INTEGRATION_DESIGN.md
   * §1.7 "a 403/429 with `x-poll-interval` → backoff + retry the *publish*
   * step only").
   */
  fetchPRDiff(req: FetchPRDiffRequest): Promise<PRDiff>;
}

// ---------------------------------------------------------------------------
// The anchor resolver (a "a finding's line resolves against the diff's
// added-line ranges", a REVIEW_ENGINE_SPEC.md §2 stage [9] "a line-valid: a
// finding.line ∈ diff.addedLines[file]", a FR-306).
//
// A *pure* line-map from the diff (a the diff-engine owns the full
// parseUnifiedDiff; this is the *anchor* subset the publisher needs before
// posting an inline comment, a INTEGRATION_DESIGN.md §1.6 "a the line
// validation precedes publication").
// ---------------------------------------------------------------------------

export interface AnchorResult {
  ok: boolean;
  /** The GitHub-side line number (a 1-based, a the right side of the diff). */
  line?: number;
  /** `RIGHT` (a the new file) or `LEFT` (a the old file, a a removed-line note). */
  side: "RIGHT" | "LEFT";
  reason?: "not_in_added_ranges" | "file_not_in_diff" | "line_out_of_range";
}

/**
 * Resolve a finding's (file, line) to a GitHub inline-comment anchor.
 *
 * The diff provides the per-file *added* line ranges (a the new-file line
 * numbers that were added). A finding line that's not in the added ranges
 * can't be an inline comment on the right side (a GitHub 422s on it) →
 * demote to a PR-body section (a `anchor_failed`, a AC-203 "a finding whose
 * line does not resolve to the diff → demote to a sectioned PR comment").
 *
 * @param addedLineRanges a map of file → the set of added (right-side) line
 *   numbers in that file, a parsed from the diff's hunks.
 */
export function resolveAnchor(
  file: string,
  line: number,
  side: "RIGHT" | "LEFT",
  addedLineRanges: Record<string, Set<number>>
): AnchorResult {
  if (side === "LEFT") {
    // A removed-line note: a valid on the left side (a we don't validate the
    // removed ranges here — a removed-line is a "this line was deleted"
    // finding, a not an inline-on-new-line).
    return { ok: true, line, side };
  }
  // A RIGHT side: the line must be in the file's added ranges.
  const ranges = addedLineRanges[file];
  if (!ranges) {
    return { ok: false, side, reason: "file_not_in_diff" };
  }
  if (!ranges.has(line)) {
    return { ok: false, side, reason: "not_in_added_ranges" };
  }
  return { ok: true, line, side };
}

/**
 * Build the per-file added-line-range map from a unified diff (a the
 * diff-engine's `parseUnifiedDiff` returns this; a this is the shape the
 * publisher consumes). A line number is the *new-file* (right-side) number.
 */
export function addedLineRangesFromDiff(diff: string): Record<string, Set<number>> {
  const result: Record<string, Set<number>> = {};
  // The hunk headers: `@@ -oldStart,oldCount +newStart,newCount @@`
  const lines = diff.split("\n");
  let currentFile: string | null = null;
  let newLineNo = 0;
  let inHunk = false;

  for (const line of lines) {
    const fileMatch = line.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (fileMatch) {
      currentFile = fileMatch[2];
      result[currentFile] = new Set();
      inHunk = false;
      newLineNo = 0;
      continue;
    }
    if (currentFile === null) continue;
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      inHunk = true;
      newLineNo = parseInt(hunkMatch[1], 10);
      continue;
    }
    if (inHunk) {
      if (line.startsWith("+") && !line.startsWith("+++")) {
        // A added line: the new-file line number is newLineNo (a 1-based,
        // a the right side).
        result[currentFile].add(newLineNo);
        newLineNo += 1;
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        // A removed line: the new-file counter doesn't advance.
      } else if (line.startsWith(" ")) {
        // A context line: the new-file counter advances.
        newLineNo += 1;
      }
      // A line that's neither (a a hunk boundary) resets the inHunk state is
      // handled on the next hunk header.
    }
  }

  return result;
}
