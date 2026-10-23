/**
 * /changelog/<date> — the per-entry page (INFORMATION_ARCHITECTURE_AND_PAGES.md §3.6).
 *
 * The full entry: all sections + bullets, a CreativeWork JSON-LD
 * (STRUCTURED_DATA.md §1's /changelog/<date> row), a visible breadcrumb
 * ("Changelog / vX.Y.Z" at 13px var(--faint)), and a "Next release"
 * link back to /changelog/.
 *
 * The "Upgrade notes" rule (§3.6's "when a breaking change exists"): a
 * section that includes Deprecated or Removed gets an "Upgrade notes"
 * block. Neither current entry has one, so the section is absent — the
 * conditional below carries the rule; a future entry with either section
 * gets the notes automatically.
 */
import { notFound } from "next/navigation";
import { readChangelog } from "@/lib/content-store.js";
import { generateSchemaFor } from "@/lib/schema-generator.js";
import { JsonLd } from "@/components/JsonLd.js";

const BREAKING_SECTIONS = new Set(["Deprecated", "Removed"]);

export function generateStaticParams(): { date: string }[] {
  return readChangelog()
    .filter((e) => e.status === "published")
    .map((e) => ({ date: e.date }));
}

function sectionsOf(body: string): { name: string; items: string[] }[] {
  // Strip the author's <!-- U-item --> comment (internal note, not content).
  const clean = body.replace(/<!--[\s\S]*?-->/g, "");
  const sections: { name: string; items: string[] }[] = [];
  for (const block of clean.split(/\n(?=## )/)) {
    const m = block.match(/^## (.+)\n?([\s\S]*)$/);
    if (!m) continue;
    const name = m[1].trim();
    const items = m[2]
      .split("\n")
      .map((l) => l.replace(/^[-*] ?/, "").trim())
      .filter((l) => l.length > 0);
    sections.push({ name, items });
  }
  return sections;
}

export default async function ChangelogEntryPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  const entry = readChangelog().find((e) => e.date === date);
  if (!entry || entry.status !== "published") notFound();

  const sections = sectionsOf(entry.body);
  // The rule: "Upgrade notes" shows only when the entry has a
  // Deprecated/Removed section (§3.6's "when a breaking change exists").
  const hasBreaking = sections.some((s) => BREAKING_SECTIONS.has(s.name));
  const breaking = sections.filter((s) => BREAKING_SECTIONS.has(s.name));
  const blocks = generateSchemaFor({
    route: `/changelog/${entry.date}`,
    title: `v${entry.version} — ${entry.title}`,
    metaDescription: entry.summary,
    author: entry.author,
    datePublished: entry.date,
    breadcrumbTrail: [
      { name: "Vercode", url: "/" },
      { name: "Changelog", url: "/changelog/" },
      { name: `v${entry.version}`, url: `/changelog/${entry.date}/` },
    ],
  });

  return (
    <main className="reading-col" style={{ margin: "0 auto", padding: "4rem 1.5rem" }}>
      <style>{`
        .ce-bc { font-size: 13px; color: var(--faint); margin: 0 0 2rem; }
        .ce-bc a { color: var(--faint); text-decoration: none; }
        .ce-bc a:hover { color: var(--accent-ink); }
        .ce-meta { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem; }
        .ce-time { font-size: 13px; color: var(--faint); }
        .ce-chip { font-family: var(--font-mono); font-size: 12px; padding: 2px 8px; border: 1px solid var(--hard-border); border-radius: var(--radius-chip); color: var(--muted); }
        .ce h1 { font-size: 32px; font-weight: 600; margin: 0 0 0.5rem; }
        .ce-summary { font-size: 16px; color: var(--muted); margin: 0 0 2rem; line-height: 1.6; }
        .ce-sec { font-size: 13px; font-weight: 600; letter-spacing: 0.05em; color: var(--faint); margin: 0 0 0.375rem; }
        .ce ul { margin: 0 0 1.5rem; padding-left: 1.25rem; font-size: 16px; line-height: 1.6; }
        .ce li { margin-bottom: 0.375rem; }
        .ce li code { font-family: var(--font-mono); font-size: 0.85em; background: var(--raised); padding: 0.1em 0.35em; border-radius: var(--radius-chip); }
        .ce-upgrade { margin: 0 0 1.5rem; padding: 1rem; background: var(--raised); border-radius: var(--radius-card); font-size: 16px; }
        .ce-upgrade h2 { font-size: 16px; font-weight: 600; margin: 0 0 0.5rem; }
        .ce-next { margin-top: 3rem; padding-top: 1.5rem; font-size: 16px; }
        .ce-next a { color: var(--accent-ink); }
      `}</style>

      <JsonLd blocks={blocks} />

      {/* The visible breadcrumb — 13px var(--faint): "Changelog / vX.Y.Z". */}
      <p className="ce-bc">
        <a href="/changelog/">Changelog</a> / v{entry.version}
      </p>

      <div className="ce-meta">
        <time dateTime={entry.date} className="ce-time">{entry.date}</time>
        <span className="ce-chip">v{entry.version}</span>
      </div>
      <h1>{entry.title}</h1>
      <p className="ce-summary">{entry.summary}</p>

      {/* The "Upgrade notes" section — present ONLY when a section includes
          Deprecated/Removed (the §3.6 rule; neither entry has one, so it is
          absent in P2). */}
      {hasBreaking && (
        <section className="ce-upgrade">
          <h2>Upgrade notes</h2>
          <p>
            This release {breaking.map((s) => s.name.toLowerCase()).join(" + ")}.
            Read the items before upgrading:
          </p>
          {breaking.map((s) => (
            <ul key={s.name}>
              {s.items.map((item, ix) => (
                <li key={ix}>{item}</li>
              ))}
            </ul>
          ))}
        </section>
      )}

      {sections.map((s) =>
        s.items.length > 0 ? (
          <div key={s.name}>
            <p className="ce-sec">{s.name}</p>
            <ul>
              {s.items.map((item, ix) => (
                <li key={ix}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null,
      )}

      <p className="ce-next">
        <a href="/changelog/">Next release</a>
      </p>
    </main>
  );
}
