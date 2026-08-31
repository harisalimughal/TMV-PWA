import React from "react";
import { cx } from "./cx";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, className, rows = 4, disabled, ...rest },
  ref
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      disabled={disabled}
      className={cx(
        "w-full rounded-control border bg-surface px-3 py-2.5 text-[16px] text-fg",
        "placeholder:text-fg-subtle outline-none resize-y transition duration-fast ease-out",
        "focus:border-brand focus:shadow-[var(--ring)]",
        invalid ? "border-danger-line" : "border-line",
        disabled && "opacity-60 bg-surface-sunken cursor-not-allowed",
        className
      )}
      {...rest}
    />
  );
});
