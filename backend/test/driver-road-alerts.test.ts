import { describe, expect, it } from "vitest";
import { projectRoadAlerts, summarizeExpectedRoadCharges } from "../src/reports/driver-road-alerts";
import { parseGpsEvent } from "../src/gps/gps.parse";
import type { DriverProfile, Job } from "../src/jobs/job.types";
const now = "2026-10-11T23:00:00Z", range = { from: "2026-10-10T00:00:00Z", to: "2026-10-11T00:00:00Z" };
const driver = { initials: "MA", fullName: "Man Van", imei: "123", vanRegistration: "TEST" } as DriverProfile;
const job = { jobId: "ONE", status: "COMPLETED", driverInitials: "MA", actualStart: "2026-10-10T09:00:00Z", actualFinish: "2026-10-10T18:00:00Z", gpsliveImei: "123" } as Job;
const event = (id: string, at: string, zone: string, type = "zone_in", imei = "123") => parseGpsEvent({ event_id: id, dt_tracker: at, type, event_desc: zone, device: { imei, name: "TEST - MA" } }, "alerts-history", now)!;
const project = (events: ReturnType<typeof event>[], jobs = [job]) => projectRoadAlerts(events, jobs, driver, "MA", range, { congestion: 1800, tunnel: 1360 }, now);
describe("Read-only road alert projections", () => {
  it("totals expected charges across the full selected job cohort, excluding context and unlinked jobs", () => {
    const alerts = [{ jobId: "ONE", type: "tunnel", estimatedPence: 1360 }, { jobId: "TWO", type: "tunnel", estimatedPence: 2720 },
      { jobId: "TWO", type: "tunnel", estimatedPence: null }, { jobId: "ONE", type: "congestion", estimatedPence: 1800 },
      { jobId: "ONE", type: "congestion", estimatedPence: 0 }, { jobId: "CONTEXT", type: "tunnel", estimatedPence: 9999 },
      { jobId: null, type: "congestion", estimatedPence: 9999 }];
    expect(summarizeExpectedRoadCharges(alerts, new Set(["ONE", "TWO"]), true)).toEqual({
      tunnel: { pence: 4080, knownPence: 4080, unpricedEntries: 1 }, congestion: { pence: 1800, knownPence: 1800, unpricedEntries: 0 } });
    expect(summarizeExpectedRoadCharges([], new Set(["ONE"]), false).tunnel.pence).toBeNull();
    expect(summarizeExpectedRoadCharges([], new Set(["ONE"]), true).tunnel.pence).toBe(0);
    expect(summarizeExpectedRoadCharges([{ jobId: "ONE", type: "tunnel", estimatedPence: null }], new Set(["ONE"]), true).tunnel.pence).toBeNull();
  });
  it("keeps today's linked entries when a seven-day query contains older unclosed sectors", () => {
    const firstJob = { ...job, jobId: "FRIDAY", actualStart: "2026-10-09T09:00:00Z", actualFinish: "2026-10-09T11:00:00Z" } as Job;
    const todayJob = { ...job, jobId: "TODAY", actualStart: "2026-10-11T06:00:00Z", actualFinish: "2026-10-11T08:00:00Z" } as Job;
    const history = [
      event("old-unlinked", "2026-10-06T07:08:40Z", "CHARGES - ALERTS (Congestion Zone NE)"),
      event("friday-sw", "2026-10-09T09:20:13Z", "CHARGES - ALERTS (Congestion Zone SW)"),
      event("friday-e", "2026-10-09T09:42:13Z", "CHARGES - ALERTS (Congestion Zone E)"),
      event("today-one", "2026-10-11T06:31:39Z", "CHARGES - ALERTS (Congestion)"),
      event("today-duplicate", "2026-10-11T06:31:39Z", "CHARGES - ALERTS (Congestion)")
    ];
    const projectRange = (selected: { from: string; to: string }) => {
      const windowEvents = history.filter(row => Date.parse(row.occurredAt!) >= Date.parse(selected.from) - 6 * 3600000 && Date.parse(row.occurredAt!) < Date.parse(selected.to) + 6 * 3600000);
      return projectRoadAlerts(windowEvents, [firstJob, todayJob], driver, "MA", selected, { congestion: 1800, tunnel: 1360 }, now).filter(row => row.jobId);
    };
    const todayRows = projectRange({ from: "2026-10-10T23:00:00Z", to: "2026-10-11T23:00:00Z" });
    const weekRows = projectRange({ from: "2026-10-04T23:00:00Z", to: "2026-10-11T23:00:00Z" });
    expect(todayRows).toHaveLength(1);
    expect(weekRows.map(row => row.jobId)).toEqual(["FRIDAY", "TODAY"]);
    expect(weekRows.find(row => row.jobId === "TODAY")).toEqual(todayRows[0]);
    expect(todayRows[0].alerts).toHaveLength(2);
    expect(todayRows[0].zone).toBe("CHARGES - ALERTS (Congestion)");
    expect(todayRows[0].estimatedPence).toBe(0);
    expect(weekRows[0].estimatedPence).toBe(1800);
  });
  it("starts a new display entry for another job on the same day without splitting overlapping sectors of one job", () => {
    const morning = { ...job, jobId: "MORNING", actualFinish: "2026-10-10T11:00:00Z" } as Job;
    const afternoon = { ...job, jobId: "AFTERNOON", actualStart: "2026-10-10T12:00:00Z" } as Job;
    const rows = project([
      event("morning-main", "2026-10-10T10:00:00Z", "Congestion"),
      event("afternoon-sector", "2026-10-10T12:30:00Z", "Congestion Zone NE"),
      event("afternoon-main", "2026-10-10T12:32:00Z", "Congestion")
    ], [morning, afternoon]);
    expect(rows.map(row => row.jobId)).toEqual(["MORNING", "AFTERNOON"]);
    expect(rows[1].alerts).toHaveLength(2);
  });
  it("preserves separate entry alerts when exits are missing without counting short boundary jitter twice", () => {
    const rows = project([event("1", "2026-10-10T10:00:00Z", "Dartford"), event("2", "2026-10-10T10:00:10Z", "Dartford"), event("3", "2026-10-10T12:00:00Z", "Dartford")]);
    expect(rows).toHaveLength(2); expect(rows[0].exitedAt).toBeNull(); expect(rows.map(row => row.estimatedPence)).toEqual([1360, 1360]);
  });
  it("counts alert passages without requiring physical portal proof and deduplicates ledger/history", () => {
    const first = event("1", "2026-10-10T10:00:00Z", "Tunnels-Black-Silver");
    const rows = project([first, first, event("2", "2026-10-10T10:02:00Z", "Tunnels-Black-Silver", "zone_out"), event("3", "2026-10-10T12:00:00Z", "Tunnels-Black-Silver")]);
    expect(rows).toHaveLength(2); expect(rows.reduce((sum, row) => sum + row.estimatedPence!, 0)).toBe(2720);
    expect(rows[0]).toMatchObject({ jobId: "ONE", durationSeconds: 120, linkBasis: "recorded-device", rateBasis: "Current Pricing Settings estimate" });
    expect(rows[0].alerts).toHaveLength(2); expect(job).not.toHaveProperty("roadTariffSnapshot");
  });
  it("uses weekend London windows and charges congestion once per job, not per entry", () => {
    const rows = project([event("1", "2026-10-10T10:00:00Z", "Congestion"), event("2", "2026-10-10T10:02:00Z", "Congestion", "zone_out"), event("3", "2026-10-10T11:00:00Z", "Congestion"), event("4", "2026-10-10T11:02:00Z", "Congestion", "zone_out"), event("5", "2026-10-10T12:00:00Z", "Congestion")]);
    expect(rows.map(row => row.estimatedPence)).toEqual([0, 1800, 0]);
    expect(rows.filter(row => row.chargeable)).toHaveLength(1);
  });
  it("merges overlapping congestion sectors and ignores exit-only alerts", () => {
    expect(project([event("1", "2026-10-10T12:00:00Z", "Congestion"), event("2", "2026-10-10T12:01:00Z", "Congestion Zone NE"), event("3", "2026-10-10T12:00:00Z", "Dartford", "zone_out")])).toHaveLength(1);
  });
  it("keeps unmatched alerts visible without inventing a customer charge or job", () => {
    expect(project([event("1", "2026-10-10T20:00:00Z", "Dartford")])[0]).toMatchObject({ jobId: null, estimatedPence: null, feeReason: "No matching job" });
    expect(project([event("1", "2026-10-10T12:00:00Z", "Dartford")], [{ ...job, jobId: "OTHER", driverInitials: "AB" }])).toEqual([]);
  });
  it("uses job snapshots and does not count approach activity as an in-job fee", () => {
    const snapshot = { ...job, onMyWayAt: "2026-10-10T08:00:00Z", roadTariffSnapshot: { effectiveFrom: "2026-10-10T08:00:00Z", congestionPence: 2000, tunnelPence: 1500 } } as Job;
    const rows = project([event("1", "2026-10-10T08:30:00Z", "Dartford"), event("2", "2026-10-10T08:35:00Z", "Dartford", "zone_out"), event("3", "2026-10-10T12:00:00Z", "Dartford")], [snapshot]);
    expect(rows.map(row => row.estimatedPence)).toEqual([null, 1500]);
    expect(rows[0].feeReason).toBe("Outside job working time");
  });
  it("links unique legacy work intervals to their frozen driver identity rather than the current assignee", () => {
    const historical = { ...job, gpsliveImei: undefined, driverInitials: "OTHER", reportIdentity: { initials: "MA" } } as Job;
    expect(project([event("legacy", "2026-10-10T12:00:00Z", "Dartford")], [historical])[0]).toMatchObject({ jobId: "ONE", linkBasis: "driver-time-match", estimatedPence: 1360, feeReason: null });
  });
  it("explains missing pricing without inventing a zero fee", () => {
    const rows = projectRoadAlerts([event("missing-rate", "2026-10-10T12:00:00Z", "Dartford")], [job], driver, "MA", range, { congestion: 1800, tunnel: null }, now);
    expect(rows[0]).toMatchObject({ jobId: "ONE", estimatedPence: null, feeReason: "Pricing rate unavailable" });
  });
  it("leaves overlapping job identities unlinked instead of assigning the charge twice", () => {
    expect(project([event("1", "2026-10-10T12:00:00Z", "Dartford")], [job, { ...job, jobId: "TWO" }])).toEqual([]);
  });
});
