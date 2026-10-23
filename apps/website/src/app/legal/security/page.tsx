// /legal/security (INFORMATION_ARCHITECTURE_AND_PAGES.md §3.9): the
// PUBLIC trust page — a summary of the threat model + the controls + a
// vulnerability-reporting line + a subprocessor list + a link to the
// full security architecture docs in the repo. WFR-406, PRD.md §4.2.
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
import { SITE_NAME, GITHUB_REPO } from "@/lib/site.js";

// 120–158 chars (WFR-102's meta description band; the on-page gate).
const SECURITY_META_DESCRIPTION =
  "The threat-model summary, the webhook verification layers, the five GitHub App scopes, the BYOK key storage, and the vulnerability-reporting address.";

export const metadata: Metadata = {
  title: `Security — ${SITE_NAME}`,
  description: SECURITY_META_DESCRIPTION,
};

// The BreadcrumbList + WebSite JSON-LD (the schema-generator's /legal/*
// case; WFR-104's "no hand-written JSON-LD" rule, STRUCTURED_DATA.md §2).
const schemaBlocks = generateSchemaFor({
  route: "/legal/security",
  title: "Security",
  metaDescription: SECURITY_META_DESCRIPTION,
  author: "the VERCODE team",
  datePublished: "2026-10-23",
  dateModified: "2026-10-23",
  breadcrumbTrail: [
    { name: "Vercode", url: "/" },
    { name: "Legal", url: "/legal/" },
    { name: "Security", url: "/legal/security/" },
  ],
});

const toc: TocEntry[] = [
  { id: "threat-model", label: "The threat model" },
  { id: "webhook-verification", label: "Webhook verification" },
  { id: "github-scopes", label: "GitHub App scopes" },
  { id: "key-storage", label: "Key storage" },
  { id: "prompt-injection", label: "Prompt injection defense" },
  { id: "report", label: "Report a vulnerability" },
];

export default function LegalSecurityPage() {
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
              <span className="text-[hsl(var(--muted))]">Security</span>
            </p>
          </nav>

          <h1 className="text-[32px] font-bold leading-[1.2] tracking-tight text-[var(--text)]">
            Security
          </h1>

          <p className="mt-3 text-[13px] text-[hsl(var(--faint))]">
            Last updated <time dateTime="2026-10-23">2026-10-23</time> ·
            Contact{" "}
            <a
              href="mailto:security@vercode.com"
              className="text-[hsl(var(--faint))] underline underline-offset-2"
            >
              security@vercode.com
            </a>{" "}
            {/* infra-owned U-item: the security contact is a P2-decision
                placeholder (the vulnerability-reporting inbox is wired at
                the public launch, UNRESOLVED_DECISIONS.md U3-adjacent);
                it is a placeholder, not a live address. */}
          </p>

          {/* Section 1 — the 3-layer webhook verification summary from
              THREAT_MODEL.md T-01 + NFR-06. */}

          <section aria-label="The threat model" id="threat-model">
            <h2 className="text-[20px] font-semibold text-[var(--text)]">
              The threat model
            </h2>
            <p>
              The register in the repo covers the threat classes that apply
              to a multi-tenant AI review pipeline. The summary here is the
              public form; the full register lives in the repo.
            </p>
          </section>

          <section aria-label="Webhook verification" id="webhook-verification">
            <h2 className="text-[20px] font-semibold text-[var(--text)]">
              Webhook verification
            </h2>
            <p>
              Three layers, all required (NFR-06: 100% rejection of
              forged or replayed webhooks): HMAC-SHA256 signature
              verification, a 5-minute timestamp window, and a 24-hour{" "}
              <code>X-Hub-Delivery</code> dedup. A forged signature fails
              layer 1; a captured event fails layer 2 (stale) or layer 3
              (seen). Every rejection is audit-logged.
            </p>
          </section>

          {/* Section 2 — the least-privilege GitHub App scopes (FR-210,
              verbatim 5-scope list). */}

          <section aria-label="GitHub App scopes" id="github-scopes">
            <h2 className="text-[20px] font-semibold text-[var(--text)]">
              GitHub App scopes
            </h2>
            <p>
              The App requests only the five least-privilege scopes
              (FR-210):{" "}
              <code>contents:read</code>, <code>pull_requests:write</code>,{" "}
              <code>checks:write</code>, <code>metadata:read</code>,{" "}
              <code>issues:read</code>. No admin, no secrets scopes.
              Install tokens are cached server-side and never sent to the
              browser.
            </p>
          </section>

          {/* Section 3 — the BYOK AES-256-GCM + KMS-wrapped master key
              (FR-313). */}

          <section aria-label="Key storage" id="key-storage">
            <h2 className="text-[20px] font-semibold text-[var(--text)]">
              Key storage
            </h2>
            <p>
              A BYOK provider key is KMS-wrapped at rest
              (AES-256-GCM under a KMS master key) — only the ciphertext
              is stored. Decryption happens in the worker process, in KMS
              scope, for that organization's calls only (FR-313). The API
              returns a masked last-4, not the key.
            </p>
          </section>

          {/* Section 4 — the prompt-injection defense (NFR-09). */}

          <section
            aria-label="Prompt injection defense"
            id="prompt-injection"
          >
            <h2 className="text-[20px] font-semibold text-[var(--text)]">
              Prompt injection defense
            </h2>
            <p>
              Repository content is data, never instructions (NFR-09).
              Every repo-derived value is wrapped in a delimitation block
              with an explicit "untrusted data" instruction. The review
              mode has no tool-calling path — an injected "call the API"
              has no tool to call. Output is schema-validated; a leaked
              system prompt or a scope change does not parse as a
              <code>ReviewFinding</code>.
            </p>
          </section>

          {/* Section 5 — the subprocessor list + the "no untrusted code
              execution" honest line (KNOWN_LIMITATIONS L-1: a deferred
              capability is documented, not silently absent). */}

          <section aria-label="Report a vulnerability" id="report">
            <h2 className="text-[20px] font-semibold text-[var(--text)]">
              Subprocessors and known limitations
            </h2>
            <p>
              Subprocessors: the AI provider and the host (Vercel or
              Cloudflare Pages, an infra decision at launch). No other
              third party receives repository content.
            </p>
            <p>
              A limitation, stated plainly: the pipeline does not run the
              PR's own tests. The static analysis pass is what runs in the
              worker; the sandbox that would execute untrusted code is a
              deferred capability (KNOWN_LIMITATIONS L-1). A deferred
              capability is documented, not silently absent.
            </p>
          </section>

          {/* The "report a vulnerability" block. */}
          <section aria-label="Report a vulnerability">
            <h2 className="text-[20px] font-semibold text-[var(--text)]">
              Report a vulnerability
            </h2>
            <p>
              Write to{" "}
              <a
                href="mailto:security@vercode.com"
                className="text-[var(--accent-color)] underline underline-offset-2"
              >
                security@vercode.com
              </a>
              . Include the affected component and a reproducible example
              where possible.
            </p>
            <p>
              The full security architecture (threat register, controls,
              and verification tests) is in the repo:{" "}
              <a
                href={`${GITHUB_REPO}/tree/main/docs/SECURITY/SECURITY_ARCHITECTURE.md`}
                className="text-[var(--accent-color)] underline underline-offset-2"
              >
                docs/SECURITY/SECURITY_ARCHITECTURE.md
              </a>
              .
            </p>
          </section>
        </Prose>
      </div>
    </main>
  );
}
