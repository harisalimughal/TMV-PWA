import React from "react";
import { cx } from "./cx";

export interface RadioProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label?: React.ReactNode;
}

/** A single radio. Group several with the same `name`. */
export const Radio = React.forwardRef<HTMLInputElement, RadioProps>(function Radio(
  { label, className, disabled, ...rest },
  ref
) {
  return (
    <label
      className={cx(
        "inline-flex items-start gap-2.5 min-h-[44px] py-2.5 cursor-pointer select-none",
        disabled && "cursor-not-allowed opacity-60",
        className
      )}
    >
      <span className="relative mt-0.5 grid size-5 shrink-0 place-items-center">
        <input
          ref={ref}
          type="radio"
          disabled={disabled}
          className="peer size-5 appearance-none rounded-pill border border-line-strong bg-surface
                     checked:border-brand transition duration-fast ease-out disabled:cursor-not-allowed"
          {...rest}
        />
        <span className="pointer-events-none absolute size-2.5 rounded-pill bg-brand opacity-0 peer-checked:opacity-100 transition duration-fast" aria-hidden="true" />
      </span>
      {label != null && <span className="text-[14px] text-fg leading-[1.35] pt-0.5">{label}</span>}
    </label>
  );
});
