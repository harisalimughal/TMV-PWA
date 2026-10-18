import type { CapturedLocation } from "./geo";
import type { Job } from "../api/jobs";

export const ARRIVAL_RADIUS_METERS = 150;

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const earthRadiusMeters = 6_371_000;
  const toRad = (degrees: number) => degrees * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(h));
}

export function isWithinArrivalRadius(
  current: CapturedLocation,
  pickupLocation: Job["pickupLocation"],
  radiusMeters = ARRIVAL_RADIUS_METERS
): boolean {
  if (!pickupLocation) return false;
  return distanceMeters(current, pickupLocation) <= radiusMeters;
}
