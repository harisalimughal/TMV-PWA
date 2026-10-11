import type { GpsDrive, GpsPosition } from "./gps.types";

const ms = (value: string) => Date.parse(value);
export function plausibleGpsStep(a: GpsPosition, b: GpsPosition): boolean {
  const gap = (ms(b.occurredAt) - ms(a.occurredAt)) / 1000;
  if (a.imei !== b.imei || gap <= 0 || gap > 120) return false;
  const degrees = Math.hypot(b.lat - a.lat, (b.lng - a.lng) * Math.cos(a.lat * Math.PI / 180));
  return degrees * 111_320 / gap <= 200 / 3.6;
}
export function gpsMovement(positions: GpsPosition[], drives: GpsDrive[], from: string, to: string) {
  const start = ms(from), end = ms(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return { coverage: "unavailable" as const, movingSeconds: null,
    stationarySeconds: null, idleSeconds: null, engineOffSeconds: null, unknownSeconds: null, providerMovingSeconds: null, maxGapSeconds: null };
  const points = [...positions].filter(p => p.timeSource !== "future" && !p.conflicting).sort((a, b) => ms(a.occurredAt) - ms(b.occurredAt));
  let moving = 0, stationary = 0, idle = 0, engineOff = 0, ignitionKnown = false, maxGap = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const gap = (ms(b.occurredAt) - ms(a.occurredAt)) / 1000;
    const overlap = Math.max(0, Math.min(end, ms(b.occurredAt)) - Math.max(start, ms(a.occurredAt))) / 1000;
    if (!overlap || gap <= 0) continue;
    maxGap = Math.max(maxGap, gap);
    if (!plausibleGpsStep(a, b) || a.speedKph === null || b.speedKph === null || a.speedKph > 200 || b.speedKph > 200) continue;
    const displacement = Math.hypot(b.lat - a.lat, (b.lng - a.lng) * Math.cos(a.lat * Math.PI / 180)) * 111_320;
    if (a.speedKph >= 5 && b.speedKph >= 5 && displacement >= 5) moving += overlap;
    else if (a.speedKph < 5 && b.speedKph < 5) {
      stationary += overlap;
      if (a.ignitionOn === true && b.ignitionOn === true) { idle += overlap; ignitionKnown = true; }
      if (a.ignitionOn === false && b.ignitionOn === false) { engineOff += overlap; ignitionKnown = true; }
    }
  }
  // A drive spanning another job is not proportionally allocated without actual points.
  let provider = 0, providerCovered = 0, providerFound = false, driveEnd = -Infinity;
  for (const drive of [...drives].sort((a, b) => ms(a.start) - ms(b.start))) {
    if (ms(drive.start) < start || ms(drive.end) > end || ms(drive.start) < driveEnd || drive.movingSeconds === null) continue;
    provider += drive.movingSeconds; providerCovered += (ms(drive.end) - ms(drive.start)) / 1000;
    driveEnd = ms(drive.end); providerFound = true;
  }
  const duration = (end - start) / 1000, covered = moving + stationary;
  if (providerFound && providerCovered > covered) return { coverage: providerCovered < duration ? "partial" as const : "provider-reported" as const,
    movingSeconds: provider, stationarySeconds: providerCovered - provider, unknownSeconds: Math.max(0, duration - providerCovered),
    idleSeconds: null, engineOffSeconds: null,
    providerMovingSeconds: provider, maxGapSeconds: maxGap || null };
  return { coverage: !covered ? "unavailable" as const : covered < duration ? "partial" as const : "sampled" as const,
    movingSeconds: covered ? moving : null, stationarySeconds: covered ? stationary : null,
    idleSeconds: ignitionKnown ? idle : null, engineOffSeconds: ignitionKnown ? engineOff : null,
    unknownSeconds: Math.max(0, duration - covered), providerMovingSeconds: providerFound ? provider : null,
    maxGapSeconds: maxGap || null };
}
