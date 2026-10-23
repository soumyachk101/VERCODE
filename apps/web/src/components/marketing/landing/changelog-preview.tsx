import Link from "next/link";
import { changelog } from "@/lib/changelog-data";
import { IconArrow } from "../icons";

const TAG_LABEL: Record<string, string> = {
  added: "Added",
  improved: "Improved",
  fixed: "Fixed",
  security: "Security",
};

const TAG_CLASS: Record<string, string> = {
  added: "text-[hsl(var(--success))]",
  improved: "text-[hsl(var(--text-3))]",
  fixed: "text-[hsl(0_80%_55%)]",
  security: "text-[hsl(270_70%_65%)]",
};

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function ChangelogPreview() {
  const entries = changelog.slice(0, 3);
  return (
    <section className="border-t border-[hsl(var(--line))]">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--accent))]">
              Changelog
            </span>
            <h2 className="mt-3 text-[28px] font-bold tracking-[-0.01em] text-[hsl(var(--text-1))] sm:text-[34px]">
              The recent releases
            </h2>
          </div>
          <Link
            href="/changelog"
            className="inline-flex items-center gap-1.5 text-[14px] font-medium text-[hsl(var(--accent))] hover:underline"
          >
            View changelog
            <IconArrow width={16} height={16} />
          </Link>
        </div>

        <ol className="mt-10 space-y-4">
          {entries.map((entry) => (
            <li
              key={entry.version}
              className="rounded-[10px] border border-[hsl(var(--line))] bg-[hsl(var(--panel))] p-5 sm:p-6"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="font-mono text-[15px] font-semibold text-[hsl(var(--text-1))]">
                  {entry.version}
                </span>
                <span
                  className={`rounded-[4px] border border-[hsl(var(--line))] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${TAG_CLASS[entry.tag]}`}
                >
                  {TAG_LABEL[entry.tag]}
                </span>
                <time dateTime={entry.date} className="text-[13px] text-[hsl(var(--text-3))]">
                  {formatDate(entry.date)}
                </time>
                <h3 className="w-full text-[15px] font-semibold text-[hsl(var(--text-1))] sm:ml-auto sm:w-auto">
                  {entry.title}
                </h3>
              </div>
              <ul className="mt-3 space-y-1.5">
                {entry.items.slice(0, 2).map((item) => (
                  <li key={item} className="flex gap-2.5 text-[14px] leading-relaxed text-[hsl(var(--text-2))]">
                    <span aria-hidden="true" className="mt-[9px] h-px w-3 shrink-0 bg-[hsl(var(--accent))]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
