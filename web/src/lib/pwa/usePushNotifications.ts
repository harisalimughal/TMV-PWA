import { useCallback, useEffect, useState } from "react";
import { supportsNotifications, supportsPush, getPlatform } from "./platform";
import type { Platform } from "./types";
import { urlBase64ToUint8Array } from "./vapidHelper";

export interface PushNotificationsState {
  permission: NotificationPermission | "unsupported";
  isSupported: boolean;
  isSubscribed: boolean;
  isLoading: boolean;
  platform: Platform;
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<boolean>;
  sendTestNotification: () => Promise<boolean>;
}

export function usePushNotifications(): PushNotificationsState {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() => {
    if (!supportsNotifications()) return "unsupported";
    return Notification.permission;
  });
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentSub, setCurrentSub] = useState<PushSubscription | null>(null);

  const isSupported = supportsNotifications() && supportsPush();
  const platform = getPlatform();

  // Check existing push subscription on mount or permission change
  const checkSubscription = useCallback(async () => {
    if (!isSupported || !("serviceWorker" in navigator)) return;

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setCurrentSub(sub);
      setIsSubscribed(!!sub);
      setPermission(Notification.permission);
    } catch (err) {
      console.warn("Failed to check push subscription", err);
    }
  }, [isSupported]);

  useEffect(() => {
    checkSubscription();
  }, [checkSubscription]);

  // Subscribe to push notifications
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;
    setIsLoading(true);

    try {
      // 1. Request browser permission
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setIsLoading(false);
        return false;
      }

      // 2. Fetch VAPID public key from backend
      const res = await fetch("/api/push/vapid-public-key");
      if (!res.ok) throw new Error("Failed to fetch VAPID public key");
      const { publicKey } = await res.json();
      if (!publicKey) throw new Error("No public key returned");

      // 3. Subscribe with PushManager
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();

      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as any
        });
      }

      // 4. Send subscription to server
      const saveRes = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: sub.toJSON(),
          platform
        })
      });

      if (!saveRes.ok) throw new Error("Failed to register subscription on server");

      setCurrentSub(sub);
      setIsSubscribed(true);
      setIsLoading(false);
      return true;
    } catch (err) {
      console.error("Push subscription failed", err);
      setIsLoading(false);
      return false;
    }
  }, [isSupported, platform]);

  // Unsubscribe from push notifications
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!currentSub) return true;
    setIsLoading(true);

    try {
      const endpoint = currentSub.endpoint;

      // 1. Tell server to delete subscription
      await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint })
      }).catch(() => {});

      // 2. Unsubscribe browser PushManager
      await currentSub.unsubscribe();

      setCurrentSub(null);
      setIsSubscribed(false);
      setIsLoading(false);
      return true;
    } catch (err) {
      console.error("Unsubscribe failed", err);
      setIsLoading(false);
      return false;
    }
  }, [currentSub]);

  // Send a test notification to this device
  const sendTestNotification = useCallback(async (): Promise<boolean> => {
    if (!currentSub) return false;
    setIsLoading(true);

    try {
      const res = await fetch("/api/push/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: currentSub.toJSON()
        })
      });

      setIsLoading(false);
      return res.ok;
    } catch (err) {
      console.error("Test notification failed", err);
      setIsLoading(false);
      return false;
    }
  }, [currentSub]);

  return {
    permission,
    isSupported,
    isSubscribed,
    isLoading,
    platform,
    subscribe,
    unsubscribe,
    sendTestNotification
  };
}
