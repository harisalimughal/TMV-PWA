import { gpsLocation } from "./gps.parse";
import { schemePosition } from "./gps.geometry";
import { associateGpsEvent } from "./gps.association";
import { plausibleGpsStep } from "./gps.movement";
import { DateTime } from "luxon";
import type { Job } from "../jobs/job.types";
import type { GpsLiveZone } from "../integrations/gpslive";
import type { GpsPosition, GpsTunnelPortalRule, GpsVisit } from "./gps.types";

export function parsePortalRules(value: string): GpsTunnelPortalRule[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.length > 20) throw new RangeError("At most 20 tunnel portal rules are supported.");
  const ids = new Set<string>();
  for (const rule of parsed) {
    if (!rule || typeof rule.id !== "string" || !rule.id || ids.has(rule.id) || typeof rule.tunnelName !== "string" || !rule.tunnelName ||
      !["dartford", "blackwall-silvertown"].includes(rule.scheme) || typeof rule.effectiveFrom !== "string" ||
      !/(?:Z|[+-]\d{2}:\d{2})$/i.test(rule.effectiveFrom) || !DateTime.fromISO(rule.effectiveFrom, { setZone: true }).isValid) throw new RangeError("Portal rule identity/scheme/effective date is invalid.");
    ids.add(rule.id);
    for (const ring of [rule.sideA, rule.sideB]) if (!Array.isArray(ring) || ring.length < 3 || ring.length > 500 || ring.some(pair => !Array.isArray(pair) || !gpsLocation(pair[0], pair[1]))) throw new RangeError("Portal polygons must contain valid latitude/longitude pairs.");
  }
  return parsed as GpsTunnelPortalRule[];
}

/** Confirm only opposite configured portals with fresh continuous moving route evidence. */
export function verifyPortalTraversals(visits: GpsVisit[], positions: GpsPosition[], zones: GpsLiveZone[], rules: GpsTunnelPortalRule[], jobs: Job[], now: string): GpsVisit[] {
  const result = visits.map(visit => ({ ...visit, issues: [...visit.issues] }));
  for (const rule of rules) for (const imei of new Set(positions.map(p => p.imei))) {
    let entered: { side: "A" | "B"; point: GpsPosition } | null = null;
    let middle = false;
    let middlePoint: GpsPosition | null = null;
    let last: GpsPosition | null = null;
    for (const p of positions.filter(row => row.imei === imei && !row.conflicting && row.timeSource !== "future").sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))) {
      if (Date.parse(p.occurredAt) < Date.parse(rule.effectiveFrom)) continue;
      if (last?.occurredAt === p.occurredAt) continue;
      if (last && !plausibleGpsStep(last, p)) { entered = null; middle = false; }
      last = p;
      const portal = (ring: [number, number][]) => schemePosition(p, rule.scheme, [{ zoneId: 0, zoneName: rule.scheme === "dartford" ? "Dartford" : "Blackwall", zoneVertices: ring }], 5);
      const a = portal(rule.sideA), b = portal(rule.sideB);
      if (a === "inside" && b === "inside") { entered = null; middle = false; continue; }
      const side = a === "inside" ? "A" : b === "inside" ? "B" : null;
      if (entered && !side && p.speedKph !== null && p.speedKph >= 5 && p.speedKph <= 200 && schemePosition(p, rule.scheme, zones) === "inside") { middle = true; middlePoint = p; }
      if (!side) continue;
      if (!entered || entered.side === side) { entered = { side, point: p }; middle = false; continue; }
      const bracketed = plausibleGpsStep(entered.point, p) && entered.point.speedKph !== null && entered.point.speedKph >= 5 && entered.point.speedKph <= 200 && p.speedKph !== null && p.speedKph >= 5 && p.speedKph <= 200;
      if ((middle || bracketed) && p.speedKph !== null && p.speedKph <= 200) {
        const overlap = result.find(row => row.imei === imei && row.scheme === rule.scheme && row.proofFrom && row.proofTo &&
          Date.parse(row.proofFrom) < Date.parse(p.occurredAt) && Date.parse(row.proofTo) > Date.parse(entered!.point.occurredAt));
        if (overlap) {
          overlap.physicalCrossingConfirmed = false;
          delete overlap.tunnelName; delete overlap.direction;
          overlap.issues.push("Overlapping portal proofs require verification; no duplicate crossing counted.");
          entered = { side, point: p }; middle = false; continue;
        }
        let visit = result.find(row => row.imei === imei && row.scheme === rule.scheme && !row.physicalCrossingConfirmed &&
          Date.parse(row.firstInsideAt) >= Date.parse(entered!.point.occurredAt) - 120_000 && Date.parse(row.firstInsideAt) <= Date.parse(p.occurredAt));
        if (!visit) {
          visit = { id: `portal:${rule.id}:${entered.point._id}:${p._id}`, imei, scheme: rule.scheme,
            entryAt: entered.point.occurredAt, firstInsideAt: entered.point.occurredAt, exitAt: p.occurredAt,
            durationSeconds: (Date.parse(p.occurredAt) - Date.parse(entered.point.occurredAt)) / 1000,
            entryObserved: false, origin: "positions", status: "inferred", physicalCrossingConfirmed: false,
            eventIds: [], zoneNames: [], issues: [], association: associateGpsEvent(entered.point, jobs, now) };
          result.push(visit);
        }
        visit.physicalCrossingConfirmed = true; visit.tunnelName = rule.tunnelName;
        visit.direction = `${entered.side} to ${side}`;
        visit.proofPositionIds = middle && middlePoint ? [entered.point._id, middlePoint._id, p._id] : [entered.point._id, p._id];
        visit.portalProofKind = middle ? "continuous-route" : "bounded-signal-gap";
        visit.proofFrom = entered.point.occurredAt; visit.proofTo = p.occurredAt;
        const first = associateGpsEvent(entered.point, jobs, now), lastAssociation = associateGpsEvent(p, jobs, now);
        if (first.jobId && first.jobId === lastAssociation.jobId) visit.association = first;
        else visit.association = { jobId: null, driverInitials: null, phase: null, confidence: "ambiguous",
          candidateJobIds: [...new Set([...first.candidateJobIds, ...lastAssociation.candidateJobIds])], reason: "Traversal spans unmatched or different job intervals." };
        visit.issues = visit.issues.filter(issue => !issue.startsWith("Geofence passage is not proof"));
        visit.issues.push(`Portal proof uses configured geometry ${rule.id}, effective ${rule.effectiveFrom}.`);
      }
      entered = { side, point: p }; middle = false;
    }
  }
  return result;
}
