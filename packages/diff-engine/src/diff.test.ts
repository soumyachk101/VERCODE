import { describe, it, expect } from "vitest";
import {
  parseUnifiedDiff,
  resolveAnchor,
  classifyFile,
  type ChangeSet,
} from "./index.js";

// ---------------------------------------------------------------------------
// The fixtures
// ---------------------------------------------------------------------------

const MULTI_FILE_DIFF = `diff --git a/src/auth.ts b/src/auth.ts
index 1111111..2222222 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -10,6 +10,9 @@
 import { token } from "./token.js";

-export function make(key: string) {
+export function make(key: string, ttl: number) {
+  if (ttl <= 0) {
+    throw new Error("bad ttl");
+  }
   return sign(key);
 }

diff --git a/lib/util.js b/lib/util.js
index 3333333..4444444 100644
--- /dev/null
+++ b/lib/util.js
@@ -0,0 +1,3 @@
+function clamp(n, lo, hi) {
+  return Math.max(lo, Math.min(hi, n));
+}
`;

// A mixed-hunk diff used by the range tests (UT-diff-ranges-01/02).
const MIXED_DIFF = `diff --git a/a.txt b/a.txt
index 0000000..1111111 100644
--- a/a.txt
+++ b/a.txt
@@ -2,4 +2,5 @@
 keep1
-drop me
-also drop
+add one
+add two
 keep2
`;

const BINARY_DIFF = `diff --git a/img/logo.png b/img/logo.png
index e69de29..7898192 100644
Binary files a/img/logo.png and b/img/logo.png differ
diff --git a/bin/blob b/bin/blob
GIT binary patch
literal 0

zcmV:
`;

function parseOf(text: string): ChangeSet {
  return parseUnifiedDiff(text);
}

// ---------------------------------------------------------------------------
// UT-diff-parse-01: a multi-file diff → file list + per-file hunk ranges
// ---------------------------------------------------------------------------

