"use client";

import { useCallback, type ReactNode } from "react";
import { observeReveal } from "./RevealObserver.js";

type RevealTag = "div" | "li" | "section";

interface RevealProps {
  /** The element to render (a `div`, a `li`, or a `section`). */
  readonly as?: RevealTag;
  /** Extra classes to add on top of `.reveal`. */
  readonly className?: string;
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
export function Reveal({ as = "div", className, children }: RevealProps) {
  // A stable callback ref (a `useCallback` — a stable identity across
  // renders so the ref is only called on mount/unmount, not every
  // render).
  const register = useCallback((el: HTMLElement | null) => {
    if (el) {
      observeReveal(el);
    }
  }, []);

  const cls = className ? `reveal ${className}` : "reveal";

  if (as === "li") {
    return (
      <li ref={register} className={cls}>
        {children}
      </li>
    );
  }
  if (as === "section") {
    return (
      <section ref={register} className={cls}>
        {children}
      </section>
    );
  }
  return (
    <div ref={register} className={cls}>
      {children}
    </div>
  );
}
