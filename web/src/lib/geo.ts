/**
 * Where/when a photo was actually taken — captured client-side at the moment of the
 * camera shutter (see components/camera/useLocationWatch.ts), carried alongside the
 * file through PhotoPicker -> PhotoUploader -> the upload call, and stored on the
 * evidence record so both the driver (a small caption under the photos) and admin
 * (a caption under each thumbnail) can see where/when a piece of evidence came from.
 * Entirely best-effort: a denied/unavailable GPS never blocks taking or using a photo,
 * it just means `location` stays null for that photo.
 */
export interface CapturedLocation {
  lat: number;
  lng: number;
  /** Meters, as reported by the Geolocation API — lower is more precise. */
  accuracy: number;
}

export interface PhotoCaptureMeta {
  /** ISO timestamp, set the instant the shutter fired. */
  capturedAt: string;
  location: CapturedLocation | null;
}

/** Opens the point in Google Maps. */
export function mapsUrlForLocation(location: CapturedLocation): string {
  return `https://www.google.com/maps?q=${location.lat},${location.lng}`;
}

/** "51.50740, -0.12780" — enough precision to be useful, not a wall of digits. */
export function formatCoords(location: CapturedLocation): string {
  return `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`;
}

/** "14:32" in Europe/London, for the small caption under a photo. */
export function formatCapturedTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
}
