import { useCallback, useEffect, useState } from "react";
import { supportsNotifications, supportsPush } from "../../../lib/pwa/platform";
import type { NotificationPermissionState } from "../../../lib/pwa/types";

interface NotificationPermissionApi {
  permission: NotificationPermissionState;
  supported: boolean;
  /** Permission is granted AND the browser can receive web push. Distinct from
   *  `permission === "granted"`: push delivery is not wired up in this app yet. */
  pushCapable: boolean;
  /** Only meaningful when `permission === "default"`. Requests permission as a direct
   *  result of a user gesture and returns the resulting state. */
  request: () => Promise<NotificationPermissionState>;
}

function currentPermission(): NotificationPermissionState {
  if (!supportsNotifications()) return "unsupported";
  return Notification.permission;
}

/**
 * Browser notification permission state + a gesture-driven request.
 *
 * This deliberately stops at *permission*. There is no push backend in this repo, so
 * no `PushManager.subscribe()` call is made — `pushCapable` reports whether one
 * *could* be added later.
 */
export function useNotificationPermission(): NotificationPermissionApi {
  const [permission, setPermission] = useState<NotificationPermissionState>(
    currentPermission,
  );

  // Pick up changes made in browser settings while the app is open.
  useEffect(() => {
    if (!supportsNotifications()) return;
    let cancelled = false;
    const sync = () => {
      if (!cancelled) setPermission(Notification.permission);
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    document.addEventListener("visibilitychange", onVisible);

    let permStatus: PermissionStatus | undefined;
    navigator.permissions
      ?.query({ name: "notifications" as PermissionName })
      .then(status => {
        if (cancelled) return;
        permStatus = status;
        status.addEventListener("change", sync);
      })
      .catch(() => {
        /* Permissions API not available for `notifications` — visibility sync covers it */
      });

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      permStatus?.removeEventListener("change", sync);
    };
  }, []);

  const request = useCallback(async (): Promise<NotificationPermissionState> => {
    if (!supportsNotifications()) return "unsupported";
    if (Notification.permission !== "default") {
      setPermission(Notification.permission);
      return Notification.permission;
    }
    try {
      // Older Safari only supported the callback form.
      const result = await new Promise<NotificationPermission>(resolve => {
        const maybePromise = Notification.requestPermission(resolve);
        if (maybePromise && typeof maybePromise.then === "function") {
          maybePromise.then(resolve).catch(() => resolve(Notification.permission));
        }
      });
      setPermission(result);
      return result;
    } catch {
      const fallback = Notification.permission;
      setPermission(fallback);
      return fallback;
    }
  }, []);

  return {
    permission,
    supported: supportsNotifications(),
    pushCapable: permission === "granted" && supportsPush(),
    request,
  };
}
