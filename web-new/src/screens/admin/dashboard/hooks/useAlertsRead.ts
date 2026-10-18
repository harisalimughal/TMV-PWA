/**
 * "Read" state for the header bell. Bell items are live conditions derived by
 * useAttention (an unassigned job, a stale tracker), not stored messages, and the
 * backend keeps no read state for them. Marking them read only quiets the badge in
 * this browser: the items stay listed until the condition itself is resolved, and an
 * item that changes (new time or count) or a new one counts as unread again.
 */
import { useCallback, useState } from "react";
import type { AttentionItem } from "./useAttention";

export const ALERTS_READ_KEY = "tmv:admin-alerts-read";

/** Identity plus the facts that make it "new again" when they change. */
export const readSignature = (item: Pick<AttentionItem, "id" | "at" | "occurrences">) => `${item.id}|${item.at ?? ""}|${item.occurrences ?? ""}`;

function load(): Set<string> {
  try {
    const stored = JSON.parse(localStorage.getItem(ALERTS_READ_KEY) || "[]");
    return new Set(Array.isArray(stored) ? stored.filter((value): value is string => typeof value === "string") : []);
  } catch { return new Set(); }
}

export function useAlertsRead() {
  const [read, setRead] = useState(load);
  const isRead = useCallback((item: AttentionItem) => read.has(readSignature(item)), [read]);
  /** Marks exactly these items read. Signatures of items no longer listed are dropped, so storage stays small. */
  const markAllRead = useCallback((items: AttentionItem[]) => {
    const next = new Set(items.map(readSignature));
    try { localStorage.setItem(ALERTS_READ_KEY, JSON.stringify([...next])); } catch { /* lasts this session */ }
    setRead(next);
  }, []);
  return { isRead, markAllRead };
}
