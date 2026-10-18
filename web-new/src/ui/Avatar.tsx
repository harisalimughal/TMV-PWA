import React, { useState } from "react";
import { cx } from "./cx";

export interface AvatarProps {
  /** Full name or initials; initials are derived if a longer string is passed. */
  name: string;
  /** Optional photo. Falls back to initials if absent or if it fails to load. */
  src?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZES = {
  sm: "size-7 text-[11px]",
  md: "size-9 text-[12px]",
  lg: "size-11 text-[14px]",
  xl: "size-24 text-[28px]"
} as const;

// Small fixed set of tints, chosen deterministically from the name.
const TINTS = [
  "bg-brand-subtle text-brand-subtle-fg",
  "bg-success-subtle text-success",
  "bg-warning-subtle text-warning",
  "bg-info-subtle text-info",
  "bg-neutral-subtle text-fg-muted"
];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function tintFor(seed: string): string {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[hash % TINTS.length];
}

export function Avatar({ name, src, size = "md", className }: AvatarProps) {
  const [broken, setBroken] = useState(false);
  const showImage = Boolean(src) && !broken;

  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-pill font-semibold uppercase leading-none",
        SIZES[size],
        showImage ? "bg-surface-sunken" : tintFor(name),
        className
      )}
    >
      {showImage ? (
        <img
          src={src as string}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}
