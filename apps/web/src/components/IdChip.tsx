import { useState } from "react";
import { copyText } from "@/lib/clipboard";

/**
 * Monospace identifiers (SHAs, source IPs, file:line): 8-char truncated,
 * 12px, with a copy button (aria-labelled). VERCODE mono job: IDs only.
 */
export function IdChip({ value, label, length = 8 }: { value: string; label: string; length?: number }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="meta">—</span>;
  const short = value.length > length ? value.slice(0, length) : value;
  return (
    <span className="meta" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span className="mono tabular">{short}</span>
      <button
        type="button"
        aria-label={`Copy ${label}`}
        className="pressable text-[var(--faint)]"
        onClick={async () => {
          await copyText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
      >
        {copied ? "copied" : "copy"}
      </button>
    </span>
  );
}
