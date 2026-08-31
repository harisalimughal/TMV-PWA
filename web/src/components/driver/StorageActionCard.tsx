import React from "react";
import { ArrowRight } from "lucide-react";
import { cx } from "../../ui";
import { haptics } from "../../lib/haptics";

export interface StorageActionCardProps {
  /** Small uppercase operational label, e.g. "Inbound". */
  eyebrow: string;
  /** "Check in" / "Check out" — dominates the card. */
  title: string;
  description: string;
  /** lucide icon element; sized by this component. */
  icon: React.ReactNode;
  /** Branded accent edge + icon surface: `brand` for Check in, `neutral` for Check out. */
  accent?: "brand" | "neutral";
  onClick: () => void;
  className?: string;
}

/**
 * A primary Storage action — an operational card, not a promo tile. Neutral surface,
 * a refined hairline, a structured icon block, one branded accent edge, and a clear
 * action affordance. The whole card is the button.
 */
export function StorageActionCard({
  eyebrow,
  title,
  description,
  icon,
  accent = "brand",
  onClick,
  className,
}: StorageActionCardProps) {
  return (
    <button
      type="button"
      aria-label={`${title} — ${description.toLowerCase()}`}
      onClick={() => {
        haptics.tap();
        onClick();
      }}
      className={cx(
        "group relative flex w-full flex-col overflow-hidden rounded-card border border-l-2 border-line bg-surface p-4 pb-[18px] text-left shadow-xs",
        accent === "brand" ? "border-l-brand" : "border-l-fg-muted",
        "transition duration-fast ease-out hover:bg-surface-sunken/40 hover:shadow-sm",
        "active:scale-[0.985] motion-reduce:active:scale-100 motion-reduce:transition-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        className,
      )}
    >
      <span
        className={cx(
          "grid size-12 shrink-0 place-items-center rounded-card border [&_svg]:size-6",
          accent === "brand"
            ? "border-brand-line bg-brand-subtle text-brand"
            : "border-line-strong bg-surface-sunken text-fg-muted",
        )}
      >
        {icon}
      </span>

      <div className="mt-4 pr-9">
        <span className="block text-eyebrow uppercase text-fg-subtle">{eyebrow}</span>
        <span className="mt-1.5 block text-[18px] font-[620] leading-tight tracking-[-0.012em] text-fg">
          {title}
        </span>
        <span className="mt-1 block text-helper text-fg-subtle">{description}</span>
      </div>

      <span
        className="absolute bottom-4 right-4 grid size-8 place-items-center rounded-full bg-surface-sunken text-fg-subtle transition-transform duration-fast group-hover:translate-x-0.5 group-hover:text-fg [&_svg]:size-4"
        aria-hidden
      >
        <ArrowRight />
      </span>
    </button>
  );
}
