"use client";

// The "GitHub connection" card (the settings "GitHub connection" section's
// body; P6's connect/disconnect/settings feature). Three independent blocks:
//
// 1. Personal GitHub account (OAuth, the "reviews are posted as you"
//    token) — reuses the account page's per-user start/disconnect hooks
//    (no new auth path; the same GITHUB_CLIENT_ID OAuth app is used).
// 2. Organization GitHub App install — the App-install click-through.
//    The install flow has no server-side "connect" call: GitHub's install
//    page handles it, and the `installation` webhook is what records the
//    install + repos. The "Connect GitHub" button here fetches the install
//    URL via `POST /orgs/:id/github/connect` and opens it in a new tab;
//    "Disconnect" marks the install REMOVED + schedules a purge (the
//    existing `disconnect` handler's logic).
// 3. The accessible-repos list + an "active for review" checkbox set that
//    persists to org_settings.active_repos_for_review via
//    `PUT /orgs/:id/github-repos`.
//
// The card is self-contained so the repositories page's connect flow
// (P5's dashboard UI) can re-implement a slimmer variant against the
// same two endpoints without duplicating the org-level logic.

import { useEffect, useState } from "react";
import { useOrgShell } from "@/components/OrgShell";
import {
  useProfile,
  useInstall,
  useRepos,
  useGithubStart,
  useGithubDisconnect,
  useGithubOrgConnect,
  useGithubOrgDisconnect,
  useSetGithubActiveRepos,
  useSettings,
} from "@/lib/hooks";
import { DataBlock, EmptyBlock, ProviderConnectionRow } from "@/components/DataBlock";
import { Pill } from "@/components/Pill";
import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/BlockError";

