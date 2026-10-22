import { MembersClient } from "./members-client";

// /settings/members (PAGE §7.1): the members table (a stable initial +
// a pale per-person hue tint, the role pill, last active, Change role +
// Remove actions; the owner's removal is guarded by the LAST_OWNER rule).
export const dynamic = "force-dynamic";

export default function SettingsMembersPage() {
  return <MembersClient />;
}
