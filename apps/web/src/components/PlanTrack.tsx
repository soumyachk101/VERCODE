import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";

/**
 * PlanTrack (COMPONENT_CATALOG §2, the `Charts.plan`-style track): the plan's
 * length IS the quota (limit). The spent part is filled, the committed part
 * (queued) is a lighter segment, an overrun past the end renders in the
 * negative colour. Both ends are labelled ("1,240 of 5,000 reviews").
 *
 * Purely arithmetic + ARIA: the component is testable without DOM charts
 * (the vitest unit: overrun > 0 flips the overrun segment to --negative).
 */
export interface PlanTrackModel {
  used: number;
  limit: number;
  committed: number;
  overflow: number;
  unit: string;
  spentFrac: number;
  committedFrac: number;
  overflowFrac: number;
}

/** Compute the segment fractions from the raw numbers (the one source). */
export function computePlanTrack(
  used: number,
  limit: number,
  committed = 0,
): PlanTrackModel {
  const safeLimit = Math.max(0, limit);
  const spent = Math.min(Math.max(0, used), safeLimit);
  const overflow = Math.max(0, used - safeLimit);
  const committedClamped = Math.min(Math.max(0, committed), safeLimit - spent);
  const frac = (n: number) => (safeLimit === 0 ? 0 : n / safeLimit);
  const m: PlanTrackModel & {
    spentFrac: number;
    committedFrac: number;
    overflowFrac: number;
  } = {
    used,
    limit: safeLimit,
    committed: committedClamped,
    overflow,
    unit: "reviews",
    spentFrac: frac(spent),
    committedFrac: frac(committedClamped),
    overflowFrac: safeLimit === 0 ? (used > 0 ? 1 : 0) : frac(overflow),
  };
  return m;
}

export function PlanTrack({
  used,
  limit,
  committed = 0,
  unit = "reviews",
  warnAt = 0.8,
  className,
}: {
  used: number;
  limit: number;
  committed?: number;
  unit?: string;
  /** the 80% quiet strip threshold (J4) */
  warnAt?: number;
  className?: string;
}) {
  const m = computePlanTrack(used, limit, committed);
  const { spentFrac, committedFrac, overflowFrac } = m as unknown as {
    spentFrac: number;
    committedFrac: number;
    overflowFrac: number;
  };
  const pctUsed = limit > 0 ? used / limit : used > 0 ? 1 : 0;
  const warn = pctUsed >= warnAt;

  return (
    <div className={cn("w-full", className)} data-testid="plan-track">
      {warn && (
        <div
          role="status"
          style={{
            border: "1px solid var(--notice-border)",
            background: "var(--surface)",
            borderRadius: "var(--radius-card)",
            padding: "6px 10px",
            marginBottom: 10,
            fontSize: 12,
            color: "var(--pill-warning-ink)",
          }}
        >
          Quota {Math.round(pctUsed * 100)}% — you&apos;ve used {formatNumber(used)} of{" "}
          {formatNumber(limit)} {unit} this month
        </div>
      )}
      <div
        role="img"
        aria-label={`Quota: ${formatNumber(used)} of ${formatNumber(limit)} ${unit} used${
          overflowFrac > 0 ? `, ${formatNumber(m.overflow)} over` : ""
        }`}
        style={{
          position: "relative",
          height: 12,
          background: "var(--raised)",
          border: "1px solid var(--rule)",
          borderRadius: 4,
          overflow: "hidden",
          display: "flex",
        }}
      >
        <div
          style={{
            width: `${spentFrac * 100}%`,
            background: "var(--accent)",
            height: "100%",
          }}
          data-testid="plan-spent"
        />
        <div
          style={{
            width: `${committedFrac * 100}%`,
            background: "color-mix(in srgb, var(--accent) 40%, var(--surface))",
            height: "100%",
          }}
          data-testid="plan-committed"
        />
        {overflowFrac > 0 && (
          <div
            style={{
              position: "absolute",
              left: `${Math.min(100, (spentFrac + committedFrac) * 100)}%`,
              width: `${overflowFrac * 100}%`,
              minWidth: 8,
              background: "var(--negative)",
              height: "100%",
              top: 0,
            }}
            data-testid="plan-overflow"
          />
        )}
      </div>
      <div
        className="meta tabular"
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 6,
          fontSize: 12,
        }}
      >
        <span>0</span>
        <span>
          {formatNumber(used)} of {formatNumber(limit)} {unit}
        </span>
      </div>
      {m.overflow > 0 && (
        <div
          className="meta tabular"
          style={{ marginTop: 2, color: "var(--negative)", fontSize: 12 }}
          data-testid="plan-overflow-note"
        >
          {formatNumber(m.overflow)} {unit} over plan
        </div>
      )}
    </div>
  );
}

export type { PlanTrackModel };
