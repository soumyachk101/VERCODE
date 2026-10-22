import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The shell (INFORMATION_ARCHITECTURE §2): a labelled 230px sidebar on the
 * page ground (never dark on a light screen), an org switcher at top, the
 * seven destinations, settings utilities at the bottom, and a user row at
 * the very bottom. The active item is a neutral grey pill (radius 8,
 * inset 8–14px) — NOT a coloured left bar. Attention counts only on
 * action-queues, noun-clear ("Security 4", "Failed 2").
 */

export interface NavItem {
  key: string;
  href: string;
  label: string;
  /** the queue's noun-clear count ("4") — rendered next to the label */
  count?: number | null;
  countNoun?: string;
}

export interface ShellUser {
  name: string;
  email: string;
}

export function Shell({
  orgName,
  orgPlan,
  onSwitchOrg,
  items,
  active,
  bottomItems = [],
  user,
  onSignOut,
  main,
  children,
  className,
}: {
  orgName: string;
  orgPlan?: string;
  onSwitchOrg?: (orgId: string) => void;
  items: NavItem[];
  active: string;
  bottomItems?: NavItem[];
  user?: ShellUser | null;
  onSignOut?: () => void;
  /** an extra user menu (profile link etc.) */
  main?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("flex min-h-screen", className)}
      style={{
        background: "var(--ground)",
        fontSize: 14,
      }}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
        style={{ background: "var(--surface)", padding: 8, border: "1px solid var(--control)" }}
      >
        Skip to content
      </a>

      {/* the desktop sidebar */}
      <nav
        aria-label="Primary"
        style={{
          width: 230,
          flexShrink: 0,
          padding: "20px 12px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          position: "sticky",
          top: 0,
          height: "100vh",
          boxSizing: "border-box",
        }}
      >
        <SidebarHeader orgName={orgName} orgPlan={orgPlan} onSwitchOrg={onSwitchOrg} />
        <div style={{ marginTop: 20 }}>
          <GroupLabel>Work</GroupLabel>
          {items.map((it) => (
            <NavRow key={it.key} item={it} active={active === it.key} />
          ))}
        </div>
        <div style={{ marginTop: 20, flex: 1 }}>
          {bottomItems.length > 0 && (
            <>
              <GroupLabel>Settings</GroupLabel>
              {bottomItems.map((it) => (
                <NavRow key={it.key} item={it} active={active === it.key} />
              ))}
            </>
          )}
        </div>
        {user && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 8px 4px",
              borderTop: "1px solid var(--rule)",
              marginTop: 12,
            }}
          >
            <Avatar name={user.name} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--text)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {user.name}
              </div>
              <div className="meta" style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.email}
              </div>
            </div>
            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                className="pressable"
                style={{ color: "var(--muted)", fontSize: 12 }}
              >
                Sign out
              </button>
            )}
          </div>
        )}
      </nav>

      {/* the mobile fold (RESPONSIVE_BEHAVIOR §2): a 48px top bar + a sheet */}
      <MobileShell
        orgName={orgName}
        orgPlan={orgPlan}
        items={items}
        bottomItems={bottomItems}
        active={active}
        user={user}
        onSignOut={onSignOut}
      />

      <div style={{ flex: 1, minWidth: 0 }} id="main">
        {/* the canvas: fluid, 24–40px gutters, one left edge header-to-last-row */}
        <div style={{ maxWidth: 1312, margin: "0 auto", padding: "28px 32px 48px", boxSizing: "border-box" }}>
          <Header />
          {main}
          <div style={{ marginTop: 24 }}>{children}</div>
        </div>
      </div>
    </div>
  );
}

function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 12,
        color: "var(--muted)",
        padding: "0 8px",
        marginBottom: 6,
        marginTop: 2,
      }}
    >
      {children}
    </div>
  );
}

function SidebarHeader({
  orgName,
  orgPlan,
  onSwitchOrg,
}: {
  orgName: string;
  orgPlan?: string;
  onSwitchOrg?: (orgId: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 8px",
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: "0.02em",
        }}
        aria-label="VERCODE"
      >
        <span
          aria-hidden="true"
          style={{
            width: 16,
            height: 16,
            background: "var(--accent)",
            borderRadius: 4,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ width: 8, height: 8, background: "var(--ground)", borderRadius: 2 }} />
        </span>
        <span>VERCODE</span>
      </div>
      <button
        type="button"
        onClick={() => onSwitchOrg?.("")}
        className="pressable"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 8px",
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--surface)",
          color: "var(--text)",
          fontSize: 13,
          textAlign: "left",
        }}
      >
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {orgName}
        </span>
        {orgPlan && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: "var(--muted)",
              background: "var(--raised)",
              border: "1px solid var(--rule)",
              borderRadius: "var(--radius-chip)",
              padding: "1px 6px",
              textTransform: "capitalize",
            }}
          >
            {orgPlan}
          </span>
        )}
      </button>
    </div>
  );
}

