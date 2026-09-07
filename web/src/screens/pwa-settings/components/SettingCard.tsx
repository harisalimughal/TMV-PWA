import React from "react";
import { Card, cx } from "../../../ui";

export interface SettingCardProps {
  /** lucide icon element — sized by this component. */
  icon: React.ReactNode;
  title: string;
  description?: string;
  /** Optional trailing element in the header (e.g. a status badge). */
  headerAside?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

/**
 * The section container for the PWA Settings screen. A bordered surface with an
 * icon-tile + title + one line of supporting copy, then a body. Consistent radius,
 * border, padding and icon geometry across every section on the page.
 */
export function SettingCard({
  icon,
  title,
  description,
  headerAside,
  className,
  children,
}: SettingCardProps) {
  return (
    <Card elevation="xs" flush className={cx("overflow-hidden", className)}>
      <div className="flex items-start gap-3.5 p-4">
        <span
          className="grid size-[42px] shrink-0 place-items-center rounded-[12px] bg-surface-sunken text-fg-muted [&_svg]:size-[20px]"
          aria-hidden
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-bold text-fg">{title}</h2>
          {description && (
            <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{description}</p>
          )}
        </div>
        {headerAside && <div className="shrink-0">{headerAside}</div>}
      </div>
      {children != null && (
        <div className="border-t border-line p-4">{children}</div>
      )}
    </Card>
  );
}
