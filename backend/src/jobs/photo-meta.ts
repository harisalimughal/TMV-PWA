export interface PhotoCapture {
  /** ISO timestamp from the driver's device, taken at the camera shutter. */
  capturedAt?: string;
  location?: { lat: number; lng: number; accuracy: number };
  /** A place name the client already resolved for `location` (see the driver app's
   *  GET /api/jobs/geocode/reverse, called live while the camera's open) -- trusted
   *  as-is when present so the upload path never redoes the same Nominatim lookup a
   *  second time. Absent if the client's own lookup hadn't resolved yet by the time
   *  this photo was sent, in which case the upload path falls back to resolving it
   *  itself (see jobs/evidence.service.ts / jobs/scenario.service.ts). */
  locationName?: string;
}

/**
 * Parses the "photoMeta" multipart field the PWA sends alongside its photo files --
 * a JSON array, one entry per file in the same order (see web/src/lib/geo.ts's
 * PhotoCaptureMeta). Shared by every route that accepts photos (evidence upload,
 * job-scoped scenario forms, standalone storage scenario forms).
 *
 * Defensive about all of it: this is a nice-to-have caught straight off a driver's
 * browser, never something that should block an upload, so any malformed / missing /
 * partial data just yields an empty entry for that photo rather than failing the
 * request.
 */
export function parsePhotoMeta(raw: unknown): PhotoCapture[] {
  if (typeof raw !== "string" || !raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map(entry => {
    if (!entry || typeof entry !== "object") return {};
    const capturedAt = typeof (entry as any).capturedAt === "string" ? (entry as any).capturedAt : undefined;
    const loc = (entry as any).location;
    const location =
      loc && typeof loc === "object" &&
      typeof loc.lat === "number" && typeof loc.lng === "number" && typeof loc.accuracy === "number"
        ? { lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy }
        : undefined;
    const locationName =
      typeof (entry as any).locationName === "string" && (entry as any).locationName.trim()
        ? (entry as any).locationName.trim()
        : undefined;
    return { capturedAt, location, locationName };
  });
}
