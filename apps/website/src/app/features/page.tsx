// /features (IA §3.2): "What does VERCODE actually do that other AI
// reviewers don't?" The 4 pillars as anchorable sections + the 6-story grid
// mapped to their dashboard FR IDs (FR-504/505/506/507/509/510). The
// W-AC-05 rule: every feature block names its FR ID in the source.
import type { Metadata } from "next";
import { JsonLd } from "../../components/JsonLd";
import { Reveal } from "../../components/Reveal";
import { SITE_NAME } from "../../lib/site";
import { generateSchemaFor } from "../../lib/schema-generator";

const META_DESCRIPTION =
  "A deterministic-first pipeline, evidence-backed findings, per-org cost discipline, and a workspace around the pull request — the VERCODE difference.";

export const metadata: Metadata = {
  title: `Features — ${SITE_NAME}`,
  // 120–158 chars (WFR-404's meta description band).
  description: META_DESCRIPTION,
  openGraph: {
    title: `Features — ${SITE_NAME}`,
    description:
      "Deterministic-first review, evidence-backed findings, per-org cost discipline, a workspace around the pull request.",
    type: "website",
  },
};

const schemaBlocks = generateSchemaFor({ route: "/features" });

// A live finding, the exact shape the pipeline publishes
// (packages/contracts/src/findings.ts's ReviewFindingSchema — the real field
// names: id/file/line/severity/category/title/description/suggestedFix/
// confidence; a Semgrep SQL-injection hit on the payments path).
const FINDING_SAMPLE = `{
  "id": "f_01j2x9",
  "file": "src/payments.ts",
  "line": 84,
  "severity": "high",
  "category": "security",
  "title": "Unsanitized input reaches a SQL statement",
  "description": "query interpolates req.params.id into a SELECT string (semgrep rule: sql-injection), a user-controlled value reaches the statement.",
  "suggestedFix": "Parameterize: const rows = await db.query('SELECT * FROM invoices WHERE user_id = $1', [req.params.id]);",
  "confidence": 0.91
}`;

// The 4 pillars (IA §3.2's anchorable sections; each carries a code/UI
// fragment of the real surface + a "How it works" link to the docs).
const PILLARS = [
  {
    id: "deterministic-precision",
    title: "Deterministic precision",
    body: "Static analysis runs before the model: ESLint, Semgrep, and secret scanning establish the ground truth on the changed files. The AI stage's findings are deltas on those grounded checks, not a free-form second opinion — a deterministic check that flags a pattern always does, and a model-only reviewer drifts run to run.",
    fragment: FINDING_SAMPLE,
    docs: "/docs/rules/",
  },
  {
    id: "evidence-backed",
    title: "Evidence-backed reasoning",
    body: "Every finding carries a category, a severity, a confidence, a reason, and a suggested fix — the ReviewFinding shape the pipeline publishes. The default confidence floor is 0.6: below it, a finding is suppressed, not down-ranked, so the pull request is not flooded with hedges. Each posted finding names its source stage and the file + line it proves.",
    fragment: FINDING_SAMPLE,
    docs: "/docs/api/",
  },
  {
    id: "cost-discipline",
    title: "Cost discipline",
    body: "Per-org quotas and per-review cost accounting bound the spend. The static pass costs almost nothing; the task-routed AI stage sends the bounded diff, not the whole repo, and picks the model tier per task. An over-cap org's review is skipped with a notice, never silently billed beyond the cap.",
    fragment: `// the ReviewResult.cost block (contracts/src/findings.ts)
cost: {
  inputTokens: 18402,
  outputTokens: 2114,
  estUsd: 0.051,
  model: "gpt-4.1",
  promptVersion: "v19"
}`,
    docs: "/docs/pricing/",
  },
  {
    id: "the-workspace",
    title: "A workspace, not just a bot",
    body: "The dashboard answers the org's risk and cost question, not just the pull request's: a security rollup, an audit trail, a usage-vs-quota view. The review history is keyed by commit SHA, so both versions of a PR are legible. The PR comment is the output; the workspace is the product.",
    fragment: `// the ReviewSummary shape the PR headline is built from
summary: {
  verdict: "Needs changes",
  highSeverityCount: 2,
  topRisks: ["SQL injection in payments.ts:84", "unbounded retry loop in workers/dispatch.ts:41"],
  overallConfidence: 0.87
}`,
    docs: "/docs/quickstart/",
  },
];

