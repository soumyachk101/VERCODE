import { UsageClient } from "./usage-client";

// /usage (PAGE §5.1): "Am I getting value, and will I hit my cap?" —
// the cost/PR blended figure + the reviews/day + cost/day dual view +
// the by-provider breakdown + the quota track.
export const dynamic = "force-dynamic";

export default function UsagePage() {
  return <UsageClient />;
}
