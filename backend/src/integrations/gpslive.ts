import { env } from "../config/env";
import { withRetry, withTimeout } from "../utils/retry";

/**
 * One row from GET /v1/devices/list (api.gpslive.app). Field names match the API
 * response verbatim; see https://api.gpslive.app/api-docs/v1#/Platform.
 */
export interface GpsLiveDevice {
  imei: string;
  name: string;
  plateNumber: string;
  dtTracker: string;
  lat: number;
  lng: number;
  speed: number;
  odometer?: number;
  active?: string;
  /**
   * Raw hardware sensor readings, all string-typed by the device firmware (Teltonika,
   * per the "protocol" field on live accounts). Keys are not documented by GPSLive and
   * vary by hardware model -- only read known keys defensively, never assume a key is
   * present. Ones this app reads: acc (ignition, "1"/"0"), batv (battery volts), gsmlev
   * / gpslev (signal strength, small integer scale), crash / jamming ("1"/"0"),
   * ecodriving (last harsh-event type, e.g. "hbrake"/"hcorner"), ecodrivingvalue (score).
   */
  params?: Record<string, string>;
}

export class GpsLiveError extends Error {
  constructor(message: string, readonly statusCode?: number) {
    super(message);
    this.name = "GpsLiveError";
  }
}

/**
 * GPSLive plate numbers and our own Van Registration field are typed freely
 * ("WN69 FEH" vs "wn69feh") -- compare on letters/digits only. Shared by
 * fleet.routes.ts (matching /v1/devices/list rows) and gpslive-webhook.routes.ts
 * (matching a webhook event's deviceName string).
 */
export function normalizePlate(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** GPSLive device names follow "<PLATE> - <DRIVER INITIALS>" for vans labelled that
 * way in the GPSLive dashboard -- not guaranteed for every device, only a fallback
 * when the plate itself doesn't match. */
export function parseTrailingInitials(name: string): string | null {
  const match = name.match(/-\s*([A-Za-z]{2,4})\s*$/);
  return match ? match[1].toUpperCase() : null;
}

/** Best-effort plate guess for payloads that only carry a combined "<PLATE> -
 * <INITIALS>" device name (e.g. the webhook's `deviceName`), unlike /v1/devices/list
 * rows which already have a separate plateNumber field. Falls back to the whole
 * string when there's no trailing "- XX" suffix to strip. */
export function guessPlateFromDeviceName(name: string): string {
  return name.replace(/-\s*[A-Za-z]{2,4}\s*$/, "").trim();
}

export interface MatchedDriver {
  initials: string;
  fullName: string;
}

export interface DriverMatchIndex {
  byPlate: Map<string, MatchedDriver>;
  byInitials: Map<string, MatchedDriver>;
}

/**
 * Plate is the authoritative signal once a driver has one on file; initials-matching
 * is only offered for drivers who have no van registration on file to match by
 * instead. Shared by fleet.routes.ts and gpslive-webhook.routes.ts, which both need
 * to turn a GPSLive device identity into "which driver is this".
 */
export function buildDriverMatchIndex(
  drivers: Array<{ initials: string; fullName: string; vanRegistration: string }>
): DriverMatchIndex {
  const byPlate = new Map<string, MatchedDriver>();
  const byInitials = new Map<string, MatchedDriver>();
  for (const d of drivers) {
    if (!d.initials) continue;
    if (d.vanRegistration) {
      byPlate.set(normalizePlate(d.vanRegistration), { initials: d.initials, fullName: d.fullName });
    } else {
      byInitials.set(d.initials, { initials: d.initials, fullName: d.fullName });
    }
  }
  return { byPlate, byInitials };
}

export function matchDriverByPlateAndName(
  plateNumber: string,
  name: string,
  index: DriverMatchIndex
): MatchedDriver | null {
  const byPlate = index.byPlate.get(normalizePlate(plateNumber || ""));
  const trailingInitials = parseTrailingInitials(name || "");
  const byInitials = trailingInitials ? index.byInitials.get(trailingInitials) : undefined;
  return byPlate || byInitials || null;
}

/** The reverse direction of matchDriverByPlateAndName above: given a driver, find
 * their van's GPSLive device (to look up its imei) instead of given a device, find
 * the driver. Used by congestion-zone.service.ts's job-start check.
 *
 * Priority: an admin-assigned imei (exact, unambiguous -- see DriverAccountDoc's own
 * comment) beats vanRegistration/initials string-matching, which stays only as a
 * fallback for drivers who haven't been assigned one yet. */
export function findDeviceForDriver(
  driver: { initials: string; vanRegistration: string; imei?: string },
  devices: GpsLiveDevice[]
): GpsLiveDevice | null {
  if (driver.imei) {
    const byImei = devices.find(d => d.imei === driver.imei);
    if (byImei) return byImei;
  }
  if (driver.vanRegistration) {
    const plate = normalizePlate(driver.vanRegistration);
    const byPlate = devices.find(d => normalizePlate(d.plateNumber || "") === plate);
    if (byPlate) return byPlate;
  }
  return devices.find(d => parseTrailingInitials(d.name || "") === driver.initials) ?? null;
}

/**
 * Fetches every device (van) on the account with its last-known position. GPSLive
 * updates dtTracker whenever the device last reported -- callers should treat a stale
 * dtTracker as "vehicle offline", not filter it out server-side, so the dashboard can
 * show that explicitly.
 */
export async function fetchGpsLiveDevices(): Promise<GpsLiveDevice[]> {
  if (!env.gpsApiKey) return [];

  const response = await withTimeout(
    "GPSLive devices.list",
    withRetry(
      "gpslive.devices.list",
      () =>
        fetch("https://api.gpslive.app/v1/devices/list", {
          headers: { Authorization: `Bearer ${env.gpsApiKey}` }
        }),
      "idempotent"
    ),
    env.gpsTimeoutMs
  );

  if (!response.ok) {
    throw new GpsLiveError(`GPSLive devices.list failed: HTTP ${response.status}`, response.status);
  }

  const body = (await response.json()) as unknown;
  return Array.isArray(body) ? (body as GpsLiveDevice[]) : [];
}

/** One row from POST /v1/alerts/custom -- shape confirmed against a live response,
 * not the (undocumented beyond a one-line description) Swagger schema. Device
 * identity is nested here (`device.imei`), unlike the flat `imei`/`deviceName` on a
 * Webhooks delivery (see gpslive-webhook.routes.ts) -- same underlying event, two
 * different shapes depending on how GPSLive delivers it. */
export interface GpsLiveAlertEvent {
  event_id: string;
  type: string;
  event_desc: string;
  dt_tracker: string;
  device?: { imei: string; name: string; odometer?: number };
}

/**
 * A single device's alert history over an explicit time range -- unlike the
 * account-wide Webhooks feed (gpslive-webhook.routes.ts), which only ever reports a
 * *fresh* crossing as it happens, this can be asked "what already happened", which is
 * what congestion-zone.service.ts's job-start check needs. `dateFrom`/`dateTo` must be
 * "YYYY-MM-DD HH:mm:ss" -- GPSLive rejects any other format (including a trailing
 * millisecond group).
 */
export async function fetchGpsLiveAlertsForDevice(
  imei: string,
  dateFrom: string,
  dateTo: string,
  search = ""
): Promise<GpsLiveAlertEvent[]> {
  if (!env.gpsApiKey) return [];

  const response = await withTimeout(
    "GPSLive alerts.custom",
    withRetry(
      "gpslive.alerts.custom",
      () =>
        fetch("https://api.gpslive.app/v1/alerts/custom", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.gpsApiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ dateFrom, dateTo, imeis: [imei], search, limit: 20 })
        }),
      // Despite the POST verb this is a read/search, not a mutation -- safe to retry
      // like devices.list above.
      "idempotent"
    ),
    env.gpsTimeoutMs
  );

  if (!response.ok) {
    throw new GpsLiveError(`GPSLive alerts.custom failed: HTTP ${response.status}`, response.status);
  }

  const body = (await response.json()) as unknown;
  return Array.isArray(body) ? (body as GpsLiveAlertEvent[]) : [];
}

