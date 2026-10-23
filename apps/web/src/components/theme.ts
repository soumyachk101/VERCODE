"use client";

// The theme controller (ACCESSIBILITY / DESIGN_SYSTEM §4.3): light/dark/
// system. A <button> in the user row (or the account page) drives this;
// a :root[data-theme] swap is the one place the palette flips. The choice
// persists to localStorage. The "system" option reads prefers-color-scheme
// and follows it live (a media-query change re-themes without a reload).

import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

const KEY = "vercode_theme";

function resolve(t: Theme): "light" | "dark" {
  if (t !== "system") return t;
  if (typeof matchMedia !== "undefined") {
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

export function applyTheme(t: Theme) {
  const resolved = resolve(t);
  const el = document.documentElement;
  if (resolved === "dark") el.setAttribute("data-theme", "dark");
  else el.removeAttribute("data-theme");
}

export function useTheme() {
  // Always initialize with "system" so SSR output and initial client render match identically.
  const [theme, setTheme] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem(KEY) as Theme | null;
      if (stored) {
        setTheme(stored);
        applyTheme(stored);
        return;
      }
    }
    applyTheme("system");
  }, []);

  useEffect(() => {
    if (!mounted) return;
    applyTheme(theme);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(KEY, theme);
    }
  }, [theme, mounted]);

  useEffect(() => {
    // the "system" option follows the OS live (no reload, no flash)
    let mq: MediaQueryList | null = null;
    const onMq = () => {
      if (theme === "system") applyTheme("system");
    };
    if (typeof matchMedia !== "undefined") {
      mq = matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", onMq);
    }
    return () => {
      mq?.removeEventListener("change", onMq);
    };
  }, [theme]);

  return { theme, setTheme, resolved: resolve(theme), mounted };
}
