import { ReviewDetailClient } from "./review-client";

// /reviews/[repo]/[pr]/[commit] (PAGE §3.3): the deep-work screen — the
// verdict header, the findings list (the product's signature row), the
// static-vs-AI source note, the summary narrative.
export const dynamic = "force-dynamic";

export default function ReviewDetailPage({
  params,
}: {
  params: Promise<{ repo: string; pr: string; commit: string }>;
}) {
  return <ReviewDetailClient params={params} />;
}
