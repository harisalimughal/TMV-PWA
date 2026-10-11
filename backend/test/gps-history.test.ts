import { describe, expect, it } from "vitest";
import { gpsTime, parseGpsEvent, parseGpsPosition } from "../src/gps/gps.parse";
import { associateGpsEvent, recordGpsAssignment } from "../src/gps/gps.association";
import { reconstructGpsVisits } from "../src/gps/gps.visits";
import { gpsMovement } from "../src/gps/gps.movement";
import { parsePortalRules, verifyPortalTraversals } from "../src/gps/gps.portals";
import type { Job } from "../src/jobs/job.types";
import type { GpsLiveZone } from "../src/integrations/gpslive";

const now = "2026-10-09T12:00:00Z";
const time = (seconds: number) => new Date(Date.parse("2026-10-09T09:00:00Z") + seconds * 1000).toISOString();
const job = (changes: Partial<Job> = {}): Job => ({ jobId: "OLD", driverInitials: "AB", status: "COMPLETED",
  onMyWayAt: "2026-10-09T08:30:00Z", actualStart: time(0), actualFinish: time(7200), gpsliveImei: "123",
  gpsDeviceHistory: [{ imei: "123", from: "2026-10-09T08:30:00Z", to: null, driverInitials: "AB", source: "profile-snapshot" }], ...changes } as Job);
const event = (id: string, type: string, seconds: number, zoneId = 10377) => parseGpsEvent({ event_id: id, imei: "123", type, dt_tracker: time(seconds), zoneId,
  event_desc: zoneId === 10381 ? "Dartford Crossing" : "Congestion" }, "webhook", now)!;
const point = (seconds: number, lng = -0.128 + seconds / 60 * 0.002, speed = 30) => parseGpsPosition({ dtTracker: time(seconds), lat: 51.5, lng, speed }, "123", "positions-history", now)!;
const zone: GpsLiveZone = { zoneId: 10381, zoneName: "Dartford Crossing", zoneVertices: [[51.49, -0.13], [51.51, -0.13], [51.51, -0.11], [51.49, -0.11]] };
const portals = () => parsePortalRules(JSON.stringify([{ id: "verified-fixture", scheme: "dartford", tunnelName: "Fixture tunnel", effectiveFrom: "2026-01-01T00:00:00Z",
  sideA: [[51.49, -0.129], [51.51, -0.129], [51.51, -0.127], [51.49, -0.127]],
  sideB: [[51.49, -0.113], [51.51, -0.113], [51.51, -0.111], [51.49, -0.111]] }]));

describe("GPS source parsing and historical association", () => {
  it("deduplicates a provider ID across webhook/history representations", () => {
    expect(event("same", "zone_in", 0)._id).toBe(parseGpsEvent({ event_id: "same", type: "zone_in", device: { imei: "123" }, dt_tracker: time(0), event_desc: "Congestion" }, "alerts-history", now)!._id);
  });
  it("retains missing timestamps instead of replacing them with receipt time", () => {
    expect(parseGpsEvent({ event_id: "missing", type: "zone_in", event_desc: "Dartford" }, "webhook", now)).toMatchObject({ scheme: "dartford", occurredAt: null, timeSource: "missing", receivedAt: now });
  });
  it("retains malformed/future events while excluding future position samples", () => {
    expect(gpsTime("2026-02-30 10:00:00", now).timeSource).toBe("invalid");
    expect(gpsTime("2027-10-09 10:00:00", now).timeSource).toBe("future");
    expect(parseGpsPosition({ dtTracker: "2027-10-09 10:00:00", lat: 51.5, lng: -0.1, speed: 20 }, "123", "positions-history", now)).toBeNull();
  });
  it("keeps SQL UTC interpretation explicit and respects DST offsets", () => {
    expect(gpsTime("2026-10-09 09:00:00", now).timeSource).toBe("provider-assumed-utc");
    expect(gpsTime("2026-10-25T01:15:00+01:00", "2026-10-26T00:00:00Z").occurredAt).toBe("2026-10-25T00:15:00.000Z");
  });
  it("attributes a late delivery to the completed job at occurrence, not the current job", () => {
    const current = job({ jobId: "NEW", status: "IN_PROGRESS" as Job["status"], actualStart: time(8000), onMyWayAt: time(7500), actualFinish: "" });
    expect(associateGpsEvent(event("late", "zone_in", 3600), [job(), current], now).jobId).toBe("OLD");
  });
  it("uses immutable assignment segments through a van/driver swap", () => {
    const assigned = job({ actualFinish: time(8000), gpsDeviceHistory: [] });
    recordGpsAssignment(assigned, "123", time(0), "job-start-resolution");
    assigned.driverInitials = "CD";
    recordGpsAssignment(assigned, "456", time(3600), "pickup-report");
    expect(associateGpsEvent(event("before", "zone_in", 60), [assigned], now).driverInitials).toBe("AB");
    expect(associateGpsEvent({ ...event("after", "zone_in", 4000), imei: "456" }, [assigned], now).driverInitials).toBe("CD");
  });
  it("never picks one of two overlapping jobs or guesses a missing device", () => {
    expect(associateGpsEvent(event("ambiguous", "zone_in", 60), [job(), job({ jobId: "OTHER" })], now)).toMatchObject({ jobId: null, confidence: "ambiguous" });
    expect(associateGpsEvent({ ...event("missing", "zone_in", 60), imei: null }, [job()], now).jobId).toBeNull();
  });
  it("associates READY/on-my-way approach events but not post-finish activity", () => {
    const ready = job({ status: "READY" as Job["status"], actualStart: "", actualFinish: "" });
    expect(associateGpsEvent(event("approach", "zone_in", 60), [ready], now).phase).toBe("approach");
    expect(associateGpsEvent(event("after", "zone_in", 7200), [job()], now).jobId).toBeNull();
  });
  it("does not attach evidence with conflicting identity or fallback finish times", () => {
    expect(associateGpsEvent({ ...event("bad", "zone_in", 60), conflicts: ["imei"] }, [job()], now).jobId).toBeNull();
    expect(associateGpsEvent(event("bad", "zone_in", 60), [job({ actualFinishSource: "admin-manual" })], now).jobId).toBeNull();
  });
});

