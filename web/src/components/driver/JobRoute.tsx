import React from "react";
import { cx } from "../../ui";

export interface JobRouteProps {
  pickup: string;
  dropoff: string;
  /** `light` for a normal row, `onDark` for the featured blue block. */
  tone?: "light" | "onDark";
  /** `full` shows PICKUP / DELIVER labels; `compact` omits them. */
  density?: "full" | "compact";
  className?: string;
}

/** Split an address into a first line + the remainder, so the road name reads
 *  strong and the town/postcode sit under it. */
function splitAddress(addr: string): [string, string] {
  const parts = addr.split(",").map(s => s.trim()).filter(Boolean);
  if (parts.length <= 1) return [addr, ""];
  return [parts[0], parts.slice(1).join(", ")];
}

/**
 * The route, as a signature element: a circle at the origin, a square at the
 * destination, a rule between them. Addresses are stacked over two lines — never
 * an inline "A → B" string.
 */
export function JobRoute({ pickup, dropoff, tone = "light", density = "full", className }: JobRouteProps) {
  const onDark = tone === "onDark";
  const label = onDark ? "text-white/70" : "text-fg-subtle";
  const road = onDark ? "text-white" : "text-fg";
  const town = onDark ? "text-white/70" : "text-fg-muted";
  const rule = onDark ? "bg-white/40" : "bg-line-strong";
  const marker = onDark ? "border-white" : "border-fg";

  const [pRoad, pTown] = splitAddress(pickup || "Pickup TBC");
  const [dRoad, dTown] = splitAddress(dropoff || "Delivery TBC");

  return (
    <div className={cx("grid grid-cols-[10px_1fr] gap-x-3", className)}>
      {/* origin — circle */}
      <span className="mt-[3px] flex justify-center">
        <span className={cx("size-2.5 rounded-pill border-2 bg-transparent", marker)} aria-hidden />
      </span>
      <div className="min-w-0 pb-2.5">
        {density === "full" && <p className={cx("op-label", label)}>Pickup</p>}
        <p className={cx("text-label font-semibold [overflow-wrap:anywhere]", road)}>{pRoad}</p>
        {pTown && <p className={cx("text-helper [overflow-wrap:anywhere]", town)}>{pTown}</p>}
      </div>

      {/* rule */}
      <span className="flex justify-center">
        <span className={cx("my-0.5 w-px flex-1", rule)} aria-hidden />
      </span>
      <span aria-hidden />

      {/* destination — square */}
      <span className="mt-[3px] flex justify-center">
        <span className={cx("size-2.5 border-2", marker, onDark ? "bg-white" : "bg-fg")} aria-hidden />
      </span>
      <div className="min-w-0 pt-2">
        {density === "full" && <p className={cx("op-label", label)}>Deliver</p>}
        <p className={cx("text-label font-semibold [overflow-wrap:anywhere]", road)}>{dRoad}</p>
        {dTown && <p className={cx("text-helper [overflow-wrap:anywhere]", town)}>{dTown}</p>}
      </div>
    </div>
  );
}
