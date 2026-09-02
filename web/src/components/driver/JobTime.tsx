import React from "react";
import { cx } from "../../ui";

const LONDON = "Europe/London";

function parts(iso: string) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return {
    time: d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: LONDON }),
    day: d
      .toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: LONDON })
      .toUpperCase()
  };
}

export interface JobTimeProps {
  iso: string;
  /**
   * `column` — the schedule row's time column (strong time, tiny date under).
   * `display` — the large time on the featured block / row detail.
   * `onDark` — display, white.
   */
  variant?: "column" | "display" | "onDark";
  className?: string;
}

/**
 * A job's time as part of the page grid — no grey box. Tabular figures, so times
 * line up down the schedule like a departures board.
 */
export function JobTime({ iso, variant = "column", className }: JobTimeProps) {
  const p = parts(iso);

  if (variant === "onDark") {
    return (
      <span className={cx("text-[34px] font-bold leading-none tracking-[-0.02em] text-white", className)}>
        {p?.time ?? "--:--"}
      </span>
    );
  }

  if (variant === "display") {
    return (
      <div className={cx("leading-none", className)}>
        <div className="text-[32px] font-bold leading-none tracking-[-0.02em] text-fg">
          {p?.time ?? "--:--"}
        </div>
        <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-fg-subtle">
          {p?.day ?? ""}
        </div>
      </div>
    );
  }

  return (
    <div className={cx("leading-none", className)}>
      <div className="text-[16px] font-bold tracking-[-0.01em] text-fg">{p?.time ?? "--:--"}</div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.05em] text-fg-subtle">
        {p?.day ?? ""}
      </div>
    </div>
  );
}
