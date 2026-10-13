import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { assessRoadCharges, parseRoadRate, roadWindow, ROAD_RULE_VERSION } from "../src/gps/road-charge.rules";
import type { GpsVisit } from "../src/gps/gps.types";
import type { Job } from "../src/jobs/job.types";
import type { DriverJobSummaryDoc } from "../src/db/driver-job-summary.repo";

const job = (changes: Partial<Job> = {}) => ({ jobId: "JOB", driverInitials: "AB", status: "COMPLETED", actualStart: "2026-10-09T00:00:00Z", actualFinish: "2026-10-11T23:00:00Z", extraCharges: [],
  chargeSnapshot: { basePence: 20000, congestionPence: 1800, tunnelPence: 2720 }, roadTariffSnapshot: { version: ROAD_RULE_VERSION, effectiveFrom: "2026-10-08T00:00:00Z", capturedAt: "2026-10-08T00:00:00Z", source: "pricing-settings", congestionPence: 1800, tunnelPence: 1360 }, ...changes } as Job);
const visit = (id: string, at = "2026-10-09T10:00:00Z", tunnel = false): GpsVisit => ({ id, imei: "123", scheme: tunnel ? "dartford" : "congestion", entryAt: at, firstInsideAt: at, exitAt: at, durationSeconds: 0, entryObserved: true, origin: "alerts", status: "observed-pair", physicalCrossingConfirmed: tunnel, eventIds: [id], zoneNames: [], issues: [],
  ...(tunnel ? { proofFrom: new Date(Date.parse(at) - 60000).toISOString(), proofTo: at, tunnelName: "Fixture", direction: "A to B" } : {}),
  association: { jobId: "JOB", driverInitials: "AB", phase: "on-job", confidence: "recorded-assignment", candidateJobIds: ["JOB"], reason: null } });
const manual = (congestion = 1800, tunnel = 2720) => ({ jobId: "JOB", chargeItems: [{ type: "congestion", amountPence: congestion }, { type: "tunnel", amountPence: tunnel }] } as DriverJobSummaryDoc);
const assess = (visits: GpsVisit[], changes: Partial<Parameters<typeof assessRoadCharges>[0]> = {}) => assessRoadCharges({ job: job(), visits, coverage: "sampled", manual: manual(), ...changes });

describe("London customer charge windows", () => {
  for (const [date, type, start, finish] of [["2026-10-09", "congestion", 7, 18], ["2026-10-10", "congestion", 12, 18], ["2026-10-11", "congestion", 12, 18], ["2026-10-09", "tunnel", 6, 22], ["2026-10-11", "tunnel", 6, 22]] as const) {
    for (const [hour, seconds, expected] of [[start, -1, false], [start, 0, true], [start, 1, true], [finish, -1, true], [finish, 0, false], [finish, 1, false]] as const) {
      it(`${type} ${date} boundary ${hour}:00 ${seconds}s`, () => {
        const at = DateTime.fromISO(`${date}T${String(hour).padStart(2, "0")}:00:00`, { zone: "Europe/London" }).plus({ seconds }).toUTC().toISO()!;
        expect(roadWindow(type, at).chargeable).toBe(expected);
      });
    }
  }
  it("uses the supplied schedule on Christmas and bank holidays, without inventing exemptions", () => {
    expect(roadWindow("congestion", "2026-12-25T07:00:00Z").chargeable).toBe(true);
    expect(roadWindow("tunnel", "2026-12-25T06:00:00Z").chargeable).toBe(true);
    expect(roadWindow("congestion", "2026-05-25T06:00:00Z").chargeable).toBe(true);
  });
  it("handles both London DST transitions and rejects naive/malformed times", () => {
    expect(roadWindow("congestion", "2026-03-29T11:00:00Z").chargeable).toBe(true);
    expect(roadWindow("congestion", "2026-10-25T12:00:00Z").chargeable).toBe(true);
    expect(roadWindow("tunnel", "2026-10-09T06:00:00").chargeable).toBeNull();
    expect(roadWindow("tunnel", "2026-02-30T06:00:00Z").chargeable).toBeNull();
  });
});

