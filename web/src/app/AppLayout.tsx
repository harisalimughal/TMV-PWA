import React from "react";
import { DesktopSidebar } from "../components/driver/DesktopSidebar";
import { AppTopBar } from "../components/driver/AppTopBar";
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
 * The authenticated-app frame for the four tab destinations (Jobs / Storage / Van /
 * Settings). Desktop (`lg`+): a persistent left sidebar with the app column padded
 * past it. Mobile: a persistent The Man Van top bar, an edge-to-edge screen, and a
 * fixed bottom tab bar. Drill-in flows (a job, a check-in form, a success screen)
 * are rendered outside this — they own the whole screen and their own back nav.
 */
export function AppLayout({ active, onSelect, driver, onLogout, children }: AppLayoutProps) {
  return (
    <div className="h-screen-safe bg-bg">
      <DesktopSidebar active={active} onSelect={onSelect} driver={driver} onLogout={onLogout} />
      <div className="flex h-full flex-col lg:pl-[var(--sidebar-width)]">
        <AppTopBar
          className="lg:hidden"
          driver={driver}
          onOpenProfile={() => onSelect("profile")}
        />
        <div className="min-h-0 flex-1">{children}</div>
      </div>
      <BottomNav active={active} onSelect={onSelect} />
    </div>
  );
}
