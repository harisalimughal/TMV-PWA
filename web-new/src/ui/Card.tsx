import React from "react";
import { cx } from "./cx";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** `xs` = hairline border only (default). `sm` = a faint lift for things that float. */
  elevation?: "none" | "xs" | "sm";
  /** Remove interior padding — for a card that only contains a table or list. */
  flush?: boolean;
}

const ELEVATION = { none: "", xs: "shadow-xs", sm: "shadow-sm" } as const;

/** A bordered surface for a genuine conceptual group. Prefer <Section> for plain
 *  content grouping — not every block needs a card. */
const CardRoot = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { elevation = "xs", flush = false, className, children, ...rest },
  ref
) {
  return (
    <div
      ref={ref}
      className={cx(
        "rounded-card border border-line bg-surface",
        ELEVATION[elevation],
        !flush && "p-4",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
});

function CardHeader({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx("flex items-center justify-between gap-3 px-4 py-3 border-b border-line", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

function CardBody({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("p-4", className)} {...rest}>
      {children}
    </div>
  );
}

function CardFooter({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx("flex items-center justify-end gap-2 px-4 py-3 border-t border-line", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export const Card = Object.assign(CardRoot, {
  Header: CardHeader,
  Body: CardBody,
  Footer: CardFooter
});
