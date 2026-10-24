import { UsageClient } from "./usage-client";

// /usage (PAGE §5.1): "Am I getting value?" — the cost/PR blended figure +
// the reviews/day + cost/day dual view + the by-provider breakdown.
export const dynamic = "force-dynamic";

export default function UsagePage() {
  return <UsageClient />;
}
