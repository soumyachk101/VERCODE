// The 16 canonical FAQ items — IA §3.4's table, in the 4 groups
// (getting-started 4 / reviews-findings 4 / security-privacy 4 /
// billing-limits 4; the 16th row, "export or delete", lands in
// billing-limits — WFR-204's "≥ 15" is a floor, not a cap).
//
// This is the single source both surfaces read: the visible /faq page
// renders these, and the schema-generator's FAQPage block uses the same
// question + answer strings — the byte-equivalence rule (WFR-204,
// SEO_AEO_GEO.md §3.3: the visible text IS the JSON-LD text). Editing
// this file is the only edit that moves either surface.
//
// House rules applied to every answer: declarative, numbers literal
// (CONTENT_STRATEGY.md §1.1 "specificity"), no marketing adjectives
// (§1.3's banned list: no "revolutionary", "seamless", "best-in-class").
// Each item's comment cites its IA §3.4 anchor (the FR/NFR/L the answer
// is grounded in).

export type FaqGroup =
  | "getting-started"
  | "reviews-findings"
  | "security-privacy"
  | "billing-limits";

export interface FaqItem {
  group: FaqGroup;
  q: string;
  a: string;
  /** The §3.4 anchor (the FR/NFR/L the answer cites). */
  anchor: string;
}

export const FAQ_GROUPS: readonly { id: FaqGroup; label: string }[] = [
  { id: "getting-started", label: "Getting started" },
  { id: "reviews-findings", label: "Reviews & findings" },
  { id: "security-privacy", label: "Security & privacy" },
  { id: "billing-limits", label: "Billing & limits" },
];

