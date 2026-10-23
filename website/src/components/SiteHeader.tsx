"use client";

import { useEffect, useRef, useState } from "react";
import { HEADER_CTA_HREF, NEXT_LINKS } from "./nav-links.js";

// The marketing header (IA §4 + DESIGN_SYSTEM_AND_TYPOGRAPHY.md §3):
// the product mark + the wordmark (left); the 5-link nav + the one CTA
// (right). A sticky header with a 1px bottom border that *appears* on
// scroll (no shadow — the "a 1px line separates surfaces" rule).
//
// The CTA href is `HEADER_CTA_HREF` from `nav-links.js` (the
// `WFR-501/502` primary CTA: `/signin` + a `?src=web-header` beacon
// param, `WFR-504`), built in that module from `lib/site.ts`'s
// `signinUrl` + `srcParam` — one source of truth for every CTA on the
// site.

export function SiteHeader() {
  const [sheetOpen, setSheetOpen] = useState(false);

  // The mobile sheet: a `position: fixed inset-0` overlay with a scrim
  // + the nav + the CTA. A `role="dialog"` + `aria-modal`, a focus on
  // the trigger on close, Escape closes. The trigger is a real
  // `<button>` (a `aria-expanded` + `aria-controls`); Tab order is
  // trigger → sheet links → (back to trigger on close). No
  // `tabindex > 0` anywhere.
  const triggerRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const openSheet = () => {
    setSheetOpen(true);
  };

  const closeSheet = () => {
    setSheetOpen(false);
    // A focus return to the trigger (the "back to trigger on close"
    // step — the trigger is a real `<button>`, so `focus()` is
    // keyboard-safe).
    triggerRef.current?.focus();
  };

  // An Escape closes the sheet. The handler is attached to the document
  // while the sheet is open (not just the sheet's own `onKeyDown`): the
  // trigger keeps focus after opening ("focus-trap by keeping focus on
  // the trigger"), so a keydown fired on the trigger — outside the
  // sheet — must still close it.
  useEffect(() => {
    if (!sheetOpen) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeSheet();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  // The sheet is mobile-only chrome: if the viewport grows past 768px
  // while it's open (a rotation / a window resize), close it so the
  // fixed overlay never renders on desktop.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => {
      if (mq.matches) {
        setSheetOpen(false);
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <header className="site-header">
      <div className="container flex h-14 items-center justify-between">
        {/* The product mark + the wordmark (left). The mark lives in
            `public/vercode-mark.svg` so the OG image + the favicon can
            reuse it (a single brand asset on disk, the
            `STRUCTURED_DATA.md` logo path). */}
        <a href="/" className="flex items-center gap-2.5" aria-label="Vercode — home">
          <img
            src="/vercode-mark.svg"
            alt=""
            width={20}
            height={20}
            className="shrink-0 text-[var(--text)]"
          />
          <span className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--text)]">
            Vercode
          </span>
        </a>

        {/* The desktop nav (≥ 768px): the 5 links + the one CTA. */}
        <nav aria-label="Primary" className="hidden items-center gap-6 md:flex">
          {NEXT_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="nav-link">
              {link.label}
            </a>
          ))}
          <a
            href={HEADER_CTA_HREF}
            className="btn-cta"
            data-beacon-src="web-header"
          >
            Start a free review
          </a>
        </nav>

        {/* The mobile toggle (< 768px): a real `<button>` with an
            `aria-expanded` + `aria-controls`; the sheet is the
            `role="dialog"` overlay below. */}
        <button
          ref={triggerRef}
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] text-[var(--text)] transition-colors duration-100 hover:bg-[var(--raised)] md:hidden"
          aria-expanded={sheetOpen}
          aria-controls="site-header-sheet"
          aria-label={sheetOpen ? "Close navigation menu" : "Open navigation menu"}
          onClick={() => (sheetOpen ? closeSheet() : openSheet())}
        >
          <MobileMenuGlyph open={sheetOpen} />
        </button>
      </div>

      {/* The mobile sheet (a `position: fixed inset-0` + a scrim).
          An enter-only `@starting-style` animation lives in
          `globals.css` (a `#site-header-sheet` + a
          `.site-header-sheet-panel` + a `.site-header-sheet-scrim`
          150ms opacity+translateY travel, skipped under
          `prefers-reduced-motion`). The sheet unmounts on close, so
          an exit animation is not needed (a `DESIGN_SYSTEM_AND_TYP-
          OGRAPHY.md` §5's "no exit" note: the sheet is a few links
          away from the next page). */}
      {sheetOpen && (
        <div
          ref={sheetRef}
          id="site-header-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Site navigation"
          className="fixed inset-0 z-50 md:hidden"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              closeSheet();
            }
          }}
        >
          {/* The scrim: a click on it closes the sheet (the "a
              scrim click + an Escape" close affordance — no
              explicit close button). The `.site-header-sheet-scrim`
              class is the `@starting-style` hook in `globals.css`. */}
          <span
            aria-hidden="true"
            className="site-header-sheet-scrim absolute inset-0 block cursor-default bg-[rgba(28,25,23,0.45)]"
            onClick={closeSheet}
          />
          {/* The top panel: the nav + the CTA. A
              `.site-header-sheet-panel` `@starting-style` 150ms
              opacity+translateY(8px) travel — the one "mount"
              moment in the site's motion set (§5's `emil-design-
              eng` rule). */}
          <div className="site-header-sheet-panel absolute inset-x-0 top-0 border-b border-[var(--hard-border)] bg-[var(--surface)]">
            <nav aria-label="Primary (mobile)" className="container flex flex-col py-4">
              <ul className="flex flex-col">
                {NEXT_LINKS.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      onClick={closeSheet}
                      className="block py-4 text-[16px] font-medium text-[var(--text)]"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
                <li>
                  <a
                    href={HEADER_CTA_HREF}
                    onClick={closeSheet}
                    className="btn-cta mt-4 w-full"
                    data-beacon-src="web-header"
                  >
                    Start a free review
                  </a>
                </li>
              </ul>
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}

// A 20×20 mobile menu glyph (a `X` when open, a hamburger when
// closed) — hand-written, `currentColor`, no stock icon library (the
// "no stock icon" rule).
function MobileMenuGlyph({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg
        viewBox="0 0 20 20"
        width={20}
        height={20}
        fill="none"
        aria-hidden="true"
        className="text-[var(--text)]"
      >
        <path
          d="M5 5l10 10M15 5L5 15"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 20 20"
      width={20}
      height={20}
      fill="none"
      aria-hidden="true"
      className="text-[var(--text)]"
    >
      <path
        d="M3.5 6h13M3.5 10h13M3.5 14h13"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </svg>
  );
}

