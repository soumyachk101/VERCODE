"use client";

import { useState } from "react";
import { OrgPage } from "@/components/page";
import { useOrgShell } from "@/components/OrgShell";
import { useRepos, useReviews, useSecurity } from "@/lib/hooks";
import { PageHead } from "@/components/Settings";
import { DataBlock, EmptyBlock } from "@/components/DataBlock";
import { Panel, PanelTitle } from "@/components/cards";
import { Table, TRow, TCell } from "@/components/Table";
import { Pill } from "@/components/Pill";
import { Search } from "@/components/controls";
import { relativeTime } from "@/lib/format";

export function RepositoriesClient() {
  return (
    <OrgPage>
      <RepositoriesBody />
    </OrgPage>
  );
}

function RepositoriesBody() {
  const s = useOrgShell();
  const orgId = s.active?.id ?? "";
  const repos = useRepos(orgId || undefined);
  const sec = useSecurity(orgId || undefined);
  const [query, setQuery] = useState("");

  const list = repos.data?.repos ?? [];
  const filtered = list.filter(
    (r) => !query || r.full_name.toLowerCase().includes(query.toLowerCase()),
  );

  // the open high/critical count is a real API number when the rollup
  // returns; a missing rollup is a grey dash, not a fabricated zero.
  const openHc = sec.data ? sec.data.open.high + sec.data.open.critical : null;

  return (
    <div>
      <PageHead
        title="Repositories"
        finding={
          repos.data
            ? `${list.length} connected repositories · ${openHc ?? "—"} open high/critical org-wide`
            : "What's connected, and where's the risk concentrated?"
        }
        right={
          <Search
            placeholder="Search repositories"
            value={query}
            onSearch={setQuery}
            style={{ width: 220 }}
          />
        }
      />
      <Panel>
        <PanelTitle>Connected repositories</PanelTitle>
        <DataBlock result={repos} block="repositories">
          {() => {
            if (filtered.length === 0) {
              return list.length === 0 ? (
                <EmptyBlock>
                  No repositories connected yet — install the GitHub App to
                  start reviewing PRs.
                </EmptyBlock>
              ) : (
                <EmptyBlock>No repos match this filter</EmptyBlock>
              );
            }
            return (
              <Table
                caption="Repositories: reviews in the last 30 days, open high/critical findings, last reviewed, and connection status"
                head={[
                  { label: "Repository", width: "38%" },
                  { label: "Reviews (30d)", align: "right" },
                  { label: "Open high/critical", align: "right" },
                  { label: "Last reviewed" },
                  { label: "Status" },
                ]}
              >
                {filtered.slice(0, 8).map((r) => (
                  <TRow key={r.id}>
                    <TCell>
                      <a
                        href={`/repositories/${encodeURIComponent(r.full_name)}`}
                        style={{ color: "var(--text)", fontWeight: 500, textDecoration: "none" }}
                      >
                        {r.full_name}
                      </a>
                    </TCell>
                    <TCell right>
                      <RepoReviews orgId={orgId} repoId={r.id} />
                    </TCell>
                    <TCell right>{openHc == null ? <Dash /> : openHc}</TCell>
                    <TCell>
                      <RepoLastReviewed orgId={orgId} repoId={r.id} />
                    </TCell>
                    <TCell>
                      <Pill tone={r.connected ? "positive" : "negative"}>
                        {r.connected ? "connected" : "disconnected"}
                      </Pill>
                    </TCell>
                  </TRow>
                ))}
              </Table>
            );
          }}
        </DataBlock>
        {list.length > 8 && (
          <p className="meta" style={{ marginTop: 8 }}>
            Showing 8 of {list.length} repositories
          </p>
        )}
      </Panel>
    </div>
  );
}

// One reviews-30d number per repo — the API aggregates this; when it
// doesn't, a real zero (a connected repo with no reviews in 30d) prints
// as "0", a disconnected repo prints as a grey dash. A failed fetch also
// prints a dash (a count is a claim, never a guess).
function RepoReviews({ orgId, repoId }: { orgId: string; repoId: string }) {
  const r = useReviews(orgId || undefined, {
    repoId,
    since: new Date(Date.now() - 30 * 86400000).toISOString(),
  });
  if (r.isError || !r.data) return <Dash />;
  return <>{r.data.items.length}</>;
}

function RepoLastReviewed({ orgId, repoId }: { orgId: string; repoId: string }) {
  const r = useReviews(orgId || undefined, { repoId });
  const last = r.data?.items[0];
  if (r.isError || !r.data || !last) return <Dash />;
  return relativeTime(last.finishedAt ?? last.createdAt);
}

function Dash() {
  return <span className="meta" style={{ color: "var(--faint)" }}>—</span>;
}
