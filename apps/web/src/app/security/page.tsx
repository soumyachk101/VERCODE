import { SecurityClient } from "./security-client";

// /security (PAGE §4): "What's the most serious risk in my org right
// now?" — the severity ladder (the lead figure is critical + high), the
// rollup table, the 30-day trend, the actioned-rate figure.
export const dynamic = "force-dynamic";

export default function SecurityPage() {
  return <SecurityClient />;
}
