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
