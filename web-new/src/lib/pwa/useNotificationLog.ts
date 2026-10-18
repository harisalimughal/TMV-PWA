import { useCallback, useEffect, useState } from "react";
import { listNotifications, markAllRead, markRead, type LoggedNotification } from "./notificationLog";

export interface NotificationLogApi {
  items: LoggedNotification[];
  unreadCount: number;
  loading: boolean;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  refresh: () => void;
}

/**
 * Live view over the IndexedDB-backed notification log (notificationLog.ts). push-
 * worker.js writes a row on every push, whether or not a tab is open; this refreshes
 * on mount and again whenever push-worker.js's existing BroadcastChannel fires (it
 * already posts on every push, for the in-app toast -- reused here rather than adding
 * a second channel) so the bell's unread badge updates live while the app is open,
 * not just next time it's reopened.
 */
export function useNotificationLog(): NotificationLogApi {
  const [items, setItems] = useState<LoggedNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    if (typeof indexedDB === "undefined") {
      setLoading(false);
      return;
    }
    listNotifications()
      .then(setItems)
      .catch(() => {
        /* IndexedDB can throw in private-browsing contexts -- an empty bell beats a
         * crashed header. */
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel("tmv_in_app_notifications");
      channel.onmessage = event => {
        if (event.data?.type === "PUSH_NOTIFICATION_RECEIVED") refresh();
      };
    }
    return () => channel?.close();
  }, [refresh]);

  const handleMarkRead = useCallback(
    async (id: number) => {
      await markRead(id);
      refresh();
    },
    [refresh]
  );

  const handleMarkAllRead = useCallback(async () => {
    await markAllRead();
    refresh();
  }, [refresh]);

  return {
    items,
    unreadCount: items.filter(item => !item.read).length,
    loading,
    markRead: handleMarkRead,
    markAllRead: handleMarkAllRead,
    refresh
  };
}
