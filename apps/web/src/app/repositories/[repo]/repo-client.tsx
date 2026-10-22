"use client";

// /repositories/[repo] — the detail screen (PAGE §2.2). All four blocks
// are data-driven (the trend chart, the open findings, the last 5
// reviews, the rule state); each keeps its frame + header on an error.
import { useEffect, useState } from "react";
import { OrgPage } from "@/components/page";
import { useOrgShell } from "@/components/OrgShell";
import {
  useRepos,
  useSecurity,
  useTrends,
  useRules,
  useReviews,
} from "@/lib/hooks";
import { PageHead } from "@/components/Settings";
import { DataBlock, EmptyBlock } from "@/components/DataBlock";
import { Panel, PanelTitle } from "@/components/cards";
import { CategoryTrendChart } from "@/components/charts";
import { SeverityMark } from "@/components/SeverityMark";
import { relativeTime, verdictWord } from "@/lib/format";

export function RepoDetailClient({ params }: { params: Promise<{ repo: string }> }) {
  const [repo, setRepo] = useState<string | null>(null);
  useEffect(() => {
    void params.then((p) => setRepo(p.repo));
  }, [params]);

  return (
    <OrgPage>
      {repo ? <RepoBody repo={decodeURIComponent(repo)} /> : (
        <p className="meta" role="status">Loading repository…</p>
      )}
    </OrgPage>
  );
}

function RepoBody({ repo }: { repo: string }) {
  const s = useOrgShell();
  const orgId = s.active?.id ?? "";
  const reposQ = useRepos(orgId || undefined);
  const secQ = useSecurity(orgId || undefined);
  const trendsQ = useTrends(orgId || undefined, { repoId: repoIdOf(repo, reposQ.data) });
  const rulesQ = useRules(orgId || undefined);
  const reviewsQ = useReviews(orgId || undefined, { repoId: repoIdOf(repo, reposQ.data) });

  // the repo's open findings (capped to 6, the unactioned high/critical
  // ones first — Marcus's "risk concentrated here" question, PAGE §2.2)
  const open = secQ.data?.items
    ?.filter(
      (f) =>
        f.repoName === repo &&
        (f.severity === "critical" || f.severity === "high") &&
        !f.actioned,
    )
    .slice(0, 6) ?? [];

  const last5 = reviewsQ.data?.items.slice(0, 5) ?? [];
  const rule = rulesQ.data?.find((r) => r.repoName === repo);

  // the risk-trend chart: a findings-by-category series for 30 days. The
  // data comes from the API's /trends; when it's a flat zero line, the
  // chart draws flat (DESIGN_SYSTEM §6.5: a flat line tells the truth).
  const catMap = new Map<string, { date: string; [k: string]: number | string }>();
  for (const p of trendsQ.data ?? []) {
    const row = catMap.get(p.date) ?? { date: p.date };
    row[p.category] = (Number(row[p.category]) || 0) + p.count;
    catMap.set(p.date, row);
  }
  const series = Array.from(catMap.values());
  const cats = Array.from(new Set((trendsQ.data ?? []).map((p) => p.category)));

  return (
    <div>
      <PageHead
        title={repo}
        finding={
          secQ.data
            ? `${open.length} open high/critical findings in this repository`
            : "Risk trend, open findings, and the last 5 reviews for this repository"
        }
      />
      <div style={{ display: "grid", gap: 16 }}>
        <Panel>
          <PanelTitle>Risk trend by category (30d)</PanelTitle>
          <DataBlock result={trendsQ} block="the trend">
            {() =>
              series.length === 0 ? (
                <EmptyBlock>No findings recorded in this period — a flat line is a clean record.</EmptyBlock>
              ) : (
                <CategoryTrendChart data={series} categories={cats} ariaLabel="Findings by category, 30 days" />
              )
            }
          </DataBlock>
        </Panel>

        <Panel>
          <PanelTitle right={<a href={`/reviews?repo=${encodeURIComponent(repo)}`} className="pressable" style={{ color: "var(--accent)", fontSize: 13 }}>View all</a>}>
            Open findings
          </PanelTitle>
          {secQ.data && open.length === 0 ? (
            <EmptyBlock>No open high or critical findings in this repository</EmptyBlock>
          ) : (
            <DataBlock result={secQ} block="open findings">
              {() => (
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {open.map((f) => (
                    <li key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--rule)" }}>
                      <SeverityMark severity={f.severity} size={6} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.title}</span>
                      <span className="meta" style={{ fontSize: 12 }}>{f.category}</span>
                      <span className="meta" style={{ fontSize: 12 }}>{f.createdAt ? relativeTime(f.createdAt) : "—"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </DataBlock>
          )}
        </Panel>

        <Panel>
          <PanelTitle>Last 5 reviews</PanelTitle>
          <DataBlock result={reviewsQ} block="recent reviews">
            {() =>
              last5.length === 0 ? (
                <EmptyBlock>No reviews for this repository yet</EmptyBlock>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {last5.map((j) => (
                    <li key={j.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--rule)" }}>
                      <a
                        href={`/reviews/${encodeURIComponent(repo)}/${j.prNumber}/${j.id}`}
                        className="tabular"
                        style={{ color: "var(--text)", textDecoration: "none" }}
                      >
                        PR #{j.prNumber}
                      </a>
                      <span className="meta" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {verdictWord(j)}
                      </span>
                      <span className="meta" style={{ fontSize: 12 }}>
                        {relativeTime(j.finishedAt ?? j.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )
            }
          </DataBlock>
        </Panel>

        <Panel>
          <PanelTitle>Rules</PanelTitle>
          <DataBlock result={rulesQ} block="rule state">
            {() =>
              rule ? (
                <p className="finding-line" style={{ margin: 0 }}>
                  {rule.overrides.length} repo-specific rule override
                  {rule.overrides.length === 1 ? "" : "s"} in force: {rule.overrides.join(", ")}.{" "}
                  <a href="/settings/rules" className="pressable" style={{ color: "var(--accent)" }}>Manage rules</a>
                </p>
              ) : (
                <p className="finding-line" style={{ margin: 0 }}>
                  No repo-specific rules — using the org default.{" "}
                  <a href="/settings/rules" className="pressable" style={{ color: "var(--accent)" }}>Manage rules</a>
                </p>
              )
            }
          </DataBlock>
        </Panel>
      </div>
    </div>
  );
}

function repoIdOf(fullName: string, repos: ReturnType<typeof useRepos>["data"]) {
  return repos?.repos.find((r) => r.full_name === fullName)?.id ?? fullName;
}
