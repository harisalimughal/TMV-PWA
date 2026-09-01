import React, { useEffect } from "react";
import { useToast } from "./ui/Toast";

export function InAppNotificationListener(): React.ReactElement | null {
  const toast = useToast();

  useEffect(() => {
    // 1. BroadcastChannel listener (from service worker / push-worker.js)
    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel("tmv_in_app_notifications");
      channel.onmessage = (event) => {
        if (event.data?.type === "PUSH_NOTIFICATION_RECEIVED") {
          const payload = event.data.payload || {};
          const title = payload.title || "The Man Van";
          const body = payload.body || "New update received";
          toast.info(`${title}: ${body}`);
        }
      };
    }

    // 2. Direct ServiceWorker postMessage listener
    const onSwMessage = (event: MessageEvent) => {
      if (event.data?.type === "PUSH_NOTIFICATION_RECEIVED") {
        const payload = event.data.payload || {};
        const title = payload.title || "The Man Van";
        const body = payload.body || "New update received";
        toast.info(`${title}: ${body}`);
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
