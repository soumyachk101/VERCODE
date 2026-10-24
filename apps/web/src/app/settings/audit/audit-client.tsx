"use client";

// /settings/audit (PAGE §7.2). The table is real <table> + caption +
// scope (ACCESSIBILITY §3): timestamp | actor | action-verb (the
// product's words of the trade) | target | source IP (mono, 8-char +
// copy). Filters: action-type, actor, a date range. No delete path —
// the log is append-only (DATABASE_DESIGN §7's integrity rule, the UI
// reflects it).
import { useMemo, useState } from "react";
import { OrgPage } from "@/components/page";
import { useOrgShell } from "@/components/OrgShell";
import { useAudit } from "@/lib/hooks";
import { PageHead } from "@/components/Settings";
import { DataBlock, EmptyBlock } from "@/components/DataBlock";
import { Panel, PanelTitle } from "@/components/cards";
import { Table, TRow, TCell } from "@/components/Table";
import { VcToggle } from "@/components/controls";
import { IdChip } from "@/components/IdChip";

const ACTIONS = ["review.published", "role.changed", "byok.rotated", "org.invitation_sent"];

export function AuditClient() {
  return (
    <OrgPage>
      <AuditBody />
    </OrgPage>
  );
}

function AuditBody() {
  const s = useOrgShell();
  const orgId = s.active?.id ?? "";
  const q = useAudit(orgId || undefined);
  const [action, setAction] = useState<string | null>(null);
  const [range, setRange] = useState<"30d" | "90d" | "all">("30d");

  const entries = q.data?.items ?? [];
  const filtered = useMemo(
    () =>
      entries.filter((e) => {
        if (action && e.action !== action) return false;
        if (range !== "all") {
          const days = range === "30d" ? 30 : 90;
          const t = new Date(e.timestamp).getTime();
          if (Number.isNaN(t) || Date.now() - t > days * 86400000) return false;
        }
        return true;
      }),
    [entries, action, range],
  );

  return (
    <div>
      <PageHead
        title="Audit"
        finding={
          entries.length > 0
            ? `${entries.length} events · append-only, no delete path`
            : "The org's event log, filterable by action"
        }
        right={
          <div style={{ display: "flex", gap: 8 }}>
            {ACTIONS.map((a) => (
              <VcToggle
                key={a}
                pressed={action === a}
                onPressedChange={(v) => setAction(v ? a : null)}
                aria-label={`Filter: ${a}`}
              >
                {a}
              </VcToggle>
            ))}
            <select
              aria-label="Date range"
              value={range}
              onChange={(e) => setRange(e.target.value as "30d" | "90d" | "all")}
              style={{
                height: 32,
                border: "1px solid var(--control)",
                borderRadius: "var(--radius-control)",
                background: "var(--surface)",
                color: "var(--text)",
                fontSize: 13,
                padding: "0 8px",
              }}
            >
              <option value="30d">30 days</option>
              <option value="90d">90 days</option>
              <option value="all">All time</option>
            </select>
          </div>
        }
      />
      <Panel>
        <PanelTitle>Events</PanelTitle>
        <DataBlock result={q} block="the audit log">
          {() =>
            filtered.length === 0 ? (
              <EmptyBlock>No events in this scope — filters narrowed the log to zero rows</EmptyBlock>
            ) : (
              <Table
                caption="Audit log: the timestamp, the actor, the action verb, the target, and the source IP"
                head={[
                  { label: "Timestamp", width: "14%" },
                  { label: "Actor", width: "18%" },
                  { label: "Action", width: "20%" },
                  { label: "Target" },
                  { label: "Source IP" },
                ]}
              >
                {filtered.slice(0, 50).map((e) => (
                  <TRow key={e.id}>
                    <TCell>
                      <span className="meta">
                        {new Date(e.timestamp).toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                    </TCell>
                    <TCell>
                      <span className="meta">{e.actor ?? "—"}</span>
                    </TCell>
                    <TCell>
                      <span className="mono" style={{ fontSize: 12, color: "var(--text)" }}>
                        {e.action}
                      </span>
                    </TCell>
                    <TCell>
                      <span className="meta">{e.target ?? "—"}</span>
                    </TCell>
                    <TCell>
                      <IdChip value={e.sourceIp ?? ""} label="source IP" length={8} />
                    </TCell>
                  </TRow>
                ))}
              </Table>
            )
          }
        </DataBlock>
      </Panel>
    </div>
  );
}
