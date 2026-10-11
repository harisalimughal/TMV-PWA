import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "../src/jobs/job.types";
import type { GpsVisit } from "../src/gps/gps.types";
import { ROAD_RULE_VERSION } from "../src/gps/road-charge.rules";
const mocks = vi.hoisted(() => ({ job: vi.fn(), manual: vi.fn(), monitoring: vi.fn(), read: vi.fn(), reserve: vi.fn(), conflict: vi.fn(), authority: vi.fn() }));
vi.mock("../src/db/jobs.repo", () => ({ getJob: mocks.job }));
vi.mock("../src/db/driver-job-summary.repo", () => ({ getDriverJobSummary: mocks.manual }));
vi.mock("../src/gps/gps.monitoring", () => ({ gpsJobMonitoring: mocks.monitoring }));
vi.mock("../src/gps/road-charge.repo", () => ({ readRoadAllocations: mocks.read, reserveRoadObligation: mocks.reserve, roadAllocationConflict: mocks.conflict, saveAuthorityReferences: mocks.authority }));
import { jobRoadChargeReport } from "../src/gps/road-charge.service";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.job.mockResolvedValue({ jobId: "JOB", status: "COMPLETED", driverInitials: "AB", actualStart: "2026-10-09T09:00:00Z", actualFinish: "2026-10-09T12:00:00Z", extraCharges: [],
    chargeSnapshot: { basePence: 0, congestionPence: 1800, tunnelPence: 1360 }, roadTariffSnapshot: { version: ROAD_RULE_VERSION, effectiveFrom: "2026-10-09T08:00:00Z", capturedAt: "2026-10-09T08:00:00Z", source: "pricing-settings", congestionPence: 1800, tunnelPence: 1360 } } as Job);
  const visit = { id: "passage", imei: "123", scheme: "dartford", firstInsideAt: "2026-10-09T10:00:00Z", proofFrom: "2026-10-09T10:00:00Z", proofTo: "2026-10-09T10:01:00Z", physicalCrossingConfirmed: true,
    association: { jobId: "JOB", driverInitials: "AB", confidence: "recorded-assignment" } } as GpsVisit;
  mocks.monitoring.mockResolvedValue({ visits: [visit], coverage: "sampled" });
  mocks.manual.mockResolvedValue({ chargeItems: [{ type: "tunnel", amountPence: 1360 }] });
  mocks.read.mockResolvedValue([]); mocks.reserve.mockResolvedValue(null); mocks.conflict.mockResolvedValue(null); mocks.authority.mockResolvedValue(undefined);
});
describe("Admin charge reports", () => {
  it("keeps GET-style reports strictly read-only", async () => {
    const result = await jobRoadChargeReport("JOB");
    expect(result?.comparisons[1].observedExpectedPence).toBe(1360);
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.authority).not.toHaveBeenCalled();
  });
  it("persists allocations only on an explicit reconcile", async () => {
    const result = await jobRoadChargeReport("JOB", true);
    expect(result?.persisted).toBe(true);
    expect(mocks.reserve).toHaveBeenCalledTimes(1);
    expect(mocks.authority).toHaveBeenCalledTimes(1);
  });
  it("excludes duplicate allocations from current expected totals and authority persistence", async () => {
    mocks.reserve.mockResolvedValue({ code: "Duplicate allocation", type: "tunnel", source: "allocation", reason: "Another job owns it", evidenceIds: ["passage"] });
    const result = await jobRoadChargeReport("JOB", true);
    expect(result?.comparisons[1].observedExpectedPence).toBeNull();
    expect(result?.obligations).toHaveLength(0);
    expect(mocks.authority).toHaveBeenCalledWith([]);
    expect(result?.flags.some(flag => flag.code === "Duplicate allocation")).toBe(true);
  });
  it("retains stale saved allocations as audit evidence without adding them to current totals", async () => {
    mocks.read.mockResolvedValue([{ id: "old", type: "tunnel", visitIds: ["old-evidence"] }]);
    const result = await jobRoadChargeReport("JOB");
    expect(result?.comparisons[1].observedExpectedPence).toBe(1360);
    expect(result?.flags.some(flag => flag.source === "allocation" && flag.code === "Needs verification")).toBe(true);
  });
  it("returns not found without doing reconciliation writes", async () => {
    mocks.job.mockResolvedValue(null);
    expect(await jobRoadChargeReport("MISSING", true)).toBeNull();
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
});
