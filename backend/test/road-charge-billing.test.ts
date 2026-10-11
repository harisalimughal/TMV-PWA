import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExtraChargeType, JobStatus, type Job } from "../src/jobs/job.types";
import type { GpsVisit } from "../src/gps/gps.types";
import { ROAD_RULE_VERSION } from "../src/gps/road-charge.rules";
const mocks = vi.hoisted(() => ({ getSetting: vi.fn(), gpsJobMonitoring: vi.fn(), reserve: vi.fn(), conflict: vi.fn(), authority: vi.fn() }));
vi.mock("../src/db/settings.repo", () => ({ getSetting: mocks.getSetting }));
vi.mock("../src/gps/gps.monitoring", () => ({ gpsJobMonitoring: mocks.gpsJobMonitoring }));
vi.mock("../src/gps/road-charge.repo", () => ({ reserveRoadObligation: mocks.reserve, roadAllocationConflict: mocks.conflict, saveAuthorityReferences: mocks.authority }));
import { captureRoadTariff } from "../src/gps/road-charge.tariff";
import { calculateJobTotal, freezeJobCharges } from "../src/jobs/job-billing.service";

const job = (changes: Partial<Job> = {}) => ({ jobId: "JOB", driverInitials: "AB", status: JobStatus.IN_PROGRESS, currentState: "WAITING_TOTAL_CHARGES", basePrice: 200, overtimeCharge: 0, extraCharges: [], gpsliveImei: "123", actualStart: "2026-10-09T09:00:00Z", actualFinish: "2026-10-09T12:00:00Z",
  roadTariffSnapshot: { version: ROAD_RULE_VERSION, effectiveFrom: "2026-10-09T08:00:00Z", capturedAt: "2026-10-09T08:00:00Z", congestionPence: 1800, tunnelPence: 1360, source: "pricing-settings" }, ...changes } as Job);
const visit = (id: string, at: string, tunnel = false): GpsVisit => ({ id, imei: "123", scheme: tunnel ? "dartford" : "congestion", entryAt: at, firstInsideAt: at, exitAt: at, durationSeconds: 0, entryObserved: true, origin: "alerts", status: "observed-pair", physicalCrossingConfirmed: tunnel, eventIds: [id], zoneNames: [], issues: [],
  ...(tunnel ? { proofFrom: new Date(Date.parse(at) - 60000).toISOString(), proofTo: at } : {}), association: { jobId: "JOB", driverInitials: "AB", phase: "on-job", confidence: "recorded-assignment", candidateJobIds: ["JOB"], reason: null } });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSetting.mockImplementation(async (key) => key === "CONGESTION_CHARGE" ? "18" : "13.60");
  mocks.gpsJobMonitoring.mockResolvedValue({ visits: [], coverage: "unavailable" });
  mocks.reserve.mockResolvedValue(null); mocks.conflict.mockResolvedValue(null); mocks.authority.mockResolvedValue(undefined);
});
describe("Prospective road billing snapshots", () => {
  it("captures settings once and does not reprice on subsequent settings changes", async () => {
    const fresh = job({ actualStart: "", actualFinish: "", roadTariffSnapshot: undefined });
    await captureRoadTariff(fresh, "2026-10-09T08:00:00Z");
    mocks.getSetting.mockResolvedValue("999");
    await captureRoadTariff(fresh, "2026-10-09T09:00:00Z");
    expect(fresh.roadTariffSnapshot).toMatchObject({ congestionPence: 1800, tunnelPence: 1360, effectiveFrom: "2026-10-09T08:00:00Z" });
    expect(mocks.getSetting).toHaveBeenCalledTimes(2);
  });
  it("does not backfill today's tariff onto a historic/active job", async () => {
    const old = job({ roadTariffSnapshot: undefined });
    await captureRoadTariff(old, "2026-10-10T08:00:00Z");
    expect(old.roadTariffSnapshot).toBeUndefined();
  });
  it("adds one congestion fee and two confirmed tunnel fees even if the driver missed a selection", async () => {
    mocks.gpsJobMonitoring.mockResolvedValue({ coverage: "sampled", visits: [visit("cong", "2026-10-09T10:00:00Z"), visit("cong2", "2026-10-09T11:00:00Z"), visit("tun1", "2026-10-09T10:00:00Z", true), visit("tun2", "2026-10-09T11:00:00Z", true)] });
    const current = job();
    expect(await calculateJobTotal(current)).toBe(245.2);
    expect(mocks.reserve).not.toHaveBeenCalled();
    await freezeJobCharges(current);
    expect(current.chargeSnapshot).toMatchObject({ congestionPence: 1800, tunnelPence: 2720, confirmedTunnelCrossings: 2 });
    expect(mocks.reserve).toHaveBeenCalledTimes(3);
    mocks.gpsJobMonitoring.mockResolvedValue({ visits: [], coverage: "unavailable" });
    expect(await calculateJobTotal(current)).toBe(245.2);
    await freezeJobCharges(current);
    expect(mocks.reserve).toHaveBeenCalledTimes(3);
  });
  it("does not automatically charge inferred tunnel activity", async () => {
    const unconfirmed = visit("zone", "2026-10-09T10:00:00Z", true); unconfirmed.physicalCrossingConfirmed = false;
    mocks.gpsJobMonitoring.mockResolvedValue({ coverage: "sampled", visits: [unconfirmed] });
    expect(await calculateJobTotal(job())).toBe(200);
  });
  it("removes a selected system fee when all trustworthy observed activity is outside hours", async () => {
    mocks.gpsJobMonitoring.mockResolvedValue({ coverage: "sampled", visits: [visit("outside", "2026-10-09T22:00:00Z", true)] });
    expect(await calculateJobTotal(job({ actualFinish: "2026-10-10T00:00:00Z", extraCharges: [ExtraChargeType.TUNNEL] }))).toBe(200);
  });
  it("keeps accepted historical totals unchanged", async () => {
    expect(await calculateJobTotal(job({ status: JobStatus.COMPLETED, totalCharges: 250, calculatedTotalCharges: 240 }))).toBe(240);
    expect(mocks.gpsJobMonitoring).not.toHaveBeenCalled();
  });
  it("blocks payment confirmation for unknown selected rates or duplicate allocations", async () => {
    const unknown = job({ extraCharges: [ExtraChargeType.CONGESTION] }); unknown.roadTariffSnapshot!.congestionPence = null;
    await expect(freezeJobCharges(unknown)).rejects.toThrow("verification");
    mocks.gpsJobMonitoring.mockResolvedValue({ coverage: "sampled", visits: [visit("duplicate", "2026-10-09T10:00:00Z", true)] });
    mocks.reserve.mockResolvedValue({ code: "Duplicate allocation", reason: "Already allocated" });
    await expect(freezeJobCharges(job())).rejects.toThrow("Already allocated");
  });
});
