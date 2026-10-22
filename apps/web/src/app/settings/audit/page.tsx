import { AuditClient } from "./audit-client";

// /settings/audit (PAGE §7.2): the audit table (timestamp | actor |
// action-verb | target | source IP monospace), filters action/actor/date,
// and NO delete control (append-only, the integrity rule).
export const dynamic = "force-dynamic";

export default function SettingsAuditPage() {
  return <AuditClient />;
}
