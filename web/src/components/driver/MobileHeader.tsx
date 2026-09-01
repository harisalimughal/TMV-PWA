import React from "react";
import { RefreshCw } from "lucide-react";
import { Avatar, cx } from "../../ui";
import { useLocalAvatar } from "../../lib/profile";
import type { DriverProfile } from "../../api/auth";
import { ThemeToggleButton } from "./ThemeToggle";
import { NotificationBell } from "./NotificationBell";

const LONDON = "Europe/London";

function greeting(): string {
  const h = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: LONDON }).format(new Date())
  );
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || full;
}

function dateLabel(): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: LONDON
  }).format(new Date());
}

export interface MobileHeaderProps {
  driver: DriverProfile;
  onOpenProfile: () => void;
  onRefresh: () => void;
  refreshing?: boolean;
  jobCount?: number;
  className?: string;
}

/**
 * The Home header: a compact wordmark row, then the greeting, the date and
 * today's job count. Black text, generous, no heavy rules.
 */
export function MobileHeader({
  driver,
  onOpenProfile,
  onRefresh,
  refreshing = false,
  jobCount,
  className
}: MobileHeaderProps) {
  const localAvatar = useLocalAvatar();

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-label font-semibold text-fg">The Man Van</span>
        <div className="flex items-center gap-1">
          <ThemeToggleButton />
          <NotificationBell />
          <button
            type="button"
            aria-label="Refresh jobs"
            onClick={onRefresh}
            disabled={refreshing}
            className="grid size-9 place-items-center rounded-lg text-fg-subtle transition-colors hover:bg-surface-sunken hover:text-fg disabled:opacity-50"
          >
            <RefreshCw className={cx("size-[17px]", refreshing && "animate-spin")} />
          </button>
          <button
            type="button"
            onClick={onOpenProfile}
            aria-label="Profile"
            className="rounded-full transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <Avatar name={driver.fullName || driver.initials} src={localAvatar} size="md" />
          </button>
        </div>
      </div>

      <div className="mt-5">
        <h1 className="text-title text-fg">
          {greeting()}, {firstName(driver.fullName)}
        </h1>
        <p className="mt-1 text-body text-fg-muted">
          {dateLabel()}
          {jobCount !== undefined && (
            <>
              <span className="mx-1.5 text-fg-subtle">·</span>
              {jobCount === 0 ? "no jobs today" : `${jobCount} job${jobCount === 1 ? "" : "s"} today`}
            </>
          )}
        </p>
      </div>
    </div>
  );
}
