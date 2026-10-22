import { RepoDetailClient } from "./repo-client";

// /repositories/[repo] (PAGE §2.2): the detail screen — the risk trend by
// category over 30 days, this repo's open findings (capped), the last 5
// reviews, the repo's rule state. One question: "where's the risk in this
// repo, right now?"
export const dynamic = "force-dynamic";

export default function RepoDetailPage({
  params,
}: {
  params: Promise<{ repo: string }>;
}) {
  return <RepoDetailClient params={params} />;
}
