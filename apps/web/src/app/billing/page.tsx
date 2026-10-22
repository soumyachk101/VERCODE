import { BillingClient } from "./billing-client";

// /billing (PAGE §5.2): the plan state, the invoices table, the
// upgrade/downgrade/cancel controls (a destructive cancel last,
// consequence-named, with a confirmation that names the object).
export const dynamic = "force-dynamic";

export default function BillingPage() {
  return <BillingClient />;
}
