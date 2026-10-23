import { useState } from "react";
import { Pill } from "./Pill";
import { IdChip } from "./IdChip";
import { jobStatusLabel } from "@/lib/types";
import { money, relativeTime, verdictWord } from "@/lib/format";
import { Button } from "./Button";
import { useReReview } from "@/lib/hooks";
import type { NormalizedJob } from "@/lib/normalized";
import { ChevronDown, ChevronRight } from "lucide-react";

export function statusTone(job: Pick<NormalizedJob, "status">): "neutral" | "positive" | "negative" | "warning" {
  switch (job.status) {
    case "succeeded":
      return "positive";
    case "queued":
    case "running":
      return "neutral";
    case "partial":
      return "warning";
    case "skipped":
    case "failed":
      return "negative";
  }
}

/**
 * CommitHistory (COMPONENT_CATALOG §2): a PR's review-job history by commit —
 * mono 8-char SHA + copy, verdict + findings + cost + a status pill per
 * commit. The latest commit's job is expanded (the current review); older
 * commits are collapsed ("This commit was re-reviewed after a force-push").
 * The most-frequent job (Re-review, US-105) is one click away.
 */
export function CommitHistory({
  orgId,
  repoId,
  prNumber,
  jobs,
  detailHref,
}: {
  orgId: string;
  repoId?: string;
  prNumber: number;
  jobs: NormalizedJob[];
  detailHref?: (job: NormalizedJob) => string;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const latest = jobs[0]?.id;
    return latest ? { [latest]: true } : {};
  });
  const reReview = useReReview(orgId);
  const head = jobs[0];

  return (
    <div>
      {head && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
          <Button
            disabled={reReview.isPending || !head.commitSha}
            onClick={() => {
              void reReview.mutate({ prNumber, commitSha: head.commitSha, repoId });
            }}
          >
            Re-review
          </Button>
          {reReview.isError && (
            <span className="meta" role="status" style={{ marginRight: 8 }}>
              {String(reReview.error?.message ?? "Re-review failed")}
            </span>
          )}
          {reReview.data?.status === "queued" && (
            <span className="meta" role="status">
              Review requested — queued
            </span>
          )}
        </div>
      )}
      <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {jobs.map((job, i) => {
          const isOpen = !!open[job.id];
          const label = jobStatusLabel(job.status, job.skipReason);
          return (
            <li key={job.id} style={{ borderBottom: "1px solid var(--rule)", paddingBottom: i === jobs.length - 1 ? 0 : undefined }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 44, padding: "6px 0" }}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen((o) => ({ ...o, [job.id]: !isOpen }))}
                  className="pressable"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    color: "var(--muted-ink)",
                    fontSize: 12,
                  }}
                >
                  {isOpen ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
                  <IdChip value={job.commitSha} label="commit SHA" />
                </button>
                <span className="meta" style={{ flex: 1, minWidth: 0 }}>
                  {verdictWord(job)}
                </span>
                <span className="meta tabular">{job.findingsCount ?? 0} findings</span>
                <span className="meta tabular">{money(job.costUsd)}</span>
                <Pill tone={statusTone(job)}>{label}</Pill>
              </div>
              {isOpen && (
                <div style={{ padding: "4px 0 12px 26px" }}>
                  <p className="meta" style={{ margin: "0 0 8px" }}>
                    {i === 0
                      ? "Current review at the head commit."
                      : "This commit was re-reviewed after a force-push."}
                  </p>
                  {job.skipReason && (
                    <p className="finding-line" style={{ margin: 0 }}>
                      {job.skipReason === "quota_exceeded"
                        ? "Quota reached this month — this review was skipped. Upgrade or reduce review volume."
                        : job.error
                          ? `Failure: ${job.error}`
                          : "This review was skipped."}
                    </p>
                  )}
                  {detailHref && (
                    <a
                      className="text-sm font-medium text-[var(--accent-color)]"
                      href={detailHref(job)}
                      style={{ display: "inline-block", marginTop: 8 }}
                    >
                      View review
                    </a>
                  )}
                  <span className="meta" style={{ display: "inline-block", marginTop: 6, fontSize: 12 }}>
                    {relativeTime(job.finishedAt ?? job.createdAt)}
                  </span>
                </div>
              )}
            </li>
          );
        })}
        {jobs.length === 0 && (
          <li>
            <div className="empty-box">No reviews for this PR yet — open a PR on a connected repo.</div>
          </li>
        )}
      </ol>
    </div>
  );
}
