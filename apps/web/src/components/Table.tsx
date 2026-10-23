import type { ReactNode } from "react";

/**
 * Table (COMPONENT_CATALOG §1): a real <table> + <caption> + scope on
 * headers (ACCESSIBILITY §3). 12px grey sentence-case headers, no zebra,
 * 1px rule dividers. Numbers right-aligned tabular; the identity column
 * is the widest, never the truncated one.
 */
export function Table({
  caption,
  head,
  children,
  className,
}: {
  /** the caption is visually muted but present in the DOM */
  caption: string;
  /** the header cells (sentence case, 12px grey) */
  head: { label: string; align?: "left" | "right"; width?: number | string }[];
  children: ReactNode;
  className?: string;
}) {
  return (
    <table
      className={className}
      style={{
        width: "100%",
        borderCollapse: "collapse",
        fontSize: 14,
        color: "var(--text)",
      }}
    >
      <caption className="meta sr-only">{caption}</caption>
      <thead>
        <tr style={{ borderBottom: "1px solid hsl(var(--border))" }}>
          {head.map((h) => (
            <th
              key={h.label}
              scope="col"
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: "var(--muted-ink)",
                textAlign: h.align === "right" ? "right" : "left",
                padding: "8px 10px",
                width: h.width,
                whiteSpace: "nowrap",
              }}
            >
              {h.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

export function TRow({ children }: { children: ReactNode }) {
  return <tr style={{ borderBottom: "1px solid var(--rule)" }}>{children}</tr>;
}

export function TCell({
  children,
  right,
  mono,
  className,
  style,
}: {
  children: ReactNode;
  /** right-aligned numbers (tabular, fixed decimals) */
  right?: boolean;
  mono?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <td
      className={className}
      style={{
        padding: "10px 10px",
        verticalAlign: "middle",
        textAlign: right ? "right" : "left",
        fontVariantNumeric: right ? "tabular-nums" : undefined,
        fontFamily: mono ? "var(--font-mono)" : undefined,
        fontSize: mono ? 13 : 14,
        ...style,
      }}
    >
      {children}
    </td>
  );
}
