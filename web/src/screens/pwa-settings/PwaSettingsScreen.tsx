import React from "react";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "../../app/AppShell";
import { IconButton } from "../../ui";
import { NotificationsCard } from "./components/NotificationsCard";

interface PwaSettingsScreenProps {
  onBack: () => void;
}

/**
 * "PWA Settings" — backend-backed device settings for the installed-app experience.
 * A drill-in screen: it owns the viewport and provides its own back affordance,
 * matching every other drill-in flow in the driver app.
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
          Manage backend-backed PWA features for this device.
        </p>

        <NotificationsCard />
      </div>
    </AppShell>
  );
}