describe("Observed obligations and reconciliation", () => {
  it("charges verified approach crossings and congestion from On the Way before arrival", () => {
    const approachJob = job({ onMyWayAt: "2026-10-09T09:00:00Z", actualStart: "2026-10-09T11:00:00Z", actualFinish: "2026-10-09T12:00:00Z" });
    const tunnel = visit("approach-tunnel", "2026-10-09T10:00:00Z", true);
    const congestion = visit("approach-congestion", "2026-10-09T10:05:00Z");
    tunnel.association.phase = congestion.association.phase = "approach";
    const result = assess([tunnel, congestion], { job: approachJob });
    expect(result.comparisons.map(row => row.observedExpectedPence)).toEqual([1800, 1360]);
    expect(result.activity.every(row => row.inJob && row.eligible)).toBe(true);
  });
  it("requires the entire tunnel proof to be after On the Way and before finish", () => {
    const approachJob = job({ onMyWayAt: "2026-10-09T09:00:00Z", actualStart: "2026-10-09T11:00:00Z", actualFinish: "2026-10-09T12:00:00Z" });
    const result = assess([
      visit("straddles-departure", "2026-10-09T09:00:30Z", true),
      visit("departure-entry", "2026-10-09T09:00:00Z"),
      visit("before", "2026-10-09T08:59:59Z"),
      visit("finish", "2026-10-09T12:00:00Z"),
      visit("after", "2026-10-09T12:01:00Z", true)
    ], { job: approachJob });
    expect(result.obligations.map(row => row.type)).toEqual(["congestion"]);
    expect(result.activity.filter(row => row.inJob).map(row => row.visitId)).toEqual(["departure-entry"]);
  });
  it("charges congestion once per job, retaining entries and separate authority dates", () => {
    const result = assess([visit("first"), visit("repeat", "2026-10-09T11:00:00Z"), visit("next-day", "2026-10-10T12:00:00Z")]);
    expect(result.obligations).toHaveLength(1);
    expect(result.obligations[0].visitIds).toHaveLength(3);
    expect(result.authorityReferences).toHaveLength(3);
    expect(new Set(result.authorityReferences.map(row => row.authorityKey)).size).toBe(2);
    expect(result.comparisons[0].observedExpectedPence).toBe(1800);
  });
  it("counts repeated genuine tunnel passages separately but duplicate delivery only once", () => {
    const result = assess([visit("one", undefined, true), visit("one-copy", undefined, true), visit("two", "2026-10-09T11:00:00Z", true)]);
    expect(result.obligations).toHaveLength(2);
    expect(result.comparisons[1]).toMatchObject({ observedExpectedPence: 2720, obligations: 2 });
  });
  it("groups overlapping enriched physical proofs instead of doubling crossing totals", () => {
    const enriched = visit("enriched", "2026-10-09T10:00:10Z", true);
    expect(assess([visit("one", undefined, true), enriched]).comparisons[1]).toMatchObject({ observedExpectedPence: 1360, obligations: 1 });
  });
  it("keeps amounts unknown when operational boundaries are fallback timestamps", () => {
    expect(assess([], { job: job({ actualFinishSource: "admin-manual" }) }).comparisons.every(row => row.observedExpectedPence === null)).toBe(true);
  });
  it("allows separate jobs/drivers using the same van to have their own congestion fee", () => {
    const a = assess([visit("one")]).obligations[0];
    const other = visit("two"); other.association.jobId = "OTHER"; other.association.driverInitials = "CD";
    const b = assess([other], { job: job({ jobId: "OTHER", driverInitials: "CD" }) }).obligations[0];
    expect(a.id).not.toBe(b.id);
    expect(a.authorityKey).toBe(b.authorityKey);
  });
  it("keeps authority references tied to each vehicle through an in-job van swap", () => {
    const otherVan = visit("other-van", "2026-10-09T11:00:00Z"); otherVan.imei = "456";
    const result = assess([visit("first"), otherVan]);
    expect(result.obligations).toHaveLength(1);
    expect(result.authorityReferences.map(row => row.imei)).toEqual(["123", "456"]);
  });
  it("does not charge pre-window entries, occupancy at opening or midnight continuation", () => {
    const before = visit("before", "2026-10-09T05:59:59Z"); before.exitAt = "2026-10-09T10:00:00Z";
    const overnight = visit("night", "2026-10-09T23:00:00Z"); overnight.exitAt = "2026-10-10T15:00:00Z";
    expect(assess([before, overnight]).obligations).toHaveLength(0);
    expect(assess([before, visit("real-new-entry", "2026-10-09T07:00:00Z")]).obligations).toHaveLength(1);
  });
  it("does not use inferred occupancy, geofence-only tunnel passage or legacy ownership as proof", () => {
    const inside = { ...visit("inside"), entryObserved: false, entryAt: null };
    const tunnel = { ...visit("tunnel", undefined, true), physicalCrossingConfirmed: false };
    const legacy = visit("legacy"); legacy.association.confidence = "legacy-pin";
    const result = assess([inside, tunnel, legacy]);
    expect(result.obligations).toHaveLength(0);
    expect(result.flags.some(flag => flag.code === "Needs verification")).toBe(true);
  });
  it("requires the whole crossing to be inside recorded job boundaries", () => {
    expect(assess([visit("cross", "2026-10-09T10:00:00Z", true)], { job: job({ actualStart: "2026-10-09T09:59:30Z" }) }).obligations).toHaveLength(0);
    expect(assess([visit("finish")], { job: job({ actualFinish: "2026-10-09T10:00:00Z" }) }).obligations).toHaveLength(0);
  });
  it("does not guess exact crossing time when route proof straddles a charging boundary", () => {
    const result = assess([visit("opening", "2026-10-09T05:00:00Z", true)]);
    expect(result.obligations).toHaveLength(0);
    expect(result.comparisons[1].observedExpectedPence).toBeNull();
    expect(result.activity[0].reason).toContain("boundary");
  });
  it("uses saved effective rates; unknown and future tariffs never become zero", () => {
    const frozen = job(); frozen.roadTariffSnapshot!.congestionPence = 1900;
    expect(assess([visit("fee")], { job: frozen }).comparisons[0].observedExpectedPence).toBe(1900);
    expect(assess([visit("old")], { job: job({ roadTariffSnapshot: undefined }) }).comparisons[0].observedExpectedPence).toBeNull();
    frozen.roadTariffSnapshot!.effectiveFrom = "2026-10-10T00:00:00Z";
    expect(assess([visit("future-rate")], { job: frozen }).comparisons[0].observedExpectedPence).toBeNull();
  });
  it("distinguishes an explicit zero price from unknown GPS/rates/manual amounts", () => {
    const zero = job(); zero.roadTariffSnapshot!.congestionPence = 0;
    expect(assess([visit("free")], { job: zero }).comparisons[0].observedExpectedPence).toBe(0);
    expect(assess([], { coverage: "unavailable" }).comparisons[0].observedExpectedPence).toBeNull();
    const unknown = manual(); unknown.chargeItems![0].amountPence = null;
    expect(assess([visit("unknown")], { manual: unknown }).comparisons[0].manualReportedPence).toBeNull();
  });
  it("flags missing, mismatched, outside-hours and manual-only amounts without alleging fraud", () => {
    const missing = assess([visit("fee")], { manual: manual(0, 0), job: job({ chargeSnapshot: { basePence: 0, congestionPence: 0, tunnelPence: 0 } }) });
    expect(missing.flags.filter(flag => flag.code === "Missing charge")).toHaveLength(2);
    expect(assess([visit("fee")], { manual: manual(1700, 0) }).flags.some(flag => flag.code === "Amount mismatch")).toBe(true);
    expect(assess([visit("outside", "2026-10-09T19:00:00Z")]).flags.some(flag => flag.code === "Outside chargeable hours")).toBe(true);
    expect(assess([]).flags.some(flag => flag.code === "Manual only")).toBe(true);
    expect(assess([], { coverage: "unavailable" }).flags.every(flag => flag.code !== "Manual only")).toBe(true);
  });
  it("blocks a duplicate allocation from expected totals", () => {
    const result = assess([visit("duplicate", undefined, true)], { allocationConflicts: [{ code: "Duplicate allocation", type: "tunnel", source: "allocation", reason: "Already owned", evidenceIds: ["duplicate"] }] });
    expect(result.obligations).toHaveLength(0);
    expect(result.comparisons[1].observedExpectedPence).toBeNull();
  });
  it.each([["18", 1800], ["13.60", 1360], ["0", 0], ["£18.00", 1800], ["", null], ["-1", null], ["NaN", null], ["1.001", null], ["1000001", null]])("validates settings rate %s", (raw, expected) => expect(parseRoadRate(String(raw))).toBe(expected));
});
