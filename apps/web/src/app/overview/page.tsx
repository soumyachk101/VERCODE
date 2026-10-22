import { OverviewClient } from "./overview-client";

// /overview (PAGE §1): "What needs my attention today?" — the verdict-lead
// figure, the attention queues, the plan's quota track, the cost/usage mini.
// Real data only: every block fetches from the API through TanStack Query;
// the first-run state ("Connect GitHub to start reviewing PRs") sits where
// the data will appear (INFORMATION_ARCHITECTURE §5).
export const dynamic = "force-dynamic";

export default function OverviewPage() {
  return <OverviewClient />;
}
