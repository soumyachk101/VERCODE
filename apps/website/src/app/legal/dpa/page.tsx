// /legal/dpa (INFORMATION_ARCHITECTURE_AND_PAGES.md §3.9, PRD.md §4.2
// WFR-406): the data-processing addendum — an enterprise clause page
// (COMPLIANCE_CONSIDERATIONS.md's "the DPDP alignment" + "the enterprise
// DPA" references; SAAS_LAUNCH_PLAN P3).
//
// A plain, readable page in the 720px column (the `reading-col` class,
// the DESIGN_SYSTEM_AND_TYPOGRAPHY.md §3 rule; 45rem in globals.css).
// The `Prose` wrapper's right-rail TOC carries the section anchors.
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
const DPA_META_DESCRIPTION =
  "What is processed, the PII boundary, the subprocessor list, the deletion duty on access revocation, and the 180-day audit-log floor.";

export const metadata: Metadata = {
  title: `Data processing addendum — ${SITE_NAME}`,
  description: DPA_META_DESCRIPTION,
};

// The BreadcrumbList + WebSite JSON-LD (the schema-generator's /legal/*
// case; WFR-104's "no hand-written JSON-LD" rule, STRUCTURED_DATA.md §2).
const schemaBlocks = generateSchemaFor({
  route: "/legal/dpa",
  title: "Data processing addendum",
  metaDescription: DPA_META_DESCRIPTION,
  author: "the VERCODE team",
  datePublished: "2026-10-23",
  dateModified: "2026-10-23",
  breadcrumbTrail: [
    { name: "Vercode", url: "/" },
    { name: "Legal", url: "/legal/" },
    { name: "Data processing addendum", url: "/legal/dpa/" },
  ],
});

const toc: TocEntry[] = [
  { id: "data-processed", label: "The data processed" },
  { id: "pii-boundary", label: "The PII boundary" },
  { id: "subprocessors", label: "The subprocessor list" },
  { id: "deletion", label: "Deletion on revocation" },
  { id: "audit-floor", label: "The audit-log floor" },
];

export default function LegalDpaPage() {
  return (
    <main>
      <JsonLd blocks={schemaBlocks} />

      <div className="mx-auto flex max-w-4xl gap-10 px-5 pt-14">
        <Prose toc={toc}>
          <nav aria-label="Breadcrumb" className="mb-6">
            <p className="text-[13px] text-[hsl(var(--faint))]">
              <a
                href="/"
                className="text-[hsl(var(--faint))] underline underline-offset-2 hover:text-[var(--text)]"
              >
                Vercode
              </a>{" "}
              /{" "}
              <a
                href="/legal/"
                className="text-[hsl(var(--faint))] underline underline-offset-2 hover:text-[var(--text)]"
              >
                Legal
              </a>{" "}
              /{" "}
              <span className="text-[hsl(var(--muted))]">
                Data processing addendum
              </span>
            </p>
          </nav>

          <h1 className="text-[32px] font-bold leading-[1.2] tracking-tight text-[var(--text)]">
            Data processing addendum
          </h1>

          <p className="mt-3 text-[13px] text-[hsl(var(--faint))]">
            Last updated <time dateTime="2026-10-23">2026-10-23</time> ·
            Contact{" "}
            <a
              href="mailto:privacy@vercode.com"
              className="text-[hsl(var(--faint))] underline underline-offset-2"
            >
              privacy@vercode.com
            </a>{" "}
            {/* infra-owned U-item: the DPA contact email is a P2-decision
                placeholder (the actual signed-DPA document is a
                sales-owned artifact, not this page — see the note at the
                bottom of this page, UNRESOLVED_DECISIONS.md U3-adjacent);
                it is a placeholder, not a live address. */}
          </p>

          {/* The "public summary + a signed copy" split: this page is the
              summary; the signed-DPA document is a sales-team artifact,
              available on request (COMPLIANCE_CONSIDERATIONS.md's "the
              DPA is available to enterprise customers on request" line). */}

          {/* Section 1 — the data processed (findings + usage + audit,
              PII boundary). */}

          <section aria-label="The data processed" id="data-processed">
            <h2 className="text-[20px] font-semibold text-[var(--text)]">
              The data processed
            </h2>
            <p>
              What this addendum covers is the data an organization
              generates through the review pipeline: the findings
              (bounded code snippets), the usage record, and the audit
              event. Repository content itself is not processed beyond
              the review lifetime (NFR-28, the "repository content is
              ephemeral" rule; see the{" "}
              <a
                href="/legal/privacy/"
                className="text-[var(--accent-color)] underline underline-offset-2"
              >
                privacy policy
              </a>{" "}
              for the full storage description).
            </p>
          </section>

          {/* Section 2 — the PII boundary (NFR-22: no PII in logs). */}

          <section aria-label="The PII boundary" id="pii-boundary">
            <h2 className="text-[20px] font-semibold text-[var(--text)]">
              The PII boundary
            </h2>
            <p>
              The organization's member emails and GitHub handles are PII
              under this addendum. The "no PII in logs" rule (NFR-22)
              applies across the error-tracking and observability stack:
              email addresses, code content, and secrets are scrubbed
              from breadcrumbs and captures before they are stored.
            </p>
          </section>

          {/* Section 3 — the subprocessor list. */}

          <section aria-label="The subprocessor list" id="subprocessors">
            <h2 className="text-[20px] font-semibold text-[var(--text)]">
              The subprocessor list
            </h2>
            <p>
              The AI provider acts as a processor under this addendum.
              The host (Vercel or Cloudflare Pages, an infra decision at
              launch) is a subprocessor for the website. A BYOK path
              reduces the AI subprocessor boundary for organizations that
              use their own provider key.
            </p>
          </section>

          {/* Section 4 — the deletion duty on revocation (FR-404). */}

          <section aria-label="Deletion on revocation" id="deletion">
            <h2 className="text-[20px] font-semibold text-[var(--text)]">
              Deletion on revocation
            </h2>
            <p>
              When the GitHub App install is removed, the organization's
              data is hard-deleted on schedule (FR-404: deletion on
              access revocation). The deletion is a retention queue
              action, not a soft-delete; the 180-day audit floor is
              honored before the cascade completes.
            </p>
          </section>

          {/* Section 5 — the 180-day audit-log floor (NFR-27). */}

          <section aria-label="The audit-log floor" id="audit-floor">
            <h2 className="text-[20px] font-semibold text-[var(--text)]">
              The audit-log floor
            </h2>
            <p>
              Audit events are retained a minimum of 180 days under every
              tier (NFR-27: "audit log 180 days minimum"). The audit log
              is append-only — a mutation of the record is structurally
              impossible through the API; only a retention hard-delete
              expires an event by age. An audit retention below the
              180-day minimum is a compliance defect.
            </p>
          </section>

          {/* The "available on request" line + the split note. */}
          <p className="mt-8 text-[16px] text-[hsl(var(--muted))]">
            The DPA is available to enterprise customers on request.
            {/* Note: the actual signed-DPA document is a sales-owned
                artifact (COMPLIANCE_CONSIDERATIONS.md's "the enterprise
                DPA" reference; SAAS_LAUNCH_PLAN P3). This page is the
                public summary; a link to the signed document is the
                sales team's, not this page's. */}
          </p>
        </Prose>
      </div>
    </main>
  );
}
