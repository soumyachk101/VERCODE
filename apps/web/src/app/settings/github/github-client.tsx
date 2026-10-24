"use client";

// /settings/github (PAGE §6.x): the "GitHub connection" settings section.
// The whole body lives in `GitHubConnectCard` (P6's feature component):
// personal OAuth + org App install + the accessible-repos list with the
// "active for review" checkbox set. This file is the page wrapper — same
// shape as providers/ and audit/ (thin `OrgPage` + `PageHead` shell).
import { OrgPage } from "@/components/page";
import { useOrgShell } from "@/components/OrgShell";
import { PageHead } from "@/components/Settings";
import { GitHubConnectCard } from "@/components/github-connect-card";

export function SettingsGithubClient() {
  return (
    <OrgPage>
      <SettingsGithubBody />
    </OrgPage>
  );
}

function SettingsGithubBody() {
  const s = useOrgShell();
  const orgId = s.active?.id ?? "";
  return (
    <div>
      <PageHead
        title="GitHub connection"
        finding={
          orgId
            ? "The personal OAuth, the org App install, and the repos that are active for review"
            : "Pick an organization to manage its GitHub connection"
        }
      />
      <div style={{ background: "var(--surface)", border: "1px solid var(--hard-border)", borderRadius: 8, padding: "20px" }}>
        <GitHubConnectCard />
      </div>
    </div>
  );
}
