import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useToast } from "./ui/Toast";
import { notifyJobsRefresh } from "../lib/jobsRefresh";
import { playPersistentAlertSound, primePersistentAlertSound } from "../lib/alertSound";
import { dismissNotification, listNotifications } from "../lib/pwa/notificationLog";

interface ZoneAlert {
  id: number;
  notificationId?: number;
  title: string;
  body: string;
}

let nextZoneAlertId = 1;

const PERSISTENT_KINDS = new Set([
  "broadcast_message",
  "congestion_zone",
  "tunnel_zone",
  "arrival_proof_overdue"
]);

export function InAppNotificationListener(): React.ReactElement | null {
  const toast = useToast();
  // Congestion/tunnel zone pushes (congestion-zone.service.ts's data.kind) get their
  // own persistent notice instead of the usual toast -- see the render below. A toast
  // that fades out in a few seconds is too easy to miss while driving, and this is
  // money the office needs to know got flagged, so it stays until the driver explicitly
  // closes it.
  const [zoneAlerts, setZoneAlerts] = useState<ZoneAlert[]>([]);

  useEffect(() => {
    let active = true;

    // Pushes received while the app is closed are already in IndexedDB. Restore
    // persistent notices on startup and keep them visible until their own close
    // button is used; bell read/unread state is intentionally separate.
    if (typeof indexedDB !== "undefined") {
      void listNotifications()
        .then(items => {
          if (!active) return;
          const restored = items
            .filter(item => item.kind && PERSISTENT_KINDS.has(item.kind) && !item.dismissed)
            .map(item => ({
              id: nextZoneAlertId++,
              notificationId: item.id,
              title: item.title,
              body: item.body
            }));
          setZoneAlerts(prev => {
            const existingIds = new Set(prev.map(item => item.notificationId));
            return [...restored.filter(item => !existingIds.has(item.notificationId)), ...prev];
          });
        })
        .catch(() => {
          // IndexedDB can be unavailable in private browsing; live pushes still work.
        });
    }

    const primeAudio = () => primePersistentAlertSound();
    window.addEventListener("pointerdown", primeAudio, { once: true, passive: true });
    window.addEventListener("keydown", primeAudio, { once: true });
    window.addEventListener("touchstart", primeAudio, { once: true, passive: true });

    // 1. BroadcastChannel listener (from service worker / push-worker.js)
    // Tapping the toast takes the driver/admin to whatever the notification was
    // about -- the same place tapping the real OS notification goes (push-worker.js's
    // notificationclick). A full navigation, not client-side routing, deliberately:
    // this is the one place a push's `url` is handled outside the service worker, and
    // matching that handler's own approach keeps both paths behaving identically
    // rather than maintaining two different navigation strategies for the same link.
    const notify = (payload: Record<string, any>) => {
      const title = payload.title || "The Man Van";
      const body = payload.body || "New update received";
      const url = payload.url;
      const kind = payload.data?.kind;
      const notificationId = typeof payload.notificationId === "number" ? payload.notificationId : undefined;

      if (PERSISTENT_KINDS.has(kind)) {
        setZoneAlerts(prev => {
          if (notificationId && prev.some(item => item.notificationId === notificationId)) return prev;
          return [...prev, { id: nextZoneAlertId++, notificationId, title, body }];
        });
        playPersistentAlertSound();
      } else {
        toast.info(`${title}: ${body}`, url ? { onClick: () => { window.location.href = url; } } : undefined);
      }
      // Any push (new job assigned, reassigned, a booking edited, ...) is a sign the
      // Jobs list may be stale -- refetch it in the background rather than waiting
      // for the driver to notice and pull-to-refresh themselves.
      notifyJobsRefresh();
    };

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel("tmv_in_app_notifications");
      channel.onmessage = (event) => {
        if (event.data?.type === "PUSH_NOTIFICATION_RECEIVED") {
          notify(event.data.payload || {});
        }
      };
    }

    // 2. Direct ServiceWorker postMessage listener
    const onSwMessage = (event: MessageEvent) => {
      if (event.data?.type === "PUSH_NOTIFICATION_RECEIVED") {
        notify(event.data.payload || {});
      }
    };

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", onSwMessage);
    }

    return () => {
      active = false;
      window.removeEventListener("pointerdown", primeAudio);
      window.removeEventListener("keydown", primeAudio);
      window.removeEventListener("touchstart", primeAudio);
      if (channel) channel.close();
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", onSwMessage);
      }
    };
  }, [toast]);

  const closeAlert = (alert: ZoneAlert) => {
    setZoneAlerts(prev => prev.filter(item => item.id !== alert.id));
    if (alert.notificationId) {
      void dismissNotification(alert.notificationId).catch(() => {
        // The notice is closed for this session even if storage is unavailable.
      });
    }
  };

  if (zoneAlerts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed left-0 right-0 top-[calc(env(safe-area-inset-top)+190px)] z-[15] flex flex-col items-center gap-2 px-4 lg:left-[var(--sidebar-width)]"
      role="alert"
      aria-live="assertive"
    >
      {zoneAlerts.map(alert => (
        <div
          key={alert.id}
          className="pointer-events-auto relative w-full max-w-[calc(var(--content-max-width)-2rem)] rounded-[8px] border border-[#F1D989] bg-[#FFFBE6] px-5 py-4 text-center text-[#8A5A21] shadow-sm animate-in slide-in-from-top-4"
        >
          <div className="min-w-0">
            <p className="text-[13px] font-bold leading-snug">{alert.title}</p>
            <p className="mt-3 text-[13px] font-bold leading-snug">{alert.body}</p>
          </div>
          <button
            onClick={() => closeAlert(alert)}
            className="absolute right-2 top-2 shrink-0 rounded-full p-1 text-[#8A5A21]/70 hover:text-[#8A5A21] focus-visible:outline-[#8A5A21]"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
