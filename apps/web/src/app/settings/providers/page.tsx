import { ProvidersClient } from "./providers-client";

// /settings/providers (PAGE §6.2): the provider + task routing table
// (unavailable rows are legibly disabled + named), the BYOK key (masked,
// never the raw key), and the configured fallback state.
export const dynamic = "force-dynamic";

export default function SettingsProvidersPage() {
  return <ProvidersClient />;
}
