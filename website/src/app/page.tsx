// The landing surface (IA §3.1): "Is this AI code review actually trustworthy,
// and can I try it?" The 7 blocks in order (the hero→CTA stack, WFR-201/202):
// hero → how it works → capability → [social proof, omitted]
// → FAQ teaser → closing CTA. The section order is the WFR-202 assertion.
import type { Metadata } from "next";
import { JsonLd } from "../components/JsonLd";
import { Reveal } from "../components/Reveal";
import { VerdictDevice } from "../components/VerdictDevice";
import {
  SITE_NAME,
  TAGLINE,
  signinUrl,
  srcParam,
} from "../lib/site";
import { HOME_FAQ_SLICE } from "../lib/faq";
import { generateSchemaFor } from "../lib/schema-generator";

// The H1 (the SAAS_LAUNCH_PLAN §1 wedge, humanized; ≤ 12 words) + the
// deterministic-first subhead (the WFR-201 hero spec).
const HERO_TITLE = "Reviews you can act on, in two minutes.";
const HERO_SUBHEAD =
  "Static analysis runs first. Task-routed AI runs on the diff. A verdict and evidence-backed findings land on the pull request in under two minutes.";
const META_DESCRIPTION =
  "Static analysis runs first; task-routed AI runs on the diff. VERCODE posts a verdict plus evidence-backed findings to the pull request in under two minutes.";

export const metadata: Metadata = {
  title: `${SITE_NAME} — AI code review your team actually reads`,
  // 120–158 chars (WFR-404's meta description band).
  description: META_DESCRIPTION,
  openGraph: {
    title: `${SITE_NAME} — AI code review your team actually reads`,
    description:
      "A deterministic-first review pipeline that posts a verdict and evidence-backed findings on the pull request, in under two minutes.",
    type: "website",
  },
};

// WFR-102: every page's JSON-LD comes from the single generator (the
// STRUCTURED_DATA.md §2 "no hand-written JSON-LD" rule). The root page is
// isRoot (the WebSite + HowTo + top-5 FAQPage blocks).
const schemaBlocks = generateSchemaFor({ route: "/", isRoot: true });

// The 3-step HowTo content (IA §3.1 block 2; the HowTo block in the schema
// mirrors this — a visible text == schema text, the SEO_AEO_GEO.md §3 rule).
const STEPS = [
  {
    title: "Install the GitHub App",
    body: "The install URL is pre-scoped to the least-privilege list: contents:read, pull_requests:write, checks:write, metadata:read, issues:read. No admin:org, no secrets scope.",
  },
  {
    title: "Open a pull request",
    body: "GitHub dispatches the webhook; VERCODE verifies the signature and enqueues the review job in under 300 ms (NFR-04 — no LLM on the webhook path). The queue, not the request, does the work.",
  },
  {
    title: "Read the review",
    body: "Static analysis runs first; the task-routed AI stage runs on the bounded diff. A verdict and inline findings land on the pull request in under two minutes at p50 (NFR-02).",
  },
];

// The 4 pillars (IA §3.1 block 3; the README's four, the featureList of the
// SoftwareApplication block — the copy matches the schema's featureList).
const PILLARS = [
  {
    title: "Deterministic first",
    body: "Static analysis — ESLint, Semgrep, secret scanning — runs before the model. The model's findings are deltas on grounded checks, not a free-form second opinion.",
  },
  {
    title: "Evidence-backed",
    body: "Every finding carries a category, a severity, a confidence, a reason, and a suggested fix. A verdict you can read, not a wall of flags to triage by hand.",
  },
  {
    title: "Cost discipline",
    body: "Per-review cost accounting keeps the spend bounded. The strong model runs only where it earns its spend; the static pass costs almost nothing.",
  },
  {
    title: "A workspace, not just a bot",
    body: "The dashboard answers the org's risk and cost question: a security rollup, an audit trail, a usage view. The pull request is one view of the org, not the whole product.",
  },
];

// WFR-202: the social-proof section is omitted until real customer logos
// exist (the "omit, don't fabricate" rule; content/ has no logo wall yet).
// When the first real logos land, the block re-enters between the
// capability block and the FAQ teaser, in this same position.

// The top-5 teaser, same text as /faq's full answers (the WFR-204 rule;
// HOME_FAQ_SLICE is lib/faq.js's top-5 helper, the same slice the root
// FAQPage schema block carries).
const FAQ_TEASER = HOME_FAQ_SLICE;

