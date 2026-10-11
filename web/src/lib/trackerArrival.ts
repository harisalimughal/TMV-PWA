export function withArrivalDistance(label: string, distance: unknown): string {
  const meters = typeof distance === "number" && Number.isFinite(distance) && distance >= 0 ? Math.round(distance) : null;
  return `${label} (${meters === null ? "distance not recorded" : `${meters} m`})`;
}
