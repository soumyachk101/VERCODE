import { RulesClient } from "./rules-client";

// /settings/rules (PAGE §6.1): "How is the review tuned for my team?" —
// the confidence floor (with a live preview), the suppressed-categories
// toggle list, the per-repo overrides table, one "Saved" autosave stamp.
export const dynamic = "force-dynamic";

export default function SettingsRulesPage() {
  return <RulesClient />;
}
