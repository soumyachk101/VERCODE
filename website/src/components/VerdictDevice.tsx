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
  readonly size: 10 | 8;
}) {
  const style: CSSProperties = {
    width: size,
    height: size,
    background: `var(--sev-${level})`,
  };
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 shrink-0 rounded-[2px]"
      style={style}
    />
  );
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
 *
 * The premium pass (2026-10-23): the card is the hero's "one large
 * thing" — a 640px measure with a roomy 24px interior, the verdict at
 * 32px, the meta line carrying the runtime, and the findings as real
 * 14px code lines with their confidence figures, not a compressed
 * wall.
 */
export function VerdictDevice() {
  return (
    <div
      className="w-full max-w-[640px] rounded-[var(--radius-card)] border border-[var(--hard-border)] bg-[var(--surface)] p-6 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset,0_24px_48px_-24px_rgba(0,0,0,0.6)] sm:p-7"
      role="group"
      aria-label="A representative VERCODE review verdict (preview data)"
      data-ui
    >
      {/* The meta line: the repo, the PR, the runtime — 13px tabular
          graphite, the card's label row. */}
      <p className="text-[13px] leading-none tracking-[-0.01em] text-[var(--faint)] tnum">
        payments-service · PR #412 · reviewed in 2m 41s
      </p>

      {/* The verdict: a 32px/600 word + the severity marks + a 13px
          grey count (the "a single large word with its severity marks
          counted beside it" rule, at the display scale). */}
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-[32px] font-semibold leading-none tracking-[-0.02em] text-[var(--text)]">
          Needs changes
        </span>
        <span className="inline-flex items-center gap-1.5">
          <SevMark level="high" size={10} />
          <SevMark level="high" size={10} />
          <SevMark level="medium" size={8} />
        </span>
        <span className="text-[13px] leading-none text-[var(--muted)] tnum">
          2 high · 1 medium
        </span>
      </div>

      {/* The findings: 14px real code lines, each with a severity
          square (the WNFR-07 "info-in-text" rule — the squares are
          `aria-hidden`, the text is the source of truth). */}
      <ul className="mt-5 space-y-2.5 border-t border-[var(--rule)] pt-5">
        <li className="flex items-start gap-3">
          <SevMark level="high" size={10} />
          <div className="min-w-0">
            <p className="text-[14px] leading-snug text-[var(--text)]">
              Unvalidated input concatenated into a SQL string
            </p>
            <code className="mt-0.5 block text-[13px] leading-snug text-[var(--faint)]">
              payments.ts:84 · security · 0.91 confidence
            </code>
          </div>
        </li>
        <li className="flex items-start gap-3">
          <SevMark level="high" size={10} />
          <div className="min-w-0">
            <p className="text-[14px] leading-snug text-[var(--text)]">
              A credential written to the response body on the error path
            </p>
            <code className="mt-0.5 block text-[13px] leading-snug text-[var(--faint)]">
              auth.ts:122 · security · 0.87 confidence
            </code>
          </div>
        </li>
        <li className="flex items-start gap-3">
          <SevMark level="medium" size={8} />
          <div className="min-w-0">
            <p className="text-[14px] leading-snug text-[var(--text)]">
              Missing await on an async handler in the drain loop
            </p>
            <code className="mt-0.5 block text-[13px] leading-snug text-[var(--faint)]">
              queue.ts:141 · logic · 0.82 confidence
            </code>
          </div>
        </li>
      </ul>
    </div>
  );
}
