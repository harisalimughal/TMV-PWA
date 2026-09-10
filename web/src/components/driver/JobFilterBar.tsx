import React, { useLayoutEffect, useRef, useState } from "react";
import { cx } from "../../ui";
import { haptics } from "../../lib/haptics";
import { useCountUp } from "../../lib/useCountUp";

export type HomeFilter = "today" | "upcoming";

export interface JobFilterBarProps {
  value: HomeFilter;
  onChange: (filter: HomeFilter) => void;
  counts: { today: number; upcoming: number };
  className?: string;
}

function Counter({ n }: { n: number }) {
  const rolled = useCountUp(n);
  return <span className="font-mono text-[12px] font-semibold tabular-nums opacity-85">{rolled}</span>;
}

/**
 * The primary date navigation for the Jobs screen — a two-way segmented control:
 * Today / Upcoming. A single raised pill slides between the tabs (measured from the
 * live DOM); each tab carries a rolling mono count.
 */
export function JobFilterBar({ value, onChange, counts, className }: JobFilterBarProps) {
  const select = (f: HomeFilter) => {
    if (f !== value) haptics.tap();
    onChange(f);
  };

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
      setPill({ left: el.offsetLeft - list.clientLeft - padLeft, width: el.offsetWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [value]);

  const setRef = (key: string) => (el: HTMLElement | null) => {
    tabRefs.current[key] = el;
  };

  const btn = (on: boolean) =>
    cx(
      "relative z-10 flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-[10px] px-1 text-[13.5px] font-semibold whitespace-nowrap",
      "transition-[color,transform] duration-fast active:scale-[0.95]",
      "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
      on ? "text-fg" : "text-fg-muted"
    );

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Filter jobs by date"
      className={cx("relative flex gap-1 rounded-[14px] border border-line bg-surface-sunken p-1", className)}
    >
      {pill && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-1 top-1 bottom-1 rounded-[10px] bg-surface shadow-sm transition-[transform,width] duration-[240ms] ease-out motion-reduce:transition-none"
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
        ref={setRef("upcoming")}
        type="button"
        role="tab"
        aria-selected={value === "upcoming"}
        onClick={() => select("upcoming")}
        className={btn(value === "upcoming")}
      >
        Upcoming <Counter n={counts.upcoming} />
      </button>
    </div>
  );
}
