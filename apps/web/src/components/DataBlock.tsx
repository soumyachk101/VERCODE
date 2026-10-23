import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { Button } from "./Button";
import { Pill } from "./Pill";

/**
 * Loading: the final layout with each value a flat grey bar at its real size
 * (no shimmer, no layout shift when data lands — DESIGN_SYSTEM §6.6).
 */
export function Skeleton({ lines = 3, height = 12 }: { lines?: number; height?: number }) {
  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 8, padding: "4px 0" }}
      aria-hidden="true"
    >
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{ height, width: `${Math.max(35, 90 - i * 18)}%` }}
        />
      ))}
    </div>
  );
}

/**
 * DataBlock: wraps a TanStack Query result into the three designed states —
 * skeleton, error-inside-the-block, and children with data. A real zero
 * renders children; only a failed fetch renders BlockError.
 */
export function DataBlock({
  result,
  block,
  lastUpdated,
  children,
}: {
  result: UseQueryResult<unknown>;
  block: string;
  lastUpdated?: string | null;
  children: (data: NonNullable<UseQueryResult<unknown>["data"]>) => ReactNode;
}) {
  if (result.isLoading || (result.data == null && !result.isError)) {
    return <Skeleton lines={3} />;
  }
  if (result.isError) {
    return (
      <ErrorState
        block={block}
        lastUpdated={lastUpdated ?? result.dataUpdatedAt ? formatStamp(result.dataUpdatedAt) : undefined}
        onRetry={() => {
          void result.refetch();
        }}
      />
    );
  }
  return children(result.data!);
}

import { BlockError } from "./BlockError";

function ErrorState({
  block,
  lastUpdated,
  onRetry,
}: {
  block: string;
  lastUpdated?: string;
  onRetry: () => void;
}) {
  return <BlockError title={block} lastUpdated={lastUpdated} onRetry={onRetry} />;
}

function formatStamp(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** The designed zero / in-scope-empty box: frame + header kept, one sentence. */
export function EmptyBlock({ children }: { children: ReactNode }) {
  return <div className="empty-box">{children}</div>;
}

/**
 * The per-user provider-connection row (the account page's "GitHub" block,
 * API_SPECIFICATION.md "Auth & account"). A `null` / `undefined` `data` is
 * a not-connected state: a quiet "Not connected" dash + a Connect button
 * (a the mutation's `data` is the authorize URL — a the client navigates
 * there, GitHub redirects back to `/settings/account?github=connected`).
 *
 * Visual contract (the user forbids colour changes): a single row, 12px
 * meta, the status pill + one interaction (the button), no tint.
 */
export function ProviderConnectionRow({
  label,
  data,
  connecting,
  onConnect,
  onDisconnect,
  disconnecting,
}: {
  label: string;
  /** `null` / `undefined` = not connected. */
  data: { connected: boolean; handle?: string | null } | null | undefined;
  connecting?: boolean;
  onConnect: () => void;
  onDisconnect?: () => void;
  disconnecting?: boolean;
}) {
  const connected = !!data?.connected;
  const handle = data?.handle;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "4px 0",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {connected ? (
          <Pill tone="positive">
            Connected as {handle ?? "unknown"}
          </Pill>
        ) : (
          <span className="meta" style={{ color: "var(--faint)" }}>
            Not connected
          </span>
        )}
      </div>
      {connected ? (
        onDisconnect && (
          <Button variant="ghost" size="sm" disabled={disconnecting} onClick={onDisconnect}>
            {disconnecting ? "Disconnecting…" : "Disconnect"}
          </Button>
        )
      ) : (
        <Button size="sm" disabled={connecting} onClick={onConnect}>
          {connecting ? "Opening GitHub…" : `Connect ${label}`}
        </Button>
      )}
    </div>
  );
}
