"use client";

// /reviews/[repo]/[pr]/[commit] — the review detail (PAGE §3.3).
//
// Blocks, reading order:
//   1. the verdict header (the verdict word at 24px + the counted
//      severity-marks + a one-line finding + the cost + View-on-GitHub;
//      NEVER a coloured banner — type + marks only)
//   2. the findings list (the core, 48px-pitch rows, the source note,
//      the one-trailing-action kebab)
//   3. the summary narrative (a p at statement size, ~25 words)
//
// Focus + announcements (ACCESSIBILITY §3): when a new set of findings
// loads into this screen, focus moves to the findings region and a
// role="status" region announces "N findings loaded".
import { useEffect, useRef, useState } from "react";
import { OrgPage } from "@/components/page";
import { useOrgShell } from "@/components/OrgShell";
import { useJob, useFindings, useFindingAction } from "@/lib/hooks";
import { PageHead } from "@/components/Settings";
import { DataBlock, EmptyBlock } from "@/components/DataBlock";
import { Panel, PanelTitle, VerdictBlock } from "@/components/cards";
import { FindingRow, sourceNote } from "@/components/FindingRow";
import { VcToggle } from "@/components/controls";
import { announce, useAnnounce } from "@/components/announcer";
import { money, relativeTime, verdictWord } from "@/lib/format";
import { jobStatusLabel } from "@/lib/types";
import { SeverityCounts } from "@/components/SeverityMark";

export function ReviewDetailClient({
  params,
}: {
  params: Promise<{ repo: string; pr: string; commit: string }>;
}) {
  const [triplet, setTriplet] = useState<{ repo: string; pr: number; commit: string } | null>(null);
  useEffect(() => {
    void params.then((p) =>
      setTriplet({
        repo: decodeURIComponent(p.repo),
        pr: Number(p.pr),
        commit: p.commit,
      }),
    );
  }, [params]);

  return (
    <OrgPage>
      {triplet ? (
        <ReviewBody repo={triplet.repo} prNumber={triplet.pr} commitId={triplet.commit} />
      ) : (
        <p className="meta" role="status">Loading…</p>
      )}
    </OrgPage>
  );
}

