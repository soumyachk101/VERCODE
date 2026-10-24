// /legal/privacy (INFORMATION_ARCHITECTURE_AND_PAGES.md §3.9): the
// privacy policy — a plain, readable legal page in the 720px column (a
// "last updated" date, a TOC, a contact email; WFR-406, PRD.md §4.2).
//
// The 720px reading column comes from the `reading-col` class (the
// DESIGN_SYSTEM_AND_TYPOGRAPHY.md §3 centered 720px rule; 45rem in
// globals.css). The `Prose` wrapper's right-rail TOC carries the
// section anchors (IA §3.5's "a right rail on desktop for a page with
// > 3 sections" rule).
//
// The house rules applied: sentence case only, no icon-topped cards, no
// eyebrow labels, no uppercase labels (DESIGN_SYSTEM §9 + §10). The
// `--muted` / `--faint` / `--surface` / `--border` CSS vars are the only
// colors; no hex.
import type { Metadata } from "next";
import { generateSchemaFor } from "@/lib/schema-generator.js";
import { JsonLd } from "@/components/JsonLd.js";
import { Prose, type TocEntry } from "@/components/Prose.js";
import { SITE_NAME } from "@/lib/site.js";

// 120–158 chars (WFR-102's meta description band; the on-page gate).
const PRIVACY_META_DESCRIPTION =
  "What is stored and what is not, the retention windows, the AI subprocessor boundary, and the 30-day data-subject request path.";

export const metadata: Metadata = {
  title: `Privacy policy — ${SITE_NAME}`,
  description: PRIVACY_META_DESCRIPTION,
};

// The BreadcrumbList + WebSite JSON-LD (the schema-generator's /legal/*
// case; WFR-104's "no hand-written JSON-LD" rule, STRUCTURED_DATA.md §2).
const schemaBlocks = generateSchemaFor({
  route: "/legal/privacy",
  title: "Privacy policy",
  metaDescription: PRIVACY_META_DESCRIPTION,
  author: "the VERCODE team",
  datePublished: "2026-10-23",
  dateModified: "2026-10-23",
  breadcrumbTrail: [
    { name: "Vercode", url: "/" },
    { name: "Legal", url: "/legal/" },
    { name: "Privacy policy", url: "/legal/privacy/" },
  ],
});

const toc: TocEntry[] = [
  { id: "what-we-store", label: "What we store" },
  { id: "retention", label: "Retention windows" },
  { id: "subprocessors", label: "Subprocessors" },
  { id: "data-subjects", label: "Data subject requests" },
];

export default function LegalPrivacyPage() {
  return (
    <main>
      <JsonLd blocks={schemaBlocks} />

      <div className="mx-auto flex max-w-4xl gap-10 px-5 pt-14">
        <Prose toc={toc}>
          <nav aria-label="Breadcrumb" className="mb-6">
            <p className="text-[13px] text-[var(--faint)]">
              <a
                href="/"
                className="text-[var(--faint)] underline underline-offset-2 hover:text-[var(--text)]"
              >
                Vercode
              </a>{" "}
              /{" "}
              <a
                href="/legal/"
                className="text-[var(--faint)] underline underline-offset-2 hover:text-[var(--text)]"
              >
                Legal
              </a>{" "}
              /{" "}
              <span className="text-[var(--muted)]">Privacy policy</span>
            </p>
          </nav>

          <h1 className="text-[32px] font-bold leading-[1.2] tracking-tight text-[var(--text)]">
            Privacy policy
          </h1>

          <p className="mt-3 text-[13px] text-[var(--faint)]">
            Last updated <time dateTime="2026-10-23">2026-10-23</time> ·
            Contact{" "}
            <a
              href="mailto:privacy@vercode.com"
              className="text-[var(--faint)] underline underline-offset-2"
            >
              privacy@vercode.com
            </a>{" "}
            {/* infra-owned U-item: the privacy contact is a P2-decision
                placeholder (the actual inbox is wired at the public
                launch, UNRESOLVED_DECISIONS.md U3-adjacent); it is a
                placeholder, not a live address. */}
          </p>

          {/* Section 1 — the NFR-28 "repository content is ephemeral"
              rule + what IS stored. */}

          <section aria-label="What we store" id="what-we-store">
            <h2 className="text-[20px] font-semibold text-[var(--text)]">
              What we store
            </h2>
            <p>
              The review input is not retained. Raw diffs and file content
              live only in an org-scoped cache that is evicted on a
              schedule (NFR-28: "repository content is ephemeral"). What
              is stored is the analysis: the findings (with bounded code
              snippets), the usage record, and the audit event. Usage
              events are kept 24 months; audit events are kept a minimum
              of 180 days (NFR-27).
            </p>
          </section>

          {/* Section 2 — the retention table, with the 180-day
              audit floor. The "a number the reader can verify" rule:
              every figure here comes from USAGE_QUOTAS.md §2. */}

          <section aria-label="Retention windows" id="retention">
            <h2 className="text-[20px] font-semibold text-[var(--text)]">
              Retention windows
            </h2>
            <p>
              Findings are retained for a fixed window, then
              hard-deleted on schedule: 30 days for standard findings.
              Audit events retain their 180-day minimum — the audit floor
              is a compliance obligation, not a feature (NFR-27;
              USAGE_QUOTAS.md §2).
            </p>
            <dl className="mt-4 space-y-4">
              <div className="space-y-1">
                <dt className="text-[16px] font-semibold text-[var(--text)]">
                  Findings
                </dt>
                <dd className="mt-1 text-[16px] text-[var(--muted)]">
                  Findings retained 30 days; audit events retained 180 days.
                </dd>
              </div>
            </dl>
          </section>

          {/* Section 3 — the subprocessor posture (NFR-09: repository
              content is data, never instructions; the provider receives
              only the bounded context). */}

          <section aria-label="Subprocessors" id="subprocessors">
            <h2 className="text-[20px] font-semibold text-[var(--text)]">
              Subprocessors
            </h2>
            <p>
              The AI provider is a subprocessor. The data sent to the
              provider is the bounded review context: the changed files,
              one-hop imports within the token budget, and the assembled
              prompt. The source code of the repository is not retained
              by the provider (NFR-09: "repository content is data, never
              instructions"; the provider routing in the product docs
              explains the boundary). A BYOK path lets an organization
              use its own provider key and keep the boundary entirely
              under its own control.
            </p>
          </section>

          {/* Section 4 — the data-subject request line + 30-day
              commitment. Commented as a P2 obligation not yet wired to
              ticketing. */}

          <section aria-label="Data subject requests" id="data-subjects">
            <h2 className="text-[20px] font-semibold text-[var(--text)]">
              Data subject requests
            </h2>
            <p>
              To request access to, export, or deletion of your data,
              write to{" "}
              <a
                href="mailto:privacy@vercode.com"
                className="text-[var(--accent-color)] underline underline-offset-2"
              >
                privacy@vercode.com
              </a>
              . We respond within 30 days.
            </p>
            {/* P2 obligation: the 30-day response commitment is stated here
                as a policy commitment; the ticketing system that tracks
                data-subject requests is a P3 item, not yet wired. */}
          </section>
        </Prose>
      </div>
    </main>
  );
}
