import React, { useId } from "react";
import { cx } from "./cx";

export interface FieldProps {
  label: React.ReactNode;
  /** Guidance shown under the control until an error replaces it. */
  hint?: React.ReactNode;
  /** When set, the control renders invalid and this message shows in place of the hint. */
  error?: React.ReactNode;
  required?: boolean;
  /** Visually hide the label (still read by assistive tech). */
  hideLabel?: boolean;
  className?: string;
  /**
   * Render-prop for the control. Receives the wiring to spread onto the input:
   * `id`, `aria-describedby`, `aria-invalid`, `required`.
   */
  children: (control: {
    id: string;
    "aria-describedby": string | undefined;
    "aria-invalid": boolean | undefined;
    required: boolean | undefined;
    /** Convenience mirror of the error state for a control's own `invalid` prop. */
    invalid: boolean;
  }) => React.ReactNode;
}

/**
 * The single source of field layout, label hierarchy and a11y wiring. Reserves space
 * for the hint/error line so the form doesn't jump when validation appears.
 */
export function Field({ label, hint, error, required, hideLabel, className, children }: FieldProps) {
  const id = useId();
  const describedById = hint || error ? `${id}-desc` : undefined;

  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label
        htmlFor={id}
        className={cx("text-label font-semibold text-fg", hideLabel && "sr-only")}
      >
        {label}
        {required && (
          <span className="ml-0.5 text-danger" aria-hidden="true">
            *
          </span>
        )}
      </label>

      {children({
        id,
        "aria-describedby": describedById,
        "aria-invalid": error ? true : undefined,
        required: required || undefined,
        invalid: Boolean(error)
      })}

      {(hint || error) && (
        <p
          id={describedById}
          className={cx("text-helper", error ? "text-danger" : "text-fg-subtle")}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
