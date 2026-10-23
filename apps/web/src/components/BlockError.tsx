import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { clsx } from "clsx";
import { X } from "lucide-react";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { Button } from "./Button";

/**
 * A quiet in-block error state (DESIGN_SYSTEM §6.6): the failed block keeps
 * its frame, one line + a Retry text button; never a full-screen banner.
 * `lastUpdated` is the stale-data freshness stamp.
 */
export function BlockError({
  title,
  lastUpdated,
  onRetry,
  retrying,
  className,
}: {
  title: string;
  lastUpdated?: string;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn("empty-box", className)}
      style={{ minHeight: 48, justifyContent: "flex-start", gap: 12 }}
    >
      <span style={{ color: "var(--muted-ink)" }}>
        Couldn&apos;t load {title}
        {lastUpdated ? ` . Last updated ${lastUpdated}` : "."}
      </span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="pressable text-sm font-medium text-[var(--accent)] disabled:opacity-60"
        >
          Retry
        </button>
      )}
    </div>
  );
}

/**
 * The confirmation dialog (ACCESSIBILITY §5): a real role="alertdialog",
 * focus-trapped (Radix), Esc closes, focus returns to the trigger. The
 * confirmation names the object + the consequence in words.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  cancelLabel = "Keep",
  onConfirm,
  confirming,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  confirming?: boolean;
}) {
  // The confirm button hands the action to the caller: a real dialog
  // confirmation (ACCESSIBILITY §5) fires `onConfirm`, which the caller
  // wires to the destructive mutation. The button's onClick closes the
  // dialog + fires the caller's onConfirm in one event.
  const closeAndConfirm = () => {
    onOpenChange(false);
    onConfirm();
  };
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogPrimitive.Content
        className="popover-enter"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-card)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          padding: 20,
          maxWidth: 420,
          width: "calc(100% - 32px)",
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          margin: 0,
          zIndex: 60,
          outline: "none",
        }}
      >
        <AlertDialogPrimitive.Title className="section-title" style={{ margin: 0 }}>
          {title}
        </AlertDialogPrimitive.Title>
        <AlertDialogPrimitive.Description
          className="finding-line"
          style={{ margin: "8px 0 0" }}
        >
          {body}
        </AlertDialogPrimitive.Description>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 20,
          }}
        >
          <AlertDialogPrimitive.Cancel asChild>
            <Button variant="secondary">{cancelLabel}</Button>
          </AlertDialogPrimitive.Cancel>
          <Button
            variant="destructive"
            disabled={confirming}
            onClick={closeAndConfirm}
            data-radix-action="true"
          >
            {confirming ? "Working…" : confirmLabel}
          </Button>
        </div>
      </AlertDialogPrimitive.Content>
    </AlertDialogPrimitive.Root>
  );
}

/** A generic dismissible notice (a quiet pale-border strip, never a tinted ground). */
export function Notice({
  children,
  tone = "warning",
  onClose,
  className,
}: {
  children: ReactNode;
  tone?: "warning" | "info" | "positive";
  onClose?: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  const border =
    tone === "warning" ? "var(--notice-border)" : "var(--border)";
  return (
    <div
      className={cn(className)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        border: `1px solid ${border}`,
        background: "var(--surface)",
        borderRadius: "var(--radius-card)",
        padding: "8px 12px",
        fontSize: 13,
        color: "var(--muted-ink)",
      }}
      role="status"
    >
      <span>{children}</span>
      {onClose ? (
        <button
          type="button"
          aria-label="Dismiss notice"
          onClick={() => setOpen(false)}
          className="pressable text-[var(--faint)]"
        >
          <X size={14} aria-hidden="true" />
        </button>
      ) : null}
      <span className="sr-only">{clsx("vc-notice")}</span>
    </div>
  );
}
