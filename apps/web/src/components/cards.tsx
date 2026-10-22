import { forwardRef, type ReactNode, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import type { Severity } from "@/lib/types";

/**
 * Card / Panel (COMPONENT_CATALOG §1): 1px border, no shadow at rest,
 * 8px radius, 20px pad. A row of cards shares a bottom edge (stretched).
 */
export function Panel({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("panel", className)}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-card)",
        padding: 20,
      }}
      {...rest}
    />
  );
}

export function PanelTitle({
  children,
  right,
  className,
}: {
  children: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("flex items-center justify-between gap-4", className)}
      style={{ marginBottom: 12 }}
    >
      <h2 className="section-title" style={{ margin: 0 }}>
        {children}
      </h2>
      {right && <div className="meta">{right}</div>}
    </div>
  );
}

/** A label-over-value KPI cell: a divided strip, not a tile (no icon, no sparkline). */
export function Figure({
  label,
  value,
  unit,
  delta,
  deltaGood,
  lead,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  delta?: string | null;
  /** colour says good-or-bad: pass true when the delta is the good direction */
  deltaGood?: boolean | null;
  /** the lead figure is 30–36px, its siblings 24px */
  lead?: boolean;
}) {
  return (
    <div style={{ padding: "8px 0", minWidth: 0 }}>
      <div className="label">{label}</div>
      <div
        className="tabular"
        style={{
          fontSize: lead ? 32 : 24,
          fontWeight: 500,
          color: "var(--text)",
          display: "inline-flex",
          alignItems: "baseline",
          gap: 6,
          marginTop: 4,
        }}
      >
        {value}
        {unit && <span className="meta" style={{ fontSize: 12 }}>{unit}</span>}
      </div>
      {delta && (
        <div
          className="meta"
          style={{
            marginTop: 4,
            color:
              deltaGood == null ? "var(--muted)" : deltaGood ? "var(--positive)" : "var(--negative)",
          }}
        >
          {delta}
        </div>
      )}
    </div>
  );
}

/**
 * The verdict block (COMPONENT_CATALOG §2): the verdict word at 24px + the
 * counted severity-marks + a one-line finding. NEVER a coloured banner.
 */
export function VerdictBlock({
  verdict,
  counts,
  finding,
  cost,
  githubUrl,
}: {
  verdict: string;
  counts?: Partial<Record<Severity, number>>;
  finding?: string | null;
  cost?: string | null;
  githubUrl?: string | null;
}) {
  const any = counts && Object.values(counts).some((n) => (n ?? 0) > 0);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <div>
        <div
          style={{
            fontSize: 24,
            fontWeight: 600,
            color: "var(--text)",
            lineHeight: 1.2,
          }}
        >
          {verdict}
        </div>
        {any && (
          <div style={{ marginTop: 6, fontSize: 13 }}>
            <SeverityCountInline counts={counts} />
          </div>
        )}
        {finding && (
          <p className="finding-line" style={{ margin: "8px 0 0", maxWidth: 640 }}>
            {finding}
          </p>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
        {cost && <span className="meta tabular">{cost}</span>}
        {githubUrl && (
          <a
            className="text-sm font-medium text-[var(--accent)]"
            href={githubUrl}
            target="_blank"
            rel="noreferrer"
          >
            View on GitHub
          </a>
        )}
      </div>
    </div>
  );
}

import { SeverityCounts } from "./SeverityMark";

function SeverityCountInline({ counts }: { counts: Partial<Record<Severity, number>> }) {
  return <SeverityCounts counts={counts} />;
}

export type { PanelProps } from "./panel-types";
