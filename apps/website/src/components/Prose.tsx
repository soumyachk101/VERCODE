import type { ReactNode } from "react";

// The markdown-prose wrapper (the docs / blog / changelog / legal
// pages). A `<div className="prose-vercode">` around a child
// `<article>`, styled by `src/styles/prose.css` (imported in
// `src/app/layout.tsx`).
//
// A 72ch measure (45rem, the DESIGN_SYSTEM_AND_TYPOGRAPHY.md §3
// reading-column rule). The markdown renderer (a page's job) emits
// the semantic tags; this wrapper is the element + the one CSS hook.
//
// The optional `toc` right rail (a sticky <nav aria-label="On this
// page"> with anchor links, hidden on mobile) is the > 3-sections
// TOC rule (IA §3.5's "a right rail on desktop, a collapsible
// <details> on mobile, for a page with > 3 sections" — the P2 cut
// ships the sticky rail only; the mobile <details> variant is the
// same entry list, a P3 nicety). The 11rem rail width is the
// DESIGN_SYSTEM's TOC spec.

export interface TocEntry {
  /** The heading's id (the anchor target the renderer's slugify emits). */
  id: string;
  /** The heading's text (the visible label in the rail). */
  label: string;
}

export interface ProseProps {
  /** The rendered body (a page's renderMarkdown output). */
  readonly children: ReactNode;
  /** The ## / ### heading entries, in document order. */
  readonly toc?: readonly TocEntry[];
}

export function Prose({ children, toc }: ProseProps) {
  // The TOC shows only when the doc has more than 3 sections (IA §3.5's
  // "> 3 sections" rule — a 3-section doc is short enough not to need
  // a TOC; the mobile <details> variant for the > 3 case is P3).
  const showToc = (toc?.length ?? 0) > 3;

  return (
    <div className="prose-vercode mx-auto flex justify-center gap-10">
      <div className="w-full min-w-0 flex-1">
        <article>{children}</article>
      </div>

      {showToc && toc && (
        <nav
          aria-label="On this page"
          className="sticky top-24 hidden w-44 shrink-0 self-start lg:block"
        >
          <p className="text-[13px] font-medium text-[hsl(var(--faint))]">
            On this page
          </p>
          <ul className="mt-3 space-y-2 border-l border-[var(--rule)]">
            {toc.map((e) => (
              <li key={e.id}>
                <a
                  href={`#${e.id}`}
                  className="block border-l border-transparent pl-3 text-[13px] text-[hsl(var(--muted))] transition-colors hover:border-[var(--accent-color)] hover:text-[var(--text)]"
                >
                  {e.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
