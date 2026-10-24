"use client";

// The dashboard "connect a repository" card (P5's scope). Two shapes:
//
// 1. No ACTIVE install yet (useRepoCandidates.connected === false) → a
//    prominent install-CTA card: the GitHub App install URL (the same static
//    URL github.ts's POST /:id/github/install-url returns) + a step list.
//
// 2. An ACTIVE install exists (repos connected) → the "Connect another
//    repository" card: a search/choose input that lists the install's
//    disconnected repo rows (the candidates), an inline success
//    confirmation (aria-live), and Connect buttons disabled while a
//    connection is in flight.
//
// Reuses existing primitives (Panel / Pill / Button / Search) — no new
// shared components. The connection result announces through the shell's
// global LiveRegion (OrgShell renders it) as well as the inline box.

import { useEffect, useState } from "react";
import { Panel, PanelTitle } from "./cards";
import { Pill } from "./Pill";
import { Button } from "./Button";
import { Search } from "./controls";
import { announce } from "./announcer";
import {
  useConnectRepo,
  useInstallUrl,
  useRepoCandidates,
  type RepoCandidate,
} from "@/lib/hooks-repo-connect";

// The install URL is static per github.ts (the App's slug is fixed); a
// candidate list that came back with `connected: true` still offers a deep
// link when every grantable repo is already connected.
const GITHUB_APP_INSTALL_URL = "https://github.com/apps/vercode/installations/new";

