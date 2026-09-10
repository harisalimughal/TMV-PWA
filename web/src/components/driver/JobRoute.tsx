import React from "react";
import { CircleDot, MapPin } from "lucide-react";
import { cx } from "../../ui";

export interface JobRouteProps {
  pickup: string;
  dropoff: string;
  /** Optional mid-route stop ("stop by" / waypoint). When set it's drawn as a third
   *  marker between the pickup and the drop-off. */
  stop?: string;
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
 * The route, as a signature element: an origin dot at the pickup, a drawn gradient
 * line, a location pin at the drop-off. Each stop is a label, a street line and a
 * mono postcode line — never an inline "A → B" string.
 */
export function JobRoute({ pickup, dropoff, stop, tone = "light", density = "full", className }: JobRouteProps) {
  const onDark = tone === "onDark";
  const label = onDark ? "text-white/60" : "text-fg-subtle";
  const road = onDark ? "text-white" : "text-fg";
  const pc = onDark ? "text-white/70" : "text-fg-muted";

  const [pRoad, pPc] = splitAddress(pickup || "Pickup TBC");
  const [dRoad, dPc] = splitAddress(dropoff || "Delivery TBC");
  const hasStop = Boolean(stop && stop.trim());
  const [sRoad, sPc] = hasStop ? splitAddress(stop as string) : ["", ""];

  return (
    <div className={cx("grid grid-cols-[24px_minmax(0,1fr)] gap-x-3.5", className)}>
      {/* pickup rail */}
      <div className="flex flex-col items-center">
        <CircleDot
          className={cx("size-[21px] shrink-0", onDark ? "text-white" : "text-brand")}
          strokeWidth={2.5}
          aria-hidden
        />
        <span
          className={cx(
            "my-[3px] w-0.5 flex-1",
            onDark ? "bg-white/40" : "bg-gradient-to-b from-brand to-fg-subtle"
          )}
          style={{ minHeight: 24 }}
          aria-hidden
        />
      </div>
      <div className="min-w-0 pb-5">
        {density === "full" && (
          <p className={cx("text-eyebrow", label)}>Pickup</p>
        )}
        <p className={cx("mt-[3px] text-card font-semibold [overflow-wrap:anywhere]", road)}>
          {pRoad}
        </p>
        {pPc && <p className={cx("mt-0.5 font-mono text-body font-semibold [overflow-wrap:anywhere]", pc)}>{pPc}</p>}
      </div>

      {/* stop rail — only when the job carries a mid-route stop */}
      {hasStop && (
        <>
          <div className="flex flex-col items-center">
            <CircleDot
              className={cx("size-[17px] shrink-0", onDark ? "text-white/90" : "text-brand/80")}
              strokeWidth={2.5}
              aria-hidden
            />
            <span
              className={cx(
                "my-[3px] w-0.5 flex-1",
                onDark ? "bg-white/40" : "bg-gradient-to-b from-brand to-fg-subtle"
              )}
              style={{ minHeight: 24 }}
              aria-hidden
            />
          </div>
          <div className="min-w-0 pb-5">
            {density === "full" && <p className={cx("text-eyebrow", label)}>Stop</p>}
            <p className={cx("mt-[3px] text-card font-semibold [overflow-wrap:anywhere]", road)}>
              {sRoad}
            </p>
            {sPc && (
              <p className={cx("mt-0.5 font-mono text-body font-semibold [overflow-wrap:anywhere]", pc)}>
                {sPc}
              </p>
            )}
          </div>
        </>
      )}

      {/* drop-off rail */}
      <div className="flex flex-col items-center">
        <MapPin
          className={cx(
            "size-[23px] shrink-0 -translate-y-0.5",
            onDark ? "text-white fill-white/25" : "text-brand fill-brand/15"
          )}
          strokeWidth={2.5}
          aria-hidden
        />
      </div>
      <div className="min-w-0">
        {density === "full" && (
          <p className={cx("text-eyebrow", label)}>Drop-off</p>
        )}
        <p className={cx("mt-[3px] text-card font-semibold [overflow-wrap:anywhere]", road)}>
          {dRoad}
        </p>
        {dPc && <p className={cx("mt-0.5 font-mono text-body font-semibold [overflow-wrap:anywhere]", pc)}>{dPc}</p>}
      </div>
    </div>
  );
}
