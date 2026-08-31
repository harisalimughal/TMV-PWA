import React from "react";
import { cx } from "./cx";

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  disabled?: boolean;
  className?: string;
}

/** Boolean toggle (settings, theme). role="switch"; space/enter toggles. */
export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { checked, onChange, disabled, className, ...aria },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={aria["aria-label"]}
      aria-labelledby={aria["aria-labelledby"]}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative inline-flex h-6 w-10 shrink-0 items-center rounded-pill p-0.5 transition-colors duration-fast ease-out",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        checked ? "bg-brand" : "bg-line-strong",
        className
      )}
    >
      <span
        className={cx(
          "size-5 rounded-pill bg-white shadow-sm transition-transform duration-fast ease-out",
          checked ? "translate-x-4" : "translate-x-0"
        )}
      />
    </button>
  );
});
