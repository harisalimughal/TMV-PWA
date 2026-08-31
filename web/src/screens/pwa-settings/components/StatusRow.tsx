import React from "react";
import { Badge, cx } from "../../../ui";
import type { BadgeTone } from "../../../ui";

export interface StatusRowProps {
  label: string;
  /** Status text. Always shown alongside an icon + tone so status is never
   *  communicated by colour alone. */
  value: string;
  tone: BadgeTone;
  /** Small leading icon inside the badge. */
  icon?: React.ReactNode;
  /** Optional explanatory line under the row. */
  hint?: React.ReactNode;
  className?: string;
}

/** One `label — status badge` line. Used for every derived-state readout on the page. */
export function StatusRow({
  label,
  value,
  tone,
  icon,
  hint,
  className,
}: StatusRowProps) {
  return (
    <div className={cx("flex flex-col gap-1", className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-label font-normal text-fg-muted">{label}</span>
        <Badge tone={tone} className="gap-1 [&_svg]:size-3">
          {icon}
          {value}
        </Badge>
      </div>
      {hint && <p className="text-helper text-fg-subtle">{hint}</p>}
    </div>
  );
}
