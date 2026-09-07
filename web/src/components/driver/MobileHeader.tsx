import React from "react";
import type { DriverProfile } from "../../api/auth";
import { useCountUp } from "../../lib/useCountUp";

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
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: LONDON
  }).format(new Date());
}

export interface MobileHeaderProps {
  driver: DriverProfile;
  jobCount?: number;
  className?: string;
}

/**
 * The Home greeting: the salutation and a mono date / job-count line. The The Man
 * Van lockup and icon cluster live in the persistent <AppTopBar>; refreshing is by
 * pull-down on the list. This is just the in-content greeting — the design's
 * `.head` block.
 */
export function MobileHeader({ driver, jobCount, className }: MobileHeaderProps) {
  const rolled = useCountUp(jobCount ?? 0);
  return (
    <div className={className}>
      <h1 className="text-display text-fg">
        {greeting()}, {firstName(driver.fullName)}
      </h1>
      <p className="mt-1.5 flex items-center gap-2 text-[13px] text-fg-muted">
        <span className="font-mono text-[12.5px] text-fg">{dateLabel()}</span>
        {jobCount !== undefined && (
          <>
            <span className="size-[3px] rounded-full bg-fg-subtle" aria-hidden />
            <span>
              {jobCount === 0 ? (
                "no jobs today"
              ) : (
                <>
                  <span className="font-mono tabular-nums text-fg">{rolled}</span> job{jobCount === 1 ? "" : "s"} today
                </>
              )}
            </span>
          </>
        )}
      </p>
    </div>
  );
}
