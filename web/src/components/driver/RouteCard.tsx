import React, { useState } from "react";
import { ArrowRight, ChevronDown, MapPin, Navigation } from "lucide-react";
import { cx } from "../../ui";
import { directionsUrl, mapsUrl } from "../../lib/links";
import { JobRoute } from "./JobRoute";

export interface RouteCardProps {
  pickup: string;
  dropoff: string;
  /** Optional mid-route stop ("stop by" / waypoint). Shown between pickup and
   *  drop-off and added to the Navigate link as a waypoint. */
  stop?: string;
  /** Start collapsed to one line — the route is reference, not the task. */
  collapsible?: boolean;
  className?: string;
}

/**
 * The workflow route. Full: the marker/rule/marker <JobRoute>, each address a
 * link out to maps. Collapsed: a single line with a chevron. Bordered, square —
 * no rounded card.
 *
 * Pickup-only jobs (no drop-off address on the Calendar event) show just the
 * pickup, and the address itself is the tap target — it opens straight into maps.
 * There's no Navigate button because there's nowhere to navigate *to*.
 */
export function RouteCard({ pickup, dropoff, stop, collapsible = false, className }: RouteCardProps) {
  const [userExpanded, setUserExpanded] = useState(false);
  const showFull = !collapsible || userExpanded;
  const hasDropoff = Boolean(dropoff && dropoff.trim());
  const hasStop = Boolean(stop && stop.trim());

  if (!hasDropoff) {
    return (
      <a
        href={mapsUrl(pickup)}
        target="_blank"
        rel="noopener noreferrer"
        className={cx(
          "flex items-start gap-3 rounded-lg border border-line bg-surface p-4 shadow-xs",
          "transition-colors hover:bg-surface-sunken/60",
          "focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2",
          className
        )}
      >
        <MapPin
          className="mt-0.5 size-[22px] shrink-0 -translate-y-0.5 fill-brand/15 text-brand"
          strokeWidth={2.5}
          aria-hidden
        />
        <div className="min-w-0">
          <p className="text-eyebrow text-fg-subtle">Pickup</p>
          <p className="mt-[3px] text-card font-semibold text-brand [overflow-wrap:anywhere]">
            {pickup || "Pickup TBC"}
          </p>
          <p className="mt-1.5 inline-flex items-center gap-1 text-meta font-semibold text-brand">
            <Navigation className="size-3.5" aria-hidden />
            Open in Maps
          </p>
        </div>
      </a>
    );
  }

  if (!showFull) {
    return (
      <button
        type="button"
        onClick={() => setUserExpanded(true)}
        className={cx(
          "flex w-full items-center gap-2 border border-line-strong bg-surface px-3.5 py-2.5 text-left",
          "rounded-md transition-colors hover:bg-surface-sunken/60",
          "focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2",
          className
        )}
      >
        <span className="min-w-0 flex-1 truncate text-helper font-medium text-fg-muted">
          <span className="text-fg">{pickup || "Pickup TBC"}</span>
          <span className="mx-1.5 text-fg-subtle">→</span>
          {hasStop && (
            <>
              <span className="text-fg">{stop}</span>
              <span className="mx-1.5 text-fg-subtle">→</span>
            </>
          )}
          <span className="text-fg">{dropoff || "Delivery TBC"}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-fg-subtle" aria-hidden />
      </button>
    );
  }

  return (
    <div className={cx("rounded-lg border border-line bg-surface p-4 shadow-xs", className)}>
      <JobRoute pickup={pickup} dropoff={dropoff} stop={stop} density="full" />

      {/* Pickup ──── Navigate ────▶ Delivery: the two ends keep their own map links,
          with one long arrow between them broken by a Navigate button that opens
          maps directions with both ends pre-filled (and the stop as a waypoint). */}
      <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
        <RouteEndLabel label="Pickup" />

        <div className="flex flex-1 items-center gap-1">
          <span className="h-0.5 flex-1 rounded-full bg-brand" aria-hidden />
          <a
            href={directionsUrl(pickup, dropoff, stop)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={
              hasStop ? "Navigate from pickup via the stop to delivery" : "Navigate from pickup to delivery"
            }
            className={cx(
              "inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-brand px-2.5 py-1 text-meta font-bold text-brand-fg",
              "transition-transform duration-fast active:scale-95",
              "focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
            )}
          >
            <Navigation className="size-3.5" aria-hidden />
            Navigate
          </a>
          <span className="h-0.5 flex-1 rounded-full bg-brand" aria-hidden />
          <ArrowRight className="-ml-2.5 size-7 shrink-0 stroke-[2.5] text-brand" aria-hidden />
        </div>

        <RouteEndLabel label="Delivery" />
      </div>
    </div>
  );
}

/** A plain blue end-label ("Pickup" / "Delivery") — not a link; the one tappable
 *  action on this row is the Navigate button in the middle. */
function RouteEndLabel({ label }: { label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-meta font-semibold text-brand">
      <Navigation className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}
