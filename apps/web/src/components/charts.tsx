// Chart primitives (Recharts, configured to the study's rules — never
// library defaults: one hue per chart, 2px straight lines, no markers,
// faint gridlines, annotated spikes). The data hue is the single accent.

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReactNode } from "react";

const ACCENT = "var(--accent)";
const MUTED = "var(--muted)";
const GRID = "var(--grid)";

/**
 * A single-series line chart. One hue on the main element; a spike gets a
 * 1px marker + a 12px label naming its cause (DESIGN_SYSTEM §6.5).
 */
export function LineChartBlock({
  data,
  dataKey,
  xKey = "date",
  height = 200,
  xLabel,
  spike,
  yFormat,
  ariaLabel,
}: {
  data: Record<string, number | string>[];
  dataKey: string;
  xKey?: string;
  height?: number;
  xLabel?: string;
  spike?: { index: number; label: string };
  yFormat?: (n: number) => string;
  ariaLabel: string;
}) {
  const values = data.map((d) => Number(d[dataKey]));
  const max = Math.max(0, ...values);
  const tickMax = max === 0 ? 0 : Math.ceil(max / 50) * 50 || Math.ceil(max);
  const yTicks = tickMax === 0 ? [0] : [0, 0.5, 1].map((f) => f * tickMax);

  return (
    <figure style={{ margin: 0 }}>
      <figcaption className="meta sr-only">{ariaLabel}</figcaption>
      <div
        role="img"
        aria-label={ariaLabel}
        style={{ height }}
      >
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={data} margin={{ top: 12, right: 8, bottom: 4, left: 8 }}>
            <CartesianGrid
              stroke={GRID}
              vertical={false}
              strokeDasharray="0"
              verticalCount={0}
            />
            <XAxis
              dataKey={xKey}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: MUTED }}
              interval={xLabel ? "preserveStartEnd" : "equidistant"}
              maxBarSize={44}
              tickFormatter={(v: string) => xLabel ?? String(v).slice(5, 10)}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={44}
              ticks={yTicks}
              tick={{ fontSize: 11, fill: MUTED }}
              tickFormatter={(v: number) => (yFormat ? yFormat(v) : String(v))}
            />
            <Tooltip
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-card)",
                fontSize: 12,
                color: "var(--text)",
              }}
            />
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke={ACCENT}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
              isAnimationActive={false}
            />
            {spike != null && values[spike.index] != null && (
              <ReferenceDot
                x={data[spike.index]?.[xKey]}
                y={values[spike.index]}
                r={3}
                fill={ACCENT}
                label={{
                  value: spike.label,
                  position: "top",
                  fontSize: 11,
                  fill: MUTED,
                  offset: 8,
                }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/**
 * A bar-list (the by-provider breakdown): thin grey bars, the top row in
 * the data hue. Not a real axis chart — a proportional list.
 */
export function BarList({
  items,
  unit,
}: {
  items: { label: string; value: number; sub?: string }[];
  unit?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
      {items.map((it, idx) => {
        const top = idx === 0 && it.value > 0;
        return (
          <li key={it.label} style={{ display: "grid", gridTemplateColumns: "140px 1fr 56px", alignItems: "center", gap: 8 }}>
            <span className="meta" style={{ fontSize: 12, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {it.label}
            </span>
            <div style={{ position: "relative", height: 8, background: "var(--raised)", borderRadius: 2, border: "1px solid var(--rule)" }}>
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  right: `${100 - (it.value / max) * 100}%`,
                  background: top ? ACCENT : "var(--control)",
                  borderRadius: 2,
                }}
              />
            </div>
            <span className="meta tabular" style={{ textAlign: "right", fontSize: 12, color: "var(--muted)" }}>
              {new Intl.NumberFormat("en-US").format(it.value)}
              {unit ? <span style={{ color: "var(--faint)" }}> {unit}</span> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** A small horizontal grouped bar (the risk-trend by category). */
export function CategoryTrendChart({
  data,
  ariaLabel,
}: {
  /** rows: one per date; columns: one key per category */
  data: { date: string; [k: string]: number | string }[];
  categories: string[];
  ariaLabel: string;
  height?: number;
}) {
  const top = categories[0];
  return (
    <div role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 12, right: 8, bottom: 4, left: 8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: MUTED }} tickFormatter={(v: string) => String(v).slice(5, 10)} />
          <YAxis tickLine={false} axisLine={false} width={36} tick={{ fontSize: 11, fill: MUTED }} />
          <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--text)" }} />
          <Bar dataKey={top} fill={ACCENT} barSize={10} isAnimationActive={false} />
          {categories
            .filter((c) => c !== top)
            .slice(0, 3)
            .map((c, i) => (
              <Bar key={c} dataKey={c} fill={`color-mix(in srgb, var(--control) ${70 - i * 20}%, var(--surface))`} barSize={10} isAnimationActive={false} />
            ))}
        </BarChart>
      </ResponsiveContainer>
      <div className="meta" style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
        {categories.slice(0, 4).map((c, i) => (
          <span key={c} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span
              aria-hidden="true"
              style={{
                width: 8,
                height: 8,
                borderRadius: 1,
                background:
                  i === 0
                    ? ACCENT
                    : `color-mix(in srgb, var(--control) ${70 - i * 20}%, var(--surface))`,
                display: "inline-block",
              }}
            />
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}

/** A tiny flat line (a 30d reviews/day) — ⅔ width, flat drawn flat. */
export function MiniLine({
  data,
  dataKey,
  height = 96,
  ariaLabel,
}: {
  data: Record<string, number | string>[];
  dataKey: string;
  height?: number;
  ariaLabel: string;
}) {
  return (
    <LineChartBlock
      data={data}
      dataKey={dataKey}
      height={height}
      ariaLabel={ariaLabel}
    />
  );
}

export type { ReactNode };
