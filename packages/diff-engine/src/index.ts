// diff-engine — the pure unified-diff parser + line map + anchor resolver +
// file risk-tier classifier.
//
// This is the *most*-tested pure code in the repo (UNIT_TEST_PLAN.md §1: a
// wrong line map = a finding anchored to the wrong line = GitHub 422s, the
// AC-203 failure). No I/O: in is a string, out is a plain object.
//
// 1-based line numbering throughout (it matches GitHub's; a finding's
// `line` field is 1-based, REVIEW_ENGINE_SPEC §2 stage [9]).

// ---------------------------------------------------------------------------
// The change-set shape (REVIEW_ENGINE_SPEC §1 "diff: ChangeSet")
// ---------------------------------------------------------------------------

/** One hunk: `@@ -oldStart,oldCount +newStart,newCount @@`. */
export interface Hunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  /** The hunk's source text, starting at the `@@` line. */
  text: string;
}

/** Per-file diff info. */
export interface ChangeSetFile {
  path: string;
  /** 1-based line numbers in the NEW file that were added (right side). */
  addedLines: number[];
  /** 1-based line numbers in the OLD file that were removed (left side). */
  removedLines: number[];
  hunks: Hunk[];
  /** `GIT binary patch` / `Binary files ... differ` — excluded from anchoring (UT-diff-parse-02). */
  isBinary: boolean;
  /** `No newline at end of file` was present on some hunk line. */
  missingTrailingNewline: boolean;
  /** Total added + removed lines (the budget gate counts this, CONTEXT_RETRIEVAL §1). */
  changedLines: number;
}

export interface ChangeSet {
  files: ChangeSetFile[];
  /** True when any file in the diff is binary. */
  binaryFlags: boolean;
}

// ---------------------------------------------------------------------------
// parseUnifiedDiff
// ---------------------------------------------------------------------------

const DIFF_HEADER = /^diff --git a\/(\S+) b\/(\S+)$/;
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
const BINARY_MARKERS = [/^Binary files /, /^GIT binary patch/];

/**
 * Parse a unified diff into a ChangeSet (UT-diff-parse-01/02/03).
 *
 * - multi-file diffs → one entry per `diff --git` block, with per-file
 *   hunk ranges + the added/removed 1-based line maps;
 * - binary / no-newline markers → the file is flagged, excluded from
 *   anchoring (its line maps stay empty);
 * - an empty / malformed diff → an empty change set, never a crash.
 */
export function parseUnifiedDiff(text: string): ChangeSet {
  const files: ChangeSetFile[] = [];
  if (typeof text !== "string" || text.length === 0) {
    return { files, binaryFlags: false };
  }

  const lines = text.split("\n");
  let current: ChangeSetFile | null = null;
  let newLineNo = 0;
  let oldLineNo = 0;
  let inHunk = false;
  let hunkText: string[] = [];
  let binarySeen = false;

  const closeHunk = (): void => {
    hunkText = [];
    inHunk = false;
  };

  for (const line of lines) {
    const fileMatch = line.match(DIFF_HEADER);
    if (fileMatch) {
      closeHunk();
      // The b/ path is the authoritative one (a the new path).
      current = {
        path: fileMatch[2],
        addedLines: [],
        removedLines: [],
        hunks: [],
        isBinary: false,
        missingTrailingNewline: false,
        changedLines: 0,
      };
      files.push(current);
      continue;
    }
    if (current === null) continue;

    if (BINARY_MARKERS.some((re) => re.test(line))) {
      current.isBinary = true;
      binarySeen = true;
      inHunk = false;
      continue;
    }
    const hunkMatch = line.match(HUNK_HEADER);
    if (hunkMatch) {
      closeHunk();
      inHunk = true;
      hunkText = [line];
      const m = hunkMatch;
      current.hunks.push({
        oldStart: parseInt(m[1], 10),
        oldCount: m[2] !== undefined ? parseInt(m[2], 10) : 1,
        newStart: parseInt(m[3], 10),
        newCount: m[4] !== undefined ? parseInt(m[4], 10) : 1,
        text: hunkText.join("\n"),
      });
      newLineNo = parseInt(m[3], 10);
      oldLineNo = parseInt(m[1], 10);
      continue;
    }
    if (inHunk) {
      hunkText.push(line);
      if (line.startsWith("+") && !line.startsWith("+++")) {
        current.addedLines.push(newLineNo);
        current.changedLines += 1;
        newLineNo += 1;
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        current.removedLines.push(oldLineNo);
        current.changedLines += 1;
        oldLineNo += 1;
      } else if (line.startsWith(" ") || line === "") {
        // Context lines advance both sides. An empty string is a context
        // line whose content is empty (a removed/added blank line is carried
        // by its +/- marker; a bare "" inside a hunk is an empty context).
        newLineNo += 1;
        oldLineNo += 1;
      } else if (line === "\\ No newline at end of file") {
        current.missingTrailingNewline = true;
      }
    }
  }
  closeHunk();

  return { files, binaryFlags: binarySeen };
}

// ---------------------------------------------------------------------------
// resolveAnchor (SERVICE_BOUNDARIES.md "diff-engine: resolveAnchor(file, line, side)")
//
// A miss is a *defined value*, not a throw (UT-anchor-01..04, the
// anchor_failed path, AC-203).
// ---------------------------------------------------------------------------

export type AnchorSide = "RIGHT" | "LEFT";

export type AnchorResolution =
  | { ok: true; file: string; line: number; side: AnchorSide }
  | { ok: false; reason: "file_not_in_diff" | "not_in_line_map"; side: AnchorSide };

