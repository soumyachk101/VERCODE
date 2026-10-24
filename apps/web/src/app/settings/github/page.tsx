import { SettingsGithubClient } from "./github-client";

// /settings/github (PAGE §6.x): the "GitHub connection" settings section
// — personal OAuth + org App install, the accessible-repos list, and the
// "active for review" set (stored on org_settings, round-trips through
// the github + settings routes).
export const dynamic = "force-dynamic";

export default function SettingsGithubPage() {
  return <SettingsGithubClient />;
}
