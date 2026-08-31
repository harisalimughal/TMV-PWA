import { useEffect, useState } from "react";
import {
  getDisplayMode,
  getPlatform,
  supportsServiceWorker,
} from "../../../lib/pwa/platform";
import { getOfflineReadiness } from "../../../lib/pwa/caches";
import { APP_VERSION_LABEL, BUILD_ID } from "../../../lib/pwa/version";
import type { OfflineReadiness, PwaDiagnostics } from "../../../lib/pwa/types";
import { useOnlineStatus } from "./useOnlineStatus";
import { useNotificationPermission } from "./useNotificationPermission";
import { usePwaInstall } from "./usePwaInstall";
import { useServiceWorkerUpdate } from "./useServiceWorkerUpdate";

function serviceWorkerState(controlled: boolean): PwaDiagnostics["serviceWorker"] {
  if (!supportsServiceWorker()) return "unsupported";
  return controlled ? "active" : "inactive";
}

/**
 * Aggregates the other hooks into one non-sensitive snapshot for the collapsible
 * Diagnostics section. No tokens, URLs, IDs or account data — only capability and
 * status booleans.
 */
export function usePwaDiagnostics(): PwaDiagnostics {
  const online = useOnlineStatus();
  const { permission } = useNotificationPermission();
  const { canPrompt } = usePwaInstall();
  const { controlled } = useServiceWorkerUpdate();
  const [offlineReadiness, setOfflineReadiness] =
    useState<OfflineReadiness>("unknown");

  useEffect(() => {
    let cancelled = false;
    void getOfflineReadiness().then(r => {
      if (!cancelled) setOfflineReadiness(r);
    });
    return () => {
      cancelled = true;
    };
  }, [controlled]);

  return {
    serviceWorker: serviceWorkerState(controlled),
    displayMode: getDisplayMode(),
    platform: getPlatform(),
    online,
    notificationPermission: permission,
    installPromptAvailable: canPrompt,
    offlineReadiness,
    appVersion: APP_VERSION_LABEL,
    buildId: BUILD_ID,
  };
}
