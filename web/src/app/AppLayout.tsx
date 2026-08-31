import React from "react";
import { DesktopSidebar } from "../components/driver/DesktopSidebar";
import { BottomNav, type TabId } from "../components/driver/BottomNav";
import type { DriverProfile } from "../api/auth";

export type { TabId };

export interface AppLayoutProps {
  active: TabId;
  onSelect: (tab: TabId) => void;
  driver: DriverProfile;
  onLogout: () => void;
  children: React.ReactNode;
}

/**
 * The authenticated-app frame for the three tab destinations (Jobs / Storage /
 * Profile). Desktop (`lg`+): a persistent left sidebar with the app column padded
 * past it. Mobile: an edge-to-edge screen with a fixed bottom tab bar. Drill-in
 * flows (a job, a check-in form, a success screen) are rendered outside this — they
 * own the whole screen and their own back navigation.
 */
export function AppLayout({ active, onSelect, driver, onLogout, children }: AppLayoutProps) {
  return (
    <div className="h-screen-safe bg-bg">
      <DesktopSidebar active={active} onSelect={onSelect} driver={driver} onLogout={onLogout} />
      <div className="h-full lg:pl-[var(--sidebar-width)]">{children}</div>
      <BottomNav active={active} onSelect={onSelect} />
    </div>
  );
}
