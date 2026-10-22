import { RepositoriesClient } from "./repositories-client";

// /repositories (PAGE §2): "What's connected, and where's the risk
// concentrated?" — the table (no zebra, right-aligned tabular numbers) +
// the detail's risk trend, open findings, last 5 reviews, rule state.
export const dynamic = "force-dynamic";

export default function RepositoriesPage() {
  return <RepositoriesClient />;
}
