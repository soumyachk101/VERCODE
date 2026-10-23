import type { CSSProperties } from "react";

/**
 * A severity mark square (the DESIGN_SYSTEM_AND_TYPOGRAPHY.md §3's
 * "the severity mark, the product's identity" — a small filled square
 * in a `--sev-*` token). `aria-hidden`: the accessible version of the
 * mark is the visible count line / the finding text next to it
 * (WCAG 1.1.1 — decorative graphics carry no information).
 *
 * An inline `background` (a `var(--sev-*)` token) keeps the mark in
 * the static export (a Tailwind arbitrary `bg-[var(--sev-high)]`
 * would also work, but the inline style is more explicit about the
 * token source).
 */
function SevMark({
  level,
  size,
}: {
  readonly level: "high" | "medium";
  readonly size: 8 | 6;
}) {
  const style: CSSProperties = {
    width: size,
    height: size,
    background: `var(--sev-${level})`,
  };
  return <span aria-hidden="true" className="shrink-0" style={style} />;
}

/**
 * The review-verdict device — the hero's signature element
 * (INFORMATION_ARCHITECTURE_AND_PAGES.md §3.1 block 1 +
 * DESIGN_SYSTEM_AND_TYPOGRAPHY.md §3's "a review's verdict is a
 * single large word with its severity marks counted beside it").
 *
 * **Preview data — a representative review, not a live dashboard
 * pull.** The IA is explicit: "Static, an image or a DOM card, no
 * live fetch" (the P2 no-client-data-fetching rule,
 * TECHNICAL_ARCHITECTURE.md §4.2). The card is a hand-set DOM element
 * (a `WNFR-07` 1.3.1 "info-in-text" rule: no `figcaption`, no
 * `<img alt>` carrying the meaning — everything is real DOM text, so
 * a screen reader + a crawler read it verbatim).
 */
export function VerdictDevice() {
  return (
    <div
      className="max-w-[420px] rounded-[var(--radius-card)] border border-[var(--hard-border)] bg-[var(--surface)] p-5"
      role="group"
      aria-label="A representative VERCODE review verdict (preview data)"
    >
      {/* A 14px grey meta line: the repo, the PR, the runtime. */}
      <p className="text-[14px] leading-none text-[hsl(var(--faint))] tnum">
        payments-service · PR #412 · 2m 41s
      </p>

      {/* The verdict: a 20px/600 word + the severity marks + a 12px
          grey count (the "a single large word with its severity marks
          counted beside it" rule). */}
      <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[20px] font-semibold leading-none text-[var(--text)]">
          Needs changes
        </span>
        <span className="inline-flex items-center gap-1 self-center">
          <SevMark level="high" size={8} />
          <SevMark level="high" size={8} />
          <SevMark level="medium" size={6} />
        </span>
        <span className="text-[12px] leading-none text-[hsl(var(--muted))] tnum">
          2 high · 1 medium
        </span>
      </div>

      {/* The findings: 1-line, mono 13px, each with a severity square
          (the WNFR-07 "info-in-text" rule — the squares are
          `aria-hidden`, the text is the source of truth). */}
      <ul className="mt-4 space-y-1.5 border-t border-[var(--rule)] pt-4">
        <li className="flex items-start gap-2">
          <SevMark level="high" size={8} />
          <code className="text-[13px] leading-snug text-[hsl(var(--muted))]">
            payments.ts:84 · Unvalidated input concatenated into a SQL
            string (security, 0.91)
          </code>
        </li>
        <li className="flex items-start gap-2">
          <SevMark level="medium" size={6} />
          <code className="text-[13px] leading-snug text-[hsl(var(--muted))]">
            queue.ts:141 · Missing await on async handler (logic, 0.82)
          </code>
        </li>
      </ul>
    </div>
  );
}
