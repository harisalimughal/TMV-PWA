import React from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cx } from "./cx";

export type AlertTone = "info" | "success" | "warning" | "danger";

export interface AlertProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  tone?: AlertTone;
  title?: React.ReactNode;
  /** Optional trailing action (usually a small Button or link). */
  action?: React.ReactNode;
  /** Hide the leading icon. */
  hideIcon?: boolean;
}

const TONES: Record<AlertTone, { box: string; icon: React.ReactNode }> = {
  info: {
    box: "bg-info-subtle border-info-line text-fg",
    icon: <Info className="text-info" aria-hidden />
  },
  success: {
    box: "bg-success-subtle border-success-line text-fg",
    icon: <CheckCircle2 className="text-success" aria-hidden />
  },
  warning: {
    box: "bg-warning-subtle border-warning-line text-fg",
    icon: <AlertTriangle className="text-warning" aria-hidden />
  },
  danger: {
    box: "bg-danger-subtle border-danger-line text-fg",
    icon: <XCircle className="text-danger" aria-hidden />
  }
};

/** A persistent, in-flow message. For transient feedback use a toast instead. */
export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(function Alert(
  { tone = "info", title, action, hideIcon = false, className, children, ...rest },
  ref
) {
  return (
    <div
      ref={ref}
      role={tone === "danger" ? "alert" : "status"}
      className={cx(
        "flex gap-3 rounded-card border p-3.5 text-[13px] leading-relaxed",
        TONES[tone].box,
        className
      )}
      {...rest}
    >
      {!hideIcon && <span className="mt-0.5 shrink-0 [&_svg]:size-[18px]">{TONES[tone].icon}</span>}
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold text-[14px] mb-0.5">{title}</p>}
        {children && <div className="text-fg-muted">{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
});
