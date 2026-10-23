import { cn } from "@/lib/utils";

type Tone = "neutral" | "positive" | "negative" | "warning";

const TONES: Record<Tone, string> = {
  neutral: "color-mix(in srgb, var(--control) 30%, var(--surface))",
  positive: "var(--pill-positive-bg)",
  negative: "var(--pill-negative-bg)",
  warning: "var(--pill-warning-bg)",
};
const INK: Record<Tone, string> = {
  neutral: "var(--muted-ink)",
  positive: "var(--pill-positive-ink)",
  negative: "var(--pill-negative-ink)",
  warning: "var(--pill-warning-ink)",
};

/**
 * The status pill: a pale tint + dark same-hue ink, 16–24px tall, 11–12px/500,
 * flex:none + nowrap (a chip must never squeeze). One status mark per row.
 */
export function Pill({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn("meta", className)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 20,
        padding: "0 8px",
        borderRadius: "var(--radius-chip)",
        background: TONES[tone],
        color: INK[tone],
        fontSize: 11,
        fontWeight: 500,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {children}
    </span>
  );
}