/**
 * The account's last 50 alert notifications across the whole fleet (every alert
 * type -- Moving, Ignition On, Crash Detection, Zone In/Out, ...), not scoped to one
 * device or a time range. Same shape as fetchGpsLiveAlertsForDevice's rows.
 */
export async function fetchGpsLiveNotifications(): Promise<GpsLiveAlertEvent[]> {
  if (!env.gpsApiKey) return [];

  const response = await withTimeout(
    "GPSLive alerts.notifications",
    withRetry(
      "gpslive.alerts.notifications",
      () =>
        fetch("https://api.gpslive.app/v1/alerts/notifications", {
          headers: { Authorization: `Bearer ${env.gpsApiKey}` }
        }),
      "idempotent"
    ),
    env.gpsTimeoutMs
  );

  if (!response.ok) {
    throw new GpsLiveError(`GPSLive alerts.notifications failed: HTTP ${response.status}`, response.status);
  }

  const body = (await response.json()) as unknown;
  return Array.isArray(body) ? (body as GpsLiveAlertEvent[]) : [];
}

/** One row from GET /v1/places/zones -- a geofence drawn in the GPSLive dashboard
 * (Places > Zones), e.g. the client's "Congestion", "Congestion Zone NE/E/SW" and
 * "Tunnels-Black-Silver"/"Dartford Crossing" polygons. zoneVertices is [lat, lng]
 * pairs, confirmed against a live response (undocumented in the Swagger schema). */
export interface GpsLiveZone {
  zoneId: number;
  zoneName: string;
  zoneVertices: [number, number][];
}

export async function fetchGpsLiveZones(): Promise<GpsLiveZone[]> {
  if (!env.gpsApiKey) return [];

  const response = await withTimeout(
    "GPSLive places.zones",
    withRetry(
      "gpslive.places.zones",
      () =>
        fetch("https://api.gpslive.app/v1/places/zones", {
          headers: { Authorization: `Bearer ${env.gpsApiKey}` }
        }),
      "idempotent"
    ),
    env.gpsTimeoutMs
  );

  if (!response.ok) {
    throw new GpsLiveError(`GPSLive places.zones failed: HTTP ${response.status}`, response.status);
  }

  const body = (await response.json()) as unknown;
  return Array.isArray(body) ? (body as GpsLiveZone[]) : [];
}
