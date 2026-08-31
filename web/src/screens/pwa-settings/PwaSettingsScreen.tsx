import React from "react";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "../../app/AppShell";
import { IconButton } from "../../ui";
import { InstallAppCard } from "./components/InstallAppCard";
import { InstallationStatusCard } from "./components/InstallationStatusCard";
import { AppUpdatesCard } from "./components/AppUpdatesCard";
import { AppVersionCard } from "./components/AppVersionCard";
import { OfflineModeCard } from "./components/OfflineModeCard";
import { NotificationsCard } from "./components/NotificationsCard";
import { StorageCard } from "./components/StorageCard";
import { DiagnosticsSection } from "./components/DiagnosticsSection";

interface PwaSettingsScreenProps {
  onBack: () => void;
}

/**
 * "PWA Settings" — install, updates, offline, notifications and storage for the
 * installed-app experience. A drill-in screen: it owns the viewport and provides its
 * own back affordance, matching every other drill-in flow in the driver app.
 */
export function PwaSettingsScreen({ onBack }: PwaSettingsScreenProps) {
  return (
    <AppShell
      header={
        <div className="flex items-center gap-2.5">
          <IconButton
            aria-label="Back to profile"
            icon={<ArrowLeft />}
            onClick={onBack}
            className="-ml-1.5 text-fg"
          />
          <h1 className="text-heading text-fg">PWA Settings</h1>
        </div>
      }
    >
      <div className="flex flex-col gap-4 px-4 pb-[calc(env(safe-area-inset-bottom)+40px)] pt-5">
        <p className="text-helper text-fg-subtle">
          Manage how TMV BOT installs, updates and behaves on this device.
        </p>

        <InstallAppCard />
        <InstallationStatusCard />
        <AppUpdatesCard />
        <AppVersionCard />
        <OfflineModeCard />
        <NotificationsCard />
        <StorageCard />
        <DiagnosticsSection />
      </div>
    </AppShell>
  );
}
