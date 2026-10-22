// The plan list + quota constants for the billing page. These mirror the
// commercial caps in packages/contracts/plans.ts (the single source of
// truth for the API); the dashboard shows the plan name + the quota's
// reviews-per-month in the PlanTrack (the quota is the *plan*, not the
// data — a zero-spend month still renders the track).
//
// The values are re-stated here because the web app is a standalone
// package that builds without the monorepo's workspace graph (the
// pnpm-workspace.yaml adds apps/* + packages/*; the web's package.json
// intentionally does NOT depend on @vercode/contracts so the app can be
// built + Dockerised in isolation — the CI gate is a separate typecheck
// step that asserts this table matches plans.ts by hand).

export const ALL_PLANS = ["free", "developer", "team", "enterprise"] as const;
export type PlanName = (typeof ALL_PLANS)[number];

export const PLAN_QUOTA: Record<PlanName, { label: string; reviewsPerMonth: number }> = {
  free: { label: "Free", reviewsPerMonth: 50 },
  developer: { label: "Developer", reviewsPerMonth: 500 },
  team: { label: "Team", reviewsPerMonth: 5000 },
  enterprise: { label: "Enterprise", reviewsPerMonth: 50000 },
};
