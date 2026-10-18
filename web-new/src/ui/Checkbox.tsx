import React from "react";
import { Check, Minus } from "lucide-react";
import { cx } from "./cx";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label?: React.ReactNode;
  indeterminate?: boolean;
}

/** Checkbox with a 44px hit area and a 20px control. Pass `label` for the common case;
 *  omit it to place the control yourself. */
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, indeterminate = false, className, disabled, ...rest },
  ref
) {
  const innerRef = React.useRef<HTMLInputElement>(null);
  React.useImperativeHandle(ref, () => innerRef.current as HTMLInputElement, []);
  React.useEffect(() => {
    if (innerRef.current) innerRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <label
      className={cx(
        "group inline-flex items-start gap-2.5 min-h-[44px] py-2.5 cursor-pointer select-none",
        disabled && "cursor-not-allowed opacity-60",
        className
      )}
    >
      <span className="relative mt-0.5 grid size-5 shrink-0 place-items-center">
        <input
          ref={innerRef}
          type="checkbox"
          disabled={disabled}
          className="peer size-5 appearance-none rounded-[6px] border border-line-strong bg-surface
                     checked:border-brand checked:bg-brand indeterminate:border-brand indeterminate:bg-brand
                     transition duration-fast ease-out disabled:cursor-not-allowed"
          {...rest}
        />
        <Check className="pointer-events-none absolute size-3.5 text-brand-fg opacity-0 peer-checked:opacity-100 peer-indeterminate:opacity-0" aria-hidden="true" />
        <Minus className="pointer-events-none absolute size-3.5 text-brand-fg opacity-0 peer-indeterminate:opacity-100" aria-hidden="true" />
      </span>
      {label != null && <span className="text-[14px] text-fg leading-[1.35] pt-0.5">{label}</span>}
    </label>
  );
});
