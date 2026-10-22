// policy-engine — the pure policy surface: the confidence floor, the
// per-repo/per-org suppression, the severity gating, the quota check, and
// the file-budget check (TASK_BREAKDOWN T4.5; REVIEW_ENGINE_SPEC §2 stages
// [0]/[2]/[11]).
//
// Pure: no I/O, no AI, no DB (SERVICE_BOUNDARIES "policy-engine: applyPolicy,
// checkQuota — forbidden: AI/DB calls"). The worker re-reads the durable
// rows (org_settings + repo_rules + usage_events) and hands the *resolved
// values* to these functions.
//
// Invariants (the ones the docs pin):
//   - a static (deterministic) finding is EXEMPT from the confidence floor
//     (ADR-005: a provider outage still yields a useful, if partial, review);
//   - a suppressed category never publishes, at any confidence;
//   - the quota check reads the plan's caps (contracts/plans.ts) + the
//     org's monthly usage aggregate — one enforcement point (AC-401/402).

import {
  type FindingCategory,
  type Plan,
  planQuota,
} from "@vercode/contracts";

// ---------------------------------------------------------------------------
// The resolved policy (what the org's durable rows reduce to)
// ---------------------------------------------------------------------------

export interface ReviewPolicy {
  /** The AI-finding confidence floor (default 0.6; org-configurable). */
  confidenceFloor: number;
  /** The categories suppressed for this repo (per-repo + per-org merge). */
  suppressCategories: FindingCategory[];
  /** The per-review file budget (a degrade, not a skip). */
  maxFiles: number;
  /** The per-review changed-line budget (a degrade, not a skip). */
  maxLines: number;
}

export const DEFAULT_CONFIDENCE_FLOOR = 0.6;

export interface RepoRuleLike {
  /** The suppressed categories (the Prisma JSON column). */
  suppressCategories?: unknown;
  /** A per-repo floor override (the Prisma Decimal — string-backed). */
  confidenceFloorOverride?: unknown;
}

export interface OrgSettingsLike {
  /** The org-level floor override (the Prisma Decimal — string-backed). */
  confidenceFloor?: unknown;
  /** The org-level max-files / max-lines overrides (nullable). */
  maxFiles?: unknown;
  maxLines?: unknown;
  /** The org-level suppressed categories (the Prisma JSON column). */
  suppressCategories?: unknown;
}

/** Coerce a Prisma Decimal (string-backed) / number into a number, safely. */
export function coerceNumber(raw: unknown): number | null {
  if (raw == null) return null;
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number(raw)
        : Number((raw as { toString(): string }).toString());
  return Number.isFinite(n) ? n : null;
}

function coerceCategories(raw: unknown): FindingCategory[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((c): c is FindingCategory => typeof c === "string");
}

/**
 * Resolve the effective policy from the durable rows:
 *   the org's settings (org_settings) + the repo's rules (repo_rules) +
 *   the platform defaults.
 *
 * The floor only ever goes UP (a repo rule may raise it above the org's;
 * a repo rule may not lower it below the platform's default).
 */
export function resolvePolicy(input: {
  defaults?: {
    confidenceFloor?: number;
    maxFiles?: number;
    maxLines?: number;
    suppressCategories?: FindingCategory[];
  };
  orgSettings?: OrgSettingsLike | null;
  repoRules?: RepoRuleLike[];
}): ReviewPolicy {
  const defaults = input.defaults ?? {};
  let floor = defaults.confidenceFloor ?? DEFAULT_CONFIDENCE_FLOOR;
  let maxFiles = defaults.maxFiles ?? 60;
  let maxLines = defaults.maxLines ?? 3000;
  const suppressed = new Set<string>();
  for (const c of defaults.suppressCategories ?? []) suppressed.add(c);

  const settings = input.orgSettings;
  if (settings) {
    const orgFloor = coerceNumber(settings.confidenceFloor);
    if (orgFloor != null) floor = Math.max(floor, orgFloor);
    const orgFiles = coerceNumber(settings.maxFiles);
    if (orgFiles != null && orgFiles > 0) maxFiles = orgFiles;
    const orgLines = coerceNumber(settings.maxLines);
    if (orgLines != null && orgLines > 0) maxLines = orgLines;
    for (const c of coerceCategories(settings.suppressCategories)) suppressed.add(c);
  }

  for (const rule of input.repoRules ?? []) {
    const ruleFloor = coerceNumber(rule.confidenceFloorOverride);
    if (ruleFloor != null) floor = Math.max(floor, ruleFloor);
    for (const c of coerceCategories(rule.suppressCategories)) suppressed.add(c);
  }

  return {
    confidenceFloor: floor,
    suppressCategories: [...suppressed] as FindingCategory[],
    maxFiles,
    maxLines,
  };
}

// ---------------------------------------------------------------------------
// The dedup key (stage [10]: the key is (file, line, category))
// ---------------------------------------------------------------------------

/** The dedup key: (file, line, category) — FR-307 / REVIEW_ENGINE_SPEC §2 [10]. */
export function dedupKey(file: string, line: number, category: string): string {
  return `${file}:${line}:${category}`;
}

// ---------------------------------------------------------------------------
// applyPolicy — the confidence floor + the suppression + the severity gating
// ---------------------------------------------------------------------------

export interface PolicyFinding {
  source?: string;
  category: string;
  confidence: number;
  severity?: string;
}

/** A the deterministic sources (a exempt from the confidence floor). */
export function isDeterministic(source: string | undefined): boolean {
  return source === "eslint" || source === "semgrep";
}

