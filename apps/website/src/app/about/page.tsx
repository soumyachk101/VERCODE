// /about (INFORMATION_ARCHITECTURE_AND_PAGES.md §3.8): "Who is behind
// VERCODE, and can I read the source?" The company story in 3 short
// paragraphs, the open-source posture, the "read the source" CTA, and
// the team block.
//
// The "no John Doe" rule (DESIGN_SYSTEM.md §9's ban, IA §3.8): a named
// team is a real-people rule, and the named team is an open P2 decision
// (UNRESOLVED_DECISIONS U: the team's public names are unresolved). This
// page therefore renders a placeholder-ABSENT team block: a 2-line
// honest "The VERCODE team" + a forward-pointer. No fabricated roster.
import type { Metadata } from "next";
import { generateSchemaFor } from "@/lib/schema-generator.js";
import { JsonLd } from "@/components/JsonLd.js";
import { SITE_NAME, GITHUB_REPO } from "@/lib/site.js";

// 120–158 chars (WFR-102's meta description band; the on-page gate).
const ABOUT_META_DESCRIPTION =
  "Why VERCODE exists: the noise problem in AI review, the deterministic-first answer, and the open-source posture. Read the source and the docs.";

export const metadata: Metadata = {
  title: `About — ${SITE_NAME}`,
  description: ABOUT_META_DESCRIPTION,
};

const schemaBlocks = generateSchemaFor({
  route: "/about",
  title: "About",
  metaDescription: ABOUT_META_DESCRIPTION,
  breadcrumbTrail: [
    { name: "Vercode", url: "/" },
    { name: "About", url: "/about/" },
  ],
});

export default function AboutPage() {
  return (
    <main>
      <JsonLd blocks={schemaBlocks} />

      <div className="mx-auto max-w-2xl px-5 pt-14">
        <h1 className="text-[40px] font-bold tracking-tight text-[var(--text)]">
          About VERCODE
        </h1>

        {/* The company story in 3 short paragraphs (IA §3.8's rule):
            the why (the noise problem), the answer (deterministic-first),
            the posture (open source). */}
        <section aria-label="Why VERCODE" className="mt-6 space-y-4 text-[16px] leading-[1.6] text-[hsl(var(--muted))]">
          <p>
            AI code review has a noise problem. A reviewer that posts a
            long list of low-confidence comments trains a team to stop
            reading it — the same failure mode, at the same cost, as any
            bot a team ignores. VERCODE was built around the opposite
            property: a review a team actually reads.
          </p>
          <p>
            The answer is deterministic-first. Static analysis runs
            before the model, so the findings that matter are grounded in
            a measured check, not a free-form second opinion. A low
            confidence finding is suppressed by the floor, not down-ranked
            into the noise. The model is where it earns its spend: the
            deep review and the security pass, task-routed to the right
            tier.
          </p>
          <p>
            The posture is open source. The pipeline, the static-analysis
            rules, and the dashboard are in the repository under the MIT
            license. A number in the docs is a claim you can check
            against the code; the known limitations are written down, not
            quietly absent.
          </p>
        </section>

        {/* The "read the source" CTA block (IA §3.8's open-source CTA):
            the GitHub link + the MIT one-liner + the 3-item list. */}
        <section aria-label="Read the source" className="mt-10">
          <h2 className="text-[20px] font-semibold text-[var(--text)]">
            Read the source
          </h2>
          <p className="mt-3 text-[16px] leading-[1.6] text-[hsl(var(--muted))]">
            The repository is MIT-licensed:
          </p>
          <p className="mt-2">
            <a
              href={GITHUB_REPO}
              className="text-[15px] font-medium text-[hsl(var(--accent))] underline underline-offset-2"
            >
              {GITHUB_REPO}
            </a>
          </p>
          <p className="mt-3 text-[15px] text-[hsl(var(--muted))]">
            MIT-licensed — use it, read it, build on it.
          </p>
          <ul className="mt-4 space-y-2 text-[15px] text-[hsl(var(--muted))]">
            <li>
              <strong className="text-[var(--text)]">The MIT license.</strong>{" "}
              The code is at LICENSE.md in the repo; a fork is a right, not
              a favor.
            </li>
            <li>
              <strong className="text-[var(--text)]">The repo.</strong> The
              pipeline, the static-analysis rules, the dashboard, and the
              shared contracts package are in the tree.
            </li>
            <li>
              <strong className="text-[var(--text)]">No vanity totals.</strong>{" "}
              VERCODE does not publish customer-count or "10,000+" style
              figures. A metric without a source is not a claim; the launch
              targets are written in the product docs, and the changelog is the dated
              record of what shipped.
            </li>
          </ul>
        </section>

        {/* The team block — the "no John Doe" rule (IA §3.8): a named
            team is a real-people rule, and the named people are an open
            P2 decision (UNRESOLVED_DECISIONS U: the team's public names).
            Rendered placeholder-ABSENT: a 2-line honest statement, not a
            fabricated roster. */}
        <section aria-label="The team" className="mt-10">
          <h2 className="text-[20px] font-semibold text-[var(--text)]">
            The team
          </h2>
          <p className="mt-3 text-[16px] leading-[1.6] text-[hsl(var(--muted))]">
            The VERCODE team.
          </p>
          <p className="mt-2 text-[15px] leading-[1.6] text-[hsl(var(--muted))]">
            Named authors and team details land with the public launch; the
            source and the docs are the team&rsquo;s first introduction.
          </p>
        </section>

        {/* A link to /blog/ (IA §3.8's closing link). */}
        <p className="mt-10 text-[15px] text-[hsl(var(--muted))]">
          The team&rsquo;s thinking is written up on the{" "}
          <a
            href="/blog/"
            className="text-[hsl(var(--accent))] underline underline-offset-2"
          >
            blog
          </a>
          .
        </p>
      </div>
    </main>
  );
}
