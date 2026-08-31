import React from "react";
import { haptics } from "../lib/haptics";
import { cx } from "./cx";
import { Spinner } from "./Spinner";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "tertiary"
  | "ghost"
  | "danger"
  | "success";
export type ButtonSize = "sm" | "md" | "lg";

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks the click; keeps the label so width stays stable. */
  loading?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
  /**
   * Why the action can't proceed yet (e.g. "Add a photo first"). Distinct from
   * `disabled`: the button stays interactive and calls `onBlocked(reason)` on press,
   * so the person always learns what's missing instead of facing a dead control.
   */
  blockedReason?: string;
  onBlocked?: (reason: string) => void;
  className?: string;
  children?: React.ReactNode;
}

type ButtonAsButton = CommonProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof CommonProps | "onClick"> & {
    href?: undefined;
    onClick?: () => void;
  };

type ButtonAsLink = CommonProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof CommonProps | "onClick"> & {
    href: string;
    onClick?: () => void;
  };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

/* One control geometry for every button in the app: same radius, same weight, same
 * motion, one visible focus ring, one restrained press. Only the surface changes
 * between variants. Heights are the shared control tokens (md = the 44px WCAG floor).*/
const BASE =
  "relative inline-flex items-center justify-center gap-2 select-none whitespace-nowrap " +
  "font-semibold leading-none tracking-[-0.005em] rounded-control border transition " +
  "duration-fast ease-out outline-none " +
  "focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg " +
  "active:scale-[0.98] motion-reduce:active:scale-100 motion-reduce:transition-none " +
  "disabled:pointer-events-none disabled:opacity-50 aria-disabled:cursor-default";

const VARIANTS: Record<ButtonVariant, string> = {
  // Unmistakable: solid brand fill, real elevation, darkens through hover -> press.
  primary:
    "border-transparent bg-brand text-brand-fg shadow-xs hover:bg-brand-hover active:bg-brand-active",
  // Subordinate but never disabled-looking: real surface, hairline border, fills on hover.
  secondary:
    "border-line-strong bg-surface text-fg shadow-xs hover:bg-surface-sunken hover:border-line-strong active:bg-line",
  // Quieter than secondary, more presence than ghost: a soft filled control.
  tertiary:
    "border-transparent bg-surface-sunken text-fg hover:bg-line active:bg-line-strong/60",
  // Lowest emphasis: reads as text until you're near it.
  ghost:
    "border-transparent bg-transparent text-fg-muted hover:bg-surface-sunken hover:text-fg active:bg-line",
  // Serious, not loud — semantic danger fill, no shout.
  danger:
    "border-transparent bg-danger-signal text-white shadow-xs hover:brightness-[0.97] active:brightness-95",
  // Confirmation-only, where the action genuinely is a positive completion.
  success:
    "border-transparent bg-success-signal text-white shadow-xs hover:brightness-[0.97] active:brightness-95"
};

/* Heights map to --control-h-*; padding and label size scale with them. Icons are
 * sized here so a button's icon is always proportional to its label. */
const SIZES: Record<ButtonSize, string> = {
  sm: "h-control-sm px-3 text-[13px] [&_svg]:size-4",
  md: "h-control px-4 text-[14px] [&_svg]:size-[18px]",
  lg: "h-control-lg px-5 text-[15px] [&_svg]:size-5"
};

export const Button = React.forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(
  function Button(props, ref) {
    const {
      variant = "primary",
      size = "md",
      loading = false,
      iconLeft,
      iconRight,
      fullWidth = false,
      blockedReason,
      onBlocked,
      className,
      children,
      onClick,
      ...rest
    } = props;

    const blocked = Boolean(blockedReason);
    const isDisabled = "disabled" in rest ? Boolean(rest.disabled) : false;

    function handleActivate(event: React.MouseEvent) {
      if (loading || isDisabled) return;
      if (blocked) {
        event.preventDefault();
        haptics.warn();
        onBlocked?.(blockedReason as string);
        return;
      }
      haptics.tap();
      onClick?.();
    }

    const classes = cx(
      BASE,
      VARIANTS[variant],
      SIZES[size],
      fullWidth && "w-full",
      blocked && "opacity-60",
      className
    );

    // Loading: the label and icons stay laid out (so the button keeps its exact
    // width and nothing around it shifts) but go invisible, and a single centred
    // spinner sits on top. `aria-busy` + the disabled state block a double submit.
    const content = (
      <>
        <span className={cx("inline-flex items-center gap-2", loading && "opacity-0")}>
          {iconLeft}
          {children != null && <span className="truncate">{children}</span>}
          {iconRight}
        </span>
        {loading && (
          <span className="absolute inset-0 grid place-items-center">
            <Spinner size={size === "sm" ? "sm" : "md"} />
          </span>
        )}
      </>
    );

    if (props.href !== undefined) {
      const { href, ...anchorRest } = rest as React.AnchorHTMLAttributes<HTMLAnchorElement>;
      return (
        <a
          ref={ref as React.Ref<HTMLAnchorElement>}
          href={href}
          className={classes}
          aria-disabled={blocked || isDisabled || undefined}
          aria-busy={loading || undefined}
          onClick={handleActivate}
          {...anchorRest}
        >
          {content}
        </a>
      );
    }

    const { type = "button", ...buttonRest } = rest as React.ButtonHTMLAttributes<HTMLButtonElement>;
    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        type={type}
        className={classes}
        disabled={isDisabled || loading}
        aria-disabled={blocked || undefined}
        aria-busy={loading || undefined}
        onClick={handleActivate}
        {...buttonRest}
      >
        {content}
      </button>
    );
  }
);
