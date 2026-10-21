import type { Job } from "../jobs/job.types";
import type { GpsLiveZone } from "../integrations/gpslive";
import { associateGpsEvent } from "./gps.association";
import { createSchemePosition } from "./gps.geometry";
import type { GpsEvent, GpsPosition, GpsScheme, GpsVisit } from "./gps.types";

const SCHEMES: GpsScheme[] = ["congestion", "dartford", "blackwall-silvertown"];
const ms = (iso: string) => Date.parse(iso);
const valid = (event: GpsEvent) => event.imei && event.scheme && event.occurredAt && !event.conflicts?.length &&
  !["invalid", "missing", "future"].includes(event.timeSource);
const zoneKey = (event: GpsEvent) => {
  if (event.scheme === "dartford") return "dartford";
  if (event.scheme === "blackwall-silvertown" && (!event.zoneId || event.zoneId === "47814")) return "blackwall-silvertown";
  if (event.scheme === "congestion") {
    const sectors: Record<string, string> = { "10377": "main", "10378": "e", "10379": "ne", "10380": "sw" };
    return `congestion:${sectors[event.zoneId ?? ""] ?? /congestion\s+zone\s+(ne|sw|e)\b/i.exec(event.zoneName)?.[1].toLowerCase() ?? "main"}`;
  }
  return event.zoneId || event.zoneName.toLowerCase().replace(/zone[_ ]?(?:in|out)|\b(?:entered|exited)\b/g, "").replace(/\s+/g, " ").trim();
};

/** Arrival order never determines visit order. Overlapping congestion sectors form a union. */
export function reconstructGpsVisits(events: GpsEvent[], positions: GpsPosition[], zones: GpsLiveZone[], jobs: Job[], now: string): GpsVisit[] {
  const positionForScheme = createSchemePosition(zones);
  const visits: GpsVisit[] = [];
  const sorted = [...events].filter(valid).sort((a, b) => ms(a.occurredAt!) - ms(b.occurredAt!) ||
    (a.type === b.type ? a._id.localeCompare(b._id) : a.type === "entry" ? -1 : 1));
  for (const imei of new Set([...events.map(event => event.imei).filter((value): value is string => !!value), ...positions.map(p => p.imei)])) {
    for (const scheme of SCHEMES) {
      const active = new Set<string>();
      let visit: GpsVisit | null = null;
      let previous: GpsVisit | null = null;
      const seen = new Set<string>();
      for (const event of sorted.filter(row => row.imei === imei && row.scheme === scheme)) {
        const instant = event.occurredAt!, zone = zoneKey(event), key = `${instant}:${event.type}:${zone}`;
        if (seen.has(key)) { if (visit) visit.eventIds.push(event._id); continue; }
        seen.add(key);
        if (event.type === "entry") {
          if (active.has(zone) && visit) visit.issues.push("Repeated entry without a matching exit; individual passages remain uncertain.");
          if (!active.size) {
            if (previous?.exitAt && ms(instant) - ms(previous.exitAt) <= 30_000) {
              visit = previous; visit.exitAt = null; visit.durationSeconds = null;
              visit.status = "open"; visit.issues.push("Boundary re-entry within 30 seconds merged; physical repetition uncertain.");
            } else {
              visit = { id: `visit:${event._id}`, imei, scheme, entryAt: instant, firstInsideAt: instant,
                exitAt: null, durationSeconds: null, entryObserved: true, origin: "alerts", status: "open",
                physicalCrossingConfirmed: false, eventIds: [], zoneNames: [], issues: [],
                association: associateGpsEvent(event, jobs, now) };
              visits.push(visit);
            }
          }
          active.add(zone);
        }
        if (visit) {
          visit.eventIds.push(event._id);
          visit.zoneNames = [...new Set([...visit.zoneNames, event.zoneName])];
        }
        if (event.type === "exit") {
          if (!active.has(zone)) {
            if (visit) visit.issues.push("Exit has no matching zone entry.");
            else visits.push({ id: `visit:${event._id}`, imei, scheme, entryAt: null, firstInsideAt: instant,
              exitAt: instant, durationSeconds: null, entryObserved: false, origin: "alerts", status: "inferred",
              physicalCrossingConfirmed: false, eventIds: [event._id], zoneNames: [event.zoneName],
              issues: ["Entry missing; time in zone unknown."], association: associateGpsEvent(event, jobs, now) });
            continue;
          }
          active.delete(zone);
          if (!active.size && visit) {
            visit.exitAt = instant;
            visit.durationSeconds = visit.entryAt ? (ms(instant) - ms(visit.entryAt)) / 1000 : null;
            visit.status = "observed-pair";
            previous = visit; visit = null;
          }
        }
      }
      if (visit) visit.issues.push("Exit missing; time in zone unknown.");

      // Two stable points support a derived entry. Initial in-zone occupancy is not an entry.
      let state: "inside" | "outside" | null = null;
      let candidate: { state: "inside" | "outside"; at: string } | null = null;
      let inferred: GpsVisit | null = null;
      let lastAt: string | null = null;
      for (const p of positions.filter(row => row.imei === imei && !row.conflicting).sort((a, b) => ms(a.occurredAt) - ms(b.occurredAt))) {
        if (lastAt && ms(p.occurredAt) - ms(lastAt) > 120_000) { state = null; candidate = null; inferred = null; }
        if (lastAt === p.occurredAt) continue;
        lastAt = p.occurredAt;
        const next = positionForScheme(p, scheme);
        if (next === "boundary" || next === "unavailable") { candidate = null; continue; }
        if (state === next) { candidate = null; continue; }
        if (!candidate || candidate.state !== next) { candidate = { state: next, at: p.occurredAt }; continue; }
        if (ms(p.occurredAt) - ms(candidate.at) < 30_000) continue;
        if (next === "inside") {
          const covered = visits.some(v => v.imei === imei && v.scheme === scheme && ms(v.firstInsideAt) <= ms(p.occurredAt) && (!v.exitAt || ms(v.exitAt) >= ms(candidate!.at)));
          if (!covered) {
            inferred = { id: `visit:position:${p._id}:${scheme}`, imei, scheme, entryAt: state === "outside" ? candidate.at : null,
              firstInsideAt: candidate.at, exitAt: null, durationSeconds: null, entryObserved: false, origin: "positions", status: "inferred",
              physicalCrossingConfirmed: false, eventIds: [], zoneNames: [], issues: ["Position-derived occupancy; not an observed geofence crossing."],
              association: associateGpsEvent({ imei, occurredAt: candidate.at, timeSource: p.timeSource }, jobs, now) };
            visits.push(inferred);
          }
        } else if (inferred) {
          inferred.exitAt = candidate.at;
          inferred.durationSeconds = inferred.entryAt ? (ms(candidate.at) - ms(inferred.entryAt)) / 1000 : null;
          inferred = null;
        }
        state = next; candidate = null;
      }
    }
  }
  for (const visit of visits) if (visit.scheme !== "congestion") visit.issues.push("Geofence passage is not proof of a physical tunnel traversal or direction; route/portal verification required.");
  return visits.sort((a, b) => ms(a.firstInsideAt) - ms(b.firstInsideAt));
}
