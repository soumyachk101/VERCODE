"use client";

import { useEffect, useState } from "react";

/**
 * A true once `window.scrollY > threshold` (a sticky-header border,
 * DESIGN_SYSTEM_AND_TYPOGRAPHY.md §3: "a 1px bottom border appears on
 * scroll" — no shadow, just a line).
 *
 * The listener is passive + a 100ms debounce (the site's "a hover is an
 * instant feedback, 100ms" tempo applied to scroll state). The state is
 * rAF-free: a debounced setTimeout is cheap enough and keeps the code
 * trivially testable.
 */
export function useScrolled(threshold: number, debounceMs: number): boolean {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let timer: number | undefined;

    const update = () => {
      setScrolled(window.scrollY > threshold);
    };

    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(update, debounceMs);
    };

    // The initial state must reflect the *current* scroll position (a
    // mid-page reload), not just future scrolling.
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.clearTimeout(timer);
    };
  }, [threshold, debounceMs]);

  return scrolled;
}
