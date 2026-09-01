import React, { useEffect } from "react";
import { useToast } from "./ui/Toast";

export function InAppNotificationListener(): React.ReactElement | null {
  const toast = useToast();

  useEffect(() => {
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
      toast.info(`${title}: ${body}`, url ? { onClick: () => { window.location.href = url; } } : undefined);
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
      if (channel) channel.close();
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", onSwMessage);
      }
    };
  }, [toast]);

  return null;
}

