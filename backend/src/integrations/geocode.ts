import { env } from "../config/env";
import { log } from "../utils/logger";
import { withRetry, withTimeout } from "../utils/retry";

/**
 * Reverse geocoding (lat/lng -> a short human place name) via OpenStreetMap's
 * Nominatim -- free, no API key, the same OSM data the admin's live map
 * (admin/dashboard/components/LiveFleetMap.tsx) already uses for its tiles. Called
 * once, at the moment a photo with a location lands (see evidence.service.ts's
 * uploadEvidence / scenario.service.ts's submitScenario/submitStorageScenario), and
 * the result is stored on the record forever after -- a photo is never re-geocoded.
 *
 * Entirely best-effort, same philosophy as capturing the location itself: a
 * failed/slow/rate-limited lookup just returns null, and the caller falls back to
 * showing the raw coordinates (see web/src/lib/geo.ts's formatLocationLabel) -- it
 * never blocks or fails the photo upload.
 *
 * Nominatim's usage policy caps this at roughly one request/second and asks for an
 * identifying User-Agent, no referer-sniffing app key -- both honoured below.
 */

const NOMINATIM_USER_AGENT = `TMV-PWA/1.0 (${env.notificationFromName}; operations@themanvan.co.uk)`;
const MIN_GAP_MS = 1100;

// Single shared queue so concurrent uploads (different drivers, or several photos in
// one step) still serialise onto Nominatim at roughly one request/second between
// them, rather than bursting.
let queueTail: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

function throttled<T>(run: () => Promise<T>): Promise<T> {
  const result = queueTail.then(async () => {
    const wait = Math.max(0, MIN_GAP_MS - (Date.now() - lastRequestAt));
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    return run();
  });
  // The queue itself must never reject, or every lookup queued after a failed one
  // would fail too -- each caller still sees (and handles) its own result/rejection.
  queueTail = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

interface NominatimAddress {
  house_number?: string;
  road?: string;
  pedestrian?: string;
  footway?: string;
  suburb?: string;
  neighbourhood?: string;
  city_district?: string;
  town?: string;
  village?: string;
  city?: string;
  county?: string;
}

/** A short place name -- e.g. "56 Bucklebury, Tower Hamlets" -- built from
 *  Nominatim's structured address parts rather than its full "display_name" (which
 *  reads as a long comma-separated sentence all the way down to the country/postcode). */
function shortPlaceName(address: NominatimAddress): string | null {
  const road = address.road || address.pedestrian || address.footway;
  const streetLine = address.house_number && road ? `${address.house_number} ${road}` : road;
  const locality =
    address.suburb || address.neighbourhood || address.city_district ||
    address.town || address.village || address.city || address.county;
  const parts = [streetLine, locality].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : locality || null;
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const body = await withTimeout(
      "Nominatim reverse geocode",
      throttled(() =>
        withRetry(
          "nominatim.reverse",
          async () => {
            const url =
              `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
              `&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=18&addressdetails=1`;
            const res = await fetch(url, {
              headers: { "User-Agent": NOMINATIM_USER_AGENT, Accept: "application/json" }
            });
            if (!res.ok) {
              // Carries `.status` so utils/retry.ts's statusOf() can see it -- fetch()
              // doesn't throw on a non-2xx response itself, so without this a 429/5xx
              // here would never be recognised as retryable.
              const error = new Error(`Nominatim returned ${res.status}`) as Error & { status: number };
              error.status = res.status;
              throw error;
            }
            return (await res.json()) as { address?: NominatimAddress; display_name?: string };
          },
          "idempotent"
        )
      ),
      5_000
    );
    return (body.address ? shortPlaceName(body.address) : null) ?? body.display_name?.split(",").slice(0, 2).join(",").trim() ?? null;
  } catch (error) {
    log.warn("reverse geocode failed (non-fatal)", { lat, lng, error: String(error) });
    return null;
  }
}
