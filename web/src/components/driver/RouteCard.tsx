import React, { useState } from "react";
import { ChevronDown, Navigation } from "lucide-react";
import { cx } from "../../ui";
import { mapsUrl } from "../../lib/links";
import { JobRoute } from "./JobRoute";

export interface RouteCardProps {
  pickup: string;
  dropoff: string;
  /** Start collapsed to one line — the route is reference, not the task. */
  collapsible?: boolean;
  className?: string;
}

/**
 * The workflow route. Full: the marker/rule/marker <JobRoute>, each address a
 * link out to maps. Collapsed: a single line with a chevron. Bordered, square —
 * no rounded card.
 */
export function RouteCard({ pickup, dropoff, collapsible = false, className }: RouteCardProps) {
  const [userExpanded, setUserExpanded] = useState(false);
  const showFull = !collapsible || userExpanded;

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
          <span className="text-fg">{dropoff || "Delivery TBC"}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-fg-subtle" aria-hidden />
      </button>
    );
  }

  return (
    <div className={cx("rounded-lg border border-line bg-surface p-4 shadow-xs", className)}>
      <JobRoute pickup={pickup} dropoff={dropoff} density="full" />
      <div className="mt-3 flex gap-4 border-t border-line pt-3">
        {pickup && <MapLink label="Pickup" address={pickup} />}
        {dropoff && <MapLink label="Delivery" address={dropoff} />}
      </div>
    </div>
  );
}

function MapLink({ label, address }: { label: string; address: string }) {
  return (
    <a
      href={mapsUrl(address)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-meta font-medium text-brand hover:text-brand-hover"
    >
      <Navigation className="size-3.5" aria-hidden />
      {label}
    </a>
  );
}
