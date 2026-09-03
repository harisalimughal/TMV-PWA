import React from "react";
import { Boxes, ClipboardList, LogOut, Settings, Truck } from "lucide-react";
import { cx } from "../../ui";
import type { DriverProfile } from "../../api/auth";
import type { TabId } from "./BottomNav";
import { ThemeToggleButton } from "./ThemeToggle";
import { NotificationBell } from "./NotificationBell";

const NAV: Array<{ id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "jobs", label: "Jobs", icon: ClipboardList },
  { id: "storage", label: "Storage", icon: Boxes },
  { id: "van", label: "Van", icon: Truck },
  { id: "profile", label: "Settings", icon: Settings }
];

export interface DesktopSidebarProps {
  active: TabId;
  onSelect: (tab: TabId) => void;
  driver: DriverProfile;
  onLogout: () => void;
}

/**
 * The desktop nav rail — a light column on the app ground, hairline border. The
 * active item takes a faint blue wash and a left accent rule; nothing else is
 * coloured.
 */
export function DesktopSidebar({ active, onSelect, driver, onLogout }: DesktopSidebarProps) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[var(--sidebar-width)] flex-col border-r border-line bg-surface lg:flex">
      <div className="flex items-start justify-between gap-2 px-5 pb-4 pt-5">
        <div>
          <span className="block text-heading text-fg">The Man Van</span>
          <span className="mt-0.5 block text-meta text-fg-subtle">Driver Operations</span>
        </div>
        <NotificationBell />
      </div>

      <nav aria-label="Main" className="flex-1 px-2.5 py-2">
        <ul className="flex flex-col gap-0.5">
          {NAV.map(item => {
            const isActive = item.id === active;
            const Icon = item.icon;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => onSelect(item.id)}
                  className={cx(
                    "relative flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-label transition-colors",
                    "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
                    isActive
                      ? "bg-brand-subtle font-semibold text-brand-subtle-fg"
                      : "text-fg-muted hover:bg-surface-sunken hover:text-fg"
                  )}
                >
                  {isActive && (
                    <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-brand" aria-hidden />
                  )}
                  <Icon className={cx("size-[17px] shrink-0", isActive ? "text-brand" : "text-fg-subtle")} />
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex items-center justify-between border-t border-line px-4 py-2.5">
        <span className="text-meta text-fg-subtle">Theme</span>
        <ThemeToggleButton />
      </div>

      <div className="border-t border-line px-3 py-3">
        <div className="flex items-center gap-2.5 px-1">
          <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-surface-sunken text-meta font-semibold text-fg-muted">
            {(driver.initials || "").slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-label text-fg">{driver.fullName}</p>
            <p className="truncate text-meta text-fg-subtle">Driver</p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            aria-label="Sign out"
            className="grid size-8 shrink-0 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-surface-sunken hover:text-danger"
          >
            <LogOut className="size-[15px]" />
          </button>
        </div>
      </div>
    </aside>
  );
}
