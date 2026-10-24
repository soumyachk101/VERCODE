import Link from "next/link";
import { IconArrow, IconShield } from "../icons";

// The hero: one statement of what the product is, one primary action
// (connect a repository, the product's real next step), and the verdict
// card, the product doing its job in front of the visitor. The CTA says
// connect, not buy.

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-[hsl(var(--background))]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[hsl(var(--highlight))] opacity-40"
      />
      <div className="relative mx-auto w-full max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pb-20 sm:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-[38px] font-bold leading-[1.08] tracking-[-0.02em] text-[hsl(var(--text-1))] sm:text-[56px]">
            Code review your team
            <br className="hidden sm:block" /> actually reads.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-[16px] leading-relaxed text-[hsl(var(--text-2))] sm:text-[18px]">
            Static analysis runs first. Task-routed AI reviews the bounded diff.
            Your team&apos;s rules become a merge gate. VERCODE posts a verdict and
            evidence-backed findings back to the pull request in under two minutes.
          </p>
          <div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Link
              href="/signin"
              className="pressable inline-flex h-11 items-center justify-center gap-2 rounded-[8px] bg-[var(--accent-color)] px-6 text-[15px] font-semibold text-[hsl(var(--accent-foreground))] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-color)]"
            >
              Connect your repository
              <IconArrow width={18} height={18} />
            </Link>
            <Link
              href="/changelog"
              className="pressable inline-flex h-11 items-center justify-center rounded-[8px] border border-[var(--hard-border)] px-6 text-[15px] font-semibold text-[hsl(var(--text-1))] transition-colors hover:border-[var(--accent-color)] hover:text-[var(--accent-color)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-color)]"
            >
              See what shipped
            </Link>
          </div>
          <p className="mt-4 text-[12px] text-[hsl(var(--text-3))]">
            No infrastructure to run · one sign-in connects every repo
          </p>
        </div>

        {/* the verdict device: the one large thing, a code-like card */}
        <div data-ui className="mx-auto mt-14 max-w-3xl overflow-hidden rounded-[10px] border border-[var(--hard-border)] bg-[hsl(var(--panel))]">
          <div className="flex items-center justify-between border-b border-[hsl(var(--line))] px-4 py-3">
            <div className="flex items-center gap-2">
              <IconShield width={16} height={16} className="text-[hsl(var(--success))]" />
              <span className="text-[12px] text-[hsl(var(--text-3))]">
                vercode · review #4821 · feat/checkout-retries
              </span>
            </div>
            <span className="rounded-full border border-[hsl(var(--line))] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--text-3))]">
              changes requested
            </span>
          </div>
          <pre className="overflow-x-auto px-4 py-4 font-mono text-[12px] leading-relaxed text-[hsl(var(--text-2))]">
{`src/payments/retry.ts:88  [high] security
  Missing idempotency key on the retry path — a retried
  charge can be captured twice by the provider.

  confidence 0.97   ·   rule "payments-idempotency"
  fix: derive the key from the charge intent id`}
          </pre>
          <div className="grid grid-cols-3 gap-px bg-[hsl(var(--highlight))]">
            {[
              ["120s", "publish p50"],
              ["0.6", "confidence floor"],
              ["3", "findings blocked"],
            ].map(([value, label]) => (
              <div key={label} className="bg-[hsl(var(--panel))] px-4 py-3 text-center">
                <div className="text-[15px] font-semibold tabular-nums text-[hsl(var(--text-1))]">{value}</div>
                <div className="mt-0.5 text-[11px] uppercase tracking-wider text-[hsl(var(--text-3))]">{label}</div>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-3 text-center text-[12px] text-[hsl(var(--text-3))]">
          Representative review output: a static finding on your rules, gated at merge.
        </p>
      </div>
    </section>
  );
}
