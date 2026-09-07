import React from "react";
import { cx } from "../../ui";

export interface JobRouteProps {
  pickup: string;
  dropoff: string;
  /** `light` for a normal row, `onDark` for the featured blue block. */
  tone?: "light" | "onDark";
  /** `full` shows Pickup / Drop-off labels + a drawn rail; `compact` omits them. */
  density?: "full" | "compact";
  className?: string;
}

/** Split an address into a first line + the remainder. On a route we treat the
 *  trailing fragment as the postcode / area line and set it in the mono face. */
function splitAddress(addr: string): [string, string] {
  const parts = addr.split(",").map(s => s.trim()).filter(Boolean);
  if (parts.length <= 1) return [addr, ""];
  return [parts[0], parts.slice(1).join(", ")];
}

/**
 * The route, as a signature element: a ringed dot at the pickup, a drawn gradient
 * line, a square at the drop-off. Each stop is a label, a street line and a mono
 * postcode line — never an inline "A → B" string.
 */
export function JobRoute({ pickup, dropoff, tone = "light", density = "full", className }: JobRouteProps) {
  const onDark = tone === "onDark";
  const label = onDark ? "text-white/60" : "text-fg-subtle";
  const road = onDark ? "text-white" : "text-fg";
  const pc = onDark ? "text-white/70" : "text-fg-muted";

  const [pRoad, pPc] = splitAddress(pickup || "Pickup TBC");
  const [dRoad, dPc] = splitAddress(dropoff || "Delivery TBC");

  return (
    <div className={cx("grid grid-cols-[22px_1fr] gap-x-3.5", className)}>
      {/* pickup rail */}
      <div className="flex flex-col items-center">
        <span
          className={cx(
            "size-3.5 rounded-full border-[2.5px] bg-bg2",
            onDark ? "border-white" : "border-brand"
          )}
          aria-hidden
        />
        <span
          className={cx(
            "my-[3px] w-0.5 flex-1",
            onDark ? "bg-white/40" : "bg-gradient-to-b from-brand to-fg-subtle"
          )}
          style={{ minHeight: 26 }}
          aria-hidden
        />
      </div>
      <div className="min-w-0 pb-5">
        {density === "full" && (
          <p className={cx("text-[11px] font-semibold tracking-[0.02em]", label)}>Pickup</p>
        )}
        <p className={cx("mt-[3px] text-[15.5px] font-semibold leading-tight [overflow-wrap:anywhere]", road)}>
          {pRoad}
        </p>
        {pPc && <p className={cx("mt-0.5 font-mono text-[14px] font-semibold", pc)}>{pPc}</p>}
      </div>

      {/* drop-off rail */}
      <div className="flex flex-col items-center">
        <span
          className={cx(
            "size-3.5 rounded-[4px] border-[2.5px] bg-bg2",
            onDark ? "border-white/70" : "border-fg-muted"
          )}
          aria-hidden
        />
      </div>
      <div className="min-w-0">
        {density === "full" && (
          <p className={cx("text-[11px] font-semibold tracking-[0.02em]", label)}>Drop-off</p>
        )}
        <p className={cx("mt-[3px] text-[15.5px] font-semibold leading-tight [overflow-wrap:anywhere]", road)}>
          {dRoad}
        </p>
        {dPc && <p className={cx("mt-0.5 font-mono text-[14px] font-semibold", pc)}>{dPc}</p>}
      </div>
    </div>
  );
}
