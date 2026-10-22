"use client";

// /usage (PAGE §5.1). The lead figure is the blended cost/PR; the dual
// view is a single-series line chart with a control to switch between
// reviews/day and cost/day (switching, not overlaying); the by-provider
// breakdown is a thin bar list; the quota track repeats the Overview's.
import { useMemo, useState } from "react";
import { OrgPage } from "@/components/page";
import { useOrgShell } from "@/components/OrgShell";
import { useUsage } from "@/lib/hooks";
import { PageHead } from "@/components/Settings";
import { DataBlock, EmptyBlock } from "@/components/DataBlock";
import { Panel, PanelTitle, Figure } from "@/components/cards";
import { PlanTrack } from "@/components/PlanTrack";
import { BarList, LineChartBlock } from "@/components/charts";
import { VcTabs } from "@/components/controls";

export function UsageClient() {
  return (
    <OrgPage>
      <UsageBody />
    </OrgPage>
  );
}

function UsageBody() {
  const s = useOrgShell();
  const orgId = s.active?.id ?? "";
  const q = useUsage(orgId || undefined, "30d");
  const [metric, setMetric] = useState<"reviews" | "cost">("reviews");

  const u = q.data ?? null;
  // the blended cost/PR: real math from the range's totals (a zero-spend
  // month prints $0.00 — a real zero, not a dash)
  const perReview = u
    ? u.totals.reviews > 0
      ? u.totals.estUsd / u.totals.reviews
      : 0
    : null;

  // the delta-in-words (a falling cost is the good direction → positive)
  const daily = u?.series ?? [];
  const costDelta = useMemo(() => {
    if (daily.length < 2 || perReview == null) return null;
    const first = daily[0].estUsd / Math.max(1, daily[0].reviews || 1);
    const diffCents = Math.round((perReview - first) * 100);
    if (diffCents === 0) return { text: "vs first day of the range", good: null as boolean | null };
    const up = diffCents > 0;
    return {
      text: `${up ? "up" : "down"} ${Math.abs(diffCents)}¢ vs first day of the range`,
      // colour says good-or-bad: cost falling = good
      good: !up,
    };
  }, [daily, perReview]);

  const chartData = daily.map((d) => ({
    date: d.date,
    reviews: d.reviews,
    estUsd: d.estUsd,
  }));
  const maxIdx = chartData.reduce((acc, p, i) => {
    const cur = metric === "reviews" ? p.reviews : p.estUsd;
    const ref = metric === "reviews" ? (chartData[acc]?.reviews ?? 0) : (chartData[acc]?.estUsd ?? 0);
    return cur > ref ? i : acc;
  }, 0);
  const spike =
    chartData.length > 0
      ? {
          index: maxIdx,
          label:
            metric === "reviews"
              ? `${chartData[maxIdx].reviews} reviews`
              : `$${chartData[maxIdx].estUsd.toFixed(2)}`,
        }
      : undefined;

  return (
    <div>
      <PageHead
        title="Usage"
        finding={
          u
            ? `${u.totals.reviews} reviews · $${u.totals.estUsd.toFixed(2)} in the last 30 days`
            : "Am I getting value, and will I hit my cap?"
        }
      />
      <div style={{ display: "grid", gap: 16 }}>
        {/* 1. the blended cost/PR figure */}
        <Panel>
          <PanelTitle>Blended cost</PanelTitle>
          <DataBlock result={q} block="usage">
            {() => (
              <Figure
                label="Cost per review (blended, 30d)"
                value={perReview == null ? "$0.00" : `$${perReview.toFixed(2)}`}
                unit="/ review"
                lead
                delta={costDelta?.text ?? null}
                deltaGood={costDelta?.good ?? null}
              />
            )}
          </DataBlock>
        </Panel>

        {/* 2. the dual view: one line chart, a control to switch metric */}
        <Panel>
          <PanelTitle
            right={
              <VcTabs
                tabs={[
                  { id: "reviews", label: "Reviews / day" },
                  { id: "cost", label: "Cost / day" },
                ]}
                active={metric}
                onChange={(id) => setMetric(id as "reviews" | "cost")}
                label="Metric"
              />
            }
          >
            Daily trend
          </PanelTitle>
          <DataBlock result={q} block="usage">
            {() =>
              chartData.length === 0 ? (
                <EmptyBlock>No usage in this range — $0.00 spent, 0 reviews</EmptyBlock>
              ) : (
                <LineChartBlock
                  data={chartData}
                  dataKey={metric === "reviews" ? "reviews" : "estUsd"}
                  spike={spike}
                  yFormat={metric === "cost" ? (n) => `$${n}` : undefined}
                  ariaLabel={metric === "reviews" ? "Reviews per day, last 30 days" : "Cost per day, last 30 days"}
                  height={200}
                />
              )
            }
          </DataBlock>
        </Panel>

        {/* 3. the by-provider breakdown (a bar list, the top in the data hue) */}
        {u?.byProvider && u.byProvider.length > 0 && (
          <Panel>
            <PanelTitle>By provider</PanelTitle>
            <BarList
              items={[...u.byProvider]
                .sort((a, b) => b.reviews - a.reviews)
                .map((p) => ({ label: p.provider, value: p.reviews, sub: `$${p.estUsd.toFixed(2)}` }))}
              unit="reviews"
            />
          </Panel>
        )}

        {/* 4. the quota track (the cap, both ends labelled) */}
        <Panel>
          <PanelTitle>Plan quota</PanelTitle>
          <DataBlock result={q} block="usage">
            {() => u ? (
              <PlanTrack
                used={u.quota.used}
                limit={u.quota.limit}
                committed={u.quota.committed}
                unit="reviews"
              />
            ) : null}
          </DataBlock>
        </Panel>
      </div>
    </div>
  );
}
