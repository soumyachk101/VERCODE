import { cn } from "@/lib/utils";
import type { Severity } from "@/lib/types";

const MARK: Record<Severity, string> = {
  critical: "var(--sev-critical)",
  high: "var(--sev-high)",
  medium: "var(--sev-medium)",
  low: "var(--sev-low)",
};

export const SEVERITY_WORD: Record<Severity, string> = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
};

/**
 * The product's signature mark (COMPONENT_CATALOG §2): a small filled square
 * in the severity colour. ALWAYS paired with the severity word — the square
 * is decorative (aria-hidden), the word carries the accessible meaning.
 */
export function SeverityMark({
  severity,
  size = 6,
  withWord = true,
  className,
}: {
  severity: Severity;
  size?: 6 | 8;
  withWord?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        aria-hidden="true"
        style={{
          width: size,
          height: size,
          background: MARK[severity],
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      {withWord && (
        <span className="meta" style={{ color: "var(--text)" }}>
          {SEVERITY_WORD[severity]}
        </span>
      )}
    </span>
  );
}

/** Counted marks: "2 critical · 4 high" — each mark paired with its word. */
export function SeverityCounts({
  counts,
}: {
  counts: Partial<Record<Severity, number>>;
}) {
  const entries = (Object.entries(counts) as [Severity, number][]).filter(
    ([, n]) => n > 0,
  );
  if (entries.length === 0) {
    return <span className="meta">0 findings</span>;
  }
  const order: Severity[] = ["critical", "high", "medium", "low"];
  entries.sort(
    (a, b) => order.indexOf(a[0]) - order.indexOf(b[0]),
  );
  return (
    <span className="inline-flex items-center gap-3">
      {entries.map(([sev, n]) => (
        <span key={sev} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            style={{
              width: 6,
              height: 6,
              background: MARK[sev],
              display: "inline-block",
            }}
          />
          <span className="meta tabular">{n}</span>
          <span className="meta">{sev}</span>
        </span>
      ))}
    </span>
  );
}
