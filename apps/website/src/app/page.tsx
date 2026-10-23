// The landing surface (IA §3.1): "Is this AI code review actually trustworthy,
// and can I try it?" The 7 blocks in order (the hero→CTA stack, WFR-201/202):
// hero → how it works → capability → pricing teaser → [social proof, omitted]
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
import { planOffer, formatPrice, type Plan } from "../lib/pricing";
import { HOME_FAQ_SLICE } from "../lib/faq";
import { generateSchemaFor } from "../lib/schema-generator";

// The H1 (the SAAS_LAUNCH_PLAN §1 wedge, humanized; ≤ 12 words) + the
// deterministic-first subhead (the WFR-201 hero spec).
const HERO_TITLE = "AI code review your team actually reads.";
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
    body: "Per-org quotas and per-review cost accounting keep the spend bounded. The strong model runs only where it earns its spend; the static pass costs almost nothing.",
  },
  {
    title: "A workspace, not just a bot",
    body: "The dashboard answers the org's risk and cost question: a security rollup, an audit trail, a usage view. The pull request is one view of the org, not the whole product.",
  },
];

// The 3-card teaser (IA §3.1 block 4: Free / Team / Enterprise; the Developer
// rung lives on /pricing). Prices + positioning come from the content/pricing
// source of truth (the WFR-203 consistency rule, never hand-typed).
const TEASER_PLANS: Plan[] = ["free", "team", "enterprise"];

// WFR-202: the social-proof section is omitted until real customer logos
// exist (the "omit, don't fabricate" rule; content/ has no logo wall yet).
// When the first real logos land, the block re-enters between here and the
// FAQ teaser, in this same position.

// The top-5 teaser, same text as /faq's full answers (the WFR-204 rule;
// HOME_FAQ_SLICE is lib/faq.js's top-5 helper, the same slice the root
// FAQPage schema block carries).
const FAQ_TEASER = HOME_FAQ_SLICE;

// formatPrice returns the figure + the unit ("$24 per month", "Custom
// negotiated"). The figure carries the tabular face; the unit is meta.
function priceParts(offer: ReturnType<typeof planOffer>): {
  figure: string;
  unit: string;
} {
  const full = formatPrice(offer);
  const split = full.indexOf(" ");
  return split === -1
    ? { figure: full, unit: "" }
    : { figure: full.slice(0, split), unit: full.slice(split + 1) };
}

