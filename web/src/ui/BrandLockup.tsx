import React from "react";
import { cx } from "./cx";

interface BrandLockupProps {
  /** Which app this is, e.g. "Driver" or "Admin". Omit for the name alone. */
  sub?: string;
  /** "sm" for compact mobile bars. */
  size?: "sm" | "md";
  className?: string;
}

/**
 * The one brand mark for both apps: the TMV logo with "The Man Van" set on a single
 * line and an optional app label beneath. Admin sidebar, admin mobile bar, driver top
 * bar and driver sidebar all render this, so the brand looks the same everywhere.
 */
export function BrandLockup({ sub, size = "md", className }: BrandLockupProps) {
  const sm = size === "sm";
  return (
    <span className={cx("flex min-w-0 items-center", sm ? "gap-2" : "gap-2.5", className)}>
      <img
        src="/tmv-mark.png"
        alt=""
        className={cx("shrink-0 rounded-[9px] bg-white object-cover ring-1 ring-line", sm ? "size-8" : "size-9")}
      />
      <span className="flex min-w-0 flex-col leading-none">
        <span className={cx("truncate whitespace-nowrap font-bold tracking-tight text-fg", sm ? "text-[15px]" : "text-[16px]")}>
          The Man Van
        </span>
        {sub && <span className="mt-[3px] truncate text-[12px] font-medium text-fg-subtle">{sub}</span>}
      </span>
    </span>
  );
}
