"use client";

// The Overview page blocks (PAGE §1) inside the org shell.
import { useEffect } from "react";
import { OrgPage } from "@/components/page";
import { useOrgShell } from "@/components/OrgShell";
import {
  useSecurity,
  useUsage,
  useInstall,
  useReviews,
} from "@/lib/hooks";
import { PageHead } from "@/components/Settings";
import { DataBlock, EmptyBlock } from "@/components/DataBlock";
import { Panel, PanelTitle, Figure } from "@/components/cards";
import { PlanTrack } from "@/components/PlanTrack";
import { MiniLine } from "@/components/charts";
import { SeverityMark } from "@/components/SeverityMark";
import { Pill } from "@/components/Pill";
import { useAnnounce } from "@/components/announcer";
import { openFindingsLead } from "@/lib/format";
import { jobStatusLabel, SKIP_REASON_LABEL } from "@/lib/types";

export function OverviewClient() {
  return (
    <OrgPage>
      <OverviewBody />
    </OrgPage>
  );
}

function OverviewBody() {
  const s = useOrgShell();
  const orgId = s.active?.id ?? "";
  const sec = useSecurity(orgId || undefined);
  const usage = useUsage(orgId || undefined, "30d");
  const install = useInstall(orgId || undefined);
  const skipped = useReviews(orgId || undefined, { status: "skipped" });
  const failed = useReviews(orgId || undefined, { status: "failed" });
  const announce = useAnnounce();

  // the one line under the title — the screen's *finding* (the thing that
  // most needs attention), not the interface (PAGE §1)
  const lastFailed = failed.data?.items[0];
  const finding = lastFailed
    ? `Last failed review: ${SKIP_REASON_LABEL[lastFailed.skipReason ?? ""] ?? "did not complete"} — ${
        (skipped.data?.items.length ?? 0) + (failed.data?.items.length ?? 0)
      } reviews need a look.`
    : null;

  // announce a quota change (ACCESSIBILITY §3: a polite live region)
  const quotaPct = usage.data?.quota.percentUsed ?? 0;
  const lastQuota = useRefNum();
  useEffect(() => {
    if (quotaPct >= 0.8 && lastQuota.current < 0.8) {
      announce(`Usage is now ${Math.round(quotaPct * 100)}% of this month's quota`);
    }
    lastQuota.current = quotaPct;
  }, [quotaPct, announce]);

  // the first-run state (INFORMATION_ARCHITECTURE §5): the whole screen
  // empty → keep the frame + title, put the first action where the data
  // will appear
  const firstRun = install.data ? !install.data.connected : false;

  return (
    <div>
      <PageHead title="Overview" finding={finding} />
      {firstRun ? (
        <Panel>
          <PanelTitle>Get started</PanelTitle>
          <div className="empty-box">
            Connect GitHub to start reviewing PRs — the install action is the
            org&apos;s one onboarding step.
          </div>
        </Panel>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          <LeadBlock sec={sec} />
          <div className="vc-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <SecurityQueue sec={sec} />
            <FailedQueue skipped={skipped} failed={failed} />
          </div>
          <QuotaBlock usage={usage} />
          <UsageMini usage={usage} />
        </div>
      )}
      <style>{`
        @media (max-width: 900px) {
          .vc-two-col { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

// a local ref helper (a plain ref without importing react at this scope —
// kept small; the file is a client component so a hook would be fine too)
import { useRef } from "react";
function useRefNum() {
  return useRef(0);
}

function LeadBlock({ sec }: { sec: ReturnType<typeof useSecurity> }) {
  return (
    <Panel>
      <PanelTitle>Risk posture</PanelTitle>
      <DataBlock result={sec} block="the security rollup">
        {(d) => {
          const n = d as NonNullable<typeof sec.data>;
          const lead = n.open.critical + n.open.high;
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div
                className="tabular"
                style={{ fontSize: 34, fontWeight: 500, color: "var(--text)", lineHeight: 1.1 }}
                data-testid="overview-lead"
              >
                {openFindingsLead(n.open)}
              </div>
              <Pill tone={lead > 0 ? "warning" : "positive"}>
                {lead > 0 ? "Needs attention" : "Clear"}
              </Pill>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                {(["critical", "high", "medium", "low"] as const)
                  .filter((sv) => n.open[sv] > 0)
                  .map((sv) => (
                    <SeverityMark key={sv} severity={sv} size={6} />
                  ))}
              </div>
            </div>
          );
        }}
      </DataBlock>
    </Panel>
  );
}

function SecurityQueue({ sec }: { sec: ReturnType<typeof useSecurity> }) {
  return (
    <Panel>
      <PanelTitle
        right={
          <a href="/security" className="pressable" style={{ color: "var(--accent)", fontSize: 13 }}>
            View all
          </a>
        }
      >
        Security
      </PanelTitle>
      <DataBlock result={sec} block="the security rollup">
        {(d) => {
          const n = d as NonNullable<typeof sec.data>;
          const top = n.items
            .filter((f) => (f.severity === "critical" || f.severity === "high") && !f.actioned)
            .slice(0, 5);
          if (top.length === 0) {
            return <EmptyBlock>No open high or critical findings</EmptyBlock>;
          }
          return (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {top.map((f) => (
                <li
                  key={f.id}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--rule)" }}
                >
                  <SeverityMark severity={f.severity} size={6} />
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 14, color: "var(--text)" }}>
                    {f.title}
                  </span>
                  <span className="meta" style={{ fontSize: 12 }}>
                    {f.repoName ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          );
        }}
      </DataBlock>
    </Panel>
  );
}

function FailedQueue({
  skipped,
  failed,
}: {
  skipped: ReturnType<typeof useReviews>;
  failed: ReturnType<typeof useReviews>;
}) {
  return (
    <Panel>
      <PanelTitle
        right={
          <a href="/reviews" className="pressable" style={{ color: "var(--accent)", fontSize: 13 }}>
            View all
          </a>
        }
      >
        Failed reviews
      </PanelTitle>
      <DataBlock result={skipped} block="failed reviews">
        {() => {
          const list = [
            ...(skipped.data?.items ?? []).slice(0, 5),
            ...(failed.data?.items ?? []).slice(0, 5),
          ];
          if (list.length === 0) {
            return <EmptyBlock>No skipped or failed reviews</EmptyBlock>;
          }
          return (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {list.map((j) => (
                <li
                  key={j.id}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--rule)" }}
                >
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {j.repoName ? `${j.repoName} ` : ""}
                    <span className="tabular">PR #{j.prNumber}</span>
                  </span>
                  <Pill tone={j.status === "skipped" ? "warning" : "negative"}>
                    {jobStatusLabel(j.status, j.skipReason)}
                  </Pill>
                </li>
              ))}
            </ul>
          );
        }}
      </DataBlock>
    </Panel>
  );
}

function QuotaBlock({ usage }: { usage: ReturnType<typeof useUsage> }) {
  return (
    <Panel>
      <PanelTitle>Plan quota</PanelTitle>
      <DataBlock result={usage} block="usage">
        {(d) => {
          const u = d as NonNullable<typeof usage.data>;
          return (
            <PlanTrack
              used={u.quota.used}
              limit={u.quota.limit}
              committed={u.quota.committed}
              unit="reviews"
            />
          );
        }}
      </DataBlock>
    </Panel>
  );
}

function UsageMini({ usage }: { usage: ReturnType<typeof useUsage> }) {
  return (
    <Panel>
      <PanelTitle>Usage (30d)</PanelTitle>
      <DataBlock result={usage} block="usage">
        {(d) => {
          const u = d as NonNullable<typeof usage.data>;
          // the spike annotation: the max day, named by its PR count
          const maxIdx = u.series.reduce(
            (acc, p, i) => (p.reviews > (u.series[acc]?.reviews ?? 0) ? i : acc),
            0,
          );
          const spike =
            u.series.length > 0 && u.series[maxIdx]?.reviews > 1
              ? { index: maxIdx, label: `${u.series[maxIdx].reviews} reviews` }
              : undefined;
          const perPr = u.perReviewUsd ?? (u.totals.reviews > 0 ? u.totals.estUsd / u.totals.reviews : 0);
          return (
            <div className="vc-usage-grid" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
              <MiniLine
                data={u.series}
                dataKey="reviews"
                height={120}
                ariaLabel="Reviews per day, last 30 days"
              />
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                <Figure label="Cost per PR (blended)" value={`$${perPr.toFixed(2)}`} unit="/ review" />
                <p className="meta" style={{ marginTop: 8, marginBottom: 0 }}>
                  {u.totals.reviews} reviews · ${u.totals.estUsd.toFixed(2)} in this range
                </p>
                {spike && (
                  <p className="meta" style={{ marginTop: 4, marginBottom: 0 }}>
                    Spike: {spike.label} on {String(u.series[spike.index]?.date ?? "")}
                  </p>
                )}
              </div>
            </div>
          );
        }}
      </DataBlock>
      <style>{`
        @media (max-width: 900px) {
          .vc-usage-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </Panel>
  );
}
