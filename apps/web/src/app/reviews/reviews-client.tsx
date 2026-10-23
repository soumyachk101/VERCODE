"use client";

// /reviews — the PR list (PAGE §3.1). The identity column is the PR
// (repo + #number + a short title); the verdict is the *word* (never a
// coloured banner); the status pill names its word of the trade + the
// reason (a skip is never silent — NFR-18).
import { useState } from "react";
import { OrgPage } from "@/components/page";
import { useOrgShell } from "@/components/OrgShell";
import { useReviews, useRepos } from "@/lib/hooks";
import { PageHead } from "@/components/Settings";
import { DataBlock, EmptyBlock } from "@/components/DataBlock";
import { Panel, PanelTitle } from "@/components/cards";
import { Table, TRow, TCell } from "@/components/Table";
import { Pill } from "@/components/Pill";
import { VcToggle } from "@/components/controls";
import { statusTone } from "@/components/CommitHistory";
import { money, relativeTime, verdictWord } from "@/lib/format";
import { jobStatusLabel, type JobStatus } from "@/lib/types";
import type { NormalizedJob } from "@/lib/normalized";

const STATUSES: JobStatus[] = ["succeeded", "partial", "skipped", "failed"];

export function ReviewsClient() {
  return (
    <OrgPage>
      <ReviewsBody />
    </OrgPage>
  );
}

function ReviewsBody() {
  const s = useOrgShell();
  const orgId = s.active?.id ?? "";
  const reposQ = useRepos(orgId || undefined);
  const [status, setStatus] = useState<string | null>(null);
  const [repoId, setRepoId] = useState<string | null>(null);
  const reviewsQ = useReviews(orgId || undefined, {
    status: status ?? undefined,
    repoId: repoId ?? undefined,
  });

  const rows = reviewsQ.data?.items ?? [];
  const repos = reposQ.data?.repos ?? [];

  return (
    <div>
      <PageHead
        title="Reviews"
        finding={
          reviewsQ.data
            ? `${rows.length} pull requests in this scope`
            : "What did VERCODE find on this PR, and is it current?"
        }
        right={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {repos.map((r) => (
              <VcToggle
                key={r.id}
                pressed={repoId === r.id}
                onPressedChange={(v) => setRepoId(v ? r.id : null)}
                aria-label={`Filter: ${r.full_name}`}
              >
                {r.full_name.split("/").pop()}
              </VcToggle>
            ))}
            {STATUSES.map((st) => (
              <VcToggle
                key={st}
                pressed={status === st}
                onPressedChange={(v) => setStatus(v ? st : null)}
                aria-label={`Filter: ${st}`}
              >
                {st}
              </VcToggle>
            ))}
          </div>
        }
      />
      <Panel>
        <PanelTitle>Pull requests</PanelTitle>
        <DataBlock result={reviewsQ} block="reviews">
          {() => {
            if (rows.length === 0) {
              return (
                <EmptyBlock>
                  {repos.length === 0
                    ? "No pull requests reviewed yet — open a PR on a connected repo."
                    : "No reviews for this scope this period."}
                </EmptyBlock>
              );
            }
            return (
              <Table
                caption="Pull requests: the repository, the review verdict, findings counted, job status, cost, and when it was last updated"
                head={[
                  { label: "PR", width: "34%" },
                  { label: "Repo" },
                  { label: "Verdict" },
                  { label: "Findings" },
                  { label: "Status" },
                  { label: "Cost", align: "right" },
                  { label: "Updated" },
                ]}
              >
                {rows.map((j) => (
                  <ReviewRow key={j.id} job={j} />
                ))}
              </Table>
            );
          }}
        </DataBlock>
      </Panel>
    </div>
  );
}

function ReviewRow({ job }: { job: NormalizedJob }) {
  const href = job.repoId
    ? `/reviews/${encodeURIComponent(job.repoName ?? job.repoId)}/${job.prNumber}`
    : `/reviews/${job.prNumber}`;
  return (
    <TRow>
      <TCell>
        <a
          href={href}
          style={{
            color: "var(--text)",
            fontWeight: 500,
            textDecoration: "none",
            display: "block",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          <span className="tabular">PR #{job.prNumber}</span>
          {job.prTitle ? <span style={{ fontWeight: 400, color: "var(--muted-ink)" }}> · {job.prTitle}</span> : null}
        </a>
      </TCell>
      <TCell>
        <span className="meta">{job.repoName ?? "—"}</span>
      </TCell>
      <TCell>
        <span style={{ fontSize: 14, color: "var(--accent)", fontWeight: 500 }}>
          {verdictWord(job)}
        </span>
      </TCell>
      <TCell>
        {job.findingsCount == null ? (
          <span className="meta">—</span>
        ) : (
          <span className="tabular" style={{ fontSize: 13 }}>
            {job.findingsCount}
          </span>
        )}
      </TCell>
      <TCell>
        <Pill tone={statusTone(job)}>{jobStatusLabel(job.status, job.skipReason)}</Pill>
      </TCell>
      <TCell right>{job.costUsd != null ? money(job.costUsd) : <span className="meta">—</span>}</TCell>
      <TCell>
        <span className="meta">{relativeTime(job.finishedAt ?? job.createdAt)}</span>
      </TCell>
    </TRow>
  );
}