export function GitHubConnectCard() {
  const s = useOrgShell();
  const orgId = s.active?.id ?? "";

  const profile = useProfile();
  const install = useInstall(orgId || undefined);
  const repos = useRepos(orgId || undefined);
  const githubStart = useGithubStart();
  const githubDisconnect = useGithubDisconnect();
  const orgConnect = useGithubOrgConnect(orgId);
  const orgDisconnect = useGithubOrgDisconnect(orgId);
  const setActiveRepos = useSetGithubActiveRepos(orgId);
  const settings = useSettings(orgId || undefined);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState(false);

  // Pre-seed the checkbox state from the persisted active set (a null /
  // missing value means "nothing saved yet" — the user starts with all
  // connected repos unchecked, which matches the server-side default).
  useEffect(() => {
    const active = settings.data?.activeReposForReview;
    if (Array.isArray(active)) {
      setSelected(new Set(active));
    }
  }, [settings.data?.activeReposForReview]);

  const user = {
    connected: profile.data?.githubConnected ?? false,
    handle: profile.data?.githubHandle ?? null,
  };
  const installData = install.data;
  const repoRows = repos.data?.repos ?? [];

  const onToggle = (id: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const save = () => {
    const ids = Array.from(selected);
    setActiveRepos.mutate(ids, {
      onSuccess: () => {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      },
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* The per-user OAuth block */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div className="meta" style={{ fontSize: 12 }}>
          Personal GitHub account (OAuth) — reviews are posted as this user
        </div>
        <DataBlock result={profile} block="GitHub connection">
          {() => (
            <ProviderConnectionRow
              label="GitHub"
              data={user}
              connecting={githubStart.isPending}
              onConnect={() => {
                githubStart.mutate(undefined, {
                  onSuccess: (url) => {
                    if (url) window.location.href = url;
                  },
                });
              }}
              disconnecting={githubDisconnect.isPending}
              onDisconnect={() => setConfirmDisconnect(true)}
            />
          )}
        </DataBlock>
        {githubStart.isError && (
          <span className="meta" style={{ color: "var(--negative)" }} role="alert">
            {(githubStart.error as { message?: string } | null)?.message ??
              "Couldn't start the GitHub connection."}
          </span>
        )}
      </div>

      {/* The org-level App install block */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div className="meta" style={{ fontSize: 12 }}>
          Organization GitHub App — the repo source for reviews (install +
          webhook-driven)
        </div>
        <DataBlock result={install} block="GitHub App install">
          {() => {
            const connected = !!installData?.connected;
            const account = installData?.account ?? null;
            const installId = installData?.installId;
            const connectedAt = installData?.connectedAt;
            const reposCount = installData?.reposCount ?? 0;
            return connected ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "4px 0",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <Pill tone="positive">Connected</Pill>
                    {account && (
                      <span className="meta" style={{ fontSize: 12 }}>
                        as {account}
                      </span>
                    )}
                    {installId && (
                      <span className="mono" style={{ fontSize: 11, color: "var(--faint)" }}>
                        install {installId.slice(0, 8)}
                      </span>
                    )}
                    {connectedAt && (
                      <span className="meta" style={{ fontSize: 11, color: "var(--faint)" }}>
                        since {new Date(connectedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDisconnect(true)}>
                    Disconnect
                  </Button>
                </div>
                <div className="meta" style={{ fontSize: 12 }}>
                  {reposCount} connected repository{reposCount === 1 ? "" : "s"}
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "4px 0",
                }}
              >
                <span className="meta" style={{ color: "var(--faint)" }}>
                  Not installed
                </span>
                <Button
                  size="sm"
                  disabled={orgConnect.isPending}
                  onClick={() => {
                    orgConnect.mutate(undefined, {
                      onSuccess: (url) => {
                        if (url) window.open(url, "_blank", "noopener");
                      },
                    });
                  }}
                >
                  {orgConnect.isPending ? "Opening GitHub…" : "Connect GitHub"}
                </Button>
              </div>
            );
          }}
        </DataBlock>
        {orgConnect.isError && (
          <span className="meta" style={{ color: "var(--negative)" }} role="alert">
            {(orgConnect.error as { message?: string } | null)?.message ??
              "Couldn't fetch the install URL."}
          </span>
        )}
      </div>

      {/* The accessible-repos + active-for-review block */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div className="meta" style={{ fontSize: 12 }}>
          Repositories active for review
        </div>
        <DataBlock result={repos} block="GitHub repositories">
          {() =>
            repoRows.length === 0 ? (
              <EmptyBlock>No repositories yet — install the GitHub App to pull in your repos</EmptyBlock>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 480 }}>
                {repoRows.map((r) => (
                  <label
                    key={r.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "4px 0",
                      borderBottom: "1px solid var(--rule)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={(e) => onToggle(r.id, e.target.checked)}
                      aria-label={`Active for review: ${r.full_name}`}
                      style={{ margin: 0 }}
                    />
                    <span className="mono" style={{ fontSize: 12, color: "var(--text)" }}>
                      {r.full_name}
                    </span>
                  </label>
                ))}
              </div>
            )
          }
        </DataBlock>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
          <Button size="sm" disabled={setActiveRepos.isPending || repoRows.length === 0} onClick={save}>
            {setActiveRepos.isPending ? "Saving…" : "Save selection"}
          </Button>
          {saved && (
            <span className="meta" role="status">
              Saved
            </span>
          )}
          {setActiveRepos.isError && (
            <span className="meta" style={{ color: "var(--negative)" }} role="alert">
              {(setActiveRepos.error as { message?: string } | null)?.message ??
                "Couldn't save the selection."}
            </span>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        title="Disconnect GitHub?"
        body={
          <span>
            This clears your personal GitHub OAuth token and marks the org's
            GitHub App install as removed (a content-purge job is scheduled
            to run). Webhook deliveries stop affecting this org until a
            new install is made.
          </span>
        }
        confirmLabel="Disconnect"
        onConfirm={() => {
          setConfirmDisconnect(false);
          void githubDisconnect.mutate(undefined, { onSuccess: () => void profile.refetch() });
          void orgDisconnect.mutate(undefined, { onSuccess: () => void install.refetch() });
        }}
        confirming={githubDisconnect.isPending || orgDisconnect.isPending}
      />
    </div>
  );
}
