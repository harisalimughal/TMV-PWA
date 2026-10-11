import { DateTime } from "luxon";
import { getGpsApiKey } from "../config/live-settings";
import { env } from "../config/env";
import { withRetry } from "../utils/retry";
import type { GpsQueryInterval } from "./gps.types";

export async function fetchGpsHistorySlice(source: GpsQueryInterval["source"], imei: string, from: string, to: string): Promise<unknown> {
  const apiKey = await getGpsApiKey();
  if (!apiKey) throw new Error("GPS API is not configured.");
  const format = (iso: string) => DateTime.fromISO(iso).toUTC().toFormat("yyyy-MM-dd HH:mm:ss");
  const range = { dateFrom: format(from), dateTo: format(to) };
  const endpoint = source === "alerts" ? "/v1/alerts/custom" : source === "positions" ? "/v1/devices/history" : "/v1/trip-history";
  const body = source === "alerts" ? { ...range, imeis: [imei], search: "", limit: 500 } :
    source === "positions" ? { ...range, imei } : { ...range, imei, minStopDuration: 5 };
  return withRetry(`gpslive.history.${source}`, async () => {
    const response = await fetch(`https://api.gpslive.app${endpoint}`, { method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(env.gpsTimeoutMs || 15_000) });
    if (!response.ok) {
      if (response.status === 429) {
        const seconds = Number(response.headers.get("retry-after"));
        if (seconds > 0 && seconds <= 10) await new Promise(resolve => setTimeout(resolve, seconds * 1000));
      }
      throw Object.assign(new Error(`GPS history returned HTTP ${response.status}`), { status: response.status });
    }
    return response.json();
  });
}
