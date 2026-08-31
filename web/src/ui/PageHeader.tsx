import React from "react";
import { ChevronLeft } from "lucide-react";
import { cx } from "./cx";
import { IconButton } from "./IconButton";

export interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Shows a back affordance on the left. */
  onBack?: () => void;
  backLabel?: string;
  /** Right-aligned slot — one primary action, or a menu trigger. */
  actions?: React.ReactNode;
  /** Replaces the title area entirely (e.g. a brand lockup on the home screen). */
  lead?: React.ReactNode;
  className?: string;
}

/**
 * The one header pattern for every screen. Lives inside the AppBar; keep it to a
 * single row — no decorative banner. Title uses the `display`-adjacent weight at a
 * size that suits a ~52px bar; a full-page `display` title belongs in the content
 * area, not here.
 */
export function PageHeader({
  title,
  subtitle,
  onBack,
  backLabel = "Back",
  actions,
  lead,
  className
}: PageHeaderProps) {
  return (
    <div className={cx("flex items-center gap-2 min-w-0", className)}>
      {onBack && (
        <IconButton aria-label={backLabel} icon={<ChevronLeft />} size="sm" onClick={onBack} className="-ml-1.5" />
      )}
      {lead ?? (
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-heading text-fg">{title}</h1>
          {subtitle && <p className="truncate text-meta font-normal text-fg-subtle">{subtitle}</p>}
        </div>
      )}
      {actions && <div className="ml-auto flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  );
}
