import React, { useEffect, useState } from "react";
import { ShieldAlert, X } from "lucide-react";
import { useToast } from "./ui/Toast";
import { notifyJobsRefresh } from "../lib/jobsRefresh";
import { playPersistentAlertSound, primePersistentAlertSound } from "../lib/alertSound";

interface ZoneAlert {
  id: number;
  title: string;
  body: string;
}

let nextZoneAlertId = 1;

export function InAppNotificationListener(): React.ReactElement | null {
  const toast = useToast();
  // Congestion/tunnel zone pushes (congestion-zone.service.ts's data.kind) get their
  // own persistent red popup instead of the usual toast -- see the render below. A
  // toast that fades out in a few seconds is too easy to miss while driving, and this
  // is money the office needs to know got flagged, so it stays until the driver
  // explicitly closes it.
  const [zoneAlerts, setZoneAlerts] = useState<ZoneAlert[]>([]);

  useEffect(() => {
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

      if (
        kind === "broadcast_message" ||
        kind === "congestion_zone" ||
        kind === "tunnel_zone" ||
        kind === "arrival_proof_overdue"
      ) {
        setZoneAlerts(prev => [...prev, { id: nextZoneAlertId++, title, body }]);
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
      window.removeEventListener("pointerdown", primeAudio);
      window.removeEventListener("keydown", primeAudio);
      window.removeEventListener("touchstart", primeAudio);
      if (channel) channel.close();
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", onSwMessage);
      }
    };
  }, [toast]);

  if (zoneAlerts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+165px)] z-[320] flex flex-col items-center gap-2 px-3"
      role="alert"
      aria-live="assertive"
    >
      {zoneAlerts.map(alert => (
        <div
          key={alert.id}
          className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card bg-danger-signal px-4 py-3 text-white shadow-lg animate-in slide-in-from-top-4"
        >
          <ShieldAlert className="size-5 shrink-0 mt-0.5" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold leading-snug">{alert.title}</p>
            <p className="mt-0.5 text-[13px] leading-snug">{alert.body}</p>
          </div>
          <button
            onClick={() => setZoneAlerts(prev => prev.filter(a => a.id !== alert.id))}
            className="-mr-1 -mt-1 shrink-0 p-1 opacity-80 hover:opacity-100"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
