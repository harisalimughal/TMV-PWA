import React, { useId, useRef } from "react";
import { cx } from "./cx";

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the group. */
  "aria-label": string;
  size?: "sm" | "md";
  fullWidth?: boolean;
  className?: string;
}

/**
 * Single-select toggle for 2–4 short options (Yes/No, a view mode, a device size).
 * Roving tabindex + arrow-key navigation; the selected item is the tab stop.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  fullWidth = false,
  className,
  ...aria
}: SegmentedControlProps<T>) {
  const groupId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const selectedIndex = Math.max(
    0,
    options.findIndex(o => o.value === value)
  );

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const next = (selectedIndex + delta + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  const pad = size === "sm" ? "h-8 px-2.5 text-[12px]" : "h-9 px-3 text-[13px]";

  return (
    <div
      role="radiogroup"
      aria-label={aria["aria-label"]}
      onKeyDown={onKeyDown}
      className={cx(
        "inline-flex items-center gap-0.5 rounded-control border border-line bg-surface-sunken p-0.5",
        fullWidth && "flex w-full",
        className
      )}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={el => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            id={`${groupId}-${index}`}
            onClick={() => onChange(option.value)}
            className={cx(
              "inline-flex items-center justify-center rounded-[6px] font-medium whitespace-nowrap",
              "transition duration-fast ease-out",
              pad,
              fullWidth && "flex-1",
              selected
                ? "bg-surface text-fg shadow-xs"
                : "text-fg-muted hover:text-fg"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
