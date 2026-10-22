"use client";

// /reviews/[repo]/[pr] — the PR's review-job history by commit
// (PAGE §3.2). A vertical list of commits (mono 8-char SHA + copy,
// verdict + findings + cost + a status mark); the latest commit's job
// is expanded. The Re-review primary is one click away (US-105).
import { useEffect, useState } from "react";
import { OrgPage } from "@/components/page";
import { useOrgShell } from "@/components/OrgShell";
import { useRepos, useReviews } from "@/lib/hooks";
import { PageHead } from "@/components/Settings";
import { DataBlock, EmptyBlock } from "@/components/DataBlock";
import { Panel, PanelTitle } from "@/components/cards";
import { CommitHistory } from "@/components/CommitHistory";

export function PrDetailClient({ params }: { params: Promise<{ repo: string; pr: string }> }) {
  const [pair, setPair] = useState<{ repo: string; pr: string } | null>(null);
  useEffect(() => {
    void params.then((p) => setPair({ repo: decodeURIComponent(p.repo), pr: p.pr }));
  }, [params]);

  return (
    <OrgPage>
      {pair ? (
        <PrBody repo={pair.repo} prNumber={Number(pair.pr)} />
      ) : (
        <p className="meta" role="status">Loading…</p>
      )}
    </OrgPage>
  );
}

function PrBody({ repo, prNumber }: { repo: string; prNumber: number }) {
  const s = useOrgShell();
  const orgId = s.active?.id ?? "";
  const reposQ = useRepos(orgId || undefined);
  const repoId = reposQ.data?.repos.find((r) => r.full_name === repo)?.id ?? undefined;
  const q = useReviews(orgId || undefined, { repoId, prNumber });

  // the commit history: newest first (the latest commit's job expanded by
  // default — the current review; older commits collapsed as "re-reviewed
  // after a force-push")
  const jobs = (q.data?.items ?? [])
    .filter((j) => j.repoId === repoId || j.repoName === repo)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return (
    <div>
      <PageHead
        title={`${repo} · PR #${prNumber}`}
        finding={
          jobs.length > 0
            ? `${jobs.length} review job${jobs.length === 1 ? "" : "s"} for this pull request`
            : "This pull request has no review jobs yet"
        }
      />
      <Panel>
        <PanelTitle>Review history by commit</PanelTitle>
        <DataBlock result={q} block="the review history">
          {() =>
            jobs.length === 0 ? (
              <EmptyBlock>No reviews for this PR — Re-review below enqueues one.</EmptyBlock>
            ) : (
              <CommitHistory
                orgId={orgId}
                repoId={repoId}
                prNumber={prNumber}
                jobs={jobs}
                detailHref={(job) =>
                  `/reviews/${encodeURIComponent(repo)}/${prNumber}/${job.id}`
                }
              />
            )
          }
        </DataBlock>
      </Panel>
    </div>
  );
}