export const FAQ_ITEMS: FaqItem[] = [
  // §3.4 row 1 — FR-206 (review publication: a summary comment + validated
  // inline comments, falling back to the PR comment when anchoring fails).
  {
    group: "getting-started",
    q: "Does VERCODE post comments on my pull requests?",
    a: "Yes. VERCODE posts a summary comment with the verdict and a severity count, plus inline comments anchored to the verified changed lines. If a line anchor fails validation, the finding is written into the summary comment instead of dropped. This is the FR-206 publication path.",
    anchor: "FR-206",
  },
  // §3.4 row 2 — NFR-02 (review latency: p50 < 120 s, p95 < 300 s on a
  // 50-file diff, ≤ 500 changed lines, measured from webhook receipt to
  // GitHub publication).
  {
    group: "getting-started",
    q: "How fast is a review?",
    a: "A review publishes at p50 under 120 seconds and p95 under 300 seconds, measured from the webhook receipt to the GitHub publication, on a 50-file diff with 500 changed lines or fewer. That is the NFR-02 latency target. A diff past the file or line budget degrades to the highest-risk files rather than stalling.",
    anchor: "NFR-02",
  },
  // §3.4 row 3 — FR-308 (the org-configurable confidence floor, default
  // 0.6, plus per-category suppression).
  {
    group: "getting-started",
    q: "Will it flood my PR with comments?",
    a: "No. Findings under the confidence floor are not posted, and the floor defaults to 0.6 and is configurable per org and per repo (FR-308). You can also suppress an entire category for one repo. The deterministic static-analysis pass is exempt from the floor, because its precision is measured, not estimated.",
    anchor: "FR-308",
  },
  // §3.4 row 4 — FR-302 (file classification: by language, risk tier,
  // generated/test).
  {
    group: "getting-started",
    q: "What languages does it support?",
    a: "VERCODE classifies each changed file by language and risk tier before the AI stage (FR-302). The classification is what routes the work: security-sensitive files, database-touching files, dependency manifests, generated code, and test files each get a distinct review treatment. A diff is reviewed file by file, not repo by repo.",
    anchor: "FR-302",
  },
  // §3.4 row 5 — L-1 (no untrusted code execution in the MVP; the sandbox
  // is designed now, built in Phase 2).
  {
    group: "reviews-findings",
    q: "Does it run my tests?",
    a: "No. The pipeline analyzes the diff with static analysis and a model pass; it does not execute the PR's install or test steps. Running untrusted code in the product is a known-severity threat class, so it is closed by absence in the MVP (L-1). Sandboxed test execution is the Phase 2 item on the roadmap, and the known-limitations doc says so in plain terms.",
    anchor: "L-1",
  },
  // §3.4 row 6 — FR-311 (task-routed model selection: OpenAI first,
  // Anthropic + Ollama adapters P1).
  {
    group: "reviews-findings",
    q: "Which AI models does it use?",
    a: "Model calls are task-routed, not a single model for everything (FR-311). Routine triage and summary go to a cheaper model; the deep review and the security pass go to a stronger one. OpenAI is the first provider; Anthropic and a self-hosted Ollama adapter follow as Phase 1. The routing table lives in config, so a model swap is a config change, not a code change.",
    anchor: "FR-311",
  },
  // §3.4 row 7 — FR-313 (BYOK: AES-256-GCM encryption, KMS-wrapped
  // master key).
  {
    group: "reviews-findings",
    q: "Can I bring my own API key?",
    a: "Yes. An org admin sets a provider key at the org level, and VERCODE encrypts it with AES-256-GCM under a KMS-wrapped master key (FR-313). While the key is set, the model calls run on your key and your spend. The key is masked in the dashboard, and revoking it is immediate: the wrapped row is hard-deleted.",
    anchor: "FR-313",
  },
  // §3.4 row 8 — NFR-28 (raw diffs not stored beyond the review lifetime;
  // findings retained per plan window, then purged).
  {
    group: "reviews-findings",
    q: "Where is my code stored?",
    a: "Your source is not stored as a durable asset. Raw diffs and file contents live in an org-scoped cache with a 24-hour TTL and in worker memory for the review's duration (NFR-28). What persists is the analysis: findings and summaries, retained for your plan's window, then hard-purged on schedule. A finding may quote a bounded snippet of the diff; the full file does not reach the database.",
    anchor: "NFR-28",
  },
  // §3.4 row 9 — NFR-09 (+ NFR-29: the provider gets a bounded context on
  // a no-training contract; BYOK/Ollama shift the call; the static
  // analysis never leaves).
  {
    group: "security-privacy",
    q: "Does it send my code to a third party?",
    a: "The model calls go to the configured AI provider: the changed files plus one-hop imports, inside a token budget, never the whole repository, on the provider's no-training contract (NFR-29). With BYOK the call runs on your key; on Ollama it stays on your infrastructure. The deterministic static-analysis pass runs in your pipeline and never leaves it (NFR-09).",
    anchor: "NFR-09 + NFR-29",
  },
  // §3.4 row 10 — FR-210 (the 5 least-privilege scopes, verbatim from the
  // PRD: contents:read, pull_requests:write, checks:write, metadata:read,
  // issues:read; no admin:org, no secrets scope).
  {
    group: "security-privacy",
    q: "Which GitHub permissions does the App need?",
    a: "The GitHub App requests five scopes, all read-only except the publication path: contents:read, pull_requests:write, checks:write, metadata:read, and issues:read (FR-210). No admin:org, no secrets scope. The pull_requests write is where the review is posted; everything else is a read.",
    anchor: "FR-210",
  },
  // §3.4 row 11 — FR-203 (pull_request_target on forks: reviewed in a
  // sandboxed context, published to the base repo only).
  {
    group: "security-privacy",
    q: "Does it work on pull requests from forks?",
    a: "Yes, on a restricted path. A PR from a fork arrives as a pull_request_target event; the review runs in a sandboxed context and publishes only on the base repository's PR, not on the fork (FR-203). Code from an untrusted fork is analyzed, never executed.",
    anchor: "FR-203",
  },
  // §3.4 row 12 — FR-505 (custom rules: org-level + per-repo; category
  // suppression, confidence floor, quiet categories, per-language toggles).
  {
    group: "security-privacy",
    q: "How do I silence a noisy category?",
    a: "Create a custom rule that suppresses the category, scoped to the whole org or to a single repository (FR-505). The rule types are category suppression, a confidence-floor override, quiet categories, and per-language toggles. Rules are versioned: a change is audit-logged and applies from the next review, not the in-flight one.",
    anchor: "FR-505",
  },
  // §3.4 row 13 — NFR-18 (skip-with-notice, never a silent stop; a skip
  // is before the AI stage, zero tokens).
  {
    group: "billing-limits",
    q: "What happens when I hit my quota?",
    a: "The review is skipped with a notice posted on the pull request, and a dashboard row and banner show the reason and the upgrade path (NFR-18: skip-with-notice, never a silent stop). The skip happens before the AI stage, so it consumes zero tokens. The 80% warning on the quota strip is the early signal that the cap is near.",
    anchor: "NFR-18",
  },
  // §3.4 row 14 — the MIT license + the public repo (LICENSE.md,
  // README.md).
  {
    group: "billing-limits",
    q: "Is VERCODE open source?",
    a: "Yes. The repository is MIT-licensed, with the license at LICENSE.md. The review pipeline, the static-analysis rules, and the dashboard code are in the tree. The docs are written so that each claim can be checked against the code it points at; the open-source posture is a differentiator, not a garnish.",
    anchor: "LICENSE.md",
  },
  // §3.4 row 15 — the self-hosted honest answer: the repo is MIT; the
  // hosted pipeline needs the GitHub App + a provider key; BYOK/Ollama
  // shifts the model spend to the customer.
  {
    group: "billing-limits",
    q: "Can I self-host it?",
    a: "The code is self-hostable: the repo is MIT-licensed. The hosted pipeline needs two external credentials: the GitHub App installation and an AI provider key. With BYOK or Ollama the model spend is on your bill, not VERCODE's — the Enterprise plan is built around exactly this cost-shifting shape.",
    anchor: "LICENSE.md + DEPLOYMENT §5",
  },
  // §3.4 row 16 — FR-404 (deletion on access revocation) + NFR-27
  // (retention windows: 30/90/365/custom days for findings; 180-day
  // audit floor).
  {
    group: "billing-limits",
    q: "How do I export or delete my data?",
    a: "Removing the GitHub App installation triggers deletion: the install is marked removed, the diff cache is evicted immediately, and an export window opens for your findings before any hard-purge (FR-404). Findings are retained 30 days on Free, 90 on Developer, 365 on Team, or custom on Enterprise; the audit log keeps a 180-day minimum regardless of plan (NFR-27).",
    anchor: "FR-404 + NFR-27",
  },
];

