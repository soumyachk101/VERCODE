import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";

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