export function RepoConnectCard({ orgId }: { orgId: string }) {
  const candidates = useRepoCandidates(orgId || undefined);
  const connect = useConnectRepo(orgId);
  const install = useInstallUrl(orgId);
  const [query, setQuery] = useState("");

  const data = candidates.data;
  const candidatesList = data?.candidates ?? [];
  const filtered = candidatesList.filter(
    (c) => !query || c.fullName.toLowerCase().includes(query.toLowerCase()),
  );

  // The just-connected repo (the inline success confirmation). It lives in
  // local state (not the candidate list) because the list re-fetch on
  // connect would otherwise wipe the confirmation the moment it lands.
  const [justConnected, setJustConnected] = useState<string | null>(null);
  useEffect(() => setJustConnected(null), [orgId]);

  const isPending = connect.isPending;

  const openInstall = async () => {
    try {
      const { installUrl } = await install.mutateAsync();
      window.open(installUrl, "_blank", "noopener,noreferrer");
      announce("GitHub install page opened.");
    } catch {
      // The mutation's error state renders below — the fallback link
      // (GITHUB_APP_INSTALL_URL) is always reachable directly.
    }
  };

  const connectRepo = async (c: RepoCandidate) => {
    try {
      await connect.mutateAsync(c.fullName);
      setJustConnected(c.fullName);
      announce(`${c.fullName} connected.`);
    } catch {
      announce(`Couldn't connect ${c.fullName}.`);
    }
  };

  // ---------------------------------------------------------------- shape 1
  // No install yet → the install-CTA card (the "Connect GitHub" empty state).
  // The candidates query is the install detector: it only settles into this
  // shape once it loads, so a loading card never flashes the wrong shape.
  if (!candidates.isLoading && !data?.connected) {
    return (
      <Panel>
        <PanelTitle right={<Pill tone="warning">not connected</Pill>}>
          Connect GitHub
        </PanelTitle>
        <p className="meta" style={{ margin: "0 0 12px" }}>
          Connect your repositories to start reviewing PRs with VERCODE.
        </p>
        <ol
          style={{
            margin: "0 0 16px",
            paddingLeft: 20,
            display: "grid",
            gap: 6,
            fontSize: 14,
            color: "var(--text)",
          }}
        >
          <li>Open the GitHub App install page in a new tab.</li>
          <li>Choose the account (a user or an organization).</li>
          <li>
            Select the repositories VERCODE can review — or all of them.
          </li>
          <li>Confirm the installation. The connected repos appear here.</li>
        </ol>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Button size="sm" disabled={install.isPending} onClick={() => void openInstall()}>
            {install.isPending ? "Opening…" : "Install the GitHub App"}
          </Button>
          <a
            href={GITHUB_APP_INSTALL_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--accent-color)", fontSize: 13 }}
          >
            {GITHUB_APP_INSTALL_URL.replace("https://", "")}
          </a>
        </div>
        {install.isError && (
          <p
            role="alert"
            style={{ marginTop: 12, fontSize: 13, color: "var(--negative)" }}
          >
            Couldn't request the install link — open the URL above manually.
          </p>
        )}
      </Panel>
    );
  }

  // ---------------------------------------------------------------- shape 2
  // An install exists → the "connect another" card (the candidate pick list).
  return (
    <Panel>
      <PanelTitle
        right={justConnected ? <Pill tone="positive">connected</Pill> : undefined}
      >
        Connect another repository
      </PanelTitle>
      <p className="meta" style={{ margin: "0 0 12px" }}>
        {data?.install?.accountLogin
          ? `${candidatesList.length} repositories on your ${data.install.accountLogin} install can be connected here.`
          : `${candidatesList.length} repositories can be connected here.`}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const first = filtered[0];
          if (first && !isPending) void connectRepo(first);
        }}
      >
        <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
          <label
            htmlFor="repo-connect-search"
            className="label"
            style={{ fontWeight: 500, color: "var(--text)", fontSize: 13 }}
          >
            Find a repository
          </label>
          <Search
            id="repo-connect-search"
            placeholder="Search repositories to connect"
            value={query}
            onSearch={setQuery}
            disabled={isPending}
          />
        </div>

        {/* The inline connection result: success (polite), pending (polite),
            failure (assertive). The shell's LiveRegion also announces
            success/failure, so screen readers hear it in place. */}
        {justConnected ? (
          <div
            role="status"
            aria-live="polite"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 10px",
              borderRadius: "var(--radius-control)",
              background: "var(--pill-positive-bg)",
              color: "var(--pill-positive-ink)",
              fontSize: 13,
            }}
          >
            <Pill tone="positive">Connected</Pill>
            <span>{justConnected}</span>
          </div>
        ) : isPending ? (
          <div
            role="status"
            aria-live="polite"
            style={{ padding: "8px 0", fontSize: 13, color: "var(--muted-ink)" }}
          >
            Connecting…
          </div>
        ) : connect.isError ? (
          <div
            role="alert"
            aria-live="assertive"
            style={{
              padding: "8px 10px",
              borderRadius: "var(--radius-control)",
              background: "var(--pill-negative-bg)",
              color: "var(--pill-negative-ink)",
              fontSize: 13,
            }}
          >
            {connect.error?.message ?? "Couldn't connect that repository."}
          </div>
        ) : null}

        {filtered.length > 0 ? (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
            {filtered.slice(0, 6).map((c) => (
              <li
                key={c.fullName}
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <span
                  className="tabular"
                  style={{
                    fontSize: 13,
                    color: "var(--text)",
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.fullName}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isPending}
                  onClick={() => void connectRepo(c)}
                >
                  Connect
                </Button>
              </li>
            ))}
          </ul>
        ) : candidatesList.length > 0 ? (
          <p className="meta" style={{ padding: "8px 0", color: "var(--faint)", fontSize: 13 }}>
            No repositories match this filter.
          </p>
        ) : (
          <p className="meta" style={{ padding: "8px 0", color: "var(--faint)", fontSize: 13 }}>
            Every repository on this install is connected. To connect more, add
            them on the{" "}
            <a
              href={GITHUB_APP_INSTALL_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--accent-color)" }}
            >
              GitHub App install page
            </a>{" "}
            and they will appear here.
          </p>
        )}
      </form>
    </Panel>
  );
}
