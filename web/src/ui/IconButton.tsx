import React from "react";
import { haptics } from "../lib/haptics";
import { cx } from "./cx";
import { Spinner } from "./Spinner";

export type IconButtonVariant = "ghost" | "subtle";
export type IconButtonSize = "sm" | "md";

export interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "children"> {
  /** Required — an icon-only control must be labelled for assistive tech. */
  "aria-label": string;
  icon: React.ReactNode;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  loading?: boolean;
  onClick?: () => void;
}

const VARIANTS: Record<IconButtonVariant, string> = {
  ghost: "text-fg-muted hover:bg-surface-sunken hover:text-fg active:bg-surface-sunken",
  subtle: "bg-surface-sunken text-fg-muted hover:text-fg hover:bg-line active:bg-line"
};

const SIZES: Record<IconButtonSize, string> = {
  sm: "h-9 w-9 [&_svg]:size-[18px]",
  md: "h-11 w-11 [&_svg]:size-5"
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, variant = "ghost", size = "md", loading = false, className, onClick, disabled, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onClick={() => {
        if (loading || disabled) return;
        haptics.tap();
        onClick?.();
      }}
      className={cx(
        "inline-flex items-center justify-center rounded-control shrink-0 outline-none",
        "transition duration-fast ease-out active:scale-95 motion-reduce:active:scale-100",
        "focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        "disabled:pointer-events-none disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...rest}
    >
      {loading ? <Spinner size={size === "sm" ? "sm" : "md"} /> : icon}
    </button>
  );
});
