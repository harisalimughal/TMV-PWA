export const PICKUP_ARRIVAL_RADIUS_METERS = 500;

export function recordedArrivalDistance(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
}

export function withArrivalDistance(label: string, distance: unknown): string {
  const meters = recordedArrivalDistance(distance);
  return `${label} (${meters === undefined ? "distance not recorded" : `${meters} m`})`;
}

export function trackerArrivalReason(job: { trackerArrivalAt?: string; trackerUnverifiedReason?: string; pickupLocation?: unknown; onMyWayAt?: string;
  trackerDistanceMeters?: number; trackerLocationName?: string; trackerLastSeenAt?: string }, status?: "unverified" | "stale" | "reporting"): string | undefined {
  if (job.trackerArrivalAt) return undefined;
  const recorded = job.trackerUnverifiedReason?.trim();
  if (recorded) return recorded.includes(" away") && !recorded.includes(" away from pickup point") ? recorded.replace(/ away(\b)/, " away from pickup point$1") : recorded;
  if (!job.pickupLocation) return "Pickup address could not be geocoded";
  if (!job.onMyWayAt) return "Driver did not tap On My Way";
  const meters = recordedArrivalDistance(job.trackerDistanceMeters);
  if (meters !== undefined) {
    const location = job.trackerLocationName ? ` in ${job.trackerLocationName}` : "";
    if (meters >= 1000) return `Van was ${(meters / 1000).toFixed(1)} km away from pickup point${location}`;
    return meters > PICKUP_ARRIVAL_RADIUS_METERS ? `Van was ${meters}m away from pickup point (outside ${PICKUP_ARRIVAL_RADIUS_METERS}m radius)${location}` : "Tracker is near pickup; arrival requires two fresh stationary reports.";
  }
  if (status === "stale") return "Tracker device signal was stale / offline";
  if (!job.trackerLastSeenAt) return "No tracker signal received";
  return "Tracker arrival was not verified.";
}