export default function Home() {
  const heroCta = signinUrl() + srcParam("home");
  const closingCta = signinUrl() + srcParam("home-cta");
  return (
    <>
      <JsonLd blocks={schemaBlocks} />

      {/* Block 1 — the hero (IA §3.1): a centered type column, no gradient,
          no eyebrow; the verdict device is the one large thing (WFR-201). */}
      <section
        aria-labelledby="hero-heading"
        className="mx-auto max-w-2xl px-5 pt-16 pb-14 text-center sm:pt-24"
      >
        <h1
          id="hero-heading"
          className="text-[44px] leading-[1.05] font-bold tracking-[-0.02em] text-[var(--text)] sm:text-[64px]"
        >
          {HERO_TITLE}
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-[18px] leading-relaxed text-[var(--muted)] sm:text-[20px]">
          {HERO_SUBHEAD}
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <a
            href={heroCta}
            className="flex h-10 items-center rounded-[var(--radius-control)] bg-[var(--accent-cta)] px-5 text-[16px] font-medium text-white transition-opacity duration-100 hover:opacity-90"
          >
            Start a free review
          </a>
          <a
            href="/docs/quickstart/"
            className="flex h-10 items-center rounded-[var(--radius-control)] border border-[var(--control)] px-5 text-[16px] font-medium text-[var(--text)] transition-opacity duration-100 hover:opacity-90"
          >
            Read the docs
          </a>
        </div>
        <div className="mt-10">
          <VerdictDevice />
          <p className="mt-3 text-[13px] text-[var(--faint)]">
            Preview data — a representative review.
          </p>
        </div>
      </section>

      {/* Block 2 — How it works (the 3-step row; order is shown by
          position + a step title, no index numbers). */}
      <Reveal>
        <section
          aria-labelledby="how-it-works-heading"
          className="mx-auto max-w-5xl px-5 py-16"
        >
          <h2
            id="how-it-works-heading"
            className="text-[28px] font-semibold tracking-tight text-[var(--text)] sm:text-[32px]"
          >
            How it works
          </h2>
          <ol
            aria-label="How it works"
            className="mt-10 grid grid-cols-1 gap-10 sm:grid-cols-3"
          >
            {STEPS.map((step) => (
              <li key={step.title}>
                <h3 className="text-[16px] font-semibold text-[var(--text)]">
                  {step.title}
                </h3>
                <p className="mt-2 text-[16px] leading-relaxed text-[var(--muted)]">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </Reveal>

      {/* Block 3 — the capability narrative (the 2×2 "flat hairline" grid:
          gap-px over a --border background, no card shadows, no icons). */}
      <Reveal>
        <section
          aria-labelledby="pillars-heading"
          className="mx-auto max-w-5xl px-5 py-16"
        >
          <h2
            id="pillars-heading"
            className="text-[28px] font-semibold tracking-tight text-[var(--text)] sm:text-[32px]"
          >
            Built on four principles
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-px bg-[var(--border)] sm:grid-cols-2">
            {PILLARS.map((pillar) => (
              <div key={pillar.title} className="bg-[var(--surface)] p-8">
                <h3 className="text-[17px] font-semibold text-[var(--text)]">
                  {pillar.title}
                </h3>
                <p className="mt-2 text-[16px] leading-relaxed text-[var(--muted)]">
                  {pillar.body}
                </p>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      {/* Block 4 — the pricing teaser (3 cards; the Team card's 2px accent
          border is the single visual differentiation, DESIGN_SYSTEM §3). */}
      <Reveal>
        <section
          aria-labelledby="pricing-teaser-heading"
          className="mx-auto max-w-5xl px-5 py-16"
        >
          <h2
            id="pricing-teaser-heading"
            className="text-[28px] font-semibold tracking-tight text-[var(--text)] sm:text-[32px]"
          >
            Pricing
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {TEASER_PLANS.map((plan) => {
              const offer = planOffer(plan);
              const isTeam = plan === "team";
              return (
                <div
                  key={plan}
                  className={`rounded-[var(--radius-card)] p-6 ${
                    isTeam
                      ? "border-2 border-[var(--accent)]"
                      : "border border-[var(--border)]"
                  }`}
                >
                  <h3 className="text-[16px] font-semibold capitalize text-[var(--text)]">
                    {offer.plan}
                  </h3>
                  <p className="mt-2">
                    <span className="tnum text-[28px] font-semibold text-[var(--text)]">
                      {priceParts(offer).figure}
                    </span>{" "}
                    <span className="text-[13px] text-[var(--muted)]">
                      {priceParts(offer).unit}
                    </span>
                  </p>
                  <p className="mt-3 text-[14px] leading-relaxed text-[var(--muted)]">
                    {offer.positioning}
                  </p>
                  <a
                    href="/pricing/"
                    className="mt-4 inline-block text-[14px] font-medium text-[var(--accent)] underline-offset-4 hover:underline"
                  >
                    See all plans
                  </a>
                </div>
              );
            })}
          </div>
        </section>
      </Reveal>

      {/* Block 6 — the FAQ teaser (the top-5 items; the byte-equivalence rule
          WFR-204 — the same strings /faq renders, from the same array). */}
      <Reveal>
        <section
          aria-labelledby="faq-teaser-heading"
          className="mx-auto max-w-2xl px-5 py-16"
        >
          <h2
            id="faq-teaser-heading"
            className="text-[28px] font-semibold tracking-tight text-[var(--text)] sm:text-[32px]"
          >
            Questions
          </h2>
          <dl className="mt-8">
            {FAQ_TEASER.map((item) => (
              <div key={item.anchor} className="grid grid-cols-[1fr] gap-2 py-4">
                <dt className="text-[16px] font-semibold text-[var(--text)]">
                  {item.q}
                </dt>
                <dd className="text-[16px] leading-relaxed text-[var(--muted)]">
                  {item.a}
                </dd>
              </div>
            ))}
          </dl>
          <a
            href="/faq/"
            className="mt-6 inline-block text-[14px] font-medium text-[var(--accent)] underline-offset-4 hover:underline"
          >
            All questions →
          </a>
        </section>
      </Reveal>

      {/* Block 7 — the closing CTA (a full-width band, border-y, one button;
          the TAGLINE line). */}
      <Reveal>
        <section
          aria-labelledby="cta-heading"
          className="border-y border-[var(--border)] bg-[var(--surface)] py-16"
        >
          <div className="mx-auto flex max-w-2xl flex-col items-center px-5 text-center">
            <h2
              id="cta-heading"
              className="text-[28px] font-semibold tracking-tight text-[var(--text)]"
            >
              {TAGLINE}
            </h2>
            <a
              href={closingCta}
              className="mt-6 flex h-10 items-center rounded-[var(--radius-control)] bg-[var(--accent-cta)] px-5 text-[16px] font-medium text-white transition-opacity duration-100 hover:opacity-90"
            >
              Start a free review
            </a>
          </div>
        </section>
      </Reveal>
    </>
  );
}
