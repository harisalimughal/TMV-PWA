import crypto from "node:crypto";
import { DateTime } from "luxon";
import type { GpsDrive, GpsEvent, GpsPosition, GpsScheme, GpsSource, GpsTimeSource } from "./gps.types";

export const gpsId = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const string = (value: unknown): string => typeof value === "string" || typeof value === "number" ? String(value).slice(0, 500) : "";
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function gpsTime(value: unknown, receivedAt: string): { occurredAt: string | null; timeSource: GpsTimeSource; rawTime: string | null } {
  const rawTime = string(value) || null;
  if (!rawTime) return { rawTime, occurredAt: null, timeSource: "missing" };
  const explicit = /(?:Z|[+-]\d{2}:\d{2})$/i.test(rawTime);
  let parsed = explicit ? DateTime.fromISO(rawTime, { setZone: true }) : DateTime.fromSQL(rawTime, { zone: "utc" });
  if (explicit && !parsed.isValid) parsed = DateTime.fromSQL(rawTime, { setZone: true });
  if (!parsed.isValid) return { rawTime, occurredAt: null, timeSource: "invalid" };
  return { rawTime, occurredAt: parsed.toUTC().toISO()!, timeSource: parsed.toMillis() > Date.parse(receivedAt) + 60_000
    ? "future" : explicit ? "explicit-offset" : "provider-assumed-utc" };
}

export function gpsScheme(name: string, id?: string | number | null): GpsScheme | null {
  if (["10377", "10378", "10379", "10380"].includes(String(id)) || /\bcongestion\b/i.test(name)) return "congestion";
  if (String(id) === "10381" || /\bdartford\b/i.test(name)) return "dartford";
  if (String(id) === "47814" || /blackwall|silvertown|tunnels?-black-silver/i.test(name)) return "blackwall-silvertown";
  return null;
}

export function gpsLocation(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng) ||
    Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export function parseGpsEvent(input: unknown, source: GpsSource, receivedAt = new Date().toISOString(), fallbackImei = ""): GpsEvent | null {
  const row = object(input), device = object(row.device);
  const providerType = string(row.type ?? row.event_type).trim().toLowerCase().replace(/[ -]/g, "_");
  if (providerType !== "zone_in" && providerType !== "zone_out") return null;
  const imei = string(row.imei || device.imei || fallbackImei) || null;
  const zoneName = string(row.zoneName || row.zone_name || row.event_desc);
  const zoneId = string(row.zoneId ?? row.zone_id) || null;
  const providerEventId = string(row.event_id) || null;
  const time = gpsTime(row.dt_tracker ?? row.dtTracker ?? row.timestamp, receivedAt);
  const location = gpsLocation(row.lat, row.lng);
  const raw: Record<string, unknown> = { type: providerType, event_id: providerEventId, imei,
    deviceName: string(row.deviceName || device.name), zoneName, zoneId, timestamp: time.rawTime, location };
  return {
    _id: gpsId(providerEventId ? ["gpslive-event", providerEventId] : ["gpslive-fingerprint", raw]),
    providerEventId, identity: providerEventId ? "provider-id" : "fingerprint", imei,
    deviceName: string(row.deviceName || device.name), type: providerType === "zone_in" ? "entry" : "exit",
    scheme: gpsScheme(zoneName, zoneId), zoneName, zoneId, ...time, location, raw,
    sources: [source], receivedAt, lastReceivedAt: receivedAt, deliveries: 1
  };
}

export function parseGpsPosition(input: unknown, imei: string, source: GpsSource, receivedAt: string): GpsPosition | null {
  const row = object(input), location = gpsLocation(row.lat, row.lng);
  const time = gpsTime(row.dtTracker ?? row.dt_tracker ?? row.timestamp, receivedAt);
  if (!location || (location.lat === 0 && location.lng === 0) || !time.occurredAt || time.timeSource === "future") return null;
  if (row.imei && string(row.imei) !== imei) return null;
  const ignition = object(row.params).acc;
  return { _id: gpsId(["gpslive-position", imei, time.occurredAt]), imei, ...location,
    occurredAt: time.occurredAt, timeSource: time.timeSource,
    speedKph: typeof row.speed === "number" && Number.isFinite(row.speed) && row.speed >= 0 ? row.speed : null,
    ignitionOn: ignition === "1" || ignition === 1 ? true : ignition === "0" || ignition === 0 ? false : null,
    sources: [source], receivedAt };
}

export function parseGpsDrive(input: unknown, imei: string, receivedAt: string): GpsDrive | null {
  const row = object(input), start = gpsTime(row.dt_start, receivedAt), end = gpsTime(row.dt_end, receivedAt);
  if (!start.occurredAt || !end.occurredAt || start.timeSource === "future" || end.timeSource === "future" || end.occurredAt <= start.occurredAt) return null;
  const elapsed = (Date.parse(end.occurredAt) - Date.parse(start.occurredAt)) / 1000;
  let moving = row.moving_duration_time;
  if (typeof moving !== "number" && typeof row.moving_duration === "string") {
    const parts = /^\s*(?:(\d+)h\s*)?(?:(\d+)m\s*)?(?:(\d+)s\s*)?$/i.exec(row.moving_duration);
    if (parts && parts.slice(1).some(value => value !== undefined)) moving = Number(parts[1] || 0) * 3600 + Number(parts[2] || 0) * 60 + Number(parts[3] || 0);
  }
  return { _id: gpsId(["gpslive-drive", imei, start.occurredAt, end.occurredAt]), imei, start: start.occurredAt, end: end.occurredAt,
    movingSeconds: typeof moving === "number" && Number.isFinite(moving) && moving >= 0 && moving <= elapsed ? moving : null };
}
