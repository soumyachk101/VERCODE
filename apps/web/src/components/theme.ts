"use client";

// The theme controller. VERCODE ships ONE palette: the dark indigo/red
// palette defined in globals.css (:root). There is no light variant any
// more, so the controller resolves to "dark" unconditionally and pins
// data-theme="dark" on <html> — the markup is rendered with the same
// attribute (see src/app/layout.tsx), so there is no light flash before
// hydration.
//
// The "theme" preference is still stored in localStorage so a stale
// preference from before the palette change cannot re-introduce a light
// theme, and the API surface (useTheme) is unchanged so the settings UI
// keeps working.

import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

const KEY = "vercode_theme";

function resolve(t: Theme): "dark" {
  // one palette — "light" and "system" both resolve to the dark palette.
  void t;
  return "dark";
}

export function applyTheme(_t: Theme) {
  const el = document.documentElement;
  el.setAttribute("data-theme", "dark");
}

export function useTheme() {
  // Always initialize with "system" so SSR output and initial client render match identically.
  const [theme, setTheme] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    applyTheme("dark");
    if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem(KEY) as Theme | null;
      if (stored) setTheme(stored);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    applyTheme(theme);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(KEY, theme);
    }
  }, [theme, mounted]);

  return { theme, setTheme, resolved: resolve(theme), mounted };
}
