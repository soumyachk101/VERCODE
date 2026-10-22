// The 9 FindingCategory values (packages/contracts/src/findings.ts — the
// source of truth; a category added to the contracts package must be added
// here in the same PR so the suppressed-categories toggle list stays a
// real list, not a partial one).
export const FINDER_CATEGORIES = [
  "logic-bug",
  "security",
  "performance",
  "race-condition",
  "resource-leak",
  "api-contract",
  "db-consistency",
  "edge-case",
  "assumption",
] as const;

export type FinderCategory = (typeof FINDER_CATEGORIES)[number];
