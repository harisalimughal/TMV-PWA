import React from "react";
import { AppShell } from "../app/AppShell";
import { OfflineBanner } from "../app/OfflineBanner";
import { StorageActions } from "../components/driver";

interface StorageHomeScreenProps {
  onOpenScenario: (scenario: "checkin" | "checkout") => void;
}

/**
 * The Storage tab. Two operational actions — nothing else. There's no storage
 * history endpoint, so the screen doesn't pretend to have one.
 */
export function StorageHomeScreen({ onOpenScenario }: StorageHomeScreenProps) {
  return (
    <AppShell banner={<OfflineBanner />} contentWidth="content">
      <div className="flex flex-col gap-4 px-4 pb-4 pt-6 scroll-pb-nav">
        <div>
          <h1 className="text-title text-fg">Storage</h1>
          <p className="mt-1 text-body text-fg-muted">Record items entering or leaving storage.</p>
        </div>
        <StorageActions
          onCheckIn={() => onOpenScenario("checkin")}
          onCheckOut={() => onOpenScenario("checkout")}
        />
      </div>
    </AppShell>
  );
}
