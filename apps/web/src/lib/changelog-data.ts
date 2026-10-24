// Client-safe marketing content: the VERCODE release changelog
// (newest first). Rendered by the /changelog surface.

export interface ChangelogEntry {
  version: string;
  date: string;
  tag: "added" | "improved" | "fixed" | "security";
  title: string;
  items: string[];
}

export const changelog: ChangelogEntry[] = [
  {
    version: "v2.4.0",
    date: "2026-09-15",
    tag: "added",
    title: "Branch protection rulesets and required checks",
    items: [
      "VERCODE now publishes its verdict as a named GitHub check, so branch protection can require it on merge — a rule that fails blocks the merge, one click in Settings > Rules > Gates.",
      "Per-repository exception grants: a named, expiring override for a required rule, recorded in the audit trail with the granting user and a 72-hour default expiry.",
      "Gate preview: see which open PRs would be blocked before you flip a rule from advisory to required, so the team is never surprised by the new gate.",
      "Dashboard 'Gates' view: live required-check status per repository, with last-run verdicts and open exceptions.",
    ],
  },
  {
    version: "v2.3.0",
    date: "2026-08-20",
    tag: "improved",
    title: "Faster routing, quieter noise",
    items: [
      "The task router skips the model stage entirely on diffs the static pass fully covers — those reviews now publish in under 40 seconds at p50, static findings only.",
      "Dismiss-rate tuning: weekly aggregation of dismissed findings feeds the confidence-floor recommendation, with a 'set floor to 0.65' suggestion shown when the dismiss rate passes 35%.",
      "Quiet hours per repo: reviews keep running through the night, but only advisory findings are posted between the hours you set.",
      "Review history: the dashboard keeps a 12-month per-service view of verdicts and latency, replacing the 90-day window.",
    ],
  },
  {
    version: "v2.2.0",
    date: "2026-07-14",
    tag: "added",
    title: "The code health score",
    items: [
      "A weighted 0–100 health index per service, recomputed after every review: open findings, finding age, coverage delta on changed lines, complexity drift, and security exposure.",
      "The formula and the weights are shown on the score page — expand any score into its five axes in one click, no docs detour.",
      "Health trends: 12-month trend lines per service and per repository, with the three biggest movers surfaced on the Overview page.",
      "Health alerts: an optional daily digest lists services whose score dropped more than 5 points since the previous day.",
    ],
  },
  {
    version: "v2.1.0",
    date: "2026-06-02",
    tag: "security",
    title: "KMS wrapping for BYOK, audit export",
    items: [
      "Bring-your-own-key provider keys are now KMS-wrapped at rest and decrypted only at the edge of the provider call; the raw key is never written to disk or logs.",
      "Audit log export: 180-day retention, exported as a signed JSON feed from Settings > Members > Audit — DPA-ready out of the box.",
      "Installation revocation now triggers hard delete of stored findings within 24 hours, verified by a reconciliation job and reported to the installing admin.",
      "Webhook verification hardened: replay windows cut to 5 minutes and the signature check now runs before any body parsing.",
    ],
  },
  {
    version: "v2.0.0",
    date: "2026-05-01",
    tag: "added",
    title: "The 2.0 release: zero-config detection and custom rules",
    items: [
      "Stack detection on install: VERCODE reads your manifests and directory shape to pre-fill lint targets, review tasks, and file budgets — every detection shown as an editable rule on the Rules page.",
      "Custom rules engine: org-level and repo-level rules in plain statements or pointed at your lint configs, with deterministic precedence (repo overrides org; stricter wins on collision).",
      "The confidence floor: AI findings below the floor (default 0.6, per-org) are not posted; the floor is visible in the review header and tunable per team taste.",
    ],
  },
];
