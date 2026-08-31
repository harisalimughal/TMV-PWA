import React from "react";
import { cx } from "./cx";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Tailwind size classes, e.g. "h-4 w-32". */
  className?: string;
}

/** Base shimmer block. Use the sub-components for common shapes. Compose these into a
 *  screen-shaped placeholder so the layout doesn't shift when real content lands. */
function SkeletonRoot({ className, ...rest }: SkeletonProps) {
  return <div aria-hidden="true" className={cx("skeleton rounded-control", className)} {...rest} />;
}

function Text({ className, ...rest }: SkeletonProps) {
  return <SkeletonRoot className={cx("h-3.5 w-full rounded-[4px]", className)} {...rest} />;
}

function Block({ className, ...rest }: SkeletonProps) {
  return <SkeletonRoot className={cx("h-24 w-full rounded-card", className)} {...rest} />;
}

function Circle({ className, ...rest }: SkeletonProps) {
  return <SkeletonRoot className={cx("size-10 rounded-pill", className)} {...rest} />;
}

export const Skeleton = Object.assign(SkeletonRoot, { Text, Block, Circle });