// The 6-story grid (IA §3.2's "the dashboard's user-facing features mapped to
// their FR IDs" — the W-AC-05 traceability rule: each story names its FR ID
// in the copy, the 13px --faint mono tag below).
const STORIES = [
  {
    fr: "FR-504",
    title: "Security findings rollup",
    body: "One view of the org's security posture: open findings by category and severity across every repository, not just the last pull request. A tech lead's triage path, not a per-PR chore.",
    docs: "/docs/security/",
  },
  {
    fr: "FR-505",
    title: "Custom rules",
    body: "Per-org and per-repo rules: suppress a noisy category, add a house convention as a check, tune the confidence floor. A review that reads like a human reviewer for your codebase, not a generic linter.",
    docs: "/docs/rules/",
  },
  {
    fr: "FR-506",
    title: "Usage analytics",
    body: "Real data, not a vanity dashboard: reviews per week, findings density, cost per review, quota headroom. The numbers that answer “when does this pay for itself?”",
    docs: "/docs/pricing/",
  },
  {
    fr: "FR-507",
    title: "Org management",
    body: "Members, roles, and invitations, with the quota and plan settings that follow the org, not the individual. Adding a new hire to a repository is a two-click action, not a re-scope.",
    docs: "/docs/quickstart/",
  },
  {
    fr: "FR-509",
    title: "Billing",
    body: "Plan, invoices, and usage on one screen; upgrade, downgrade, or cancel without a sales call. The quota that an over-cap org trips is the same number the billing page shows.",
    docs: "/docs/pricing/",
  },
  {
    fr: "FR-510",
    title: "Audit log",
    body: "Every config change, install, and plan change is an audit event, retained on the org's retention floor (180 days minimum). The “who changed the rules and when” answer, in the compliance window.",
    docs: "/docs/quickstart/",
  },
];

export default function Features() {
  return (
    <>
      <JsonLd blocks={schemaBlocks} />
      <div className="mx-auto max-w-4xl px-5 pt-16 sm:pt-20">
        <h1 className="text-[40px] font-bold tracking-tight text-[var(--text)]">
          Features
        </h1>
        <p className="mt-4 text-[17px] leading-relaxed text-[hsl(var(--muted))]">
          The question this page answers: what does VERCODE do that a
          model-only AI reviewer does not? The short version — a pipeline that
          is deterministic first, evidence-backed, cost-disciplined, and a
          workspace around the pull request, not just a bot on it.
        </p>
      </div>

      {/* The 4 pillars, anchorable sections (IA §3.2: each an id, 2–4
          sentences, a real code/UI fragment, a "How it works" docs link). */}
      <Reveal>
        <div className="mx-auto max-w-4xl px-5">
          {PILLARS.map((pillar) => (
            <section
              key={pillar.id}
              id={pillar.id}
              aria-labelledby={`${pillar.id}-heading`}
              className="mt-14"
            >
              <h2
                id={`${pillar.id}-heading`}
                className="text-[20px] font-semibold tracking-tight text-[var(--text)]"
              >
                {pillar.title}
              </h2>
              <p className="mt-2 text-[16px] leading-relaxed text-[hsl(var(--muted))]">
                {pillar.body}
              </p>
              {/* A live finding, the exact shape the pipeline publishes
                  (a pre in the prose styles, via the Prose wrapper). */}
              <pre className="mt-5 overflow-x-auto rounded-[var(--radius-card)] border border-[var(--hard-border)] bg-[var(--raised)] p-5 font-mono text-[14px] leading-relaxed text-[var(--text)]">
                <code>{pillar.fragment}</code>
              </pre>
              <a
                href={pillar.docs}
                className="mt-4 inline-block text-[16px] font-medium text-[var(--accent-color)] underline-offset-4 hover:underline"
              >
                How it works
              </a>
            </section>
          ))}
        </div>
      </Reveal>

      {/* The 6-story grid (the FR-504/505/506/507/509/510 user-facing
          dashboard features; each block names its FR ID, the W-AC-05 rule). */}
      <Reveal>
        <section
          aria-labelledby="stories-heading"
          className="mx-auto max-w-4xl px-5 py-16"
        >
          <h2
            id="stories-heading"
            className="text-[28px] font-semibold tracking-tight text-[var(--text)] sm:text-[32px]"
          >
            The workspace
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2">
            {STORIES.map((story) => (
              <article key={story.fr}>
                <h3 className="text-[17px] font-semibold text-[var(--text)]">
                  {story.title}
                </h3>
                <p className="mt-2 text-[16px] leading-relaxed text-[hsl(var(--muted))]">
                  {story.body}
                </p>
                <p className="mt-2 font-mono text-[13px] text-[hsl(var(--faint))]">
                  {story.fr}
                </p>
                <a
                  href={story.docs}
                  className="mt-2 inline-block text-[16px] font-medium text-[var(--accent-color)] underline-offset-4 hover:underline"
                >
                  The docs
                </a>
              </article>
            ))}
          </div>
        </section>
      </Reveal>
    </>
  );
}
