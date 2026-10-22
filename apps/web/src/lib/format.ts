// Small format helpers: relative dates, money, severity word-pairing,
// initials. All deterministic (no Math.random — a hash keeps avatar hues
// stable across renders, per-person, ≥60° apart in practice).

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const s = Math.max(0, (Date.now() - then) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 14) return `${d}d ago`;
  if (d < 60) return `${Math.floor(d / 7)}w ago`;
  return new Date(then).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function timeOfDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "—";
  return t.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function shortSha(sha: string | null | undefined): string {
  if (!sha) return "—";
  return sha.slice(0, 8);
}

export function money(usd: number | null | undefined, opts: { dashWhenMissing?: boolean } = {}): string {
  if (usd == null || Number.isNaN(usd)) {
    return opts.dashWhenMissing === false ? "$0.00" : "—";
  }
  return `$${usd.toFixed(2)}`;
}

export function percent(p: number | null | undefined): string {
  if (p == null || Number.isNaN(p)) return "—";
  return `${Math.round(p * 100)}%`;
}

export function num(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US").format(n);
}

/** "4 high, 2 critical" — the verdict-lead figure string. */
export function openFindingsLead(open: { high: number; critical: number }): string {
  const parts: string[] = [];
  if (open.critical > 0) parts.push(`${open.critical} critical`);
  if (open.high > 0) parts.push(`${open.high} high`);
  return parts.length ? parts.join(", ") : "0 open above the floor";
}

export function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** A stable per-person hue (app-screens §2.3 — two people ≥60° apart). */
export function personHue(idOrName: string): number {
  let h = 0;
  for (let i = 0; i < idOrName.length; i++) {
    h = (h * 31 + idOrName.charCodeAt(i)) % 360;
  }
  return h;
}

export function verdictWord(summary: {
  verdict?: string;
  highSeverityCount?: number;
} | null | undefined): string {
  if (!summary) return "—";
  if (summary.verdict) return summary.verdict;
  if (typeof summary.highSeverityCount === "number") {
    if (summary.highSeverityCount === 0) return "Likely mergeable";
    if (summary.highSeverityCount <= 2) return "Needs changes";
    return "High risk";
  }
  return "—";
}
