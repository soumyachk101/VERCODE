"use client";

import { usePathname, useRouter } from "next/navigation";
import { useAuthMe, useReviews, useSecurity, useSignOutAll } from "@/lib/hooks";
import { Shell, type NavItem } from "@/components/Shell";
import { LiveRegion } from "@/components/announcer";
import { useState, useEffect, type ReactNode } from "react";
import { api } from "@/lib/api";

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

  // Sign out: revoke the session server-side, then back to the sign-in
  // surface (a hard replace — the shell must not stay mounted).
  const signOut = async () => {
    try {
      await api.post("/auth/signout");
    } catch {
      // an unreachable API still clears the client-side state below
    }
    router.replace("/signin");
  };

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
    me,
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
  const router = useRouter();
  // No session yet (loading), or a session that has no orgs (a fresh
  // account mid-bootstrap, a 401 /me, a down dashboard API): render the
  // shell chrome with a designed empty state — no blank page, no
  // redirect loop. The empty state offers the one action that fits:
  // "create your organization" (a valid session without an org) or
  // "sign in" (no session / API problem).
  if (s.me.isLoading || s.orgs.length === 0) {
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
        <EmptyShellState hasSession={!!s.user} onSignOut={s.user ? () => s.signOut() : undefined} />
        {children}
      </Shell>
    );
  }
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
      onSignOut={s.signOut}
    >
      <LiveRegion />
      {children}
    </Shell>
  );
}

function EmptyShellState({
  hasSession,
  onSignOut,
}: {
  hasSession: boolean;
  onSignOut?: () => void;
}) {
  const router = useRouter();
  return (
    <div
      style={{
        padding: "48px 0",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        maxWidth: 420,
      }}
    >
      <h1 className="h1" style={{ margin: 0, fontSize: 22, color: "var(--text)" }}>
        {hasSession ? "Create your organization" : "Sign in to continue"}
      </h1>
      <p className="finding-line" style={{ margin: 0 }}>
        {hasSession
          ? "Your account is signed in but has no organization yet — create one to hold reviews."
          : "You are not signed in (or the session expired). Sign in to reach the dashboard."}
      </p>
      <button
        type="button"
        className="pressable"
        onClick={() => router.replace(hasSession ? "/signin" : "/signin")}
        style={{
          alignSelf: "flex-start",
          height: 38,
          padding: "0 14px",
          borderRadius: "var(--radius-control)",
          border: "1px solid var(--control)",
          background: "var(--primary)",
          color: "var(--primary-ink)",
          fontSize: 13,
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        {hasSession ? "Create organization" : "Sign in"}
      </button>
      {hasSession && onSignOut && (
        <button
          type="button"
          className="pressable"
          onClick={onSignOut}
          style={{ alignSelf: "flex-start", background: "none", border: 0, color: "var(--muted)", fontSize: 13, cursor: "pointer" }}
        >
          Sign out instead
        </button>
      )}
    </div>
  );
}

export type { NavItem };
