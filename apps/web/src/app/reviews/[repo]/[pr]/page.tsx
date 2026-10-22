import { PrDetailClient } from "./pr-client";

// /reviews/[repo]/[pr] (PAGE §3.2): a PR's review-job history by commit.
// The most-frequent job — Re-review (US-105) — is one click away in the
// title row; a same-SHA re-review is an idempotent no-op.
export const dynamic = "force-dynamic";

export default function PrDetailPage({
  params,
}: {
  params: Promise<{ repo: string; pr: string }>;
}) {
  return <PrDetailClient params={params} />;
}
