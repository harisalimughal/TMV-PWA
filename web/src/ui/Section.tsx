import React from "react";
import { cx } from "./cx";

export interface SectionProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  /** Small uppercase eyebrow above the content. */
  title?: React.ReactNode;
  /** Tone for the eyebrow — e.g. "warning" for a "Needs attention" group. */
  tone?: "default" | "warning" | "danger";
  /** Trailing control aligned with the eyebrow (count, link, action). */
  aside?: React.ReactNode;
}

const TONE: Record<NonNullable<SectionProps["tone"]>, string> = {
  default: "text-fg-subtle",
  warning: "text-warning",
  danger: "text-danger"
};

/**
 * Borderless content grouping — the preferred alternative to wrapping everything in a
 * card. An eyebrow label + spacing carries the hierarchy.
 */
export const Section = React.forwardRef<HTMLElement, SectionProps>(function Section(
  { title, tone = "default", aside, className, children, ...rest },
  ref
) {
  return (
    <section ref={ref} className={cx("flex flex-col gap-3", className)} {...rest}>
      {(title || aside) && (
        <div className="flex items-center justify-between gap-3">
          {title && (
            <h2 className={cx("text-card", tone === "default" ? "text-fg" : TONE[tone])}>
              {title}
            </h2>
          )}
          {aside && <div className="shrink-0">{aside}</div>}
        </div>
      )}
      {children}
    </section>
  );
});