function NavRow({ item, active }: { item: NavItem; active: boolean }) {
  const count =
    item.count != null && item.count > 0 ? (
      <span
        className="tabular"
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: "var(--muted)",
          background: "var(--raised)",
          border: "1px solid var(--rule)",
          borderRadius: "var(--radius-chip)",
          padding: "0 5px",
          lineHeight: "16px",
        }}
      >
        {item.countNoun ? `${item.countNoun} ${item.count}` : item.count}
      </span>
    ) : null;
  return (
    <a
      href={item.href}
      aria-current={active ? "page" : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: 34,
        padding: "0 8px",
        margin: "0 4px",
        borderRadius: 8,
        background: active ? "var(--active)" : "transparent",
        color: "var(--text)",
        fontSize: 14,
        textDecoration: "none",
        boxShadow: "inset 0 0 0 0 transparent",
      }}
    >
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {item.label}
      </span>
      {count}
    </a>
  );
}

function Avatar({ name }: { name: string }) {
  const hue = personHueExport(name);
  return (
    <span
      aria-hidden="true"
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        background: `hsl(${hue} 40% 92%)`,
        color: "var(--text)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 13,
        fontWeight: 600,
        flexShrink: 0,
        border: "1px solid var(--rule)",
      }}
    >
      {initialsOf(name)}
    </span>
  );
}

function personHueExport(idOrName: string): number {
  let h = 0;
  for (let i = 0; i < idOrName.length; i++) h = (h * 31 + idOrName.charCodeAt(i)) % 360;
  return h;
}
function initialsOf(name: string): string {
  const p = name.split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0][0].toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

function Header() {
  // a role="status" aria-live region that announces new findings + quota
  // changes on this shell (ACCESSIBILITY §3). Pages push a message via the
  // window-level announcer hook (useAnnounce).
  return (
    <div aria-live="polite" role="status" className="sr-only" data-testid="shell-live-region" />
  );
}

/** A mobile top bar + sheet (transform/opacity only; the keyboard-toggle
    ⌘K-style open is never animated — Emil). */
function MobileShell({
  orgName,
  orgPlan,
  items,
  bottomItems,
  active,
  user,
  onSignOut,
}: {
  orgName: string;
  orgPlan?: string;
  items: NavItem[];
  bottomItems: NavItem[];
  active: string;
  user?: ShellUser | null;
  onSignOut?: () => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div style={{ display: "none" }} className="vc-mobile">
      <style>{`
        @media (max-width: 1100px) {
          .vc-shell-nav-desktop { display: none !important; }
          .vc-mobile { display: block !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .nav-sheet { transition: none !important; }
        }
      `}</style>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: 48,
          padding: "0 12px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          position: "sticky",
          top: 0,
          zIndex: 40,
          justifyContent: "space-between",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600 }}>
          {orgName}
          {orgPlan ? (
            <span className="meta" style={{ fontWeight: 400, marginLeft: 6, textTransform: "capitalize" }}>
              ({orgPlan})
            </span>
          ) : null}
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="vc-mobile-sheet"
          onClick={() => setOpen((v) => !v)}
          className="pressable"
          style={{
            border: "1px solid var(--border)",
            background: "var(--surface)",
            borderRadius: "var(--radius-control)",
            padding: "4px 10px",
            fontSize: 13,
          }}
        >
          Menu
        </button>
      </div>
      <div
        id="vc-mobile-sheet"
        className={cn("nav-sheet fixed inset-0 z-50 bg-[var(--surface)] p-6 overflow-auto")}
        hidden={!open}
        style={{
          display: open ? "block" : "none",
          transform: "translateX(0)",
        }}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="pressable"
          style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}
        >
          Close menu
        </button>
        <GroupLabel>Work</GroupLabel>
        {items.map((it) => (
          <NavRow key={it.key} item={it} active={active === it.key} />
        ))}
        {bottomItems.length > 0 && (
          <>
            <GroupLabel>Settings</GroupLabel>
            {bottomItems.map((it) => (
              <NavRow key={it.key} item={it} active={active === it.key} />
            ))}
          </>
        )}
        {user && (
          <div style={{ marginTop: 20, borderTop: "1px solid var(--rule)", paddingTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <Avatar name={user.name} />
            <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}>{user.name}</div>
            {onSignOut && (
              <button type="button" className="pressable" style={{ fontSize: 12, color: "var(--muted)" }} onClick={onSignOut}>
                Sign out
              </button>
            )}
          </div>
        )}
      </div>
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.3)", zIndex: 45 }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
