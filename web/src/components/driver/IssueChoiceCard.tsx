import React from "react";
import { ArrowRight } from "lucide-react";
import { cx } from "../../ui";

export interface IssueChoiceCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}

/**
 * A pickable issue type — a bordered row, not a tinted icon-tile card. Icon,
 * title, one line of "use this when…", arrow.
 */
export function IssueChoiceCard({ icon, title, description, onClick }: IssueChoiceCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "flex w-full items-center gap-3.5 rounded-lg border border-line bg-surface px-4 py-3.5 text-left shadow-xs",
        "transition-colors duration-fast hover:bg-surface-sunken active:bg-surface-sunken",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      )}
    >
      <span
        className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-subtle text-brand [&_svg]:size-[18px]"
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-card text-fg">{title}</span>
        <span className="mt-0.5 block text-helper text-fg-muted">{description}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-fg-subtle" aria-hidden />
    </button>
  );
}
