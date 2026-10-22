// UT-anchor + UT-diff (TASK_BREAKDOWN T4.1 — the diff-engine's anchor + line
// map; here the github package's diff module carries the anchor resolver +
// the added-line-ranges parse, a pure + unit-testable).

import { describe, it, expect } from "vitest";
import { resolveAnchor, addedLineRangesFromDiff } from "./diff.js";

// A small unified diff: a two-file PR.
const DIFF = `diff --git a/src/a.ts b/src/a.ts
index 0000000..1111111 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,5 @@
 line1
+added line at new-line 2
+added line at new-line 3
 line2
 line3
diff --git a/src/b.ts b/src/b.ts
index 2222222..3333333 100644
--- a/src/b.ts
+++ b/src/b.ts
@@ -5,2 +5,4 @@
 keep
+new at new-line 6
 keep2
`;

describe("addedLineRangesFromDiff (a the per-file added line map)", () => {
  const ranges = addedLineRangesFromDiff(DIFF);

  it("tracks the added lines per file (a 1-based right-side)", () => {
    // a/src/a.ts: the hunk starts at new-line 1; lines 1 (context), 2 + 3
    // (added), 4-5 (context). Added = {2, 3}.
    expect(ranges["src/a.ts"]?.has(2)).toBe(true);
    expect(ranges["src/a.ts"]?.has(3)).toBe(true);
    expect(ranges["src/a.ts"]?.has(1)).toBe(false); // a context, not added
    // a/src/b.ts: the hunk starts at new-line 5; 5 context, 6 added, 7 context.
    expect(ranges["src/b.ts"]?.has(6)).toBe(true);
  });
});

describe("resolveAnchor (a the inline-comment anchor, a REVIEW_ENGINE_SPEC §2 stage [9])", () => {
  const ranges = addedLineRangesFromDiff(DIFF);

  it("a valid added line resolves (a RIGHT side)", () => {
    const r = resolveAnchor("src/a.ts", 2, "RIGHT", ranges);
    expect(r.ok).toBe(true);
    expect(r.line).toBe(2);
  });

  it("a line not in the added ranges → a miss (a demote to PR-body, a AC-203)", () => {
    const r = resolveAnchor("src/a.ts", 1, "RIGHT", ranges);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("not_in_added_ranges");
  });

  it("a file not in the diff → a miss", () => {
    const r = resolveAnchor("src/zzz.ts", 1, "RIGHT", ranges);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("file_not_in_diff");
  });

  it("a LEFT side (a removed-line note) is always ok", () => {
    const r = resolveAnchor("src/a.ts", 4, "LEFT", ranges);
    expect(r.ok).toBe(true);
  });
});
