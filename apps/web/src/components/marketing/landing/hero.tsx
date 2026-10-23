import Link from "next/link";
import { IconArrow, IconBolt, IconBranch, IconShield } from "../icons";

const TRUST = [
  { icon: IconBolt, label: "Zero-config", detail: "Detects your stack on install" },
  { icon: IconBranch, label: "Git-aware AI", detail: "Reviews the bounded diff" },
  { icon: IconShield, label: "Your rules, enforced", detail: "Gate merges on your policy" },
];

export function Hero() {

  return (
    <section className="relative overflow-hidden border-b border-[hsl(var(--line))]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.55]"
        style={{
          background:
            "radial-gradient(60rem 24rem at 50% -8rem, hsl(var(--highlight)) 0%, transparent 70%)",
        }}
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
            {cta}
            <Link
              href="/changelog"
              className="pressable inline-flex h-11 items-center justify-center gap-2 rounded-[8px] border border-[var(--hard-border)] px-6 text-[15px] font-semibold text-[hsl(var(--text-1))] transition-colors hover:border-[var(--accent-color)] hover:text-[var(--accent-color)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-color)]"
            >
              View changelog
            </Link>
          </div>
          <p className="mt-4 text-[12px] text-[hsl(var(--text-3))]">
            Free tier · 50 reviews a month · no card required
          </p>
        </div>

        {/* the verdict device — the one large thing, a code-like card */}
        <div className="mx-auto mt-14 max-w-3xl overflow-hidden rounded-[10px] border border-[var(--hard-border)] bg-[hsl(var(--panel))]">
          <div className="flex items-center justify-between border-b border-[hsl(var(--line))] px-4 py-3">
            <div className="flex items-center gap-2">
              <IconShield width={16} height={16} className="text-[hsl(var(--success))]" />
              <span className="font-mono text-[12px] text-[hsl(var(--text-3))]">
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
          <div className="grid grid-cols-3 divide-x divide-[hsl(var(--line))] border-t border-[hsl(var(--line))]">
            {[
              ["120s", "publish p50"],
              ["0.6", "confidence floor"],
              ["3", "findings blocked"],
            ].map(([value, label]) => (
              <div key={label} className="px-4 py-3 text-center">
                <div className="font-mono text-[15px] font-semibold text-[hsl(var(--text-1))]">{value}</div>
                <div className="mt-0.5 text-[11px] uppercase tracking-wider text-[hsl(var(--text-3))]">{label}</div>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-3 text-center text-[12px] text-[hsl(var(--text-3))]">
          Representative review output — a static finding on your rules, gated at merge.
        </p>

        {/* the trust strip */}
        <ul className="mx-auto mt-14 grid max-w-4xl grid-cols-1 gap-px overflow-hidden rounded-[10px] border border-[hsl(var(--line))] bg-[hsl(var(--line))] sm:grid-cols-3">
          {TRUST.map((item) => (
            <li key={item.label} className="flex items-start gap-3 bg-[hsl(var(--background))] px-5 py-5">
              <item.icon width={20} height={20} className="mt-0.5 shrink-0 text-[var(--accent-color)]" />
              <div>
                <div className="text-[14px] font-semibold text-[hsl(var(--text-1))]">{item.label}</div>
                <div className="mt-1 text-[13px] text-[hsl(var(--text-3))]">{item.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
