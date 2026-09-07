import React from "react";
import { Truck } from "lucide-react";
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

const MARK_SIZE = { sm: 34, md: 40, lg: 48 } as const;
const GLYPH_SIZE = { sm: 20, md: 24, lg: 28 } as const;
const WORDMARK = { sm: "text-[15.5px]", md: "text-[20px]", lg: "text-[26px]" } as const;

/**
 * The The Man Van lockup: a brand-blue rounded-square mark holding the van glyph,
 * next to a typographic wordmark.
 *
 * The wordmark is real text, not baked into an image, so it stays crisp at every
 * size. It carries `--fg` (not the accent) — colour on this screen is reserved for
 * action. The mark is the one spot of brand blue in the top bar.
 */
export function BrandMark({ size = "sm", tone = "brand", markOnly = false, className }: BrandMarkProps) {
  const px = MARK_SIZE[size];
  const onDark = tone === "onDark";
  return (
    <span className={cx("inline-flex items-center gap-2.5 select-none", className)}>
      <span
        aria-hidden="true"
        className={cx(
          "grid shrink-0 place-items-center rounded-[11px]",
          onDark ? "bg-white text-brand" : "bg-brand text-brand-fg"
        )}
        style={{ width: px, height: px }}
      >
        <Truck style={{ width: GLYPH_SIZE[size], height: GLYPH_SIZE[size] }} strokeWidth={2} />
      </span>
      {!markOnly && (
        <span
          className={cx(
            "font-bold leading-none tracking-[-0.01em]",
            WORDMARK[size],
            onDark ? "text-white" : "text-fg"
          )}
        >
          The Man Van
        </span>
      )}
      <span className="sr-only">The Man Van</span>
    </span>
  );
}
