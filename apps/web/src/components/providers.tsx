"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "@/lib/hooks";
import type { ReactNode } from "react";

/**
 * The client-side provider tree (root layout). One QueryClient per session —
 * server state lives in TanStack Query (every page's data flows through the
 * use* hooks in lib/hooks.ts, so a failed fetch renders an in-block error
 * state, never a thrown page).
 */
export function AppProviders({ children }: { children: ReactNode }) {
  // a module-level client would leak state across HMR; a per-layout-mount
  // client is the Next 15 App Router pattern
  const [client] = useStateQueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

import { useState } from "react";

function useStateQueryClient() {
  return useState(() => createQueryClient());
}
