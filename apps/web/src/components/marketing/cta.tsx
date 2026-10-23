import Link from "next/link";
import { IconArrow } from "./icons";

/**
 * The closing CTA band. Reused on the landing, /blog, and /changelog
 * surfaces so the conversion path is always one click away.
 */
export function Cta() {
  return (
    <section className="border-t border-[hsl(var(--line))]">
      <div className="mx-auto w-full max-w-4xl px-4 py-20 sm:px-6 sm:py-24">
        <div className="rounded-[12px] border border-[hsl(var(--line))] bg-[hsl(var(--panel))] p-8 sm:p-12">
          <h2 className="text-[26px] font-bold leading-tight tracking-[-0.01em] text-[hsl(var(--text-1))] sm:text-[32px]">
            Ship better code. Catch bugs earlier.
          </h2>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-[hsl(var(--text-2))]">
            Connect your GitHub, install the app, and set your first rule on a
            pull request in under two minutes. Start on the free tier with 50
            reviews a month, or bring your own model keys for enterprise. Your
            rules become the gate — and the gate is enforced.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/signin"
              className="pressable inline-flex h-11 items-center justify-center gap-2 rounded-[8px] bg-[var(--accent-color)] px-6 text-[15px] font-semibold text-[hsl(var(--accent-foreground))] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-color)]"
            >
              Start free — connect GitHub
              <IconArrow width={18} height={18} />
            </Link>
            <Link
              href="/changelog"
              className="pressable inline-flex h-11 items-center justify-center rounded-[8px] border border-[var(--hard-border)] px-6 text-[15px] font-semibold text-[hsl(var(--text-1))] transition-colors hover:border-[var(--accent-color)] hover:text-[var(--accent-color)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-color)]"
            >
              See what shipped
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
