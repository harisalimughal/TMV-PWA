import React from "react";
import { ArrowDownToLine, ArrowUpFromLine, ChevronRight } from "lucide-react";
import { cx } from "../../ui";

export interface StorageActionsProps {
  onCheckIn: () => void;
  onCheckOut: () => void;
  className?: string;
}

/**
 * Storage Check in / Check out — two neutral list actions. White rows, a subtle
 * icon, black text, a chevron. No coloured fills.
 */
export function StorageActions({ onCheckIn, onCheckOut, className }: StorageActionsProps) {
  return (
    <div className={cx("overflow-hidden rounded-lg border border-line bg-surface shadow-xs", className)}>
      <StorageAction
        icon={<ArrowDownToLine aria-hidden />}
        title="Check in"
        desc="Record items entering storage"
        onClick={onCheckIn}
      />
      <div className="h-px bg-line" />
      <StorageAction
        icon={<ArrowUpFromLine aria-hidden />}
        title="Check out"
        desc="Release items from storage"
        onClick={onCheckOut}
      />
    </div>
  );
}

function StorageAction({
  icon,
  title,
  desc,
  onClick
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors duration-fast hover:bg-surface-sunken/60",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
      )}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-sunken text-fg-muted [&_svg]:size-[18px]">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-card text-fg">{title}</span>
        <span className="mt-0.5 block text-helper text-fg-subtle">{desc}</span>
      </span>
      <ChevronRight
        className="size-4 shrink-0 text-fg-subtle transition-transform duration-fast group-hover:translate-x-0.5"
        aria-hidden
      />
    </button>
  );
}
