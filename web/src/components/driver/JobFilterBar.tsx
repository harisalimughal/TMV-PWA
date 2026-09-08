import React, { useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cx } from "../../ui";
import { haptics } from "../../lib/haptics";
import { useCountUp } from "../../lib/useCountUp";
import { formatDateKeyShort, type JobFilter } from "../../lib/jobDates";

export interface JobFilterBarProps {
  value: JobFilter;
  onChange: (filter: JobFilter) => void;
  counts: { today: number; upcoming: number; previous: number };
  /** Selected custom date "YYYY-MM-DD", or null. */
  customDate: string | null;
  onOpenDatePicker: () => void;
  onClearCustomDate: () => void;
  className?: string;
}

function Counter({ n }: { n: number }) {
  const rolled = useCountUp(n);
  return <span className="font-mono text-[12px] font-semibold tabular-nums opacity-85">{rolled}</span>;
}

/**
 * The primary date navigation for the Jobs screen — a four-way segmented control:
 * Today / Previous / Upcoming / Diary. A single raised pill slides between the tabs
 * (measured from the live DOM, so it also fits the variable-width date chip); each
 * fixed tab carries a rolling mono count. The active "Previous" tab turns amber,
 * matching the alert strip.
 */
export function JobFilterBar({
  value,
  onChange,
  counts,
  customDate,
  onOpenDatePicker,
  onClearCustomDate,
  className
}: JobFilterBarProps) {
  const select = (f: JobFilter) => {
    if (f !== value) haptics.tap();
    onChange(f);
  };

  const dateActive = value === "custom";

  const listRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<string, HTMLElement | null>>({});
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    const el = tabRefs.current[value];
    if (!list || !el) {
      setPill(null);
      return;
    }
    const measure = () => {
      const padLeft = parseFloat(getComputedStyle(list).paddingLeft) || 0;
      // offsetLeft is from the container's border box; subtract its border + padding
      // so the value is relative to the content box, where the indicator is anchored.
      setPill({ left: el.offsetLeft - list.clientLeft - padLeft, width: el.offsetWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [value, customDate]);

  const setRef = (key: string) => (el: HTMLElement | null) => {
    tabRefs.current[key] = el;
  };

  const btn = (on: boolean, warn = false) =>
    cx(
      "relative z-10 flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-[10px] px-1 text-[13.5px] font-semibold whitespace-nowrap",
      "transition-[color,transform] duration-fast active:scale-[0.95]",
      "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
      on ? (warn ? "text-warning" : "text-fg") : "text-fg-muted"
    );

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Filter jobs by date"
      className={cx("relative flex gap-1 rounded-[14px] border border-line bg-surface p-1", className)}
    >
      {pill && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-1 top-1 bottom-1 rounded-[10px] bg-surface-raised transition-[transform,width] duration-[240ms] ease-out motion-reduce:transition-none"
          style={{ transform: `translateX(${pill.left}px)`, width: pill.width }}
        />
      )}

      <button
        ref={setRef("today")}
        type="button"
        role="tab"
        aria-selected={value === "today"}
        onClick={() => select("today")}
        className={btn(value === "today")}
      >
        Today <Counter n={counts.today} />
      </button>

      <button
        ref={setRef("previous")}
        type="button"
        role="tab"
        aria-selected={value === "previous"}
        onClick={() => select("previous")}
        className={btn(value === "previous", true)}
      >
        Previous <Counter n={counts.previous} />
      </button>

      <button
        ref={setRef("upcoming")}
        type="button"
        role="tab"
        aria-selected={value === "upcoming"}
        onClick={() => select("upcoming")}
        className={btn(value === "upcoming")}
      >
        Upcoming <Counter n={counts.upcoming} />
      </button>

      {customDate ? (
        <div ref={setRef("custom")} className="relative z-10 flex min-h-[44px] flex-1 items-center">
          <button
            type="button"
            role="tab"
            aria-selected={dateActive}
            onClick={() => (dateActive ? onOpenDatePicker() : select("custom"))}
            className={cx(
              "flex h-full flex-1 items-center justify-center rounded-l-[10px] pl-2 pr-1 text-[13px] font-semibold whitespace-nowrap",
              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
              dateActive ? "text-fg" : "text-fg-muted"
            )}
          >
            {formatDateKeyShort(customDate)}
          </button>
          <button
            type="button"
            aria-label="Clear date filter"
            onClick={onClearCustomDate}
            className="grid h-full w-7 place-items-center rounded-r-[10px] text-fg-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      ) : (
        <button
          ref={setRef("custom")}
          type="button"
          role="tab"
          aria-selected={dateActive}
          onClick={onOpenDatePicker}
          className={btn(dateActive)}
        >
          Diary
        </button>
      )}
    </div>
  );
}
