import type { Metadata } from "next";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { Cta } from "@/components/marketing/cta";
import { changelog } from "@/lib/changelog-data";

export const metadata: Metadata = {
  title: "Changelog — VERCODE",
  description:
    "Every VERCODE release in order: the feature added, the behavior improved, the fix shipped, and the security hardening — each with its version, date, and the items it carried.",
};

const TAG_LABEL: Record<ChangelogTag, string> = {
  added: "Added",
  improved: "Improved",
  fixed: "Fixed",
  security: "Security",
};

// Tag chips — the spec colors. added = success, improved = text-3 (cool
// neutral), fixed = accent (bad), security = highlighted panel.
const TAG_CLASS: Record<ChangelogTag, string> = {
  added: "bg-[hsl(var(--success))] text-[hsl(var(--accent-foreground))]",
  improved: "bg-[hsl(var(--text-3))] text-[hsl(var(--accent-foreground))]",
  fixed: "bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]",
  security: "bg-[hsl(var(--panel))] text-[hsl(var(--text-2))]",
};

type ChangelogTag = "added" | "improved" | "fixed" | "security";

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function ChangelogPage() {
  return (
    <MarketingShell>
      <section className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
        <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-color)]">
          Changelog
        </span>
        <h1 className="mt-3 text-[32px] font-bold leading-[1.1] tracking-[-0.02em] text-[hsl(var(--text-1))] sm:text-[44px]">
          Releases, newest first
        </h1>
        <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-[hsl(var(--text-2))]">
          Every release in order, oldest at the bottom: what shipped, when, and
          under which tag. Jump to the version your team actually runs.
        </p>
      </section>

      <section className="mx-auto w-full max-w-3xl px-4 pb-16 sm:px-6">
        <ol className="relative border-l border-[hsl(var(--line))] pl-6 sm:pl-8">
          {changelog.map((entry) => (
            <li key={entry.version} className="relative pb-12 last:pb-0">
              {/* the timeline node */}
              <span
                aria-hidden="true"
                className="absolute -left-[calc(1.5rem+5px)] top-1 h-3 w-3 rounded-full border-2 border-[hsl(var(--background))] bg-[hsl(var(--accent))] sm:-left-[calc(2rem+5px)]"
              />
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="rounded-full bg-[hsl(var(--highlight))] px-2.5 py-0.5 font-mono text-[13px] font-semibold text-[hsl(var(--text-1))]">
                  {entry.version}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${TAG_CLASS[entry.tag]}`}
                >
                  {TAG_LABEL[entry.tag]}
                </span>
                <time dateTime={entry.date} className="text-[13px] text-[hsl(var(--text-3))]">
                  {formatDate(entry.date)}
                </time>
              </div>
              <h2 className="mt-3 text-[18px] font-semibold text-[hsl(var(--text-1))]">
                {entry.title}
              </h2>
              <ul className="mt-4 space-y-2.5">
                {entry.items.map((item) => (
                  <li key={item} className="flex gap-3 text-[14px] leading-relaxed text-[hsl(var(--text-2))]">
                    <span
                      aria-hidden="true"
                      className="mt-[8px] h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--text-3))]"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>

      <Cta />
    </MarketingShell>
  );
}
