"use client";

// /settings/rules (PAGE §6.1). The settings two-column layout: a ~450px
// label column + a ~700px panel split by 1px rules. The confidence floor
// is a labelled control + a live-preview; the suppressed categories are a
// toggle list (the on-colour is the semantic near-black, not the brand
// accent); the per-repo overrides table is versioned + audit-logged. One
// autosave stamp per control that changes.
import { useEffect, useState } from "react";
import { OrgPage } from "@/components/page";
import { useOrgShell } from "@/components/OrgShell";
import { useSettings, useRules, useSettingsUpdate, useSecurity } from "@/lib/hooks";
import { SettingsSection, PageHead } from "@/components/Settings";
import { DataBlock, EmptyBlock } from "@/components/DataBlock";
import { VcSlider, VcSwitch } from "@/components/controls";
import { Table, TRow, TCell } from "@/components/Table";
import { Pill } from "@/components/Pill";
import { FINDER_CATEGORIES } from "@/lib/categories";

export function RulesClient() {
  return (
    <OrgPage>
      <RulesBody />
    </OrgPage>
  );
}

function RulesBody() {
  const s = useOrgShell();
  const orgId = s.active?.id ?? "";
  const q = useSettings(orgId || undefined);
  const rulesQ = useRules(orgId || undefined);
  const mutate = useSettingsUpdate(orgId);

  const [floor, setFloor] = useState<number | undefined>(q.data?.confidenceFloor);
  const [suppressed, setSuppressed] = useState<string[]>(q.data?.suppressedCategories ?? []);
  const [savedStamp, setSavedStamp] = useState<string | null>(null);

  // a live-preview count: "N findings in your last 20 reviews fall below
  // this floor" (PAGE §6.1.1 — show what the setting produces). The count
  // is computed from the org's open security rollup (the real findings),
  // not a fabricated fixture
  const secQ = useSecurity(orgId || undefined);
  const belowFloor =
    secQ.data?.items.filter((f) => f.confidence != null && f.confidence < (floor ?? 0.6)).length ?? 0;

  useEffect(() => {
    if (mutate.isSuccess) {
      setSavedStamp(new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }));
      const t = setTimeout(() => setSavedStamp(null), 4000);
      return () => clearTimeout(t);
    }
  }, [mutate.isSuccess]);

  const saveFloor = async (v: number) => {
    setFloor(v);
    setSavedStamp(null);
    await mutate.mutateAsync({ confidenceFloor: v });
  };
  const saveSuppressed = async (next: string[]) => {
    setSuppressed(next);
    setSavedStamp(null);
    await mutate.mutateAsync({ suppressedCategories: next });
  };

  return (
    <div>
      <PageHead
        title="Rules"
        finding="How the review is tuned for this org — the confidence floor, suppressed categories, and per-repo overrides"
        right={savedStamp ? <Pill tone="positive">Saved {savedStamp}</Pill> : null}
      />
      <div style={{ background: "var(--surface)", border: "1px solid hsl(var(--border))", borderRadius: 8, padding: "0 20px" }}>
        <SettingsSection
          label="Confidence floor"
          description="Findings below this confidence are hidden from the review detail. A lower floor surfaces more of the AI's speculative findings; a higher floor trims the noise."
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <VcSlider
              value={floor ?? 0.6}
              onValueChange={(v) => {
                void saveFloor(v);
              }}
              min={0}
              max={1}
              step={0.05}
              label="Confidence floor"
            />
            <span className="tabular" style={{ fontSize: 14, color: "var(--text)" }}>
              {(floor ?? 0.6).toFixed(2)}
            </span>
          </div>
          <p className="meta" style={{ margin: 0 }}>
            Findings below {(floor ?? 0.6).toFixed(1)} are hidden — preview: {belowFloor} finding
            {belowFloor === 1 ? "" : "s"} in your recent reviews fall below this floor.
          </p>
        </SettingsSection>

        <SettingsSection
          label="Suppressed categories"
          description="Categories that are never surfaced for this org. A suppressed category is still counted in the severity ladder — the suppression is a display filter, not a delete."
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 480 }}>
            {FINDER_CATEGORIES.map((c) => (
              <div key={c} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 14, color: "var(--text)" }}>{c}</span>
                <VcSwitch
                  label={`Suppress ${c}`}
                  checked={suppressed.includes(c)}
                  onCheckedChange={(v) =>
                    void saveSuppressed(v ? [...suppressed, c] : suppressed.filter((x) => x !== c))
                  }
                />
              </div>
            ))}
          </div>
        </SettingsSection>

        <SettingsSection
          label="Per-repo overrides"
          description="Repo-specific rule overrides, versioned and audit-logged on change. Manage links jump to Settings → Rules scoped to that repo."
        >
          <DataBlock result={rulesQ} block="per-repo overrides">
            {() => {
              const rules = rulesQ.data ?? [];
              if (rules.length === 0) {
                return <EmptyBlock>No repo-specific rules — using the org default</EmptyBlock>;
              }
              return (
                <Table
                  caption="Per-repo rule overrides: the repository, the overrides in force, the version, and a manage action"
                  head={[
                    { label: "Repository", width: "30%" },
                    { label: "Overrides in force" },
                    { label: "Version" },
                    { label: "" },
                  ]}
                >
                  {rules.map((r) => (
                    <TRow key={r.repoId}>
                      <TCell>{r.repoName ?? r.repoId}</TCell>
                      <TCell>
                        <span className="meta">{r.overrides.length > 0 ? r.overrides.join(", ") : "none"}</span>
                      </TCell>
                      <TCell>
                        <span className="meta tabular">{r.version ?? 1}</span>
                      </TCell>
                      <TCell right>
                        <a href="/settings/rules" className="pressable" style={{ color: "hsl(var(--accent))", fontSize: 13 }}>
                          Manage
                        </a>
                      </TCell>
                    </TRow>
                  ))}
                </Table>
              );
            }}
          </DataBlock>
        </SettingsSection>
      </div>
    </div>
  );
}
