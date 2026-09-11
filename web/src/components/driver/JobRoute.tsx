import React, { useState } from "react";
import { Check, CircleDot, Copy, MapPin } from "lucide-react";
import { cx } from "../../ui";
import { directionsUrl } from "../../lib/links";
import { haptics } from "../../lib/haptics";

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
  /** Makes each stop's address its own tap target (opens turn-by-turn navigation
   *  from wherever the driver currently is) plus a small copy-to-clipboard icon.
   *  Off by default -- most call sites just want the route read at a glance. */
  interactive?: boolean;
  className?: string;
}

/** Split an address into a first line + the remainder. On a route we treat the
 *  trailing fragment as the postcode / area line and set it in the mono face. */
function splitAddress(addr: string): [string, string] {
  const parts = addr.split(",").map(s => s.trim()).filter(Boolean);
  if (parts.length <= 1) return [addr, ""];
  return [parts[0], parts.slice(1).join(", ")];
}

/** One stop's road + postcode text, either plain or (interactive) a tap-to-navigate
 *  link with a copy icon alongside. */
function StopText({
  road,
  pc,
  address,
  roadClass,
  pcClass,
  interactive,
  copied,
  onCopy
}: {
  road: string;
  pc: string;
  address: string;
  roadClass: string;
  pcClass: string;
  interactive: boolean;
  copied: boolean;
  onCopy: () => void;
}) {
  if (!interactive) {
    return (
      <>
        <p className={cx("mt-[3px] text-card font-semibold [overflow-wrap:anywhere]", roadClass)}>{road}</p>
        {pc && <p className={cx("mt-0.5 font-mono text-body font-semibold [overflow-wrap:anywhere]", pcClass)}>{pc}</p>}
      </>
    );
  }
  return (
    <div className="flex items-start justify-between gap-2">
      <a
        href={directionsUrl("", address)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-[3px] min-w-0 flex-1"
      >
        <p className="text-card font-semibold text-brand underline-offset-2 [overflow-wrap:anywhere] hover:underline">
          {road}
        </p>
        {pc && <p className="mt-0.5 font-mono text-body font-semibold text-brand/80 [overflow-wrap:anywhere]">{pc}</p>}
      </a>
      <button
        type="button"
        onClick={onCopy}
        aria-label={`Copy ${road} address`}
        className={cx(
          "mt-[3px] flex shrink-0 items-center gap-1 rounded-pill px-1.5 py-1.5 transition-colors active:scale-95",
          copied ? "text-success" : "text-fg-subtle hover:bg-surface-sunken"
        )}
      >
        {copied ? (
          <>
            <Check className="size-4" aria-hidden />
            <span className="text-meta font-semibold">Copied</span>
          </>
        ) : (
          <Copy className="size-4" aria-hidden />
        )}
      </button>
    </div>
  );
}

/**
 * The route, as a signature element: an origin dot at the pickup, a drawn gradient
 * line, a location pin at the drop-off. Each stop is a label, a street line and a
 * mono postcode line — never an inline "A → B" string.
 */
export function JobRoute({
  pickup,
  dropoff,
  stop,
  tone = "light",
  density = "full",
  interactive = false,
  className
}: JobRouteProps) {
  const onDark = tone === "onDark";
  const label = onDark ? "text-white/60" : "text-fg-subtle";
  const road = onDark ? "text-white" : "text-fg";
  const pc = onDark ? "text-white/70" : "text-fg-muted";

  const [copied, setCopied] = useState<string | null>(null);
  function copyAddress(address: string) {
    if (!address) return;
    navigator.clipboard
      ?.writeText(address)
      .then(() => {
        haptics.tap();
        setCopied(address);
        window.setTimeout(() => setCopied(current => (current === address ? null : current)), 1500);
      })
      .catch(() => {
        /* Clipboard access denied/unavailable -- the address is still readable and
         * tappable to navigate, so this is a silent no-op rather than an error. */
      });
  }

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
        <StopText
          road={pRoad}
          pc={pPc}
          address={pickup}
          roadClass={road}
          pcClass={pc}
          interactive={interactive && Boolean(pickup)}
          copied={copied === pickup}
          onCopy={() => copyAddress(pickup)}
        />
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
            <StopText
              road={sRoad}
              pc={sPc}
              address={stop as string}
              roadClass={road}
              pcClass={pc}
              interactive={interactive}
              copied={copied === stop}
              onCopy={() => copyAddress(stop as string)}
            />
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
        <StopText
          road={dRoad}
          pc={dPc}
          address={dropoff}
          roadClass={road}
          pcClass={pc}
          interactive={interactive && Boolean(dropoff)}
          copied={copied === dropoff}
          onCopy={() => copyAddress(dropoff)}
        />
      </div>
    </div>
  );
}
