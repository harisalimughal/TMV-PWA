import React from "react";
import { cx } from "./cx";

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "prefix"> {
  /** Icon or short text before the value (e.g. a magnifier, a "£"). */
  prefix?: React.ReactNode;
  /** Icon, unit, or a clear/toggle control after the value. */
  suffix?: React.ReactNode;
  invalid?: boolean;
}

const FIELD_BASE =
  "flex items-center gap-2 rounded-control border bg-surface transition duration-fast ease-out " +
  "min-h-[44px] px-3 " +
  "focus-within:border-brand focus-within:shadow-[var(--ring)]";

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { prefix, suffix, invalid, className, disabled, ...rest },
  ref
) {
  return (
    <div
      className={cx(
        FIELD_BASE,
        invalid ? "border-danger-line" : "border-line",
        disabled && "opacity-60 bg-surface-sunken",
        className
      )}
    >
      {prefix && <span className="shrink-0 text-fg-subtle [&_svg]:size-[18px]">{prefix}</span>}
      <input
        ref={ref}
        disabled={disabled}
        className={cx(
          "min-w-0 flex-1 bg-transparent text-[16px] text-fg placeholder:text-fg-subtle",
          "outline-none disabled:cursor-not-allowed"
        )}
        {...rest}
      />
      {suffix && <span className="shrink-0 text-fg-subtle [&_svg]:size-[18px]">{suffix}</span>}
    </div>
  );
});
