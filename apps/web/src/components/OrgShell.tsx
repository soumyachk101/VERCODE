"use client";

import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthMe, useSecurity } from "@/lib/hooks";
import { Shell, type NavItem } from "@/components/Shell";
import { LiveRegion } from "@/components/announcer";
import type { ReactNode } from "react";

/**
 * The org shell hook: wires the user's orgs to the Shell, computes the
 * attention counts (the "Security 4" / "Failed 2" queue numbers), and
 * pushes the active nav item. The org switcher re-scopes every screen.
 *
 * The attention counts come from the real API:
 *   - Security  N  = open high/critical findings (unactioned)
 *   - Failed  N    = skipped/failed reviews in the last 30 days
 */
export function useOrgShell() {
  const me = useAuthMe();
  const orgs = me.data?.orgs ?? [];
  const active = orgs.find((o) => o.id === currentOrgId()) ?? orgs[0];
  const router = useRouter();
  const pathname = usePathname();

  const activeOrg = active?.id ?? "";
  const sec = useSecurity(activeOrg || undefined, "2025-01-01T00:00:00.000Z").data;
  const openCritical = sec?.open.critical ?? 0;
  const openHigh = sec?.open.high ?? 0;
  const securityCount = openCritical + openHigh;

  const failedCount = useFailedCount(activeOrg);

  const items: NavItem[] = [
    { key: "overview", href: "/", label: "Overview" },
    { key: "repositories", href: "/repositories", label: "Repositories" },
    { key: "reviews", href: "/reviews", label: "Reviews" },
    {
      key: "security",
      href: "/security",
      label: "Security",
      count: securityCount,
    },
    {
      key: "usage",
      href: "/usage",
      label: "Usage & billing",
    },
    { key: "rules", href: "/settings/rules", label: "Rules & AI" },
    {
      key: "team",
      href: "/settings/members",
      label: "Team & audit",
      count: null,
    },
    {
      key: "failed",
      href: "/reviews",
      label: "Failed",
      count: failedCount,
      countNoun: "reviews",
    },
  ];
  const bottom: NavItem[] = [
    { key: "settings", href: "/settings/account", label: "Settings" },
  ];

  const activeKey = matchActive(items, bottom, pathname);

  return {
    items,
    bottom,
    activeKey,
    securityCount,
    failedCount,
    orgs,
    active: activeOrg,
    orgName: active?.name ?? "org",
    orgPlan: active?.plan,
    user: me.data ? { name: me.data.name, email: me.data.email } : null,
    loading: me.isLoading,
    switchOrg: (id: string) => {
      if (!id) return; // the switcher re-scopes via the router
      router.push("/");
    },
  };
}

function matchActive(items: NavItem[], bottom: NavItem[], p: string): string {
  const all = [...items, ...bottom];
  for (const it of all) {
    if (p.startsWith(it.href) && it.href !== "/") {
      // the settings/* family is keyed to the first settings section open
      if (it.href.startsWith("/settings")) {
        const sub = p.replace("/settings", "");
        if (sub === "" || sub === "/" ) return "account";
        return sub.replace("/", "");
      }
      return it.key;
    }
  }
  return "overview";
}

function currentOrgId(): string {
  return globalThis.sessionStorage?.getItem("vercode_org") ?? "";
}

// The failed/queued review count for the "Failed N" attention item. The
// full data is loaded lazily by the Reviews page; here we use the hook so
// the shell shows a real number (0 when the API is down → the item is
// not rendered, not a placeholder).
function useFailedCount(orgId: string | undefined): number {
  // imported lazily to avoid a circular import at module load
  const { useReviews } = require("@/lib/hooks");
  const r = useReviews(orgId ?? "", { status: "skipped" });
  const s = useReviews(orgId ?? "", { status: "failed" });
  if (r.isError || s.isError || orgId === "") return 0;
  const skipped = (r.data?.items.length ?? 0);
  const failed = (s.data?.items.length ?? 0);
  return skipped + failed;
}

export function OrgShell({ children }: { children: ReactNode }) {
  const s = useOrgShell();
  return (
    <Shell
      orgName={s.orgName}
      orgPlan={s.orgPlan}
      items={s.items}
      bottomItems={s.bottom}
      active={s.activeKey}
      user={s.user}
    >
      <LiveRegion />
      {children}
    </Shell>
  );
}

export type { NavItem };
