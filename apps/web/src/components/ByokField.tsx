import { useState } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { VcSwitch, Label, Input } from "./controls";
import { Button } from "./Button";
import { Copy } from "lucide-react";
import { copyText } from "@/lib/clipboard";

/**
 * The BYOK field (COMPONENT_CATALOG §2): a masked "sk-…abcd" display (the
 * raw key is NEVER shown, FR-313) + Rotate / Revoke actions. The raw key is
 * entered in a single-entry field, KMS-wrapped on the server; only the
 * last-4 round-trips to the UI.
 */
export function ByokField({
  last4,
  active,
  provider,
  onRotate,
  onRevoke,
}: {
  last4?: string;
  active: boolean;
  provider?: string;
  onRotate?: () => void;
  onRevoke?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [newKey, setNewKey] = useState("");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          border: "1px solid var(--control)",
          borderRadius: "var(--radius-control)",
          padding: "6px 10px",
          height: 38,
          background: "var(--surface)",
        }}
      >
        <span className="mono tabular" style={{ fontSize: 13, color: "var(--text)" }}>
          {last4 ? `sk-…${last4}` : "no key set"}
        </span>
        {last4 && (
          <button
            type="button"
            aria-label="Copy BYOK last four"
            className="pressable"
            style={{ color: copied ? "var(--positive)" : "var(--faint)" }}
            onClick={async () => {
              await copyText(`sk-…${last4}`);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
          >
            {copied ? "copied" : <Copy size={14} aria-hidden="true" />}
          </button>
        )}
        <span className="meta" style={{ fontSize: 11, color: active ? "var(--positive)" : "var(--negative)" }}>
          {active ? "active" : "inactive"}
        </span>
      </div>
      <p className="meta" style={{ fontSize: 12, margin: 0 }}>
        The raw key is never shown. Set a new key to rotate; the old key deactivates on save.
        {provider ? ` Provider: ${provider}.` : ""}
      </p>
      {onRotate && (
        <div style={{ display: "flex", gap: 8 }}>
          <Button size="sm" variant="secondary" onClick={onRotate}>
            Rotate
          </Button>
          {onRevoke && (
            <RevokeButton onRevoke={onRevoke} />
          )}
        </div>
      )}
      {onRotate && (
        <div>
          <Label htmlFor="byok-new">New key</Label>
          <Input
            id="byok-new"
            type="password"
            autoComplete="off"
            placeholder="sk-…"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            style={{ maxWidth: 320, display: "block" }}
          />
          {newKey && onRotate && (
            <Button size="sm" className="mt-2" onClick={() => onRotate()}>
              Save new key
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function RevokeButton({ onRevoke }: { onRevoke: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => setOpen(true)}
      >
        Revoke
      </Button>
      <AlertDialog.Root open={open} onOpenChange={setOpen}>
        <AlertDialog.Content
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-card)",
            boxShadow: "0 8px 24px rgba(0,0,0,.12)",
            padding: 20,
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%,-50%)",
            zIndex: 60,
            maxWidth: 420,
            width: "calc(100% - 32px)",
            outline: "none",
          }}
        >
          <AlertDialog.Title className="section-title">Revoke BYOK key</AlertDialog.Title>
          <AlertDialog.Description className="finding-line">
            The key is deactivated and deleted. The provider fallback takes over. This is immediate — reviews will run on the platform key until a new key is set.
          </AlertDialog.Description>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <AlertDialog.Cancel asChild>
              <Button variant="secondary" size="sm">
                Keep
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant="destructive" size="sm" onClick={() => { onRevoke(); setOpen(false); }}>
                Revoke key
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </>
  );
}

export function SwitchRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "6px 0",
        border: "1px solid var(--rule)",
        borderRadius: "var(--radius-control)",
      }}
    >
      <Label htmlFor={`switch-${label}`}>{label}</Label>
      <VcSwitch
        label={label}
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

export { VcSwitch, AlertDialog };