describe("GPS visits and tunnel traversal evidence", () => {
  it("reconstructs out-of-order overlapping congestion sectors as one visit", () => {
    const events = [event("d", "zone_out", 180, 10378), event("b", "zone_in", 60, 10378), event("a", "zone_in", 0), event("c", "zone_out", 120)];
    const visits = reconstructGpsVisits(events, [], [], [job()], now);
    expect(visits).toHaveLength(1);
    expect(visits[0]).toMatchObject({ durationSeconds: 180, status: "observed-pair", physicalCrossingConfirmed: false });
  });
  it("merges immediate boundary jitter while retaining later genuine passages", () => {
    const events = [event("a", "zone_in", 0, 10381), event("b", "zone_out", 60, 10381), event("c", "zone_in", 65, 10381), event("d", "zone_out", 120, 10381), event("e", "zone_in", 300, 10381), event("f", "zone_out", 360, 10381)];
    expect(reconstructGpsVisits(events, [], [], [job()], now)).toHaveLength(2);
  });
  it("keeps a missing exit duration unknown", () => {
    expect(reconstructGpsVisits([event("open", "zone_in", 0)], [], [], [job()], now)[0]).toMatchObject({ exitAt: null, durationSeconds: null, status: "open" });
  });
  it("treats initial in-zone GPS points as inferred occupancy without inventing an entry", () => {
    const congestion = { ...zone, zoneId: 10377, zoneName: "Congestion" };
    const visits = reconstructGpsVisits([], [point(0), point(30)], [congestion], [job()], now);
    expect(visits[0]).toMatchObject({ entryAt: null, entryObserved: false, status: "inferred" });
  });
  it("confirms an opposite-portal route and preserves its proof/source", () => {
    const result = verifyPortalTraversals([], [point(0, -0.128), point(60), point(120, -0.112)], [zone], portals(), [job()], now);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ physicalCrossingConfirmed: true, direction: "A to B", tunnelName: "Fixture tunnel" });
    expect(result[0].proofPositionIds).toHaveLength(3);
  });
  it("does not confirm a U-turn or a tunnel signal gap", () => {
    expect(verifyPortalTraversals([], [point(0, -0.128), point(60), point(120, -0.128)], [zone], portals(), [job()], now)).toHaveLength(0);
    expect(verifyPortalTraversals([], [point(0, -0.128), point(614), point(674, -0.112)], [zone], portals(), [job()], now)).toHaveLength(0);
  });
  it("can bracket short underground signal loss using known opposite moving portals", () => {
    const result = verifyPortalTraversals([], [point(0, -0.128), point(90, -0.112)], [zone], portals(), [job()], now);
    expect(result[0]).toMatchObject({ physicalCrossingConfirmed: true, portalProofKind: "bounded-signal-gap" });
    expect(result[0].proofPositionIds).toHaveLength(2);
  });
  it("does not count the same physical route twice under overlapping portal rules", () => {
    const rules = [...portals(), { ...portals()[0], id: "duplicate-rule" }];
    const result = verifyPortalTraversals([], [point(0, -0.128), point(60), point(120, -0.112)], [zone], rules, [job()], now);
    expect(result).toHaveLength(1);
    expect(result[0].physicalCrossingConfirmed).toBe(false);
  });
});

describe("GPS movement coverage", () => {
  it("keeps large gaps unknown rather than creating moving hours", () => {
    expect(gpsMovement([point(0), point(614)], [], time(0), time(614))).toMatchObject({ movingSeconds: null, unknownSeconds: 614, maxGapSeconds: 614 });
  });
  it("clips samples at job boundaries and preserves sampled provenance", () => {
    expect(gpsMovement([point(0), point(60), point(120)], [], time(30), time(90))).toMatchObject({ movingSeconds: 60, unknownSeconds: 0, coverage: "sampled" });
  });
  it("uses contained provider drive durations without double counting overlapping records", () => {
    const drive = { _id: "drive", imei: "123", start: time(0), end: time(120), movingSeconds: 90 };
    expect(gpsMovement([], [drive, { ...drive, _id: "duplicate" }], time(0), time(120))).toMatchObject({ movingSeconds: 90, stationarySeconds: 30, providerMovingSeconds: 90 });
    expect(gpsMovement([], [drive], time(30), time(90)).providerMovingSeconds).toBeNull();
  });
  it("keeps engine idling distinct from stationary time when ignition is unknown", () => {
    const a = point(0, -0.12, 0), b = point(60, -0.12, 0);
    expect(gpsMovement([a, b], [], time(0), time(60))).toMatchObject({ stationarySeconds: 60, idleSeconds: null });
    expect(gpsMovement([{ ...a, ignitionOn: true }, { ...b, ignitionOn: true }], [], time(0), time(60))).toMatchObject({ stationarySeconds: 60, idleSeconds: 60 });
  });
});
