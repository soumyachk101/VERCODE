// The settings two-column layout (COMPONENT_CATALOG §1, PAGE §6): a ~450px
// label column + a ~700px panel, split by 1px rules; on phone the label
// column stacks above its panel (RESPONSIVE_BEHAVIOR §7).
import type { ReactNode } from "react";

export function SettingsSection({
  label,
  description,
  children,
  stamp,
}: {
  label: string;
  description?: string;
  children: ReactNode;
  /** the autosave "Saved" stamp (a quiet, not a toast storm) */
  stamp?: string | null;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "450px minmax(0, 1fr)",
        gap: 0,
        borderBottom: "1px solid var(--rule)",
        padding: "20px 0",
      }}
      className="vc-settings-row"
    >
      <div style={{ paddingRight: 32 }}>
        <div className="section-title" style={{ fontSize: 14, fontWeight: 500 }}>
          {label}
        </div>
        {description && (
          <p className="meta" style={{ marginTop: 6, marginBottom: 0, maxWidth: 420 }}>
            {description}
          </p>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
        {children}
        {stamp && (
          <span
            className="meta"
            role="status"
            style={{ fontSize: 12, color: "var(--muted-ink)", textAlign: "right" }}
          >
            {stamp}
          </span>
        )}
      </div>
    </div>
  );
}

export function SettingsPage({
  title,
  finding,
  children,
}: {
  title: string;
  finding?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <PageHead title={title} finding={finding} />
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8 }}>
        {children}
      </div>
    </div>
  );
}

export function PageHead({
  title,
  finding,
  right,
}: {
  title: string;
  finding?: string | null;
  right?: ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
      <div style={{ minWidth: 0 }}>
        <h1 className="h1" style={{ margin: 0 }}>
          {title}
        </h1>
        {finding && <p className="finding-line" style={{ margin: "6px 0 0" }}>{finding}</p>}
      </div>
      {right && <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>{right}</div>}
    </div>
  );
}
