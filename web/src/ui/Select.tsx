import React from "react";
import { ChevronDown } from "lucide-react";
import { cx } from "./cx";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  /** Shown as a disabled first option when the value is empty. */
  placeholder?: string;
}

/**
 * Styled wrapper around a native <select> — deliberately native so the mobile OS
 * picker is used (right call for a driver in a van). Use a custom listbox only where
 * search or rich options are genuinely needed.
 */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid, placeholder, className, disabled, children, value, ...rest },
  ref
) {
  return (
    <div
      className={cx(
        "relative flex items-center rounded-control border bg-surface transition duration-fast ease-out",
        "min-h-[44px] focus-within:border-brand focus-within:shadow-[var(--ring)]",
        invalid ? "border-danger-line" : "border-line",
        disabled && "opacity-60 bg-surface-sunken",
        className
      )}
    >
      <select
        ref={ref}
        disabled={disabled}
        value={value}
        className={cx(
          "peer w-full appearance-none bg-transparent pl-3 pr-9 text-[16px] text-fg",
          "outline-none disabled:cursor-not-allowed",
          value === "" || value === undefined ? "text-fg-subtle" : "text-fg"
        )}
        {...rest}
      >
        {placeholder !== undefined && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 size-[18px] text-fg-subtle"
        aria-hidden="true"
      />
    </div>
  );
});
