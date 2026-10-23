"use client";

import { usePathname, useRouter } from "next/navigation";
import { useAuthMe, useReviews, useSecurity } from "@/lib/hooks";
import { Shell, type NavItem } from "@/components/Shell";
import { LiveRegion } from "@/components/announcer";
import { useState, useEffect, type ReactNode } from "react";

/**
 * The org shell (INFORMATION_ARCHITECTURE §2): the seven destinations in
 * frequency order, Settings at the bottom, a user row at the very bottom.
 * Attention counts only on the action-queues, noun-clear ("Security 4",
 * "Failed reviews 2"). The counts are real API numbers (open high/critical;
 * skipped/failed reviews) — a down API renders no count (a count is a
 * claim, never a guess), and the queues' screens carry their own
 * in-block error states.
 */
export function useOrgShell() {
  const me = useAuthMe();
  const orgs = me.data?.orgs ?? [];
  const [activeOrgId, setActiveOrgId] = useState<string>("");

  useEffect(() => {
    const saved = sessionStorageGet();
    if (saved) setActiveOrgId(saved);
  }, []);

  const active = (activeOrgId ? orgs.find((o) => o.id === activeOrgId) : undefined) ?? orgs[0];
  const activeOrg = active?.id ?? "";

  const sec = useSecurity(activeOrg || undefined);
  const securityCount = sec?.data ? sec.data.open.critical + sec.data.open.high : null;

  const skipped = useReviews(activeOrg || undefined, { status: "skipped" });
  const failed = useReviews(activeOrg || undefined, { status: "failed" });
  const failedCount =
    skipped.data && failed.data
      ? skipped.data.items.length + failed.data.items.length
      : null;

  const pathname = usePathname();
  const activeKey = matchActive(pathname);
  const router = useRouter();

  const items: NavItem[] = [
    { key: "overview", href: "/overview", label: "Overview" },
    { key: "repositories", href: "/repositories", label: "Repositories" },
    { key: "reviews", href: "/reviews", label: "Reviews" },
    { key: "security", href: "/security", label: "Security", count: securityCount },
    { key: "usage", href: "/usage", label: "Usage & billing" },
    { key: "rules", href: "/settings/rules", label: "Rules & AI" },
    { key: "team", href: "/settings/members", label: "Team & audit" },
    { key: "failed", href: "/reviews", label: "Failed", count: failedCount, countNoun: "reviews" },
  ];
  const bottom: NavItem[] = [{ key: "settings", href: "/settings/account", label: "Settings" }];

  return {
    items,
    bottom,
    activeKey,
    orgs,
    active,
    orgName: active?.name ?? "org",
    orgPlan: active?.plan,
    user: me.data ? { name: me.data.name, email: me.data.email } : null,
    loading: me.isLoading,
    switchOrg: (id: string) => {
      if (id) sessionStorage.setItem("vercode_org", id);
      router.push("/overview");
    },
  };
}

function sessionStorageGet(): string {
  return typeof sessionStorage !== "undefined" ? sessionStorage.getItem("vercode_org") ?? "" : "";
}

function matchActive(p: string): string {
  if (p.startsWith("/repositories")) return "repositories";
  if (p.startsWith("/reviews")) return "reviews";
  if (p.startsWith("/security")) return "security";
  if (p.startsWith("/usage") || p.startsWith("/billing")) return "usage";
  if (p.startsWith("/settings/rules") || p.startsWith("/settings/providers")) return "rules";
  if (p.startsWith("/settings/members") || p.startsWith("/settings/audit")) return "team";
  if (p.startsWith("/settings")) return "team";
  return "overview";
}

export function OrgShell({ children }: { children: ReactNode }) {
  const s = useOrgShell();
  return (
    <Shell
      orgName={s.orgName}
      orgPlan={s.orgPlan}
      onSwitchOrg={s.switchOrg}
      orgOptions={s.orgs.map((o) => ({ id: o.id, name: o.name, plan: o.plan }))}
      activeOrgId={s.active?.id}
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
