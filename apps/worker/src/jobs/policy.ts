// The policy stage (REVIEW_ENGINE_SPEC §2 [10]/[11]; TASK_BREAKDOWN T4.5).
//
// Pure functions, unit-testable in isolation. `@vercode/policy-engine` is
// not merged yet — these are the worker-side application points; the
// package is a later leaf (its `applyPolicy`/`checkQuota` replace these).
//
// - Confidence floor: AI findings must reach `confidenceFloor` (default
//   0.6, org-configurable via org_settings; a per-repo override via
//   repo_rules). Static findings are EXEMPT — they're deterministic
//   (ADR-005 "a provider outage still yields a useful, if partial, review").
// - Suppression: categories suppressed per-repo / per-org never publish
//   (FR-308).

import type { CanonicalFinding } from "./review.js";
import type { PolicyState } from "../config.js";

/** The dedup (stage [10]): (file, line, category) → highest-confidence survivor. */
export function dedupFindings(findings: CanonicalFinding[]): {
  deduped: CanonicalFinding[];
  droppedDeduped: number;
} {
  const map = new Map<string, CanonicalFinding>();
  let dropped = 0;
  for (const f of findings) {
    const key = `${f.file}:${f.line}:${f.category}`;
    const existing = map.get(key);
    if (existing === undefined) {
      map.set(key, f);
    } else {
      dropped += 1;
      if (f.confidence > existing.confidence) map.set(key, f);
    }
  }
  return { deduped: [...map.values()], droppedDeduped: dropped };
}

export interface PolicyOutcome {
  published: CanonicalFinding[];
  /** The dropped counters (the "dropped" block of the result, REVIEW_ENGINE_SPEC §1). */
  belowFloor: number;
  suppressedByRule: number;
}

function normalizeCategory(c: string): string {
  return c.replace(/[-_]/g, "-");
}

/**
 * Policy (stage [11]): the confidence floor (static exempt) + the
 * per-repo / per-org suppression. `repoRules` carries the durable
 * repo_rules rows (the suppressCategories + a optional per-repo floor
 * override, the Prisma Decimal-as-string coerced here, never assumed).
 */
export function applyPolicy(
  findings: CanonicalFinding[],
  policy: PolicyState,
  repoRules: Array<{
    suppressCategories: unknown;
    confidenceFloorOverride?: unknown;
  }>
): PolicyOutcome {
  let effectiveFloor = policy.confidenceFloor;
  const suppress: string[] = [...policy.suppressCategories];
  for (const rule of repoRules) {
    // The override is a Prisma Decimal (string-backed) or a plain number.
    const raw = rule.confidenceFloorOverride;
    const override: number | null =
      raw == null
        ? null
        : typeof raw === "number"
          ? raw
          : Number((raw as { toString(): string }).toString());
    if (override != null && !Number.isNaN(override)) {
      effectiveFloor = Math.max(effectiveFloor, override);
    }
    const cats = Array.isArray(rule.suppressCategories)
      ? (rule.suppressCategories as string[])
      : [];
    suppress.push(...cats);
  }
  const suppressed = new Set(suppress.map(normalizeCategory));

  const published: CanonicalFinding[] = [];
  let belowFloor = 0;
  let suppressedByRule = 0;
  for (const f of findings) {
    const isStatic = f.source === "eslint" || f.source === "semgrep";
    if (!isStatic && f.confidence < effectiveFloor) {
      belowFloor += 1;
      continue;
    }
    if (suppressed.has(normalizeCategory(f.category))) {
      suppressedByRule += 1;
      continue;
    }
    published.push(f);
  }
  return { published, belowFloor, suppressedByRule };
}
