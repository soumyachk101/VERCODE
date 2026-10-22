// The policy stage (REVIEW_ENGINE_SPEC §2 [10]/[11]; TASK_BREAKDOWN T4.5).
//
// Thin worker-side wrappers over `@vercode/policy-engine` — the package owns
// the rules (the confidence floor, the suppression, the dedup key, the
// policy resolution); the worker owns the I/O (re-reading the durable rows,
// orgId-scoped, SERVICE_BOUNDARIES.md "never trust the payload for authz").

import {
  applyPolicy as applyPolicyRules,
  dedupKey,
  resolvePolicy,
  type OrgSettingsLike,
  type RepoRuleLike,
  type ReviewPolicy,
} from "@vercode/policy-engine";
import type { PolicyState } from "../config.js";
import type { CanonicalFinding } from "./review.js";

export type { ReviewPolicy, OrgSettingsLike, RepoRuleLike };

/**
 * Resolve the effective policy from the durable rows (org_settings +
 * repo_rules + the platform defaults). The floor only ever goes UP (a repo
 * rule may raise it above the org's; it may not lower it below the platform
 * default).
 */
export function resolveWorkerPolicy(input: {
  defaults: PolicyState;
  orgSettings?: OrgSettingsLike | null;
  repoRules?: RepoRuleLike[];
}): ReviewPolicy {
  return resolvePolicy({
    defaults: {
      confidenceFloor: input.defaults.confidenceFloor,
      maxFiles: input.defaults.maxFiles,
      maxLines: input.defaults.maxLines,
      suppressCategories: input.defaults.suppressCategories as ReviewPolicy["suppressCategories"],
    },
    orgSettings: input.orgSettings,
    repoRules: input.repoRules,
  });
}

/**
 * The dedup (stage [10]): (file, line, category) → the highest-confidence
 * survivor (a tie → the longer/more-specific description wins).
 */
export function dedupFindings(findings: CanonicalFinding[]): {
  deduped: CanonicalFinding[];
  droppedDeduped: number;
} {
  const map = new Map<string, CanonicalFinding>();
  let dropped = 0;
  for (const f of findings) {
    const key = dedupKey(f.file, f.line, f.category);
    const existing = map.get(key);
    if (existing === undefined) {
      map.set(key, f);
      continue;
    }
    dropped += 1;
    const better =
      f.confidence > existing.confidence ||
      (f.confidence === existing.confidence && f.description.length > existing.description.length);
    if (better) map.set(key, f);
  }
  return { deduped: [...map.values()], droppedDeduped: dropped };
}

export interface PolicyOutcome {
  published: CanonicalFinding[];
  /** The dropped-below-floor counter (the deterministic findings are exempt). */
  belowFloor: number;
  /** The dropped-by-suppression counter. */
  suppressedByRule: number;
}

/**
 * Policy (stage [11]): the confidence floor (the static findings exempt,
 * ADR-005) + the per-repo / per-org suppression (FR-308).
 *
 * `repoRules` carries the durable repo_rules rows (suppressCategories + the
 * confidenceFloorOverride). The resolved policy merges the org defaults with
 * the per-repo overrides (the floor only goes UP).
 */
export function applyPolicy(
  findings: CanonicalFinding[],
  policy: PolicyState,
  repoRules: RepoRuleLike[] = []
): PolicyOutcome {
  const resolved = resolveWorkerPolicy({
    defaults: {
      confidenceFloor: policy.confidenceFloor,
      maxFiles: policy.maxFiles,
      maxLines: policy.maxLines,
      suppressCategories: policy.suppressCategories,
    },
    repoRules,
  });

  // The package's applyPolicy works on the generic shape; the findings map
  // onto it and the survivors map back (the rule lives in one place).
  const mapped = findings.map((f) => ({
    ref: f,
    source: f.source,
    category: f.category,
    confidence: f.confidence,
    severity: f.severity,
  }));
  const out = applyPolicyRules(mapped, resolved);
  const keep = new Set(out.published.map((m) => m.ref));
  const published = findings.filter((f) => keep.has(f));
  return {
    published,
    belowFloor: out.belowFloor,
    suppressedByRule: out.suppressed,
  };
}
