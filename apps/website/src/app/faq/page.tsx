// /faq (INFORMATION_ARCHITECTURE_AND_PAGES.md §3.4): "Will it do the
// specific thing I'm worried about?" The 16 canonical questions in 4
// groups, rendered as a <dl> (the DESIGN_SYSTEM §3 FAQ rule — a
// definition list, no accordion in P2) + a right-rail TOC on desktop
// (a sticky <aside>, hidden <lg).
//
// Byte-equivalence (WFR-204 / SEO_AEO_GEO.md §3.3): the visible answer
// and the FAQPage JSON-LD's acceptedAnswer.text are both read from
// lib/faq.ts's FAQ_ITEMS — the same string, generated once. The FAQPage
// block below is emitted by the schema-generator (the "no hand-written
// JSON-LD" rule, STRUCTURED_DATA.md §2); it uses the same FAQ_ITEMS.
import type { Metadata } from "next";
import { FAQ_ITEMS, FAQ_GROUPS, type FaqGroup } from "@/lib/faq.js";
import { generateSchemaFor } from "@/lib/schema-generator.js";
import { JsonLd } from "@/components/JsonLd.js";
import { SITE_NAME } from "@/lib/site.js";

// 120–158 chars (WFR-102's meta description band; the on-page gate).
const FAQ_META_DESCRIPTION =
  "Sixteen questions, literal answers: review latency, the 0.6 confidence floor, what is stored and purged, the 5 App scopes, the quota rules, and the license.";

export const metadata: Metadata = {
  title: `FAQ — ${SITE_NAME}`,
  description: FAQ_META_DESCRIPTION,
};

// The FAQPage block (the full 16; the schema-generator's /faq case reads
// FAQ_ITEMS from lib/faq.js, so the visible text and the JSON-LD text
// are the same string — the byte-equivalence rule, WFR-204).
const schemaBlocks = generateSchemaFor({
  route: "/faq",
  title: "FAQ",
  metaDescription: FAQ_META_DESCRIPTION,
  breadcrumbTrail: [
    { name: "Vercode", url: "/" },
    { name: "FAQ", url: "/faq/" },
  ],
});

/** A group's items, in the FAQ_ITEMS order (the §3.4 table's order). */
function itemsFor(group: FaqGroup) {
  return FAQ_ITEMS.filter((i) => i.group === group);
}

/** A group's anchor id (the TOC's target; a slug of the group label). */
function groupId(group: FaqGroup): string {
  return group.replace(/-/g, "-");
}

export default function FaqPage() {
  return (
    <main>
      <JsonLd blocks={schemaBlocks} />

      <div className="mx-auto flex max-w-4xl gap-10 px-5 pt-14">
        {/* The content column. */}
        <div className="min-w-0 flex-1">
          <h1 className="text-[40px] font-bold tracking-tight text-[var(--text)]">
            Questions, answered
          </h1>

          {/* The 4-group <dl>. Each group is a 13px/600 --faint label
              (sentence case, no uppercase — the DESIGN_SYSTEM §2 ban on
              uppercase labels); each question is a <dt> 16px/600 and
              each answer a <dd> 15px/1.6 --muted. The answers are the
              verbatim FAQ_ITEMS strings (the byte-equivalence rule). */}
          <dl>
            {FAQ_GROUPS.map((g) => {
              const items = itemsFor(g.id);
              if (items.length === 0) return null;
              return (
                <div key={g.id} id={groupId(g.id)} className="mb-10">
                  <dt className="text-[13px] font-semibold text-[hsl(var(--faint))]">
                    {g.label}
                  </dt>
                  <div className="mt-3 space-y-5">
                    {items.map((item) => (
                      <div key={item.anchor} className="border-t border-[var(--rule)] pt-4">
                        <dt className="text-[16px] font-semibold text-[var(--text)]">
                          {item.q}
                        </dt>
                        <dd className="mt-1 text-[15px] leading-[1.6] text-[hsl(var(--muted))]">
                          {item.a}
                        </dd>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </dl>
        </div>

        {/* The right-rail TOC — a sticky <aside>, hidden <lg (IA §3.4's
            TOC rule; the "On this page" label is 13px, sentence case). */}
        <aside className="sticky top-24 hidden w-44 shrink-0 self-start lg:block">
          <p className="text-[13px] font-medium text-[hsl(var(--faint))]">
            On this page
          </p>
          <nav aria-label="On this page" className="mt-3">
            <ul className="space-y-2 border-l border-[var(--rule)]">
              {FAQ_GROUPS.map((g) => (
                <li key={g.id}>
                  <a
                    href={`#${groupId(g.id)}`}
                    className="block border-l border-transparent pl-3 text-[13px] text-[hsl(var(--muted))] transition-colors hover:border-[hsl(var(--accent))] hover:text-[var(--text)]"
                  >
                    {g.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
      </div>
    </main>
  );
}
