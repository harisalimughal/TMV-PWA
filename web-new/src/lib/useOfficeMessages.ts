import { useCallback, useEffect, useRef, useState } from "react";
import { fetchInbox } from "../api/activity";
import { isUnavailable, type ActivityConversation } from "./activity";

const POLL_MS = 30_000;
/** A server that does not provide messages is asked again at most this often, not every poll. */
const RETRY_UNAVAILABLE_MS = 10 * 60_000;

export interface OfficeMessages {
  /** Conversations, newest first. Empty when the server has none or does not provide messages. */
  items: ActivityConversation[];
  /** Office messages the driver has not read, across their jobs. */
  unread: number;
  loading: boolean;
  /** The server does not provide messages: show nothing, not an error. */
  unavailable: boolean;
  failed: boolean;
  refresh: () => void;
}

/** The driver's inbox, refreshed while visible and when the app returns to the foreground. */
export function useOfficeMessages(): OfficeMessages {
  const [items, setItems] = useState<ActivityConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [failed, setFailed] = useState(false);
  const alive = useRef(true);

  const unavailableAt = useRef<number | null>(null);

  const load = useCallback(async (force = false) => {
    if (document.hidden) return;
    if (!force && unavailableAt.current !== null && Date.now() - unavailableAt.current < RETRY_UNAVAILABLE_MS) return;
    try {
      const page = await fetchInbox();
      if (!alive.current) return;
      unavailableAt.current = null; setItems(page.items); setUnavailable(false); setFailed(false);
    } catch (error) {
      if (!alive.current) return;
      if (isUnavailable(error)) { unavailableAt.current = Date.now(); setUnavailable(true); } else setFailed(true);
    } finally { if (alive.current) setLoading(false); }
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    const wake = () => void load();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    return () => { alive.current = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", wake); window.removeEventListener("online", wake); };
  }, [load]);

  return { items, unread: items.reduce((sum, item) => sum + item.unreadCount, 0), loading, unavailable, failed, refresh: () => void load(true) };
}
