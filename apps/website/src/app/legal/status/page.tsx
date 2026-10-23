// /legal/status (INFORMATION_ARCHITECTURE_AND_PAGES.md §3.9, PRD.md §4.2
// WFR-406): a THIN page — a link to the external status service, not the
// record itself. The incident record lives at the status service; this
// page is the link + a 2-line description of what a status entry looks
// like + the "no status marketing" line.
//
// The 720px reading column comes from the `reading-col` class (the
// DESIGN_SYSTEM_AND_TYPOGRAPHY.md §3 centered 720px rule; 45rem in
// globals.css). No TOC — the page has one section (IA §3.5's "> 3
// sections" rule does not trigger the right rail).
//
// The house rules applied: sentence case only, no icon-topped cards, no
// eyebrow labels, no uppercase labels (DESIGN_SYSTEM §9 + §10). The
// `--muted` / `--faint` / `--surface` / `--border` CSS vars are the only
// colors; no hex.
import type { Metadata } from "next";
import { generateSchemaFor } from "@/lib/schema-generator.js";
import { JsonLd } from "@/components/JsonLd.js";
import { SITE_NAME } from "@/lib/site.js";

// 120–158 chars (WFR-102's meta description band; the on-page gate).
const STATUS_META_DESCRIPTION =
  "The incident record lives at the external status service: a window, a detection time, a fix, each entry just the record as it happened. No status marketing.";

export const metadata: Metadata = {
  title: `Status — ${SITE_NAME}`,
  description: STATUS_META_DESCRIPTION,
};

// The BreadcrumbList + WebSite JSON-LD (the schema-generator's /legal/*
// case; WFR-104's "no hand-written JSON-LD" rule, STRUCTURED_DATA.md §2).
const schemaBlocks = generateSchemaFor({
  route: "/legal/status",
  title: "Status",
  metaDescription: STATUS_META_DESCRIPTION,
  author: "the VERCODE team",
  datePublished: "2026-10-23",
  dateModified: "2026-10-23",
  breadcrumbTrail: [
    { name: "Vercode", url: "/" },
    { name: "Legal", url: "/legal/" },
    { name: "Status", url: "/legal/status/" },
  ],
});

// U3: the status-service URL is an open infra decision (UNRESOLVED_DECISIONS.md
// U3: "the status-service URL is an open infra decision (UNRESOLVED)" —
// leaning external link + thin page). This placeholder resolves at the
// public launch when infra picks the service.
const STATUS_SERVICE_URL = "https://status.vercode.com";

export default function LegalStatusPage() {
  return (
    <main>
      <JsonLd blocks={schemaBlocks} />

      <div className="mx-auto flex max-w-4xl gap-10 px-5 pt-14">
        {/* A single-reading-column page: the `Prose` wrapper is not used
            (it adds a right-rail TOC which is only for > 3 sections, IA
            §3.5; this page has one section). The 720px column is the
            `reading-col` class (globals.css, the DESIGN_SYSTEM_AND_
            TYPOGRAPHY.md §3 rule). */}
        <div className="reading-col min-w-0 flex-1">
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
              <span className="text-[var(--muted)]">Status</span>
            </p>
          </nav>

          <h1 className="text-[32px] font-bold leading-[1.2] tracking-tight text-[var(--text)]">
            Status
          </h1>

          <p className="mt-3 text-[13px] text-[var(--faint)]">
            Last updated <time dateTime="2026-10-23">2026-10-23</time> ·
            Contact{" "}
            <a
              href="mailto:security@vercode.com"
              className="text-[var(--faint)] underline underline-offset-2"
            >
              security@vercode.com
            </a>{" "}
            {/* infra-owned U-item: the status page contact (incident
                reporting) is a P2-decision placeholder; it is a
                placeholder, not a wired inbox. */}
          </p>

          {/* The single section — one paragraph + the link + the 2-line
              "what a status entry looks like" description + the
              "no status marketing" line (the PRD's anti-vanity-totals
              rule, RELEASE_CRITERIA's "a claim without a measurement is
              a banned claim"). */}

          <section aria-label="The incident record" className="mt-8">
            <p className="text-[16px] leading-[1.6] text-[var(--muted)]">
              The incident record is maintained at the external status
              service — this page is the link, not the record. Each entry
              is a single incident: a window (start to resolution), a
              detection time, and a fix. No color-coded theater, no
              uptime percentages without the log behind them — just the
              record as it happened.
            </p>
          </section>

          {/* The prominent link block (IA §3.9: "a thin link to the
              external status service"; the PRD's "no status marketing"
              rule — a status page that claims 99.99% without the
              incident log behind it is a lie, RELEASE_CRITERIA's
              "a claim without a measurement is a banned claim"). */}

          <div className="mt-8 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="text-[13px] font-medium text-[var(--faint)]">
              Incident history
            </p>
            <a
              href={STATUS_SERVICE_URL}
              className="mt-1 block text-[16px] font-medium text-[var(--accent)] underline underline-offset-2"
            >
              {STATUS_SERVICE_URL}
            </a>
          </div>

          <p className="mt-6 text-[15px] leading-[1.6] text-[var(--muted)]">
            A status page that claims 99.99% without the incident log
            behind it is a lie. The measured-not-claimed rule
            (RELEASE_CRITERIA gate 7: "a claim without a measurement is a
            banned claim") applies here: the service publishes the record
            as it happens, not a headline.
          </p>
        </div>
      </div>
    </main>
  );
}
