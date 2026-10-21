import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "../src/jobs/job.types";
import type { DriverJobSummaryDoc } from "../src/db/driver-job-summary.repo";
const mocks = vi.hoisted(() => ({ profile: vi.fn(), jobs: vi.fn(), context: vi.fn(), liabilities: vi.fn(), gps: vi.fn(), events: vi.fn(), movement: vi.fn(), setting: vi.fn(), manuals: vi.fn(), allocations: vi.fn(), prepaymentConflicts: vi.fn(), evidence: vi.fn() }));
vi.mock("../src/auth/driver-account.service", () => ({ getDriverProfileByInitials: mocks.profile }));
vi.mock("../src/reports/driver-report.repo", () => ({ loadDriverReportJobs: mocks.jobs, loadReportContextJobs: mocks.context, loadReportLiabilitySources: mocks.liabilities, reportPrepaymentConflicts: mocks.prepaymentConflicts, ReportCapacityError: class extends Error {} }));
vi.mock("../src/gps/gps.repo", () => ({ readGpsRange: mocks.gps, readGpsEventRange: mocks.events, readGpsMovementRange: mocks.movement }));
vi.mock("../src/db/evidence.repo", () => ({ listEvidenceForJobs: mocks.evidence }));
vi.mock("../src/db/settings.repo", () => ({ getSetting: mocks.setting }));
vi.mock("../src/db/driver-job-summary.repo", () => ({ listDriverJobSummariesForJobs: mocks.manuals }));
vi.mock("../src/reports/report-road-allocations", () => ({ reportRoadAllocations: mocks.allocations }));
import { buildDriverReport, getDriverReport } from "../src/reports/driver-report.service";
import { invalidateReportReads } from "../src/reports/report-read-cache";
vi.mock("../src/reports/driver-road-alerts", async importOriginal => ({ ...await importOriginal<typeof import("../src/reports/driver-road-alerts")>(), readReportAlerts: vi.fn().mockResolvedValue({ events: [], truncated: false }) }));
import { buildLiabilityRecord } from "../src/liabilities/liability.model";
import type { ScenarioSubmissionDoc } from "../src/db/scenario.repo";
import { readReportAlerts } from "../src/reports/driver-road-alerts";
import { parseGpsEvent } from "../src/gps/gps.parse";
import { exportSections } from "../src/reports/driver-report-export.model";
const range = { from: "2026-10-09T00:00:00Z", to: "2026-10-10T00:00:00Z" };
const job = (id: string): Job => ({ jobId: id, status: "COMPLETED", driverInitials: "AB", actualStart: "2026-10-09T09:00:00Z", actualFinish: "2026-10-09T11:00:00Z", bookedStart: "2026-10-09T09:00:00Z", bookedFinish: "2026-10-09T11:00:00Z", totalCharges: 250, calculatedTotalCharges: 250, amountCharged: 250, basePrice: 250, paymentMethod: "Cash", paymentStatus: "Paid", paymentBreakdown: [{ method: "Cash", amount: 250 }], extraCharges: [], overtimeMinutes: 0, overtimeCharge: 0 } as Job);
const manual = (id: string): DriverJobSummaryDoc => ({ jobId: id, driverInitials: "AB", driverEmail: "ab@example.com", startTime: "2026-10-09T09:00:00Z", endTime: "2026-10-09T11:00:00Z", paymentMethod: "Cash", paymentBreakdown: [{ method: "Cash", amountPence: 22000 }], helperName: "", helperHours: 0 } as DriverJobSummaryDoc);
beforeEach(() => {
  invalidateReportReads();
  vi.clearAllMocks(); mocks.profile.mockResolvedValue({ initials: "AB", email: "ab@example.com", fullName: "Driver" });
  vi.mocked(readReportAlerts).mockResolvedValue({ events: [], truncated: false });
  mocks.jobs.mockResolvedValue([{ job: job("ONE"), manual: manual("ONE") }, { job: job("TWO"), manual: manual("TWO") }]);
  mocks.context.mockResolvedValue([]); mocks.gps.mockResolvedValue({ events: [], positions: [], drives: [], runs: [], truncated: false });
  mocks.events.mockResolvedValue({ events: [], truncated: false });
  mocks.movement.mockResolvedValue({ positions: [], drives: [], truncated: false });
  mocks.evidence.mockResolvedValue([]);
  mocks.setting.mockResolvedValue("[]"); mocks.manuals.mockResolvedValue([]); mocks.allocations.mockResolvedValue([]);
  mocks.liabilities.mockResolvedValue({ sources: [], jobs: [], audits: [] });
  mocks.prepaymentConflicts.mockResolvedValue([]);
});
describe("Scoped full-range driver report", () => {
  it("preserves movement, saved timings, money and alerts without geometry reads for interactive tabs", async () => {
    const tracked = { ...job("ONE"), gpsliveImei: "123", trackerArrivalAt: "2026-10-09T08:58:00Z" };
    mocks.jobs.mockResolvedValue([{ job: tracked, manual: manual("ONE") }]);
    const event = parseGpsEvent({ event_id: "entry", type: "zone_in", event_desc: "Dartford Crossing", dt_tracker: "2026-10-09T10:00:00Z", device: { imei: "123", name: "TEST - AB" } }, "webhook", range.to)!;
    const points = [0, 1].map(i => ({ _id: String(i), imei: "123", occurredAt: `2026-10-09T09:0${i}:00Z`, timeSource: "provider-assumed-utc", lat: 51 + i * .001, lng: 0, speedKph: 15, ignitionOn: true }));
    mocks.events.mockResolvedValue({ events: [event], truncated: false });
    mocks.movement.mockResolvedValue({ positions: points, drives: [], truncated: false });
    mocks.gps.mockResolvedValue({ events: [event], positions: points, drives: [], runs: [], truncated: false });
    const display = await getDriverReport("AB", range, "day", false, { includeLiabilities: false, includeGeometry: false });
    expect(mocks.gps).not.toHaveBeenCalled();
    expect(mocks.movement).toHaveBeenCalledOnce();
    expect(mocks.movement).toHaveBeenCalledWith(["123"], expect.any(String), expect.any(String), [{ from: tracked.actualStart, to: tracked.actualFinish }]);
    expect(mocks.setting.mock.calls.some(([key]) => key === "GPS_TUNNEL_PORTAL_RULES")).toBe(false);
    expect(display.summary.movingKnownSeconds).toBe(60);
    expect(display.gpsSummary.confirmedTunnelCrossings).toBeNull();
    const full = await getDriverReport("AB", range, "day", false, { includeLiabilities: false });
    expect(mocks.gps).toHaveBeenCalledOnce();
    expect(display.jobs[0].movement).toEqual(full.jobs[0].movement);
    expect(display.jobs[0].finance).toEqual(full.jobs[0].finance);
    expect(display.jobs[0].timings).toEqual(full.jobs[0].timings);
    expect(display.roadAlerts).toEqual(full.roadAlerts);
  });
  it("serves road-alert activity without waiting for positions, movement or portal geometry", async () => {
    mocks.jobs.mockResolvedValue([{ job: { ...job("ONE"), gpsliveImei: "123" }, manual: manual("ONE") }]);
    const event = parseGpsEvent({ event_id: "entry", type: "zone_in", event_desc: "Dartford Crossing", dt_tracker: "2026-10-09T10:00:00Z", device: { imei: "123", name: "TEST - AB" } }, "webhook", range.to)!;
    mocks.events.mockResolvedValue({ events: [event], truncated: false });
    mocks.setting.mockImplementation(async key => key === "TUNNEL_CHARGE" ? "13.60" : "[]");
    const report = await buildDriverReport("AB", range, "day", { includeGps: true, includePositions: false, includeLiabilities: false });
    expect(mocks.gps).not.toHaveBeenCalled();
    expect(mocks.events).toHaveBeenCalledOnce();
    expect(report.roadAlerts).toMatchObject([{ jobId: "ONE", estimatedPence: 1360 }]);
    expect(report.meta).toMatchObject({ gpsIncluded: true, movementIncluded: false });
    expect(report.gpsSummary).toMatchObject({ coverage: "events-only", confirmedTunnelCrossings: null });
    expect(report.summary).toMatchObject({ expectedKnownPence: 25000, movingUnknownJobs: 1 });
    expect(report.jobs[0].manualDetails).not.toBeNull();
  });
  it("excludes unfinished jobs and their linked road activity while keeping GPS matching context", async () => {
    const done = { ...job("DONE"), gpsliveImei: "123" };
    const active = { ...job("ACTIVE"), status: "IN_PROGRESS", gpsliveImei: "456", actualFinish: "" } as Job;
    const ready = { ...job("READY"), status: "READY" } as Job;
    mocks.jobs.mockResolvedValue([done, active, ready].map(job => ({ job, manual: manual(job.jobId) })));
    mocks.context.mockResolvedValue([active]);
    const event = parseGpsEvent({ event_id: "active-charge", type: "zone_in", event_desc: "Dartford Crossing", dt_tracker: "2026-10-09T10:00:00Z", device: { imei: "456", name: "TEST - AB" } }, "alerts-history", range.to)!;
    mocks.gps.mockResolvedValue({ events: [event], positions: [], drives: [], runs: [], truncated: false });
    vi.mocked(readReportAlerts).mockResolvedValue({ events: [event], truncated: false });
    const report = await buildDriverReport("AB", range);
    expect(report.jobs.map(row => row.jobId)).toEqual(["DONE"]);
    expect(report.summary).toMatchObject({ assignedJobs: 1, completedJobs: 1, expectedKnownPence: 25000 });
    expect(mocks.evidence).toHaveBeenCalledWith(["DONE"]);
    for (const rows of [report.events, report.visits, report.roadAlerts, report.charges, report.contextJobs]) expect(rows).toEqual([]);
  });
  it("skips GPS reads when the selected range has no finished jobs", async () => {
    mocks.jobs.mockResolvedValue([{ job: { ...job("ACTIVE"), status: "IN_PROGRESS" }, manual: null }]);
    const report = await buildDriverReport("AB", range, "day", { includeLiabilities: false });
    expect(report.jobs).toEqual([]);
    expect(report.summary.completedJobs).toBe(0);
    expect(report.trends).toEqual([]);
    for (const read of [mocks.context, mocks.gps, mocks.setting, mocks.manuals, mocks.allocations, readReportAlerts]) expect(read).not.toHaveBeenCalled();
  });
  it("serves core timings and money without any GPS, road or liability reads", async () => {
    mocks.jobs.mockResolvedValue([{ job: { ...job("ONE"), gpsliveImei: "123" }, manual: manual("ONE") }]);
    const report = await buildDriverReport("AB", range, "day", { includeGps: false, includeLiabilities: false });
    expect(report.summary).toMatchObject({ completedJobs: 1, expectedKnownPence: 25000, outstandingKnownPence: 3000 });
    expect(report.jobs[0].duration.workingMinutes).toBe(120);
    expect(report.jobs[0].manualDetails).not.toBeNull();
    expect(report.jobs[0].duration.manualMinutes).toBe(120);
    expect(report.jobs[0].finance).toMatchObject({ systemCalculatedPence: 25000, acceptedPence: 25000 });
    expect(report.meta).toMatchObject({ gpsIncluded: false, liabilitiesIncluded: false });
    expect(report.gpsSummary.coverage).toBe("not-requested");
    expect(report.liabilitySummary.completeTotalPence).toBeNull();
    for (const read of [mocks.context, mocks.gps, mocks.setting, mocks.manuals, mocks.allocations, mocks.liabilities, readReportAlerts]) expect(read).not.toHaveBeenCalled();
  });
  it("keeps display-only reads and full export reports in separate cache entries", async () => {
    await getDriverReport("AB", range, "day", false, { includeLiabilities: false });
    expect(mocks.liabilities).not.toHaveBeenCalled();
    await getDriverReport("AB", range);
    expect(mocks.liabilities).toHaveBeenCalledOnce();
    expect(mocks.jobs).toHaveBeenCalledTimes(2);
    await getDriverReport("AB", range, "day", false, { includeLiabilities: false });
    expect(mocks.jobs).toHaveBeenCalledTimes(2);
  });
  it("uses historical tracker-scoped alerts and compact GPS reads for pinned jobs", async () => {
    mocks.jobs.mockResolvedValue([{ job: { ...job("ONE"), gpsliveImei: "123" }, manual: manual("ONE") }]);
    await buildDriverReport("AB", range);
    expect(readReportAlerts).toHaveBeenCalledWith(expect.any(String), expect.any(String), ["123"]);
    expect(mocks.gps).toHaveBeenCalledWith(["123"], expect.any(String), expect.any(String), { forReport: true });
  });
  it("retains fleet history fallback for legacy jobs without pinned trackers", async () => {
    await buildDriverReport("AB", range);
    expect(readReportAlerts).toHaveBeenCalledWith(expect.any(String), expect.any(String), undefined);
  });
  it("does not expand tracker-scoped alert reads because an upcoming job has no tracker yet", async () => {
    mocks.jobs.mockResolvedValue([
      { job: { ...job("ONE"), gpsliveImei: "123" }, manual: manual("ONE") },
      { job: { ...job("FUTURE"), status: "READY", actualStart: "", actualFinish: "" }, manual: null }
    ]);
    await buildDriverReport("AB", range);
    expect(readReportAlerts).toHaveBeenCalledWith(expect.any(String), expect.any(String), ["123"]);
  });
  it("loads milestone evidence once for the selected jobs and keeps each job's photos separate", async () => {
    mocks.evidence.mockResolvedValue([{ jobId: "ONE", evidenceId: "proof", evidenceType: "Arrival", status: "COMPLETED", cloudinaryUrl: "synthetic", receivedAt: "2026-10-09T09:04:00Z", capturedAt: "2026-10-09T09:03:00Z" }]);
    const report = await buildDriverReport("AB", range);
    expect(mocks.evidence).toHaveBeenCalledOnce(); expect(mocks.evidence).toHaveBeenCalledWith(["ONE", "TWO"]);
    expect(report.jobs[0].timings).toMatchObject({ proofPhotoAt: "2026-10-09T09:03:00.000Z", proofPhotoSource: "captured" });
    expect(report.jobs[1].timings.proofPhotoAt).toBeNull();
  });
  it("includes provider alert history when the persisted GPS ledger is empty without changing financial totals", async () => {
    const tracked = { ...job("ONE"), gpsliveImei: "123" };
    mocks.jobs.mockResolvedValue([{ job: tracked, manual: manual("ONE") }]);
    mocks.setting.mockImplementation(async key => key === "TUNNEL_CHARGE" ? "13.60" : key === "CONGESTION_CHARGE" ? "18" : "[]");
    const alert = parseGpsEvent({ event_id: "history", type: "zone_in", event_desc: "Dartford Crossing", dt_tracker: "2026-10-09T10:00:00Z", device: { imei: "123", name: "TEST - AB" } }, "alerts-history", "2026-10-10T00:00:00Z")!;
    const unlinked = parseGpsEvent({ event_id: "unlinked", type: "zone_in", event_desc: "Dartford Crossing", dt_tracker: "2026-10-09T15:00:00Z", device: { imei: "123", name: "TEST - AB" } }, "alerts-history", "2026-10-10T00:00:00Z")!;
    vi.mocked(readReportAlerts).mockResolvedValue({ events: [alert, unlinked], truncated: false });
    const report = await buildDriverReport("AB", range);
    expect(report.roadAlerts).toMatchObject([{ jobId: "ONE", estimatedPence: 1360 }]);
    expect(report.roadAlerts).toHaveLength(1);
    expect(report.roadAlerts.every(row => !!row.jobId)).toBe(true);
    expect(report.jobs[0].roadAlerts).toEqual(report.roadAlerts);
    expect(report.charges).toEqual([]); expect(report.summary.expectedKnownPence).toBe(25000);
  });
  it("aggregates every matching job and reconciles summary with job/trend sums", async () => {
    const report = await buildDriverReport("AB", range);
    expect(report.summary).toMatchObject({ completedJobs: 2, expectedKnownPence: 50000, outstandingKnownPence: 6000 });
    expect(report.trends.reduce((sum, row) => sum + row.expectedKnownPence, 0)).toBe(report.summary.expectedKnownPence);
    expect(report.jobs.reduce((sum, row) => sum + (row.finance.outstandingPence ?? 0), 0)).toBe(report.summary.outstandingKnownPence);
    expect(report.gpsSummary.coverage).toBe("unavailable"); expect(report.summary.movingUnknownJobs).toBe(2);
  });
  it("excludes off-job tunnel and congestion evidence from all report records and totals", async () => {
    const tracked = { ...job("ONE"), gpsliveImei: "123" };
    mocks.jobs.mockResolvedValue([{ job: tracked, manual: manual("ONE") }]);
    mocks.setting.mockImplementation(async key => key === "TUNNEL_CHARGE" ? "13.60" : key === "CONGESTION_CHARGE" ? "18" : "[]");
    const event = (id: string, type: string, zone: string, time: string) => parseGpsEvent({
      event_id: id, type, event_desc: zone, dt_tracker: `2026-10-09T${time}:00Z`,
      device: { imei: "123", name: "TEST - AB" }
    }, "alerts-history", "2026-10-10T00:00:00Z")!;
    const linked = [
      event("linked-c-in", "zone_in", "Congestion", "09:15"), event("linked-c-out", "zone_out", "Congestion", "09:16"),
      event("linked-t-in", "zone_in", "Dartford Crossing", "10:05"), event("linked-t-out", "zone_out", "Dartford Crossing", "10:06")
    ];
    const unlinked = [
      event("unlinked-c-in", "zone_in", "Congestion", "12:15"), event("unlinked-c-out", "zone_out", "Congestion", "12:16"),
      event("unlinked-t-in", "zone_in", "Dartford Crossing", "13:05"), event("unlinked-t-out", "zone_out", "Dartford Crossing", "13:06")
    ];
    mocks.gps.mockResolvedValue({ events: linked, positions: [], drives: [], runs: [], truncated: false });
    const baseline = await buildDriverReport("AB", range);
    expect(baseline.events).toHaveLength(4);
    expect(baseline.visits).toHaveLength(2);
    expect(baseline.roadAlerts).toHaveLength(2);

    mocks.gps.mockResolvedValue({ events: [...linked, ...unlinked], positions: [], drives: [], runs: [], truncated: false });
    vi.mocked(readReportAlerts).mockResolvedValue({ events: unlinked, truncated: false });
    const report = await buildDriverReport("AB", range);
    expect(report.events).toEqual(baseline.events);
    expect(report.visits).toEqual(baseline.visits);
    expect(report.charges).toEqual(baseline.charges);
    expect(report.roadAlerts).toEqual(baseline.roadAlerts);
    expect(report.gpsSummary).toEqual(baseline.gpsSummary);
    expect(report.summary).toEqual(baseline.summary);
    expect(report.trends).toEqual(baseline.trends);
    expect(report.jobs[0].roadAlerts).toEqual(baseline.jobs[0].roadAlerts);
    expect(report.jobs[0].roadCharges).toEqual(baseline.jobs[0].roadCharges);
    expect(report.contextJobs).toEqual([]);
    expect(report.meta.roadActivityScope).toBe("job-linked-only");
    const roadSections = (value: typeof report) => exportSections(value).filter(section => ["Tunnels", "Congestion"].includes(section.name));
    expect(roadSections(report)).toEqual(roadSections(baseline));
  });
  it("marks absent data as empty, not an error or fictional GPS zero", async () => {
    mocks.jobs.mockResolvedValue([]); mocks.profile.mockResolvedValue(null);
    const report = await buildDriverReport("OLD", range);
    expect(report.jobs).toEqual([]); expect(report.summary.completedJobs).toBe(0); expect(report.gpsSummary.confirmedTunnelCrossings).toBeNull();
  });
  it("returns partial GPS coverage independently from complete financial range totals", async () => {
    const tracked = job("TRACKED"); tracked.gpsliveImei = "123";
    mocks.jobs.mockResolvedValue([{ job: tracked, manual: manual("TRACKED") }]);
    mocks.gps.mockResolvedValue({ events: [], positions: [], drives: [], runs: [], truncated: true });
    const report = await buildDriverReport("AB", range);
    expect(report.gpsSummary.coverage).toBe("partial"); expect(report.meta.financialTotalsCoverAllMatchingJobs).toBe(true);
  });
  it("keeps incident-date scoped out-of-financial-range jobs as context only", async () => {
    const old = job("OLD"); old.actualStart = "2026-10-08T09:00:00Z";
    mocks.context.mockResolvedValue([old]);
    mocks.liabilities.mockResolvedValue({ sources: [{ _id: "incident", jobId: "OLD", scenario: "parking", driver: "ab@example.com", fields: {}, photoUrls: [], signatureUrl: "", submittedAt: "2026-10-09T10:00:00Z" }], jobs: [old], audits: [] });
    const report = await buildDriverReport("AB", range);
    expect(report.liabilities).toHaveLength(1); expect(report.summary.expectedKnownPence).toBe(50000);
    expect(report.contextJobs).toMatchObject([{ jobId: "OLD", includedInFinancialTotals: false }]);
    expect(report.liabilitySummary.completeTotalPence).toBeNull();
  });
  it("shares full reports across requests, invalidates after writes and bypasses cached data for exports", async () => {
    await Promise.all([getDriverReport("AB", range), getDriverReport("AB", range)]);
    expect(mocks.jobs).toHaveBeenCalledTimes(1);
    await getDriverReport("AB", range); expect(mocks.jobs).toHaveBeenCalledTimes(1);
    invalidateReportReads();
    await getDriverReport("AB", range); expect(mocks.jobs).toHaveBeenCalledTimes(2);
    await getDriverReport("AB", range, "day", true); expect(mocks.jobs).toHaveBeenCalledTimes(3);
  });
  it("retains date-scoped audit evidence if an original incident source is missing", async () => {
    const old = job("OLD"); old.actualStart = "2026-10-08T09:00:00Z";
    const audit = buildLiabilityRecord({ _id: "missing", jobId: "OLD", scenario: "parking", driver: "ab@example.com", submittedAt: "2026-10-09T10:00:00Z", fields: {}, photoUrls: [], signatureUrl: "" } as ScenarioSubmissionDoc, old)!;
    mocks.liabilities.mockResolvedValue({ sources: [], jobs: [old], audits: [audit] });
    const report = await buildDriverReport("AB", range);
    expect(report.liabilities).toHaveLength(1); expect(report.summary.expectedKnownPence).toBe(50000);
    expect(report.contextJobs).toMatchObject([{ jobId: "OLD", includedInFinancialTotals: false }]);
  });
  it("propagates data-read failures without silently producing complete zero totals", async () => {
    mocks.jobs.mockRejectedValue(new Error("Database unavailable"));
    await expect(buildDriverReport("AB", range)).rejects.toThrow("Database unavailable");
  });
  it("does not recognize prepayments allocated to another job outside this report", async () => {
    mocks.prepaymentConflicts.mockResolvedValue(["ONE"]);
    const report = await buildDriverReport("AB", range);
    expect(report.jobs[0].finance.recognizedCollectionPence).toBeNull();
    expect(report.jobs[0].issues.some(issue => issue.includes("multiple jobs"))).toBe(true);
    expect(report.summary.outstandingUnknownJobs).toBe(1);
  });
});
