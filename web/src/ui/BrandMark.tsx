import React from "react";
import { cx } from "./cx";

export interface BrandMarkProps {
  /** `sm` for a dense top bar, `md` for auth screens, `lg` for a hero panel. */
  size?: "sm" | "md" | "lg";
  /** `brand` (default) or `onDark` for placement on a navy/brand panel. */
  tone?: "brand" | "onDark";
  /** Hide the wordmark and show only the logo mark (rare — e.g. a very tight bar). */
  markOnly?: boolean;
  className?: string;
}

const MARK_SIZE = { sm: 28, md: 40, lg: 48 } as const;
const WORDMARK = { sm: "text-[15px]", md: "text-[20px]", lg: "text-[26px]" } as const;

/**
 * The The Man Van lockup: the logo mark next to a typographic wordmark.
 *
 * The wordmark is real text, not baked into the image, so it stays crisp at every
 * size and inherits the brand colour from tokens. The mark is the existing raster
 * logo (public/tmv-logo.png) rendered small with explicit dimensions so it never
 * causes layout shift; swap that file for an SVG later and nothing here changes.
 */
export function BrandMark({ size = "sm", tone = "brand", markOnly = false, className }: BrandMarkProps) {
  const px = MARK_SIZE[size];
  return (
    <span className={cx("inline-flex items-center gap-2 select-none", className)}>
      <img
        src="/tmv-logo.png"
        alt=""
        aria-hidden="true"
        width={px}
        height={px}
        className={cx(
          "shrink-0 rounded-[6px] object-contain",
          tone === "onDark" && "bg-white/95 p-0.5"
        )}
        style={{ width: px, height: px }}
      />
      {!markOnly && (
        <span
          className={cx(
            "font-bold leading-none tracking-[-0.01em]",
            WORDMARK[size],
            tone === "onDark" ? "text-white" : "text-brand"
          )}
        >
          The Man Van
        </span>
      )}
      <span className="sr-only">The Man Van</span>
    </span>
  );
}
