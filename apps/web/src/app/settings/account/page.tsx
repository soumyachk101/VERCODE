import { AccountClient } from "./account-client";

// /settings/account (PAGE §7.3): the profile, the sessions list (sign out
// per row + sign out everywhere), the theme toggle, the password change,
// and the destructive deactivate (last, consequence-named).
export const dynamic = "force-dynamic";

export default function SettingsAccountPage() {
  return <AccountClient />;
}
