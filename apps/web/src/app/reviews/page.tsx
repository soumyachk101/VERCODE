import { ReviewsClient } from "./reviews-client";

// /reviews (PAGE §3): "What did VERCODE find on this PR, and is it
// current?" — the PR list (PR | Repo | Verdict | Findings | Status |
// Cost | Updated) with repo/status/severity filters, one row of controls.
export const dynamic = "force-dynamic";

export default function ReviewsPage() {
  return <ReviewsClient />;
}
