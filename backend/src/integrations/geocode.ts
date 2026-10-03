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

// ---------------------------------------------------------------------------
// Address cleaning — Calendar addresses contain flat numbers, floor notes and
// compressed postcodes that prevent Nominatim from resolving them.
// ---------------------------------------------------------------------------

/** Strip flat/unit numbers, floor instructions, parenthetical notes and other
 *  noise that prevents Nominatim from resolving a UK address to coordinates.
 *  Designed to be safe: patterns are specific enough that a clean address
 *  passes through unchanged. */
function cleanAddressForGeocoding(raw: string): string {
  let addr = raw;
  // (1) Remove parenthetical notes — (ground floor), (basement), (3rd floor), etc.
  addr = addr.replace(/\([^)]*\)/g, "");
  // (2) Remove trailing instructions after a dash that mention floor/lift/access.
  //     Only fires when the text after the dash contains a floor/lift keyword so
  //     genuine hyphens in street names (e.g. "Shepherd's Bush - London") survive.
  addr = addr.replace(
    /\s+[-–—]\s+(?:(?:\d+\w*\s+)?(?:floor|lift)|no\s+lift|basement|ground\s*floor).*$/i,
    ""
  );
  // (3) Remove "Flat X," / "Flat X -" / "Unit X," patterns (with separator).
  //     The separator requirement prevents false positives on street names
  //     like "Flat Iron Square".
  addr = addr.replace(/,?\s*\b(?:flat|unit|apt|apartment)\s+\S+\s*[,\-–—]\s*/gi, ", ");
  // (4) Remove trailing floor references — "First Floor Flat", "Ground Floor", etc.
  addr = addr.replace(
    /[,\s]+(?:(?:first|second|third|fourth|fifth|\d+\w*)\s+floor(?:\s+flat)?|ground\s+floor(?:\s+flat)?|basement(?:\s+flat)?)$/i,
    ""
  );
  // (5) Fix compressed UK postcodes: W26HP → W2 6HP, E32PX → E3 2PX, SW81TW → SW8 1TW
  addr = addr.replace(/\b([A-Z]{1,2}\d{1,2}[A-Z]?)(\d[A-Z]{2})\b/gi, "$1 $2");
  // (6) Tidy leftover punctuation and whitespace
  addr = addr.replace(/\.\s*(?=[,\s]|$)/g, ""); // trailing dots before separator or end
  addr = addr.replace(/,\s*,/g, ",");            // double commas
  addr = addr.replace(/\s{2,}/g, " ");           // multiple spaces
  addr = addr.replace(/^[\s,.\-–—]+|[\s,.\-–—]+$/g, ""); // leading/trailing junk
  return addr.trim();
}

/** Extract a UK postcode from an address string for fallback geocoding. */
function extractUkPostcode(address: string): string | null {
  const m = address.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?)\s*(\d[A-Z]{2})\b/i);
  return m ? `${m[1].toUpperCase()} ${m[2].toUpperCase()}` : null;
}

// ---------------------------------------------------------------------------
// Nominatim forward geocoding
// ---------------------------------------------------------------------------

/** Single Nominatim search request — shared by the primary and fallback attempts
 *  in geocodeAddress(). Returns coordinates or null (empty results); throws on
 *  network/timeout/HTTP errors so the caller can decide whether to retry. */
async function nominatimSearch(query: string): Promise<{ lat: number; lng: number } | null> {
  const body = await withTimeout(
    "Nominatim address geocode",
    throttled(() =>
      withRetry(
        "nominatim.search",
        async () => {
          const url =
            `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1` +
            `&q=${encodeURIComponent(query)}`;
          const res = await fetch(url, {
            headers: { "User-Agent": NOMINATIM_USER_AGENT, Accept: "application/json" }
          });
          if (!res.ok) {
            const error = new Error(`Nominatim returned ${res.status}`) as Error & { status: number };
            error.status = res.status;
            throw error;
          }
          return (await res.json()) as Array<{ lat?: string; lon?: string }>;
        },
        "idempotent"
      )
    ),
    5_000
  );
  const first = body[0];
  const lat = Number(first?.lat);
  const lng = Number(first?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const query = address.trim();
  if (!query) return null;
  const raw = address.trim();
  if (!raw) return null;
  const cleaned = cleanAddressForGeocoding(raw);
  const query = cleaned || raw;
  try {
    const body = await withTimeout(
      "Nominatim address geocode",
      throttled(() =>
        withRetry(
          "nominatim.search",
          async () => {
            const url =
              `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1` +
              `&q=${encodeURIComponent(query)}`;
            const res = await fetch(url, {
              headers: { "User-Agent": NOMINATIM_USER_AGENT, Accept: "application/json" }
            });
            if (!res.ok) {
              const error = new Error(`No