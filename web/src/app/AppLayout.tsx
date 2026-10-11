import React, { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { ClipboardList, FileClock } from "lucide-react";
import { Modal } from "../ui";
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
  showTopBar?: boolean;
  onOpenPendingSubmissions?: () => void;
  pendingSubmissionsActive?: boolean;
  children: React.ReactNode;
}

/**
 * The authenticated-app frame for the four tab destinations (Jobs / Storage / Van /
 * Settings). Desktop (`lg`+): a persistent left sidebar with the app column padded
 * past it. Mobile: a persistent The Man Van top bar, an edge-to-edge screen, and a
 * fixed bottom tab bar. Drill-in flows (a job, a check-in form, a success screen)
 * are rendered outside this — they own the whole screen and their own back nav.
 */
export function AppLayout({ active, onSelect, driver, onLogout, showTopBar = true, onOpenPendingSubmissions, pendingSubmissionsActive = false, children }: AppLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  return (
    <div className="h-screen-safe bg-bg">
      <DesktopSidebar active={active} onSelect={onSelect} driver={driver} onLogout={onLogout} onOpenPendingSubmissions={onOpenPendingSubmissions} pendingSubmissionsActive={pendingSubmissionsActive} />
      <div className="flex h-full flex-col lg:pl-[var(--sidebar-width)]">
        {showTopBar && (
          <AppTopBar
            className="lg:hidden"
            driver={driver}
            onOpenProfile={() => onSelect("profile")}
            onOpenMenu={() => setMenuOpen(true)}
            menuOpen={menuOpen}
          />
        )}
        <div
          data-persistent-alert-host="app"
          className="mx-auto w-full max-w-content shrink-0 px-4 pt-3 empty:hidden"
        />
        <div className="min-h-0 flex-1">{children}</div>
      </div>
      <BottomNav active={active} onSelect={onSelect} />
      {menuOpen && createPortal(<Modal open placement="left" title="The Man Van" onClose={closeMenu}>
        <nav aria-label="Driver menu" className="flex flex-col gap-1">
          <button type="button" onClick={() => { closeMenu(); onSelect("jobs"); }} className="flex min-h-12 items-center gap-3 rounded-md px-3 text-left text-fg hover:bg-surface-sunken"><ClipboardList size={20} />Jobs</button>
          {onOpenPendingSubmissions && <button type="button" aria-current={pendingSubmissionsActive ? "page" : undefined} onClick={() => { closeMenu(); onOpenPendingSubmissions(); }} className="flex min-h-12 items-center gap-3 rounded-md px-3 text-left text-fg hover:bg-surface-sunken"><FileClock size={20} />Pending Submissions</button>}
        </nav>
      </Modal>, document.body)}
    </div>
  );
}
