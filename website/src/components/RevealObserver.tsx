"use client";

import { useEffect } from "react";

// A 1 IntersectionObserver for the whole site (DESIGN_SYSTEM_AND_TYPOGRAPHY.md
// §5: the one-time scroll-reveal, "a single subtle fade" — a `WNFR-01`'s
// JS-cap rule: one observer + a shared set, NOT one per element).
//
// The module-level `observer` is created lazily, on the first
// `observeReveal()` call (the `RevealObserver` mount OR a `Reveal`
// element). When the observed set drains (a `is-in` on every element),
// the observer disconnects + nulls itself, so a page with no further
// reveals costs nothing.

let observer: IntersectionObserver | null = null;
const observed = new Set<Element>();

// The safety net: if a `.reveal` element's intersection callback never
// fires (a headless browser, a broken / absent `IntersectionObserver`,
// a late-mount on a client-side routed page), a 1.5s timer force-adds
// `is-in` to every still-un-revealed element — so a broken observer
// can never leave content hidden. Reduced-motion users get `is-in`
// synchronously, so they never wait.
let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFallback(): void {
  if (fallbackTimer !== null) {
    return;
  }
  fallbackTimer = setTimeout(() => {
    fallbackTimer = null;
    for (const el of observed) {
      el.classList.add("is-in");
    }
    observed.clear();
    if (observer !== null) {
      observer.disconnect();
      observer = null;
    }
  }, 1500);
}

function cancelFallback(): void {
  if (fallbackTimer !== null) {
    clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }
}

function ensureObserver(): IntersectionObserver {
  if (observer !== null) {
    return observer;
  }
  observer = new IntersectionObserver(
    (entries, obs) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) {
          continue;
        }
        entry.target.classList.add("is-in");
        obs.unobserve(entry.target);
        observed.delete(entry.target);
      }
      // A drained set means "everything is revealed" — disconnect +
      // drop the reference (a `WNFR-01`'s "zero-JS default" spirit:
      // the observer is a one-time effect, not a persistent listener).
      if (observed.size === 0) {
        obs.disconnect();
        if (observer === obs) {
          observer = null;
        }
        cancelFallback();
      }
    },
    { threshold: 0.1, rootMargin: "0px 0px -10% 0px" },
  );
  return observer;
}

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Register one `.reveal` element with the site's single
 * IntersectionObserver. Exported so `Reveal.tsx` can call it directly
 * (a `useEffect` + a ref) without instantiating its own observer
 * (the `WNFR-01`'s JS-cap rule: one observer, not one per element).
 *
 * A reduced-motion user (`WNFR-08`) gets the `is-in` class immediately
 * (a CSS-only path, a `PERFORMANCE_AND_ACCESSIBILITY.md`'s
 * "no-animation under reduced-motion" rule) + the observer is skipped.
 */
export function observeReveal(el: Element): void {
  if (reducedMotion()) {
    el.classList.add("is-in");
    return;
  }
  const obs = ensureObserver();
  observed.add(el);
  obs.observe(el);
  // The fallback, so a broken IntersectionObserver never hides content.
  scheduleFallback();
}

/**
 * The site's one-time scroll-reveal mount. On mount, register every
 * `.reveal:not(.is-in)` element already in the DOM with the shared
 * observer; a reduced-motion user gets `is-in` on everything + the
 * observer is skipped.
 *
 * Rendered ONCE in `src/app/layout.tsx` (the root layout) — the
 * `Reveal.tsx` client wrapper uses `observeReveal()` directly, so
 * this mount is the page-level "register everything that's already
 * rendered" pass.
 */
export function RevealObserver(): null {
  useEffect(() => {
    const els = Array.from(
      document.querySelectorAll<HTMLElement>(".reveal:not(.is-in)"),
    );
    if (reducedMotion()) {
      // A `WNFR-08`: no animation; every element gets `is-in`
      // immediately (the CSS default `.js .reveal.is-in` is
      // `opacity: 1; transform: none`).
      for (const el of els) {
        el.classList.add("is-in");
      }
      return;
    }
    for (const el of els) {
      observeReveal(el);
    }
  }, []);

  return null;
}
