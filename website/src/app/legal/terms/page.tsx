// /legal/terms (INFORMATION_ARCHITECTURE_AND_PAGES.md §3.9): the service
// semantics contract — a plain, readable legal page in the 720px column
// (a "last updated" date, a TOC, a contact email; WFR-406 the /legal
// cluster, PRD.md §4.2). No fabricated release or customer claims — the
// legal copy is a policy statement.
//
// The 720px reading column comes from the `reading-col` class (the
// DESIGN_SYSTEM_AND_TYPOGRAPHY.md §3 centered 720px rule; 45rem in
// globals.css). Prose type follows the page scale (§2).
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
const TERMS_META_DESCRIPTION =
  "What a review is, the usage cap with a posted skip notice, data ownership, the measured latency target, and the clauses to read before you rely on the service.";

export const metadata: Metadata = {
  title: `Terms of service — ${SITE_NAME}`,
  description: TERMS_META_DESCRIPTION,
};

// The BreadcrumbList + WebSite JSON-LD (the schema-generator's /legal/*
// case; WFR-104's "no hand-written JSON-LD" rule, STRUCTURED_DATA.md §2).
const schemaBlocks = generateSchemaFor({
  route: "/legal/terms",
  title: "Terms of service",
  metaDescription: TERMS_META_DESCRIPTION,
  author: "the VERCODE team",
  datePublished: "2026-10-23",
  dateModified: "2026-10-23",
  breadcrumbTrail: [
    { name: "Vercode", url: "/" },
    { name: "Legal", url: "/legal/" },
    { name: "Terms of service", url: "/legal/terms/" },
  ],
});

// The > 3-section TOC (the Prose wrapper's `toc` right rail; IA §3.5's
// "a right rail on desktop for a page with > 3 sections" rule).
const toc: TocEntry[] = [
  { id: "what-a-review-is", label: "What a review is" },
  { id: "usage-cap", label: "Usage cap" },
  { id: "data-ownership", label: "Data ownership" },
  { id: "service-levels", label: "Service levels, measured" },
  { id: "accepting", label: "Accepting these terms" },
];

export default function LegalTermsPage() {
  return (
    <main>
      <JsonLd blocks={schemaBlocks} />

      <div className="mx-auto flex max-w-4xl gap-10 px-5 pt-14">
        <Prose toc={toc}>
          {/* The breadcrumb — a visible 13px var(--faint) "Vercode / Legal /
              Terms of service" line (IA §3.9's visible breadcrumb; the
              JSON-LD BreadcrumbList is in the <script> above). */}
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
              <span className="text-[var(--muted)]">Terms of service</span>
            </p>
          </nav>

          <h1 className="text-[32px] font-bold leading-[1.2] tracking-tight text-[var(--text)]">
            Terms of service
          </h1>

          {/* The "last updated" + "contact" meta lines (IA §3.9's rule). The
              contact email is a placeholder the infra team owns at launch
              (the U-item in UNRESOLVED_DECISIONS.md); it is a placeholder
              by comment, not a promise. */}
          <p className="mt-3 text-[13px] text-[var(--faint)]">
            Last updated <time dateTime="2026-10-23">2026-10-23</time> ·
            Contact{" "}
            <a
              href="mailto:legal@vercode.com"
              className="text-[var(--faint)] underline underline-offset-2"
            >
              legal@vercode.com
            </a>{" "}
            {/* infra-owned U-item: the legal contact email is a P2-decision
                placeholder (UNRESOLVED_DECISIONS.md's U3-adjacent infra
                slot); it is a placeholder, not a wired inbox. */}
          </p>

          {/* The body sections. A legal policy statement, not a benchmark —
              no customer or release claims. Each section is an <h2> + a
              few short paragraphs. */}

          <section aria-label="What a review is" id="what-a-review-is">
            <h2 className="text-[20px] font-semibold text-[var(--text)]">
              What a review is
            </h2>
            <p>
              A review is a pipeline run. When your pull request is opened
              or updated, a webhook fires to the GitHub App. The pipeline
              fetches the diff and the changed files, runs static analysis
              first, then routes the bounded context to a model for the
              review. It publishes a verdict (pass / needs changes /
              blocking) plus inline findings back to the pull request.
              Every review is keyed by the commit SHA of the pull request
              head — the review you see belongs to that exact commit.
            </p>
          </section>

          <section aria-label="Usage cap" id="usage-cap">
            <h2 className="text-[20px] font-semibold text-[var(--text)]">
              Usage cap
            </h2>
            <p>
              Every organization has a hard monthly cap on reviews. The
              N+1th review in a month does not run silently — it is
              skipped with a posted notice on the pull request, "Usage
              cap reached this month, this review was skipped. Reduce
              review volume." The skip is the rule, not a
              bug (NFR-18: the skip is before the AI stage, zero tokens
              consumed, never a silent stop).
            </p>
          </section>

          <section aria-label="Data ownership" id="data-ownership">
            <h2 className="text-[20px] font-semibold text-[var(--text)]">
              Data ownership
            </h2>
            <p>
              Your organization owns its review findings, its usage data,
              and its audit events. When the GitHub App install is removed,
              the stored data is hard-deleted on schedule (FR-404: the
              retention queue runs, the deletion is confirmed in the
              dashboard's export window, the 180-day audit floor is
              honored before the cascade).
            </p>
          </section>

          <section aria-label="Service levels, measured" id="service-levels">
            <h2 className="text-[20px] font-semibold text-[var(--text)]">
              Service levels, measured
            </h2>
            <p>
              The review latency target is p50 under 120 seconds, p95 under
              300 seconds, measured from webhook receipt to publication
              complete (NFR-02). A number in these terms is a target, not
              a guarantee: the release criteria rule says a claim without a
              measurement is a banned claim (RELEASE_CRITERIA gate 7). The
              target is a stated engineering commitment, not a contractual
              SLA.
            </p>
          </section>

          <section aria-label="Accepting these terms" id="accepting">
            <h2 className="text-[20px] font-semibold text-[var(--text)]">
              Accepting these terms
            </h2>
            <p>
              By creating an account or installing the GitHub App on a
              repository, the organization owner accepts these terms on
              behalf of the organization. Questions about a specific clause
              or an enterprise exception go to the contact email above.
            </p>
          </section>
        </Prose>
      </div>
    </main>
  );
}
