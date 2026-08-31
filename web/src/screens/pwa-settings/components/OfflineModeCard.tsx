import React, { useEffect, useState } from "react";
import { CloudOff, HardDriveDownload, Wifi, WifiOff } from "lucide-react";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { useServiceWorkerUpdate } from "../hooks/useServiceWorkerUpdate";
import { getOfflineReadiness } from "../../../lib/pwa/caches";
import type { OfflineReadiness } from "../../../lib/pwa/types";
import { SettingCard } from "./SettingCard";
import { StatusRow } from "./StatusRow";

const READINESS_LABEL: Record<OfflineReadiness, string> = {
  ready: "Offline resources ready",
  unavailable: "Offline resources unavailable",
  unknown: "Preparing offline resources",
};

/**
 * Section 6: connectivity + honest offline-readiness.
 *
 * The service worker precaches the app shell and design assets only — job and
 * account data always loads live and is never stored. The copy reflects exactly
 * that; it does not claim full offline functionality.
 */
export function OfflineModeCard() {
  const online = useOnlineStatus();
  const { controlled, offlineReady } = useServiceWorkerUpdate();
  const [readiness, setReadiness] = useState<OfflineReadiness>("unknown");

  useEffect(() => {
    let cancelled = false;
    void getOfflineReadiness().then(r => {
      if (!cancelled) setReadiness(r);
    });
    return () => {
      cancelled = true;
    };
  }, [controlled, offlineReady]);

  return (
    <SettingCard
      icon={<CloudOff />}
      title="Offline Mode"
      description="TMV BOT can keep essential app resources available when your connection is interrupted."
    >
      <div className="flex flex-col gap-3">
        <StatusRow
          label="Connection"
          value={online ? "Online" : "Offline"}
          tone={online ? "success" : "warning"}
          icon={online ? <Wifi aria-hidden /> : <WifiOff aria-hidden />}
        />
        <StatusRow
          label="Offline readiness"
          value={READINESS_LABEL[readiness]}
          tone={readiness === "ready" ? "success" : readiness === "unavailable" ? "neutral" : "info"}
          icon={<HardDriveDownload aria-hidden />}
          hint="App screens, styles and fonts are cached so the app opens without a connection."
        />
        <p className="text-helper text-fg-subtle">
          Job lists, job details and account data always load live from the network
          and are never stored on this device.
        </p>
      </div>
    </SettingCard>
  );
}