export default function Home() {
  const heroCta = signinUrl() + srcParam("home");
  const closingCta = signinUrl() + srcParam("home-cta");
  return (
    <>
      <JsonLd blocks={schemaBlocks} />

      {/* Block 1 — the hero (IA §3.1, the premium pass 2026-10-23):
          a full-canvas centered column at the display type scale; the
          verdict device is the one large thing, now at 640px. No
          gradient, no eyebrow (the WFR-201 tells stay banned). */}
      <section
        aria-labelledby="hero-heading"
        className="mx-auto max-w-[760px] px-5 pt-16 pb-16 text-center sm:pt-24 sm:pb-20"
      >
        <h1
          id="hero-heading"
          className="text-[var(--hero-size)] leading-[var(--hero-leading)] font-semibold tracking-[var(--hero-tracking)] text-[var(--text)]"
        >
          {HERO_TITLE}
        </h1>
        <p className="mx-auto mt-6 max-w-[560px] text-[18px] leading-[1.6] text-[var(--muted)] sm:text-[19px]">
          {HERO_SUBHEAD}
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a href={heroCta} className="btn-cta">
            Start a free review
          </a>
          <a href="/docs/quickstart/" className="btn-secondary">
            Read the docs
          </a>
        </div>
        <div className="mx-auto mt-14 flex flex-col items-center">
          <VerdictDevice />
          <p className="mt-4 text-[13px] text-[var(--faint)]">
            Preview data — a representative review.
          </p>
        </div>
      </section>

      {/* Block 2 — How it works (the 3-step row; order is shown by
          position + a step title, no index numbers). The section
          `Reveal`'s inner `<li>`s are each a `Reveal` with a
          `data-stagger` index: a 60ms cascade (§5 one-time 100ms
          scroll-reveal, a `Reveal.tsx` capped at 240ms). */}
      <Reveal as="section">
        <div
          aria-labelledby="how-it-works-heading"
          className="mx-auto max-w-[720px] px-5 py-20 sm:py-24"
        >
          <h2
            id="how-it-works-heading"
            className="text-[30px] font-semibold tracking-[-0.02em] text-[var(--text)] sm:text-[34px]"
          >
            How it works
          </h2>
          <ol
            aria-label="How it works"
            className="mt-10 grid grid-cols-1 gap-8"
          >
            {STEPS.map((step, i) => (
              <Reveal as="li" key={step.title} dataStagger={i}>
                <div className="grid grid-cols-[48px_1fr] items-start gap-x-4">
                  <div
                    aria-hidden="true"
                    className="mt-1 flex h-6 w-1 items-center"
                  >
                    <span className="block h-6 w-[2px] rounded-full bg-[var(--accent-color)]/40" />
                  </div>
                  <div>
                    <h3 className="text-[16px] font-semibold text-[var(--text)]">
                      {step.title}
                    </h3>
                    <p className="mt-1.5 text-[15px] leading-[1.7] text-[var(--muted)]">
                      {step.body}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </Reveal>

      {/* Block 3 — the capability narrative (the 2×2 grid; the premium
          pass keeps the flat hairline rule grid — gap-px over a
          --hard-border background, no card shadows, no icons — but
          opens the cells so the text breathes). The 4 cards are
          `Reveal`s with a `data-stagger` index (a 60ms-per-item
          cascade, capped at 240ms in `Reveal.tsx`). */}
      <Reveal as="section">
        <div
          aria-labelledby="pillars-heading"
          className="mx-auto max-w-[720px] px-5 py-20 sm:py-24"
        >
          <h2
            id="pillars-heading"
            className="text-[30px] font-semibold tracking-[-0.02em] text-[var(--text)] sm:text-[34px]"
          >
            Built on four principles
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-[var(--radius-card)] border border-[var(--hard-border)] bg-[var(--hard-border)] sm:grid-cols-2">
            {PILLARS.map((pillar, i) => (
              <Reveal key={pillar.title} dataStagger={i}>
                <div className="bg-[var(--surface)] p-7">
                  <h3 className="text-[16px] font-semibold text-[var(--text)]">
                    {pillar.title}
                  </h3>
                  <p className="mt-2 text-[15px] leading-[1.7] text-[var(--muted)]">
                    {pillar.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </Reveal>

      {/* Block 5 — the FAQ teaser (the top-5 items; the byte-equivalence
          rule WFR-204 — the same strings /faq renders, from the same
          array). The premium pass sets the question at 17px with the
          answer a half line below. */}
      <Reveal as="section">
        <div
          aria-labelledby="faq-teaser-heading"
          className="mx-auto max-w-[720px] px-5 py-20 sm:py-24"
        >
          <h2
            id="faq-teaser-heading"
            className="text-[30px] font-semibold tracking-[-0.02em] text-[var(--text)] sm:text-[34px]"
          >
            Questions
          </h2>
          <dl className="mt-8">
            {FAQ_TEASER.map((item, i) => (
              <Reveal key={item.anchor} dataStagger={i}>
                <div
                  className={`grid grid-cols-1 gap-2 py-5 ${i > 0 ? "border-t border-[var(--rule)]" : ""}`}
                >
                  <dt className="text-[17px] font-medium text-[var(--text)]">
                    {item.q}
                  </dt>
                  <dd className="text-[15px] leading-[1.7] text-[var(--muted)]">
                    {item.a}
                  </dd>
                </div>
              </Reveal>
            ))}
          </dl>
          <a href="/faq/" className="link-cta">
            All questions
          </a>
        </div>
      </Reveal>

      {/* Block 6 — the closing CTA (the premium pass: the raised band
          keeps its tone step, no rules; the line is at the display
          scale and the one primary button carries the accent — nothing
          else on the band is red). */}
      <Reveal as="section">
        <div aria-labelledby="cta-heading" className="bg-[var(--raised)] py-20 sm:py-24">
          <div className="mx-auto flex max-w-[720px] flex-col items-center px-5 text-center">
            <h2
              id="cta-heading"
              className="text-[var(--hero-size)] leading-[var(--hero-leading)] font-semibold tracking-[var(--hero-tracking)] text-[var(--text)]"
            >
              {TAGLINE}
            </h2>
            <p className="mt-4 max-w-[440px] text-[16px] leading-[1.7] text-[var(--muted)]">
              A free review starts on a real pull request — no trial
              clock, no card.
            </p>
            <a href={closingCta} className="btn-cta mt-8">
              Start a free review
            </a>
          </div>
        </div>
      </Reveal>
    </>
  );
}