/**
 * Resolve a finding's (file, line, side) against the change set.
 * - side RIGHT → the line must be in the file's addedLines;
 * - side LEFT  → the line must be in the file's removedLines;
 * - a file not in the change set, or a binary file → a defined miss.
 */
export function resolveAnchor(
  changeSet: ChangeSet,
  file: string,
  line: number,
  side: AnchorSide
): AnchorResolution {
  const f = changeSet.files.find((x) => x.path === file);
  if (f === undefined || f.isBinary) {
    return { ok: false, reason: "file_not_in_diff", side };
  }
  const map = side === "RIGHT" ? f.addedLines : f.removedLines;
  // The line maps are sorted ascending (they build in order); a Set is
  // still a clean O(1) lookup for the large diffs the budget gate trims to.
  if (!map.includes(line)) {
    return { ok: false, reason: "not_in_line_map", side };
  }
  return { ok: true, file, line, side };
}

// ---------------------------------------------------------------------------
// classifyFile — the risk-tier heuristic (REVIEW_ENGINE_SPEC §2 stage [3],
// the names in §7: {security-sensitive, db-touching, generated, test,
// dependency-manifest, other})
// ---------------------------------------------------------------------------

export type RiskTier =
  | "security-sensitive"
  | "db-touching"
  | "generated"
  | "test"
  | "dependency-manifest"
  | "other";

export interface Classification {
  riskTier: RiskTier;
  /** Generated files are excluded from the AI scope, static-only (§2 [3]). */
  inAiScope: boolean;
}

const SECURITY_PATTERNS: RegExp[] = [
  /(^|\/)(auth|authentication|authorization|security|crypto|cipher|token|session|password|credential|jwt|oauth|keys?)([/\-.])/.i,
  /\.(pem|crt|cer|key|p12)$/,
  /secret/i,
  /\b(api[-_]?key|apikey)\b/i,
];

const DB_PATTERNS: RegExp[] = [
  /(^|\/)(db|database|databases|sql|repository|repositories|models?|migrations?|prisma)([/\-.])?$/i,
  /\.(sql)$/,
  /prisma(\/|\.schema)/i,
  /\b(migrate|migration)\b/i,
];

const GENERATED_PATTERNS: RegExp[] = [
  /\.(min\.js|map|lock|snap|d\.ts|css|scss\.min)$/i,
  /(^|\/)(dist|build|out|target|coverage|node_modules|vendor|generated|gen|\.next|\.nuxt|coverage)(\/|$)/i,
  /(^|\/)(pnpm-lock|package-lock|yarn|bun|cargo|go|Gemfile)\.?(lock|sum)(\.lock)?$/,
  /(^|\/)(poetry|uv)\.lock$/,
  /^go\.mod$/,
  /(\.pb\.|\.gen\.|_generated\.)/i,
];

const TEST_PATTERNS: RegExp[] = [
  /\.(test|spec)\.[a-z]+$/i,
  /^test_[^/]+$/,
  /(^|\/)__tests__\//,
  /(^|\/)tests?\//,
  /_test\.go$/,
];

const MANIFEST_PATTERNS: RegExp[] = [
  /^package\.json$/,
  /^composer\.json$/,
  /^requirements\.txt$/,
  /^pyproject\.toml$/,
  /^setup\.(py|cfg)$/,
  /^gemfile$/,
  /^cargo\.toml$/,
  /^go\.mod$/,
  /^gradle\.properties$/,
];

function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i >= 0 ? path.slice(i + 1) : path;
}

function matchAny(patterns: readonly (RegExp | undefined)[], ...haystacks: string[]): boolean {
  return patterns.some((re) => {
    if (re === undefined) return false;
    return haystacks.some((hay) => re.test(hay));
  });
}

/**
 * Heuristic classification by path (and optionally content). The order
 * matters: dependency-manifest & generated are checked by exact name first
 * (a lockfile named `package-lock.json` is generated, not a manifest),
 * then test, then security, then db, then other.
 */
export function classifyFile(path: string, content?: string): Classification {
  const base = basename(path);

  if (matchAny(MANIFEST_PATTERNS, base)) {
    return { riskTier: "dependency-manifest", inAiScope: true };
  }
  if (matchAny(GENERATED_PATTERNS, path, base)) {
    return { riskTier: "generated", inAiScope: false };
  }
  if (matchAny(TEST_PATTERNS, path, base)) {
    return { riskTier: "test", inAiScope: true };
  }
  if (
    content !== undefined &&
    /^\s*\/\*\s*(auto-?)?generated\b/i.test(content.slice(0, 400))
  ) {
    return { riskTier: "generated", inAiScope: false };
  }
  if (matchAny(SECURITY_PATTERNS, path, base)) {
    return { riskTier: "security-sensitive", inAiScope: true };
  }
  if (matchAny(DB_PATTERNS, path, base)) {
    return { riskTier: "db-touching", inAiScope: true };
  }
  return { riskTier: "other", inAiScope: true };
}

// ---------------------------------------------------------------------------
// Risk-tier ordering for the budget gate (REVIEW_ENGINE_SPEC §2 [2]:
// security-sensitive > db-touching > logic-heavy > other). The classifier's
// tiers don't have "logic-heavy" (that's a *per-review* AI judgment, not a
// path heuristic) — the order below maps the six tiers onto the gate's
// priority: security > db > test/manifest > other, generated last (excluded
// from AI anyway, but it may still consume static-analysis budget).
// ---------------------------------------------------------------------------

export const RISK_TIER_PRIORITY: Record<RiskTier, number> = {
  "security-sensitive": 0,
  "db-touching": 1,
  "dependency-manifest": 2,
  test: 3,
  other: 4,
  generated: 5,
};
