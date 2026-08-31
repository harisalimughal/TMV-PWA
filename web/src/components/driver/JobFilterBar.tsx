import React from "react";
import { CalendarDays, X } from "lucide-react";
import { cx } from "../../ui";
import { haptics } from "../../lib/haptics";
import { formatDateKeyShort, type JobFilter } from "../../lib/jobDates";

export interface JobFilterBarProps {
  value: JobFilter;
  onChange: (filter: JobFilter) => void;
  counts: { today: number; tomorrow: number; upcoming: number };
  /** Selected custom date "YYYY-MM-DD", or null. */
  customDate: string | null;
  onOpenDatePicker: () => void;
  onClearCustomDate: () => void;
  className?: string;
}

const PILL_BASE =
  "snap-start shrink-0 inline-flex items-center gap-1.5 h-11 rounded-pill border px-3.5 " +
  "text-label font-semibold whitespace-nowrap transition duration-fast ease-out " +
  "active:scale-[0.97] motion-reduce:active:scale-100 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

const PILL_ACTIVE = "border-brand bg-brand text-brand-fg shadow-xs";
const PILL_IDLE =
  "border-line bg-surface text-fg-muted hover:bg-surface-sunken hover:text-fg";

function Count({ n, active }: { n: number; active: boolean }) {
  return (
    <span
      className={cx(
        "grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[11px] font-bold tabular-nums",
        active ? "bg-brand-fg/20 text-brand-fg" : "bg-surface-sunken text-fg-subtle",
      )}
    >
      {n}
    </span>
  );
}

/**
 * The primary date navigation for the Jobs screen — brand-filled pills, not a
 * dropdown. Horizontally scrollable (no wrap) when the row is wider than the
 * viewport; each pill is a 44px tap target. The active pill is a solid brand fill
 * with elevation, so the current view is unmistakable in both themes.
 */
export function JobFilterBar({
  value,
  onChange,
  counts,
  customDate,
  onOpenDatePicker,
  onClearCustomDate,
  className,
}: JobFilterBarProps) {
  const select = (f: JobFilter) => {
    if (f !== value) haptics.tap();
    onChange(f);
  };

  const dateActive = value === "custom";

  return (
    <div
      role="tablist"
      aria-label="Filter jobs by date"
      className={cx(
        "flex items-center gap-2 overflow-x-auto scroll-touch pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      <button
        type="button"
        role="tab"
        aria-selected={value === "today"}
        onClick={() => select("today")}
        className={cx(PILL_BASE, value === "today" ? PILL_ACTIVE : PILL_IDLE)}
      >
        Today
        <Count n={counts.today} active={value === "today"} />
      </button>

      <button
        type="button"
        role="tab"
        aria-selected={value === "tomorrow"}
        onClick={() => select("tomorrow")}
        className={cx(PILL_BASE, value === "tomorrow" ? PILL_ACTIVE : PILL_IDLE)}
      >
        Tomorrow
        <Count n={counts.tomorrow} active={value === "tomorrow"} />
      </button>

      <button
        type="button"
        role="tab"
        aria-selected={value === "upcoming"}
        onClick={() => select("upcoming")}
        className={cx(PILL_BASE, value === "upcoming" ? PILL_ACTIVE : PILL_IDLE)}
      >
        Upcoming
        <Count n={counts.upcoming} active={value === "upcoming"} />
      </button>

      {customDate ? (
        <div
          className={cx(
            "snap-start shrink-0 inline-flex items-center rounded-pill border transition duration-fast",
            dateActive
              ? "border-brand bg-brand text-brand-fg shadow-xs"
              : "border-line bg-surface text-fg-muted hover:text-fg",
          )}
        >
          <button
            type="button"
            role="tab"
            aria-selected={dateActive}
            onClick={() => (dateActive ? onOpenDatePicker() : select("custom"))}
            className={cx(
              "inline-flex h-11 items-center gap-1.5 rounded-l-pill pl-3.5 pr-2 text-label font-semibold whitespace-nowrap active:scale-[0.97] motion-reduce:active:scale-100",
              "focus-visible:outline-2 focus-visible:-outline-offset-2",
              dateActive ? "focus-visible:outline-brand-fg" : "focus-visible:outline-brand",
            )}
          >
            <CalendarDays className="size-4" aria-hidden />
            {formatDateKeyShort(customDate)}
          </button>
          <button
            type="button"
            aria-label="Clear date filter"
            onClick={onClearCustomDate}
            className={cx(
              "grid h-11 w-8 place-items-center rounded-r-pill transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2",
              dateActive
                ? "hover:bg-brand-fg/15 focus-visible:outline-brand-fg"
                : "hover:bg-surface-sunken focus-visible:outline-brand",
            )}
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      ) : (
        <button
          type="button"
          role="tab"
          aria-selected={dateActive}
          onClick={onOpenDatePicker}
          className={cx(PILL_BASE, dateActive ? PILL_ACTIVE : PILL_IDLE)}
        >
          <CalendarDays className="size-4" aria-hidden />
          Date
        </button>
      )}
    </div>
  );
}
