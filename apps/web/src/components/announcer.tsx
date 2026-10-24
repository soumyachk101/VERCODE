"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The polite live-region announcer (ACCESSIBILITY §3): new findings, a
 * finding action ("Finding 'X' marked fixed"), and a usage change ("Usage
 * is now 80% of the 30-day total") all push a message here; a role="status"
 * region in the shell reads it. A screen reader is told the data arrived,
 * not just re-scrolled.
 */
type Message = { id: number; text: string };

let seq = 0;
const subs = new Set<(m: Message) => void>();

/** Push a message to every mounted LiveRegion. */
export function announce(text: string): void {
  const m: Message = { id: ++seq, text };
  for (const s of subs) s(m);
}

/**
 * The polite region (role="status" + aria-live="polite"). Mount one per
 * shell — it's the keyboard/sr target when findings or usage change.
 */
export function LiveRegion() {
  const [msg, setMsg] = useState<Message | null>(null);
  useEffect(() => {
    const s = (m: Message) => setMsg(m);
    subs.add(s);
    return () => {
      subs.delete(s);
    };
  }, []);
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="live-region"
      style={{
        position: "absolute",
        width: 1,
        height: 1,
        overflow: "hidden",
        clip: "rect(0 0 0 0)",
        clipPath: "inset(50%)",
        whiteSpace: "nowrap",
      }}
    >
      {msg?.text ?? ""}
    </div>
  );
}

/** A guarded push (no duplicate announces on a refetch of the same data). */
export function useAnnounce() {
  const last = useRef<string | null>(null);
  return useCallback((text: string) => {
    if (last.current === text) return;
    last.current = text;
    announce(text);
  }, []);
}
