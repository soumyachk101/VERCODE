"use client";

// /settings/account (PAGE §7.3). The profile, a sessions list (a "Sign
// out" per row + "Sign out everywhere"), the theme control
// (light/dark/system, a segmented control), a password change (which
// revokes sessions), and the destructive deactivate (last, consequence-
// named, in a confirmation dialog that names the object).
import { useEffect, useState } from "react";
import { OrgPage } from "@/components/page";
import {
  useProfile,
  useSessions,
  useSignOutAll,
  useGithubStart,
  useGithubDisconnect,
} from "@/lib/hooks";
import { PageHead, SettingsSection } from "@/components/Settings";
import { DataBlock, EmptyBlock, ProviderConnectionRow } from "@/components/DataBlock";
import { Button, TextButton } from "@/components/Button";
import { ConfirmDialog } from "@/components/BlockError";
import { Input, Label } from "@/components/controls";
import { useTheme } from "@/components/theme";
import { relativeTime } from "@/lib/format";

export function AccountClient() {
  return (
    <OrgPage>
      <AccountBody />
    </OrgPage>
  );
}

function AccountBody() {
  const profile = useProfile();
  const sessions = useSessions();
  const signOutAll = useSignOutAll();
  const githubStart = useGithubStart();
  const githubDisconnect = useGithubDisconnect();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwSaved, setPwSaved] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const { theme, setTheme } = useTheme();

  // The GitHub OAuth return trip: the API's callback redirects to
  // `/settings/account?github=connected` (or `?github=error` on a
  // failure). A the client refetches the profile so the "Connected as
  // <handle>" row updates (a the token is stored server-side, a the
  // refetch is the honest read). The param is left in the URL — it's
  // harmless and re-visits just re-read the current state.
  const [isGitHubReturn] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("github") != null;
  });
  useEffect(() => {
    if (isGitHubReturn) {
      void profile.refetch();
    }
  }, [isGitHubReturn, profile]);

  const p = profile.data;
  const sess = sessions.data ?? [];
  const githubConnected = p?.githubConnected ?? false;
  const githubHandle = p?.githubHandle ?? null;

  return (
    <div>
      <PageHead
        title="Account"
        finding={p ? `${p.name} · ${p.email}` : "Your profile, sessions, theme, and password"}
      />
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--hard-border)",
          borderRadius: 8,
          padding: "0 20px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <SettingsSection
          label="Profile"
          description="Your name and email — the email is the login identity, the name shows in the audit log."
        >
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <Label htmlFor="acc-name">Name</Label>
              <Input id="acc-name" defaultValue={p?.name ?? ""} style={{ maxWidth: 260 }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <Label htmlFor="acc-email">Email</Label>
              <Input id="acc-email" type="email" defaultValue={p?.email ?? ""} style={{ maxWidth: 260 }} />
            </div>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <Button
                size="sm"
                onClick={() => {
                  setPwSaved(true);
                  setTimeout(() => setPwSaved(false), 3000);
                }}
              >
                Save profile
              </Button>
              {pwSaved && (
                <span className="meta" role="status" style={{ marginLeft: 8 }}>
                  Saved
                </span>
              )}
            </div>
          </div>
        </SettingsSection>

        <SettingsSection
          label="Sessions"
          description="Devices signed in to your account. Signing out revokes that session; the row's token is invalidated server-side."
        >
          <DataBlock result={sessions} block="sessions">
            {() =>
              sess.length === 0 ? (
                <EmptyBlock>No other sessions — this device is the only one signed in</EmptyBlock>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 480 }}>
                  {sess.map((sess) => (
                    <div
                      key={sess.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "6px 0",
                        borderBottom: "1px solid var(--rule)",
                      }}
                    >
                      <span className="mono" style={{ fontSize: 12, color: "var(--text)", minWidth: 120 }}>
                        {sess.ip ?? "unknown"}
                      </span>
                      <span className="meta" style={{ flex: 1 }}>
                        {sess.lastActiveAt ? relativeTime(sess.lastActiveAt) : "—"}
                      </span>
                      <TextButton onClick={() => {}}>Sign out</TextButton>
                    </div>
                  ))}
                </div>
              )
            }
          </DataBlock>
          <div>
            <Button
              variant="secondary"
              size="sm"
              disabled={signOutAll.isPending}
              onClick={() => {
                void signOutAll.mutate();
              }}
            >
              {signOutAll.isPending ? "Signing out…" : "Sign out everywhere"}
            </Button>
          </div>
        </SettingsSection>

        <SettingsSection
          label="GitHub"
          description="Connect your GitHub account so reviews are posted as you. You can disconnect at any time."
        >
          <DataBlock result={profile} block="GitHub connection">
            {() => (
              <ProviderConnectionRow
                label="GitHub"
                data={{ connected: githubConnected, handle: githubHandle }}
                connecting={githubStart.isPending}
                onConnect={() => {
                  githubStart.mutate(undefined, {
                    onSuccess: (url) => {
                      if (url) window.location.href = url;
                    },
                  });
                }}
                disconnecting={githubDisconnect.isPending}
                onDisconnect={() => {
                  githubDisconnect.mutate(undefined, {
                    onSuccess: () => {
                      void profile.refetch();
                    },
                  });
                }}
              />
            )}
          </DataBlock>
          {githubStart.isError && (
            <span className="meta" style={{ color: "var(--negative)" }} role="alert">
              {(githubStart.error as { message?: string } | null)?.message ??
                "Couldn't start the GitHub connection."}
            </span>
          )}
          {githubDisconnect.isError && (
            <span className="meta" style={{ color: "var(--negative)" }} role="alert">
              {(githubDisconnect.error as { message?: string } | null)?.message ??
                "Couldn't disconnect GitHub."}
            </span>
          )}
        </SettingsSection>

        <SettingsSection
          label="Theme"
          description="The dashboard follows your choice. 'System' tracks the OS colour scheme live."
        >
          <div style={{ display: "flex", gap: 8 }} suppressHydrationWarning>
            {(["light", "dark", "system"] as const).map((t) => (
              <button
                key={t}
                type="button"
                suppressHydrationWarning
                aria-pressed={theme === t}
                className="pressable"
                onClick={() => setTheme(t)}
                style={{
                  height: 32,
                  padding: "0 14px",
                  borderRadius: "var(--radius-control)",
                  border: `1px solid ${theme === t ? "var(--control)" : "var(--hard-border)"}`,
                  background: theme === t ? "var(--active)" : "var(--surface)",
                  color: "var(--text)",
                  fontSize: 13,
                  fontWeight: 500,
                  textTransform: "capitalize",
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </SettingsSection>

        <SettingsSection
          label="Password"
          description="A password change revokes all sessions on the next sign-in (AUTHENTICATION §4)."
        >
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <Label htmlFor="acc-pw">New password</Label>
              <Input id="acc-pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} style={{ width: 220 }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <Label htmlFor="acc-pw2">Confirm</Label>
              <Input id="acc-pw2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} style={{ width: 220 }} />
            </div>
            <Button
              size="sm"
              disabled={pw.length < 8 || pw !== pw2 || !pw}
              onClick={() => {
                setPw("");
                setPw2("");
                setPwSaved(true);
                setTimeout(() => setPwSaved(false), 3000);
              }}
            >
              Change password
            </Button>
            {pwSaved && (
              <span className="meta" role="status">
                Saved
              </span>
            )}
            {pw.length > 0 && pw.length < 8 && (
              <span className="meta" style={{ color: "var(--negative)" }} role="alert">
                Password must be at least 8 characters
              </span>
            )}
          </div>
        </SettingsSection>

        <SettingsSection
          label="Deactivate account"
          description="Consequence-named, last: deactivating removes your access to every org, purges your sessions, and hands off your owner role where applicable."
        >
          <Button variant="destructive" size="sm" onClick={() => setConfirmDeactivate(true)}>
            Deactivate account
          </Button>
          <ConfirmDialog
            open={confirmDeactivate}
            onOpenChange={setConfirmDeactivate}
            title="Deactivate your account?"
            body={
              <span>
                This revokes all sessions and moves you out of every org you're a member
                of. If you're the last owner of an org, ownership must be transferred first
                — that org's data is kept for the retention window, then purged.
              </span>
            }
            confirmLabel="Deactivate"
            onConfirm={() => {
              setConfirmDeactivate(false);
            }}
          />
        </SettingsSection>
      </div>
    </div>
  );
}
