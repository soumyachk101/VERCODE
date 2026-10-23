// /pricing (IA §3.3): "What does it cost, and which plan fits my team?"
// The plan ladder (4 cards) + the quota comparison table + the pricing FAQ
// + the closing CTA. Every number comes from the pricing/quota sources of
// truth (the WFR-203 consistency rule — a price change in one file updates
// the cards, the table, the Product/Offer JSON-LD, and llms.txt together).
import type { Metadata } from "next";
import { JsonLd } from "../../components/JsonLd";
import { Reveal } from "../../components/Reveal";
import { SITE_NAME, signinUrl, srcParam } from "../../lib/site";
import { planOffer, formatPrice, QUOTA_ROWS, type Plan } from "../../lib/pricing";
import { PRICING_FAQ } from "../../lib/faq";
import { generateSchemaFor } from "../../lib/schema-generator";

/** Split formatPrice's output into a tabular figure + a muted unit ("$24 /
 * per month", "Custom / negotiated" — the WFR-203 card spec). */
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

const META_DESCRIPTION =
  "Start free. Pay when your team grows: four plans, from a permanent Free tier at $0 to negotiated Enterprise pricing, with the exact quotas listed.";

export const metadata: Metadata = {
  title: `Pricing — ${SITE_NAME}`,
  // 120–158 chars (WFR-404's meta description band).
  description: META_DESCRIPTION,
  openGraph: {
    title: `Pricing — ${SITE_NAME}`,
    description:
      "Start free. Pay when your team grows — four plans with the exact quotas listed.",
    type: "website",
  },
};

// The plan ladder order (Free → Developer → Team → Enterprise; the
// content/pricing source of truth).
const PLAN_ORDER: Plan[] = ["free", "developer", "team", "enterprise"];

// WFR-102: the Product + Offer (×4) + FAQPage blocks come from the single
// generator (the STRUCTURED_DATA.md §2 "no hand-written JSON-LD" rule).
const schemaBlocks = generateSchemaFor({ route: "/pricing" });

// The Enterprise CTA is a mailto: in P2 (IA §3.3's "the Enterprise card is
// the 'Talk to us' variant").
// U: the exact sales address is infra-owned (the UNRESOLVED_DECISIONS §U5
// family — the domain + the contact are not yet in the repo); sales@vercode.com
// is a PLACEHOLDER, to be replaced when infra confirms the address.
const SALES_EMAIL = "sales@vercode.com";

/** Append the WFR-504 ?src=web-pricing beacon param to a CTA href. */
function withSrc(href: string): string {
  const src = srcParam("pricing");
  return href.includes("?") ? `${href}&${src.slice(1)}` : `${href}${src}`;
}

