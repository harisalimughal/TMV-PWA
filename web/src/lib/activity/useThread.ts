import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityApiError } from "./client";
import { mergeActivity, newestCursor } from "./model";
import type { ActivityMessage, ActivityPage, ActivityQuery, ConversationCapabilities } from "./contract";

export const THREAD_POLL_MS = 5_000;

/** True when the server does not offer the activity endpoints at all. */
export const isUnavailable = (error: unknown): boolean => error instanceof ActivityApiError && error.unavailable;

/** Fetches one page of a job's conversation. Each app supplies its own transport. */
export type ThreadFetcher = (jobId: string, query: Pick<ActivityQuery, "after" | "before">, signal?: AbortSignal) => Promise<ActivityPage>;

export type ThreadStatus = "loading" | "ready" | "error" | "unavailable";

export interface ActivityThread {
  status: ThreadStatus;
  entries: ActivityMessage[];
  capabilities?: ConversationCapabilities;
  error?: string;
  /** A poll failed after a good load: the list on screen may be behind. */
  reconnecting: boolean;
  hasOlder: boolean;
  loadingOlder: boolean;
  loadOlder: () => void;
  retry: () => void;
  /** Add an entry the server just confirmed (our own sent message) without waiting for the poll. */
  append: (entry: ActivityMessage) => void;
}

/**
 * One job's conversation. Loads the latest page, then polls with the newest cursor so nothing is
 * missed and nothing is duplicated (entries merge by id). Polling pauses while the tab is hidden and
 * catches up on focus or reconnect. Nothing here invents entries: what shows is what the server returned.
 */
export function useActivityThread(jobId: string | undefined, fetchPage: ThreadFetcher, pollMs = THREAD_POLL_MS): ActivityThread {
  const [entries, setEntries] = useState<ActivityMessage[]>([]);
  const [status, setStatus] = useState<ThreadStatus>("loading");
  const [error, setError] = useState<string>();
  const [reconnecting, setReconnecting] = useState(false);
  const [capabilities, setCapabilities] = useState<ConversationCapabilities>();
  const [olderCursor, setOlderCursor] = useState<string>();
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const cursor = useRef<string>();
  const generation = useRef(0);

  useEffect(() => {
    if (!jobId) return;
    const mine = ++generation.current;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    cursor.current = undefined;
    setEntries([]); setStatus("loading"); setError(undefined); setReconnecting(false); setCapabilities(undefined); setOlderCursor(undefined);

    const apply = (page: { items: ActivityMessage[]; nextCursor?: string; capabilities?: ConversationCapabilities; olderCursor?: string }, initial: boolean) => {
      if (stopped || mine !== generation.current) return;
      setEntries(current => mergeActivity(current, page.items));
      cursor.current = page.nextCursor ?? newestCursor(page.items, cursor.current);
      if (page.capabilities) setCapabilities(page.capabilities);
      if (initial) setOlderCursor(page.olderCursor);
    };
    const schedule = () => { if (!stopped) timer = setTimeout(poll, pollMs); };
    const poll = async () => {
      if (stopped) return;
      if (typeof document !== "undefined" && document.hidden) return schedule();
      try {
        const page = await fetchPage(jobId, { after: cursor.current }, controller.signal);
        apply(page, false); setReconnecting(false);
      } catch (e) {
        if ((e as { name?: string })?.name === "AbortError") return;
        setReconnecting(true);
      }
      schedule();
    };
    const wake = () => { if (!document.hidden && navigator.onLine !== false) { clearTimeout(timer); void poll(); } };

    (async () => {
      try {
        const page = await fetchPage(jobId, {}, controller.signal);
        apply(page, true);
        if (!stopped && mine === generation.current) { setStatus("ready"); schedule(); }
      } catch (e) {
        if ((e as { name?: string })?.name === "AbortError" || stopped) return;
        setStatus(isUnavailable(e) ? "unavailable" : "error");
        setError(e instanceof Error ? e.message : "This conversation could not be loaded.");
      }
    })();

    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    window.addEventListener("focus", wake);
    return () => {
      stopped = true; controller.abort(); clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
      window.removeEventListener("focus", wake);
    };
  }, [jobId, pollMs, attempt]); // eslint-disable-line react-hooks/exhaustive-deps -- fetchPage is a stable module function per app

  const loadOlder = useCallback(() => {
    if (!jobId || !olderCursor || loadingOlder) return;
    setLoadingOlder(true);
    fetchPage(jobId, { before: olderCursor })
      .then(page => { setEntries(current => mergeActivity(current, page.items)); setOlderCursor(page.olderCursor); })
      .catch(e => setError(e instanceof Error ? e.message : "Older messages could not be loaded."))
      .finally(() => setLoadingOlder(false));
  }, [jobId, olderCursor, loadingOlder]);

  const append = useCallback((entry: ActivityMessage) => {
    setEntries(current => mergeActivity(current, [entry]));
    cursor.current = newestCursor([entry], cursor.current);
  }, []);

  return { status, entries, capabilities, error, reconnecting, hasOlder: Boolean(olderCursor), loadingOlder, loadOlder, retry: () => setAttempt(n => n + 1), append };
}
