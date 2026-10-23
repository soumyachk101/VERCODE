"use client";

// /security (PAGE §4.1–4.4). One question: the most serious open risk.
// The lead figure is the critical + high open count (30–36px); the ladder
// is a four-step intensity ramp; the rollup caps at 8 + View all; the
// trend is a 30-day line; the actioned rate is the north-star metric.
import { useState } from "react";
import { OrgPage } from "@/components/page";
import { useOrgShell } from "@/components/OrgShell";
import { useSecurity } from "@/lib/hooks";
import { PageHead } from "@/components/Settings";
import { DataBlock, EmptyBlock } from "@/components/DataBlock";
import { Panel, PanelTitle } from "@/components/cards";
import { Table, TRow, TCell } from "@/components/Table";
import { Pill } from "@/components/Pill";
import { SeverityMark } from "@/components/SeverityMark";
import { VcTabs } from "@/components/controls";
import { MiniLine } from "@/components/charts";
import { relativeTime } from "@/lib/format";

const WINDOWS = [
  { id: "30d", label: "30 days" },
  { id: "7d", label: "7 days" },
  { id: "90d", label: "90 days" },
];

export function SecurityClient() {
  return (
    <OrgPage>
      <SecurityBody />
    </OrgPage>
  );
}

function SecurityBody() {
  const s = useOrgShell();
  const orgId = s.active?.id ?? "";
  const [windowId, setWindowId] = useState("30d");
  const since =
    windowId === "7d"
      ? new Date(Date.now() - 7 * 86400000).toISOString()
      : windowId === "90d"
        ? new Date(Date.now() - 90 * 86400000).toISOString()
        : new Date(Date.now() - 30 * 86400000).toISOString();
  const q = useSecurity(orgId || undefined, since);

  const open = q.data?.open ?? { critical: 0, high: 0, medium: 0, low: 0 };
  const lead = open.critical + open.high;

  // the rollup rows: open high/critical findings, capped at 8
  const rows = q.data?.items
    ?.filter((f) => f.severity === "critical" || f.severity === "high")
    .slice(0, 8) ?? [];

  const rate = q.data?.actionedRate;
  const deltaPts =
    rate && rate.prior != null ? Math.round((rate.current - rate.prior) * 100) : null;

  return (
    <div>
      <PageHead
        title="Security"
        finding={
          lead > 0
            ? `${lead} open ${lead === 1 ? "finding" : "findings"} above the floor in this window`
            : "No open high or critical findings in this window"
        }
        right={<WindowTabs active={windowId} onChange={setWindowId} label="Window" />}
      />
      <div style={{ display: "grid", gap: 16 }}>
        {/* 1. the severity ladder */}
        <Panel>
          <PanelTitle>Open findings</PanelTitle>
          <DataBlock result={q} block="the security rollup">
            {() => (
              <div style={{ display: "flex", gap: 40, alignItems: "flex-start" }}>
                <div
                  className="tabular"
                  style={{ fontSize: 34, fontWeight: 500, color: "var(--text)", lineHeight: 1.1 }}
                >
                  {lead}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: "8px 32px" }}>
                  {(["critical", "high", "medium", "low"] as const).map((sv) => (
                    <div key={sv} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <SeverityMark severity={sv} size={8} />
                      <span className="tabular" style={{ fontSize: 22, color: "var(--text)" }}>
                        {open[sv]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </DataBlock>
        </Panel>

        {/* 2. the rollup table */}
        <Panel>
          <PanelTitle
            right={
              rows.length > 0 ? (
                <a href="/reviews" className="pressable" style={{ color: "hsl(var(--accent))", fontSize: 13 }}>
                  View all
                </a>
              ) : null
            }
          >
            Open high / critical
          </PanelTitle>
          <DataBlock result={q} block="the rollup">
            {() =>
              rows.length === 0 ? (
                <EmptyBlock>No high or critical findings open in this window</EmptyBlock>
              ) : (
                <Table
                  caption="Open high and critical findings: severity, title, category, repository, PR link, actioned status, and when found"
                  head={[
                    { label: "Severity" },
                    { label: "Title", width: "34%" },
                    { label: "Category" },
                    { label: "Repo" },
                    { label: "PR" },
                    { label: "Actioned?" },
                    { label: "Found" },
                  ]}
                >
                  {rows.map((f) => (
                    <TRow key={f.id}>
                      <TCell>
                        <SeverityMark severity={f.severity} size={6} />
                      </TCell>
                      <TCell>
                        <span style={{ fontWeight: 500 }}>{f.title}</span>
                      </TCell>
                      <TCell>
                        <span className="meta">{f.category}</span>
                      </TCell>
                      <TCell>
                        <span className="meta">{f.repoName ?? "—"}</span>
                      </TCell>
                      <TCell>
                        {f.prNumber != null && f.repoName ? (
                          <a
                            className="tabular"
                            href={`/reviews/${encodeURIComponent(f.repoName)}/${f.prNumber}`}
                            style={{ color: "hsl(var(--accent))", textDecoration: "none" }}
                          >
                            #{f.prNumber}
                          </a>
                        ) : (
                          <span className="meta">—</span>
                        )}
                      </TCell>
                      <TCell>
                        <Pill tone={f.actioned ? "positive" : "warning"}>
                          {f.actioned ? "actioned" : "waiting on reviewer"}
                        </Pill>
                      </TCell>
                      <TCell>
                        <span className="meta">{f.createdAt ? relativeTime(f.createdAt) : "—"}</span>
                      </TCell>
                    </TRow>
                  ))}
                </Table>
              )
            }
          </DataBlock>
        </Panel>

        {/* 3. the 30-day trend + 4. the actioned-rate figure */}
        <div className="vc-sec-grid" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
          <Panel>
            <PanelTitle>Trend (30d)</PanelTitle>
            <DataBlock result={q} block="the trend">
              {() => {
                const series = q.data?.series;
                if (!series || series.length === 0) {
                  return <EmptyBlock>No high or critical findings recorded this period</EmptyBlock>;
                }
                const data = series.map((p) => ({
                  date: p.date,
                  hc: p.high + p.critical,
                }));
                const maxIdx = data.reduce((acc, p, i) => (p.hc > (data[acc]?.hc ?? 0) ? i : acc), 0);
                const spike =
                  data[maxIdx]?.hc != null && data[maxIdx].hc > 0
                    ? { index: maxIdx, label: `${data[maxIdx].hc} open` }
                    : undefined;
                return (
                  <MiniLine
                    data={data}
                    dataKey="hc"
                    height={160}
                    ariaLabel="High and critical findings per day, 30 days"
                    spike={spike}
                  />
                );
              }}
            </DataBlock>
          </Panel>
          <Panel>
            <PanelTitle>Actioned rate</PanelTitle>
            <DataBlock result={q} block="the actioned rate">
              {() => {
                if (!rate) {
                  return <EmptyBlock>No actioned findings recorded yet</EmptyBlock>;
                }
                const pct = Math.round(rate.current * 100);
                const deltaWords =
                  deltaPts == null
                    ? null
                    : deltaPts === 0
                      ? "vs prior 30 days"
                      : `${deltaPts > 0 ? "up" : "down"} ${Math.abs(deltaPts)} pts vs prior ${rate.windowDays ?? 30} days`;
                return (
                  <div>
                    <div className="tabular" style={{ fontSize: 34, fontWeight: 500, color: "var(--text)" }}>
                      {pct}%
                    </div>
                    {deltaWords && (
                      <p
                        className="meta"
                        style={{
                          marginTop: 4,
                          color:
                            deltaPts != null && deltaPts < 0 ? "var(--negative)" : "var(--muted-ink)",
                        }}
                      >
                        {deltaWords}
                      </p>
                    )}
                  </div>
                );
              }}
            </DataBlock>
          </Panel>
        </div>
        <style>{`
          @media (max-width: 900px) { .vc-sec-grid { grid-template-columns: 1fr !important; } }
        `}</style>
      </div>
    </div>
  );
}

function WindowTabs({ active, onChange, label }: { active: string; onChange: (id: string) => void; label: string }) {
  return (
    <div>
      <VcTabs tabs={WINDOWS} active={active} onChange={onChange} label={label} />
    </div>
  );
}