function ReviewBody({ repo, prNumber, commitId }: { repo: string; prNumber: number; commitId: string }) {
  const s = useOrgShell();
  const orgId = s.active?.id ?? "";
  // the "commit" segment of the URL is the job id (the idempotency key
  // (org, repo, pr, commitSha) maps 1:1 to a job; the API returns the
  // job at /orgs/:id/reviews/:jobId)
  const jobQ = useJob(orgId || undefined, commitId);
  const findingsQ = useFindings(orgId || undefined, commitId);
  const findingAction = useFindingAction(orgId);
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const announceFinding = useAnnounce();

  // focus management on async data: when findings land, move focus to
  // the list region + announce the count (ACCESSIBILITY §3)
  const loadedCount = useRef(-1);
  useEffect(() => {
    if (findingsQ.data && loadedCount.current !== -1) {
      announce(`${findingsQ.data.items.length} findings loaded`);
    }
    loadedCount.current = findingsQ.data?.items.length ?? -1;
    listRef.current?.focus();
  }, [findingsQ.data]);

  const job = jobQ.data;
  const summary = job?.summary ?? null;
  const findings = findingsQ.data?.items ?? [];
  const shown = severityFilter ? findings.filter((f) => f.severity === severityFilter) : findings;

  // the one-line finding (PAGE §3.3.1): "2 high findings — an SQL
  // injection and an unhandled null". A summary.topRisks pair, or a
  // "no findings" when the review was clean
  const topRisks = summary?.topRisks ?? [];
  const oneLine =
    topRisks.length > 0
      ? `${summary?.highSeverityCount ?? topRisks.length} ${
          (summary?.highSeverityCount ?? topRisks.length) === 1 ? "finding" : "findings"
        } — ${topRisks.slice(0, 2).join(" and ")}`
      : findings.length === 0
        ? "No findings above the confidence floor"
        : `${findings.length} finding${findings.length === 1 ? "" : "s"} at ${findings[0]?.confidence?.toFixed(2) ?? "—"} confidence`;

  const handleAction = (id: string, action: "accepted" | "dismissed_reasonable" | "fixed") => {
    findingAction.mutate({ findingId: id, action });
    if (findingAction.isSuccess) {
      const f = findings.find((x) => x.id === id);
      announceFinding(
        `Finding ${f ? `"${f.title}"` : ""} ${action === "fixed" ? "marked fixed" : action === "accepted" ? "accepted" : "dismissed"}`,
      );
    }
  };

  return (
    <div>
      <PageHead
        title={`${repo} · PR #${prNumber}`}
        finding={job ? relativeTime(job.finishedAt ?? job.createdAt) : undefined}
      />
      <div style={{ display: "grid", gap: 16 }}>
        {/* 1. the verdict header */}
        <Panel>
          <PanelTitle>Verdict</PanelTitle>
          <DataBlock result={jobQ} block="the verdict">
            {(d) => {
              const j = d as NonNullable<typeof job>;
              return (
                <div>
                  <VerdictBlock
                    verdict={verdictWord(j.summary)}
                    counts={undefined}
                    finding={oneLine}
                    cost={j.costUsd != null ? money(j.costUsd) : null}
                    githubUrl={j.prUrl ?? undefined}
                  />
                  <div style={{ marginTop: 8, display: "flex", gap: 12, alignItems: "center" }}>
                    <span className="meta">
                      Status: {jobStatusLabel(j.status, j.skipReason)}
                    </span>
                    {j.skipReason === "quota_exceeded" && (
                      <a href="/usage" className="pressable" style={{ color: "var(--accent)", fontSize: 13 }}>
                        View usage
                      </a>
                    )}
                    {j.status === "partial" && (
                      <span className="meta" style={{ color: "var(--pill-warning-ink)" }}>
                        AI stage degraded — static findings still published
                      </span>
                    )}
                  </div>
                </div>
              );
            }}
          </DataBlock>
        </Panel>

        {/* 2. the findings list */}
        <Panel>
          <PanelTitle
            right={
              <div style={{ display: "flex", gap: 4 }}>
                {(["critical", "high", "medium", "low"] as const).map((sv) => (
                  <VcToggle
                    key={sv}
                    pressed={severityFilter === sv}
                    onPressedChange={(v) => setSeverityFilter(v ? sv : null)}
                    aria-label={`Filter: ${sv}`}
                  >
                    {sv}
                  </VcToggle>
                ))}
              </div>
            }
          >
            Findings
          </PanelTitle>
          <div ref={listRef} tabIndex={-1} style={{ outline: "none" }} aria-label="Findings list">
            <DataBlock result={findingsQ} block="findings">
              {() => {
                if (shown.length === 0) {
                  return (
                    <EmptyBlock>
                      {severityFilter
                        ? `No ${severityFilter} findings in this review`
                        : "No findings at or above the confidence floor"}
                    </EmptyBlock>
                  );
                }
                return (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {shown.map((f) => (
                      <FindingRow
                        key={f.id}
                        finding={f}
                        onAction={handleAction}
                        acting={findingAction.isPending}
                      />
                    ))}
                  </div>
                );
              }}
            </DataBlock>
          </div>
        </Panel>

        {/* 3. the summary narrative */}
        <Panel>
          <PanelTitle>Summary</PanelTitle>
          {topRisks.length > 0 ? (
            <p className="finding-line" style={{ margin: 0, maxWidth: 720 }}>
              {topRisks.join(". ")}.
            </p>
          ) : (
            <EmptyBlock>No summary narrative for this review</EmptyBlock>
          )}
          {findingsQ.data && (
            <p className="meta" style={{ marginTop: 8 }}>
              <SeverityCounts counts={findingsQ.data.counts} />
              {findings.length > 0 &&
                ` · ${findings.filter((f) => sourceNote(f.source) === "from static analysis").length} from static analysis, ${findings.filter((f) => sourceNote(f.source) === "from AI").length} from AI`}
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}
