"use client";

import { useCallback, type CSSProperties, type ReactNode } from "react";
import { observeReveal } from "./RevealObserver.js";

type RevealTag = "div" | "li" | "section";

/**
 * The `Reveal` stagger cap (DESIGN_SYSTEM_AND_TYPOGRAPHY.md §5's
 * "a restrained" rule — the `emil-design-eng` "staggered 60–90ms"
 * between siblings, capped so a long list never feels slow: the last
 * sibling in a 4-item grid waits at most 240ms).
 */
const STAGGER_STEP_MS = 60;
const STAGGER_CAP_MS = 240;

interface RevealProps {
  /** The element to render (a `div`, a `li`, or a `section`). */
  readonly as?: RevealTag;
  /** Extra classes to add on top of `.reveal`. */
  readonly className?: string;
  /**
   * The position of this `Reveal` among same-parent siblings: a
   * `transition-delay` of `index * 60ms` (capped at `240ms`), so a
   * card grid cascades 60ms-per-item instead of appearing at once.
   * Omit for a single, non-staggered reveal.
   */
  readonly dataStagger?: number;
  readonly children?: ReactNode;
}

/**
 * A 1-element `.reveal` wrapper for the site's one-time scroll-reveal
 * (DESIGN_SYSTEM_AND_TYPOGRAPHY.md §5). The element registers itself
 * with the shared `IntersectionObserver` via `observeReveal()` — no
 * per-element observer (the `WNFR-01`'s JS-cap rule: one observer for
 * the whole site).
 *
 * A reduced-motion user gets `is-in` immediately (the `observeReveal`
 * branch, `WNFR-08`).
 *
 * The `as` prop is a small, typed union (a `div` / a `li` / a
 * `section`) so the reveal element is always a block-ish semantic
 * container.
 */
export function Reveal({
  as = "div",
  className,
  dataStagger = 0,
  children,
}: RevealProps) {
  // A stable callback ref (a `useCallback` — a stable identity across
  // renders so the ref is only called on mount/unmount, not every
  // render).
  const register = useCallback(
    (el: HTMLElement | null) => {
      if (el === null) {
        return;
      }
      // Stagger a same-parent reveal: a `transition-delay` of
      // `index * 60ms`, capped at `240ms` so a long list never feels
      // slow (the §5 "restrained" rule — a `emil-design-eng`
      // "staggered, but capped" note). The delay is set only on
      // mount (a `data-staggered` marker) so the value is not
      // re-computed on every render; a `0` stagger sets no marker.
      if (dataStagger > 0 && !el.hasAttribute("data-staggered")) {
        const delayMs = Math.min(dataStagger * STAGGER_STEP_MS, STAGGER_CAP_MS);
        el.style.transitionDelay = `${delayMs}ms`;
        el.setAttribute("data-staggered", "");
      }
      observeReveal(el);
    },
    [dataStagger],
  );

  // During the transition only: a `will-change: opacity, transform`
  // (an `emil-design-eng` performance rule — hint the compositor while
  // the reveal is in flight, never keep it on for the page's life).
  // The `.js .reveal.is-in` rule's `transition-delay: 0s` also resets
  // any stagger on the revealed state, so the inline delay affects only
  // the opacity/transform travel, not a later CSS state change.
  const style: CSSProperties | undefined =
    dataStagger > 0 ? { willChange: "opacity, transform" } : undefined;

  const cls = className ? `reveal ${className}` : "reveal";

  if (as === "li") {
    return (
      <li ref={register} className={cls} style={style}>
        {children}
      </li>
    );
  }
  if (as === "section") {
    return (
      <section ref={register} className={cls} style={style}>
        {children}
      </section>
    );
  }
  return (
    <div ref={register} className={cls} style={style}>
      {children}
    </div>
  );
}