export interface PolicyOutcome<T> {
  published: T[];
  /** The dropped-below-floor counter. */
  belowFloor: number;
  /** The dropped-by-suppression counter. */
  suppressed: number;
  /** The dropped-by-severity-gate counter. */
  belowSeverity: number;
}

/**
 * Apply the policy to a finding set.
 *
 * @param findings the findings to filter.
 * @param policy the resolved policy (the floor + the suppressions).
 * @param minSeverity an optional severity gate (the severities *below* it
 *   are dropped). The default: no gate.
 */
export function applyPolicy<T extends PolicyFinding>(
  findings: T[],
  policy: ReviewPolicy
  minSeverity?: "low" | "medium" | "high" | "critical"
): PolicyOutcome<T> {
  const severityRank: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
  const gate = minSeverity ? severityRank[minSeverity] : 0;
  const suppressed = new Set(policy.suppressCategories.map((c) => c.replace(/[-_]/g, "-")));

  const published: T[] = [];
  let belowFloor = 0;
  let suppressedCount = 0;
  let belowSeverity = 0;

  for (const f of findings) {
    if (f.severity != null && gate > 0 && (severityRank[f.severity] ?? 0) < gate) {
      belowSeverity += 1;
      continue;
    }
    if (suppressed.has(f.category.replace(/[-_]/g, "-"))) {
      suppressedCount += 1;
      continue;
    }
    // A the deterministic findings are exempt from the floor (ADR-005).
    if (!isDeterministic(f.source) && f.confidence < policy.confidenceFloor) {
      belowFloor += 1;
      continue;
    }
    published.push(f);
  }
  return { published, belowFloor, suppressed: suppressedCount, belowSeverity };
}

// ---------------------------------------------------------------------------
// checkQuota — the single enforcement point (USAGE_QUOTAS §4, AC-401/402)
// ---------------------------------------------------------------------------

export interface QuotaUsage {
  /** The reviews recorded in the current month. */
  reviewsUsed: number;
  /** The provider spend recorded in the current month (USD). */
  tokenSpendUsedUsd: number;
}

export interface QuotaState {
  over: boolean;
  /** A human-readable "used/cap" detail (a the skip notice carries it). */
  detail: string;
  reviewsUsed: number;
  reviewsCap: number;
  tokenSpendUsedUsd: number;
  tokenSpendCapUsd: number;
}

/**
 * The quota check: the org is over its plan's cap when the monthly review
 * count or the monthly token-spend has reached the cap.
 *
 * The N+1th review skips (NFR-18): the check is `used >= cap`.
 */
export function checkQuota(plan: Plan, usage: QuotaUsage): QuotaState {
  const quota = planQuota(plan);
  const reviewsUsed = usage.reviewsUsed;
  const spend = usage.tokenSpendUsedUsd;

  if (quota.reviewsPerMonth > 0 && reviewsUsed >= quota.reviewsPerMonth) {
    return {
      over: true,
      detail: `${reviewsUsed}/${quota.reviewsPerMonth} reviews`,
      reviewsUsed,
      reviewsCap: quota.reviewsPerMonth,
      tokenSpendUsedUsd: spend,
      tokenSpendCapUsd: quota.tokenSpendCapMonthlyUsd,
    };
  }
  if (quota.tokenSpendCapMonthlyUsd > 0 && spend >= quota.tokenSpendCapMonthlyUsd) {
    return {
      over: true,
      detail: `spend $${spend.toFixed(2)} / $${quota.tokenSpendCapMonthlyUsd}`,
      reviewsUsed,
      reviewsCap: quota.reviewsPerMonth,
      tokenSpendUsedUsd: spend,
      tokenSpendCapUsd: quota.tokenSpendCapMonthlyUsd,
    };
  }
  return {
    over: false,
    detail: `${reviewsUsed}/${quota.reviewsPerMonth} reviews`,
    reviewsUsed,
    reviewsCap: quota.reviewsPerMonth,
    tokenSpendUsedUsd: spend,
    tokenSpendCapUsd: quota.tokenSpendCapMonthlyUsd,
  };
}

// ---------------------------------------------------------------------------
// The budget check (a degrade, not a skip — REVIEW_ENGINE_SPEC §2 stage [2])
// ---------------------------------------------------------------------------

export interface BudgetState {
  overBudget: boolean;
  /** The files in scope after the trim (the top-N by risk tier). */
  inScopeFiles: string[];
  /** The files that fell out of the trim (listed in the appendix). */
  trimmedFiles: string[];
}

/**
 * The file/line budget check. A over-budget is a *degrade* (the
 * highest-risk files are kept), never a skip (REVIEW_ENGINE_SPEC §2 [2]).
 *
 * @param files the changed files with their risk priority (lower = riskier).
 */
export function checkBudget(
  files: Array<{ path: string; changedLines: number; riskPriority: number }>,
  policy: ReviewPolicy
): BudgetState {
  const totalFiles = files.length;
  const totalLines = files.reduce((s, f) => s + f.changedLines, 0);
  if (totalFiles <= policy.maxFiles && totalLines <= policy.maxLines) {
    return { overBudget: false, inScopeFiles: files.map((f) => f.path), trimmedFiles: [] };
  }
  const sorted = [...files].sort((a, b) => a.riskPriority - b.riskPriority);
  const inScope = sorted.slice(0, policy.maxFiles);
  const inScopePaths = new Set(inScope.map((f) => f.path));
  return {
    overBudget: true,
    inScopeFiles: inScope.map((f) => f.path),
    trimmedFiles: files.filter((f) => !inScopePaths.has(f.path)).map((f) => f.path),
  };
}
