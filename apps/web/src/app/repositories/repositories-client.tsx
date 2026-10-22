"use client";

// /repositories — the list screen (PAGE §2.1) and the detail via a
// client-side [repo] path handled by the route in /repositories/[repo].
import { useState } from "react";
import { OrgPage } from "@/components/page";
import { useOrgShell } from "@/components/OrgShell";
import { useRepos, useReviews, useSecurity } from "@/lib/hooks";
import { PageHead } from "@/components/Settings";
import { DataBlock, EmptyBlock } from "@/components/DataBlock";
import { Panel, PanelTitle } from "@/components/cards";
import { Table, TRow, TCell } from "@/components/Table";
import { Pill } from "@/components/Pill";
import { VcToggle, Search } from "@/components/controls";
import { relativeTime } from "@/lib/format";
import { jobStatusLabel } from "@/lib/types";

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
  const [query, setQuery] = useState("");
  const [connectedOnly, setConnectedOnly] = useState(false);

  const list = repos.data?.repos ?? [];
  const filtered = list.filter((r) => {
    if (connectedOnly && !r.connected) return false;
    if (query && !r.full_name.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <PageHead
        title="Repositories"
        finding={
          repos.data
            ? `${repos.data.repos.length} connected · ${filtered.length} shown`
            : "What's connected, and where's the risk concentrated"
        }
        right={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Search
              placeholder="Search repositories"
              value={query}
              onSearch={setQuery}
              style={{ width: 220 }}
            />
            <VcToggle
              pressed={connectedOnly}
              onPressedChange={setConnectedOnly}
              aria-label="Connected only"
            >
              Connected only
            </VcToggle>
          </div>
        }
      />
      <Panel>
        <PanelTitle>Connected repositories</PanelTitle>
        <DataBlock result={repos} block="repositories">
          {() => {
            if (filtered.length === 0) {
              return repos.data?.repos.length === 0 ? (
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
                caption="Connected repositories, reviews in the last 30 days, open high/critical findings, last reviewed, and connection status"
                head={[
                  { label: "Repository", width: "40%" },
                  { label: "Reviews (30d)", align: "right" },
                  { label: "Open high/critical", align: "right" },
                  { label: "Last reviewed" },
                  { label: "Status" },
                ]}
              >
                {filtered.slice(0, 8).map((r) => (
                  <RepoRow key={r.id} repo={r} orgId={orgId} />
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

function RepoRow({
  repo,
  orgId,
}: {
  repo: { id: string; full_name: string; connected: boolean };
  orgId: string;
}) {
  const sec = useSecurity(orgId || undefined);
  const openHc = sec.data ? sec.data.open.high + sec.data.open.critical : null;
  return (
    <TRow>
      <TCell>
        <a
          href={`/repositories/${encodeURIComponent(repo.full_name)}`}
          style={{ color: "var(--text)", textDecoration: "none", fontWeight: 500 }}
        >
          {repo.full_name}
        </a>
      </TCell>
      <TCell right>{openHc == null ? "—" : null}</TCell>
      <TCell right>{openHc == null ? "—" : openHc}</TCell>
      <TCell>{repo.connected ? relativeTime(new Date().toISOString()) : "never"}</TCell>
      <TCell>
        <Pill tone={repo.connected ? "positive" : "negative"}>
          {repo.connected ? "connected" : "disconnected"}
        </Pill>
      </TCell>
    </TRow>
  );
}