/** The top-N teaser set, for the / landing page's FAQ teaser block (IA §3.1's block 6). */
export function topN(n: number): FaqItem[] {
  return FAQ_ITEMS.slice(0, n);
}

// ---------------------------------------------------------------------------
// The 6-question pricing FAQ (content/faq/pricing/, the separate FAQPage
// block on /pricing — IA §3.3 block 4; a distinct item set from the 16 on
// /faq, per CONTENT_SCHEMAS.md §3 CS-07's "a separate FAQPage block" note).
// The same byte-equivalence rule applies: the visible /pricing answers and
// the pricing FAQPage's acceptedAnswer.text are generated from this list.
// ---------------------------------------------------------------------------

export const PRICING_FAQ: FaqItem[] = [
  {
    group: "billing-limits",
    q: "Which plan should I start on?",
    a: "Start on Free: it is a permanent plan, not a trial, with 50 reviews a month. Move to Developer when you need more volume at the same per-review cost; move to Team when the org needs the strong-model pass and 5,000 reviews a month. Enterprise is the cost-shifting and compliance shape: BYOK, Ollama, frontier access, SSO.",
    anchor: "PRICING_STRATEGY §2",
  },
  {
    group: "billing-limits",
    q: "What happens when I reach the quota cap?",
    a: "The review is skipped before the AI stage runs, so it consumes zero tokens, and a notice is posted on the pull request (NFR-18: skip-with-notice, never a silent stop). The dashboard shows the skip row, the reason, and the upgrade path; the 80% warning banner fires before the cap is reached.",
    anchor: "NFR-18",
  },
  {
    group: "billing-limits",
    q: "Can I use my own provider key (BYOK)?",
    a: "Yes, on the plans that carry provider settings. The key is encrypted with AES-256-GCM under a KMS-wrapped master key (FR-313), masked in the dashboard, and revocable at any time. With BYOK or a self-hosted Ollama, the model spend is on your bill, not VERCODE's.",
    anchor: "FR-313",
  },
  {
    group: "billing-limits",
    q: "Do you offer annual billing?",
    a: "Yes: a Team or Enterprise annual prepay carries a discount for the commit. The exact discount percentage is a market decision and is set per plan, not a fixed published figure. Annual billing reduces churn and improves the NRR the launch target names.",
    anchor: "PRICING_STRATEGY §4",
  },
  {
    group: "billing-limits",
    q: "What if I exceed my quota during the month?",
    a: "The over-cap review is skipped with a notice, not silently billed beyond the cap (NFR-18). On Team and Enterprise, a metered overage is available as an opt-in, at a published per-review rate with a cap; Free and Developer are hard caps. The overage is transparent: the dashboard shows what will be billed before it bills.",
    anchor: "PRICING_STRATEGY §3",
  },
  {
    group: "billing-limits",
    q: "Can I self-host VERCODE?",
    a: "The code is MIT-licensed and self-hostable. The hosted pipeline requires a GitHub App installation and an AI provider key. With BYOK or Ollama the model spend is on your bill, not VERCODE's — the Enterprise plan is the commercial shape built around that cost-shifting.",
    anchor: "LICENSE.md + DEPLOYMENT §5",
  },
];

// The 5-question teaser set for the / landing page's FAQ block (IA §3.1's
// block 6): the first 5 of the 16, in order. The slice, not a separate
// hand-picked list — a change to the canonical set changes the teaser.
export const HOME_FAQ_IDS: readonly number[] = [0, 1, 2, 3, 4];

// The resolved 5-item teaser slice the / landing page renders (IA §3.1's
// block 6). Derived from HOME_FAQ_IDS, so a change to the canonical set
// flows to the teaser automatically.
export const HOME_FAQ_SLICE: FaqItem[] = HOME_FAQ_IDS.map(
  (i) => FAQ_ITEMS[i],
).filter((item): item is FaqItem => item !== undefined);
