import { useState } from "react";
import { ChevronDown, ChevronRight, Copy, MoreHorizontal } from "lucide-react";
import { SeverityMark } from "./SeverityMark";
import { Button } from "./Button";
import { copyText } from "@/lib/clipboard";
import type { NormalizedFindings } from "@/lib/normalized";

export type FindingRowItem = NormalizedFindings["items"][number];

export function sourceNote(source?: string): string | null {
  if (!source) return null;
  if (source === "eslint" || source === "semgrep" || source === "deterministic-summary") {
    return "from static analysis";
  }
  if (source === "ai-deep" || source === "ai-security") return "from AI";
  return null;
}

/**
 * FindingRow (COMPONENT_CATALOG §2): 48px pitch, severity square + title +
 * category grey + file:line mono (copy) + confidence grey + expandable
 * suggested-fix + expandable diff-context + the source note + a kebab with
 * the one-trailing-action "Accept · Dismiss · Mark fixed" (the north-star
 * finding_action, one click away).
 */
export function FindingRow({
  finding,
  onAction,
  acting,
}: {
  finding: FindingRowItem;
  onAction: (id: string, action: "accepted" | "dismissed_reasonable" | "fixed") => void;
  acting?: boolean;
}) {
  const [fixOpen, setFixOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const note = sourceNote(finding.source);

  return (
    <div
      data-testid={`finding-${finding.id}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        minHeight: 48,
        padding: "6px 0",
        borderBottom: "1px solid var(--rule)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
        <SeverityMark severity={finding.severity} size={6} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 14,
              color: "var(--text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {finding.title}
          </div>
          <div className="meta" style={{ fontSize: 12, display: "flex", gap: 8 }}>
            <span>{finding.category}</span>
            <button
              type="button"
              aria-label={`Copy file ${finding.file}:${finding.line}`}
              className="pressable mono"
              style={{ fontSize: 12, color: "var(--muted)" }}
              onClick={async () => {
                await copyText(`${finding.file}:${finding.line}`);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              }}
            >
              {copied ? "copied" : `${finding.file}:${finding.line}`}
            </button>
            {finding.confidence != null && (
              <span>confidence {finding.confidence.toFixed(2)}</span>
            )}
            {note && <span style={{ color: "var(--faint)" }}>{note}</span>}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        {finding.suggestedFix && (
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={fixOpen}
            onClick={() => setFixOpen((v) => !v)}
          >
            {fixOpen ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
            Fix
          </Button>
        )}
        {finding.diffContext && (
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={diffOpen}
            onClick={() => setDiffOpen((v) => !v)}
          >
            {diffOpen ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
            Diff
          </Button>
        )}
        <div style={{ position: "relative" }}>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Finding actions"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <MoreHorizontal size={14} aria-hidden="true" />
          </Button>
          {menuOpen && (
            <div
              role="menu"
              className="popover-enter"
              style={{
                position: "absolute",
                right: 0,
                top: 32,
                zIndex: 20,
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-card)",
                boxShadow: "0 8px 24px rgba(0,0,0,.12)",
                padding: 6,
                minWidth: 180,
              }}
            >
              {(["accepted", "dismissed_reasonable", "fixed"] as const).map((a) => (
                <button
                  key={a}
                  role="menuitem"
                  type="button"
                  disabled={acting}
                  className="pressable"
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "6px 10px",
                    fontSize: 13,
                    color: "var(--text)",
                    borderRadius: "var(--radius-chip)",
                  }}
                  onClick={() => {
                    setMenuOpen(false);
                    onAction(finding.id, a);
                  }}
                >
                  {a === "accepted" ? "Accept" : a === "dismissed_reasonable" ? "Dismiss" : "Mark fixed"}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {(fixOpen || diffOpen) && (
        <div style={{ flexBasis: "100%" }}>
          {fixOpen && finding.suggestedFix && (
            <pre
              className="mono"
              style={{
                margin: "8px 0 0",
                padding: 12,
                fontSize: 12,
                background: "var(--raised)",
                border: "1px solid var(--rule)",
                borderRadius: "var(--radius-card)",
                overflow: "auto",
                maxHeight: 200,
              }}
            >
              {finding.suggestedFix}
            </pre>
          )}
          {diffOpen && finding.diffContext && (
            <pre
              className="mono"
              style={{
                margin: "8px 0 0",
                padding: 12,
                fontSize: 12,
                background: "var(--raised)",
                border: "1px solid var(--rule)",
                borderRadius: "var(--radius-card)",
                overflow: "auto",
                maxHeight: 200,
              }}
            >
              {finding.diffContext}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