describe("UT-diff-parse-01 multi-file diff", () => {
  it("lists every file with path + hunks", () => {
    const cs = parseOf(MULTI_FILE_DIFF);
    expect(cs.files.map((f) => f.path)).toEqual(["src/auth.ts", "lib/util.js"]);
    expect(cs.files[0].hunks).toHaveLength(1);
    expect(cs.files[0].hunks[0].newStart).toBe(10);
    expect(cs.files[0].hunks[0].oldStart).toBe(10);
    expect(cs.files[1].hunks[0].newStart).toBe(1);
    expect(cs.files[1].hunks[0].oldStart).toBe(0);
    expect(cs.binaryFlags).toBe(false);
  });

  it("tracks added/removed changedLines counts", () => {
    const cs = parseOf(MULTI_FILE_DIFF);
    expect(cs.files[0].changedLines).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// UT-diff-parse-02: binary / no-newline markers → flagged, excluded
// ---------------------------------------------------------------------------

describe("UT-diff-parse-02 binary markers", () => {
  it("flags binary files and sets binaryFlags", () => {
    const cs = parseOf(BINARY_DIFF);
    expect(cs.binaryFlags).toBe(true);
    expect(cs.files.every((f) => f.isBinary)).toBe(true);
    // Binary files carry no line maps (excluded from anchoring).
    expect(cs.files[0].addedLines).toEqual([]);
  });

  it("a mixed diff has binaryFlags true but keeps text files", () => {
    const cs = parseOf(BINARY_DIFF + MULTI_FILE_DIFF);
    expect(cs.binaryFlags).toBe(true);
    expect(cs.files[2].isBinary).toBe(false);
    expect(cs.files[2].addedLines.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// UT-diff-parse-03: an empty diff → an empty change set, not a crash
// ---------------------------------------------------------------------------

describe("UT-diff-parse-03 empty input", () => {
  it("empty string → empty change set", () => {
    const cs = parseOf("");
    expect(cs.files).toEqual([]);
    expect(cs.binaryFlags).toBe(false);
  });

  it("garbage that is not a diff → empty change set (no crash)", () => {
    const cs = parseOf("hello world\nnot a diff\n");
    expect(cs.files).toEqual([]);
  });

  it("a diff with no newlines at end of file flags it", () => {
    const cs = parseOf(
      'diff --git a/x b/x\n@@ -1 +1 @@\n-a\n+b\n\\ No newline at end of file'
    );
    expect(cs.files[0].missingTrailingNewline).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// UT-anchor-01..04: resolveAnchor returns a defined miss, not a throw
// ---------------------------------------------------------------------------

describe("UT-anchor-01 a valid added-line anchor resolves", () => {
  it("resolves a RIGHT-side added line", () => {
    const cs = parseOf(MULTI_FILE_DIFF);
    // lib/util.js added lines 1..3.
    expect(resolveAnchor(cs, "lib/util.js", 2, "RIGHT")).toEqual({
      ok: true,
      file: "lib/util.js",
      line: 2,
      side: "RIGHT",
    });
  });
});

describe("UT-anchor-02 a line not in the added ranges → a defined miss", () => {
  it("returns a miss value, never throws", () => {
    const cs = parseOf(MIXED_DIFF);
    // a.txt added lines are 4 and 5 (new side). Line 99 is not added.
    const res = resolveAnchor(cs, "a.txt", 99, "RIGHT");
    expect(res).toEqual({ ok: false, reason: "not_in_line_map", side: "RIGHT" });
  });
});

describe("UT-anchor-03 a removed-line anchor (LEFT) resolves against removedLines", () => {
  it("resolves a LEFT-side removed line", () => {
    const cs = parseOf(MIXED_DIFF);
    // Removed old lines: 3 and 4.
    expect(resolveAnchor(cs, "a.txt", 3, "LEFT").ok).toBe(true);
    expect(resolveAnchor(cs, "a.txt", 4, "LEFT").ok).toBe(true);
    // Old line 2 is context (kept), not removed.
    expect(resolveAnchor(cs, "a.txt", 2, "LEFT")).toEqual({
      ok: false,
      reason: "not_in_line_map",
      side: "LEFT",
    });
  });
});

describe("UT-anchor-04 a file not in the change set → miss", () => {
  it("returns file_not_in_diff", () => {
    const cs = parseOf(MIXED_DIFF);
    expect(resolveAnchor(cs, "nope.js", 1, "RIGHT")).toEqual({
      ok: false,
      reason: "file_not_in_diff",
      side: "RIGHT",
    });
  });
});

// ---------------------------------------------------------------------------
// UT-diff-ranges-01/02: exact added/removed ranges + 1-based numbering
// ---------------------------------------------------------------------------

describe("UT-diff-ranges-01 a mixed hunk yields exact ranges", () => {
  it("addedLines match the new-file line numbers", () => {
    const cs = parseOf(MIXED_DIFF);
    // Hunk header @@ -2,4 +2,5 @@: old starts at 2, new starts at 2.
    // Old lines: 2=keep1 (ctx), 3=drop me (-), 4=also drop (-), 5=keep2 (ctx)
    // New lines: 2=keep1 (ctx), 3=add one (+), 4=add two (+), 5=keep2 (ctx)
    expect(cs.files[0].addedLines).toEqual([3, 4]);
    expect(cs.files[0].removedLines).toEqual([3, 4]);
  });
});

describe("UT-diff-ranges-02 1-based line numbering matches GitHub", () => {
  it("a new file starts its added lines at 1", () => {
    const cs = parseOf(MULTI_FILE_DIFF);
    const util = cs.files[1];
    expect(util.addedLines).toEqual([1, 2, 3]);
    expect(util.removedLines).toEqual([]);
  });

  it("a mid-file addition starts at the hunk's new start", () => {
    const cs = parseOf(MULTI_FILE_DIFF);
    const auth = cs.files[0];
    // Hunk @@ -10,6 +10,9 @@, first new line number 10. The '+' lines in the
    // hunk are lines 11,12,13,14 (context line 10 counts, then + lines).
    expect(auth.addedLines).toEqual([11, 12, 13, 14]);
    expect(auth.removedLines).toEqual([11]);
  });
});

// ---------------------------------------------------------------------------
// UT-classify: the risk-tier classifier (REVIEW_ENGINE_SPEC §7 names)
// ---------------------------------------------------------------------------

describe("UT-classify risk tiers", () => {
  it("crypto/auth files → security-sensitive", () => {
    expect(classifyFile("src/auth/passwords.ts").riskTier).toBe("security-sensitive");
    expect(classifyFile("lib/crypto/jwt.ts").riskTier).toBe("security-sensitive");
    expect(classifyFile("keys/service.key").riskTier).toBe("security-sensitive");
  });

  it("db/query files → db-touching", () => {
    expect(classifyFile("src/db/users.sql").riskTier).toBe("db-touching");
    expect(classifyFile("src/repositories/user.ts").riskTier).toBe("db-touching");
    expect(classifyFile("prisma/schema.prisma").riskTier).toBe("db-touching");
  });

  it("lockfiles / build output → generated", () => {
    expect(classifyFile("pnpm-lock.yaml").riskTier).toBe("generated");
    expect(classifyFile("dist/bundle.min.js").riskTier).toBe("generated");
    expect(classifyFile("coverage/lcov.info").riskTier).toBe("generated");
  });

  it("test files → test", () => {
    expect(classifyFile("src/foo.test.ts").riskTier).toBe("test");
    expect(classifyFile("tests/test_bar.py").riskTier).toBe("test");
    expect(classifyFile("pkg/baz_test.go").riskTier).toBe("test");
  });

  it("manifests → dependency-manifest", () => {
    expect(classifyFile("package.json").riskTier).toBe("dependency-manifest");
    expect(classifyFile("requirements.txt").riskTier).toBe("dependency-manifest");
    expect(classifyFile("Cargo.toml").riskTier).toBe("dependency-manifest");
  });

  it("everything else → other", () => {
    expect(classifyFile("src/utils/strings.ts").riskTier).toBe("other");
  });

  it("generated files are out of the AI scope; the rest in", () => {
    expect(classifyFile("pnpm-lock.yaml").inAiScope).toBe(false);
    expect(classifyFile("src/auth.ts").inAiScope).toBe(true);
  });

  it("content signals: a generated-file marker", () => {
    expect(classifyFile("out/gen.js", "// Generated by something\n").riskTier).toBe(
      "generated"
    );
    expect(classifyFile("out/gen.js", "const x = 1;\n").riskTier).toBe("generated");
  });
});