export default function Pricing() {
  return (
    <>
      <JsonLd blocks={schemaBlocks} />
      <div className="mx-auto max-w-4xl px-5 pt-16 sm:pt-20">
        <h1 className="text-[40px] font-bold tracking-tight text-[var(--text)]">
          Pricing
        </h1>
        <p className="mt-4 text-[18px] text-[var(--muted)]">
          Start free. Pay when your team grows.
        </p>
      </div>

      {/* The 4 plan cards (IA §3.3 block 2). The Team card carries the single
          2px accent border — the one visual differentiation; there is no
          "most popular" badge (the DESIGN_SYSTEM §6 ban). */}
      <Reveal>
        <section
          aria-labelledby="plans-heading"
          className="mx-auto max-w-5xl px-5 py-12"
        >
          <h2 id="plans-heading" className="sr-only">
            The plans
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PLAN_ORDER.map((plan) => {
              const offer = planOffer(plan);
              const isTeam = plan === "team";
              const isEnterprise = plan === "enterprise";
              const href = isEnterprise
                ? `mailto:${SALES_EMAIL}`
                : withSrc(signinUrl(isEnterprise ? undefined : plan));
              return (
                <div
                  key={plan}
                  className={`flex flex-col rounded-[var(--radius-card)] p-6 ${
                    isTeam
                      ? "border-2 border-[var(--accent-color)]"
                      : "border border-[var(--hard-border)]"
                  }`}
                >
                  <h3 className="text-[16px] font-semibold capitalize text-[var(--text)]">
                    {offer.plan}
                  </h3>
                  <p className="mt-3">
                    <span className="tnum text-[32px] font-semibold text-[var(--text)]">
                      {priceParts(offer).figure}
                    </span>{" "}
                    <span className="text-[13px] text-[var(--muted)]">
                      {priceParts(offer).unit}
                    </span>
                  </p>
                  <p className="mt-3 text-[16px] leading-relaxed text-[var(--muted)]">
                    {offer.positioning}
                  </p>
                  <a
                    href={href}
                    className={`mt-6 flex h-10 items-center justify-center rounded-[var(--radius-control)] px-4 text-[16px] font-medium transition-opacity duration-100 hover:opacity-90 ${
                      isTeam
                        ? "bg-[var(--accent-cta)] text-white"
                        : "border border-[var(--control)] text-[var(--text)]"
                    }`}
                  >
                    {offer.cta}
                  </a>
                </div>
              );
            })}
          </div>
        </section>
      </Reveal>

      {/* The quota comparison table (IA §3.3 block 3 — a real <table>, the
          most quotable format; the numbers are generated, never typed). */}
      <Reveal>
        <section
          aria-labelledby="quota-heading"
          className="mx-auto max-w-5xl px-5 py-12"
        >
          <h2
            id="quota-heading"
            className="text-[28px] font-semibold tracking-tight text-[var(--text)] sm:text-[32px]"
          >
            What each plan includes
          </h2>
          <div className="mt-8 overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">
                The VERCODE plan quotas, compared across the Free, Developer,
                Team, and Enterprise plans.
              </caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="border-b border-[var(--rule)] py-3 pr-4 text-[13px] font-medium text-[var(--muted)]"
                  >
                    Quota
                  </th>
                  {PLAN_ORDER.map((plan) => (
                    <th
                      key={plan}
                      scope="col"
                      className="border-b border-[var(--rule)] py-3 pr-4 text-right text-[13px] font-medium capitalize text-[var(--muted)]"
                    >
                      {plan}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {QUOTA_ROWS.map((row) => (
                  <tr key={row.label}>
                    <th
                      scope="row"
                      className="border-b border-[var(--rule)] py-3 pr-4 text-[14px] font-normal text-[var(--text)]"
                    >
                      {row.label}
                    </th>
                    {PLAN_ORDER.map((plan) => (
                      <td
                        key={plan}
                        className="tnum border-b border-[var(--rule)] py-3 pr-4 text-right text-[14px] text-[var(--muted)]"
                      >
                        {row[plan]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </Reveal>

      {/* The 6-question pricing FAQ (IA §3.3 block 4; the same strings the
          FAQPage schema carries — the WFR-204 byte-equivalence rule). */}
      <Reveal>
        <section
          aria-labelledby="pricing-faq-heading"
          className="mx-auto max-w-2xl px-5 py-12"
        >
          <h2
            id="pricing-faq-heading"
            className="text-[28px] font-semibold tracking-tight text-[var(--text)] sm:text-[32px]"
          >
            Pricing questions
          </h2>
          <dl className="mt-8">
            {PRICING_FAQ.map((item) => (
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
        </section>
      </Reveal>

      {/* The closing CTA (IA §3.3 block 5) — a raised band, no rules. */}
      <Reveal>
        <section
          aria-labelledby="pricing-cta-heading"
          className="mt-8 bg-[var(--raised)] py-16"
        >
          <div className="mx-auto flex max-w-2xl flex-col items-center px-5 text-center">
            <h2
              id="pricing-cta-heading"
              className="text-[28px] font-semibold tracking-tight text-[var(--text)]"
            >
              Start a free review
            </h2>
            <p className="mt-3 text-[16px] text-[var(--muted)]">
              The Free tier is permanent, not a trial. Install the App and see
              the first verdict on your next pull request.
            </p>
            <a
              href={withSrc(signinUrl())}
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
