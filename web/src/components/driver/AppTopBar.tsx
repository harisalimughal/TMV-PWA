import React from "react";
import { Truck } from "lucide-react";
import { cx } from "../../ui";
import type { DriverProfile } from "../../api/auth";
import { ThemeToggleButton } from "./ThemeToggle";
import { NotificationBell } from "./NotificationBell";

export interface AppTopBarProps {
  driver: DriverProfile;
  /** Opens the Settings screen — wired to the "profile" tab. */
  onOpenProfile: () => void;
  className?: string;
}

function initials(driver: DriverProfile): string {
  if (driver.initials) return driver.initials.slice(0, 2).toUpperCase();
  const parts = (driver.fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * The persistent app top bar — the The Man Van lockup with a "Driver" sub-label
 * and a quiet icon cluster (theme, notifications, profile). Shown on every tab
 * screen (Jobs / Storage / Van / Settings) on mobile; the desktop layout uses the
 * sidebar instead, so this is hidden from `lg` up by the layout that renders it.
 *
 * A blurred translucent bar with a hairline rule beneath it, clearing the notch.
 */
export function AppTopBar({ driver, onOpenProfile, className }: AppTopBarProps) {
  return (
    <header
      className={cx(
        "shrink-0 border-b border-line bg-bar/80 backdrop-blur-xl backdrop-saturate-150 pt-safe",
        className
      )}
    >
      <div className="flex min-h-[60px] items-center justify-between gap-3 px-[18px]">
        <div className="flex items-center gap-2.5">
          <span
            className="grid size-[34px] shrink-0 place-items-center rounded-[11px] bg-brand text-brand-fg"
            aria-hidden
          >
            <Truck className="size-5" strokeWidth={2} />
          </span>
          <div className="leading-none">
            <div className="text-[15.5px] font-bold tracking-[-0.01em] text-fg">The Man Van</div>
            <div className="mt-[3px] text-[11px] tracking-[0.02em] text-fg-subtle">Driver</div>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <ThemeToggleButton />
          <NotificationBell />
          <button
            type="button"
            onClick={onOpenProfile}
            aria-label="Settings"
            className="ml-1 grid size-[34px] shrink-0 place-items-center rounded-pill border border-line-strong bg-surface-raised text-[12px] font-bold uppercase text-fg-muted transition-transform duration-fast active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {initials(driver)}
          </button>
        </div>
      </div>
    </header>
  );
}
