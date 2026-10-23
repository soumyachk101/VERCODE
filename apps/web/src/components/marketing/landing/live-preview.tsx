"use client";

// The live product preview — the "See it in action" section on the landing
// page. When a session exists it pulls real data from the API (org reviews,
// security rollup, quota) and renders it in the same dark-palette panel
// style as the dashboard. When no session exists it renders the
// representative sample with a clear "sample data" label — never
// fabricated customer data.

import { useAuthMe, useInstall, useRepos, useReviews, useSecurity, useUsage } from "@/lib/hooks";
import type { NormalizedSecurity, NormalizedUsage, NormalizedReviews, NormalizedRepos, NormalizedInstall } from "@/lib/normalized";
import { IconArrow, IconShield } from "../icons";

function SkeletonPanel({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-[10px] border border-[hsl(var(--line))] bg-[hsl(var(--panel))] p-6">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--text-3))]">
        {label}
      </span>
      <div className="mt-2 h-3 w-40 animate-pulse rounded bg-[hsl(var(--highlight))]" />
      <div className="h-3 w-64 animate-pulse rounded bg-[hsl(var(--highlight))]" />
    </div>
  );
}

export function LivePreview() {
  const me = useAuthMe();
  const orgId = me.data?.orgs?.[0]?.id ?? null;
  const security = useSecurity(orgId ?? undefined);
  const reviews = useReviews(orgId ?? undefined, { since: "7d" });
  const usage = useUsage(orgId ?? undefined, "30d");
  const install = useInstall(orgId ?? undefined);
  const repos = useRepos(orgId ?? undefined);

  const signedIn = me.data !== undefined;
  const loading = signedIn && me.isFetching;

  const sec: NormalizedSecurity | undefined = security.data;
  const usg: NormalizedUsage | undefined = usage.data;
  const rev: NormalizedReviews | undefined = reviews.data;
  const inst: NormalizedInstall | undefined = install.data;
  const rep: NormalizedRepos | undefined = repos.data;

  const data = {
    openFindings: sec?.total ?? 0,
    critical: sec?.open?.critical ?? 0,
    reviews7d: rev?.items?.length ?? 0,
    avgReviewTime: usg?.totals.reviews > 0 ? `${usg.totals.reviews} reviews · ${usg.totals.estUsd.toFixed(2)} USD` : "No reviews yet",
    quotaUsed: usg ? Math.round((usg.quota?.percentUsed ?? 0) * 100) : 0,
    connectedRepos: rep?.items?.length ?? 0,
    installState: (inst?.connected ? "connected" : "not-connected") as "connected" | "not-connected",
  };

  const isLive = signedIn && orgId !== null;

  return (
    <section className="border-y border-[hsl(var(--line))] bg-[hsl(var(--panel))]">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <div className="max-w-2xl">
          <h2 className="text-[28px] font-bold tracking-[-0.01em] text-[hsl(var(--text-1))] sm:text-[34px]">
            {isLive ? "Your org, live" : "What a team sees on day one"}
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-[hsl(var(--text-2))]">
            {isLive
              ? "Live data from your org: open findings, last 7 days of reviews, and this month's quota."
              : "The overview panel as it appears the moment you sign in. What you see here is a sample — your org data replaces it after you connect a repository."}
          </p>
        </div>

        {loading ? (
          <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-[10px] border border-[hsl(var(--line))] bg-[hsl(var(--line))] sm:grid-cols-2 lg:grid-cols-3">
            {["Open findings", "Reviews · 7 days", "Quota used · 30d", "Connected repos", "30-day spend", "Install status"].map((label) => (
              <div key={label} className="flex flex-col items-start gap-3 bg-[hsl(var(--background))] p-6">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--text-3))]">{label}</span>
                <div className="h-7 w-32 animate-pulse rounded bg-[hsl(var(--highlight))]" />
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-[10px] border border-[hsl(var(--line))] bg-[hsl(var(--line))] sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                label: "Open findings",
                value: String(data.openFindings),
                sub: `${data.critical} critical`,
              },
              {
                label: "Reviews · 7 days",
                value: String(data.reviews7d),
                sub: isLive ? "across all connected repos" : "sample",
              },
              {
                label: "Quota used · 30d",
                value: `${data.quotaUsed}%`,
                sub: isLive ? "of this month's plan" : "free tier · sample",
              },
              {
                label: "Connected repos",
                value: String(data.connectedRepos),
                sub:
                  data.installState === "connected"
                    ? "GitHub App installed"
                    : "connect to start",
              },
              {
                label: "30-day spend",
                value: data.avgReviewTime,
                sub: "model + compute",
              },
              {
                label: "Install",
                value: data.installState === "connected" ? "Connected" : "Not connected",
                sub:
                  data.installState === "connected"
                    ? "vercode GitHub App"
                    : "one click, no code",
              },
            ].map((item) => (
              <div key={item.label} className="flex flex-col items-start bg-[hsl(var(--background))] p-6">
                <div className="flex w-full items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--text-3))]">
                    {item.label}
                  </span>
                  {isLive && item.label === "Install" && item.value === "Connected" && (
                    <IconShield width={14} height={14} className="text-[hsl(var(--success))]" />
                  )}
                </div>
                <div className="mt-3 font-mono text-[26px] font-bold leading-none tracking-[-0.02em] text-[hsl(var(--text-1))]">
                  {item.value}
                </div>
                <div className="mt-1 text-[12px] text-[hsl(var(--text-3))]">{item.sub}</div>
              </div>
            ))}
          </div>
        )}

        {!isLive && !loading && (
          <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[13px] text-[hsl(var(--text-3))]">
              This section updates automatically when you sign in.
            </p>
            <a
              href="/signin"
              className="inline-flex items-center gap-1.5 text-[14px] font-medium text-[var(--accent-color)] transition-colors hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-color)]"
            >
              Sign in to see your org
              <IconArrow width={15} height={15} />
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
