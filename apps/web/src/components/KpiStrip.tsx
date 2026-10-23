import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";

/**
 * The KPI strip (DESIGN_SYSTEM §6.4): one container split by 1px hairlines
 * into equal columns — label (12–14px grey, above) over value (24px ink
 * tabular). No icon in a tinted circle, no sparkline, no tinted tile.
 *
 * `computeKpiStrip(rows)` is the pure arithmetic the vitest asserts on:
 * a strip's values are computed from the rows as shown (the data-honesty
 * "totals come from the parts" rule, COMPONENT_CATALOG §4).
 */
export interface KpiRow {
  key: string;
  label: string;
  /** the value in display units already (money formatted, counts bare) */
  value: number;
  unit?: string;
  sign?: "plain" | "money" | "count";
}

export function computeKpiStrip(rows: KpiRow[]): {
  total: number;
  formatted: string;
  perRow: Record<string, number>;
} {
  const total = rows.reduce((s, r) => s + r.value, 0);
  const perRow: Record<string, number> = {};
  for (const r of rows) perRow[r.key] = r.value;
  return {
    total,
    formatted:
      rows[0]?.sign === "money"
        ? `$${total.toFixed(2)}`
        : formatNumber(total),
    perRow,
  };
}

export function KpiStrip({
  rows,
  cols = 4,
  className,
}: {
  rows: KpiRow[];
  cols?: number;
  className?: string;
}) {
  const { total, formatted } = computeKpiStrip(rows);
  void total;
  return (
    <div
      className={cn("grid", className)}
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        border: "1px solid hsl(var(--border))",
        borderRadius: "var(--radius-card)",
        background: "var(--surface)",
      }}
      data-testid="kpi-strip"
    >
      {rows.map((r, i) => (
        <div
          key={r.key}
          style={{
            padding: 16,
            borderLeft: i > 0 ? "1px solid var(--rule)" : undefined,
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            gap: 4,
          }}
        >
          <span className="label">{r.label}</span>
          <span className="tabular" style={{ fontSize: 24, fontWeight: 500, color: "var(--text)" }}>
            {r.sign === "money" ? `$${r.value.toFixed(2)}` : formatNumber(r.value)}
            {r.unit && (
              <span className="meta" style={{ fontSize: 12, marginLeft: 6 }}>
                {r.unit}
              </span>
            )}
          </span>
        </div>
      ))}
      {rows.length % cols !== 0 && (
        <div
          aria-hidden="true"
          style={{
            gridColumn: `span ${cols - (rows.length % cols)}`,
            borderLeft: "1px solid var(--rule)",
            padding: 16,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "flex-end",
          }}
        >
          <span className="tabular" style={{ fontSize: 24, fontWeight: 500 }}>
            {formatted}
          </span>
        </div>
      )}
    </div>
  );
}
