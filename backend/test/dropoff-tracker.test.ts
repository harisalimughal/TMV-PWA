import { beforeEach, describe, expect, it, vi } from "vitest";
import { JobStatus, type Job } from "../src/jobs/job.types";
import type { GpsLiveDevice } from "../src/integrations/gpslive";
const mocks = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn(), save: vi.fn(), devices: vi.fn(), geocode: vi.fn(), profile: vi.fn() }));
vi.mock("../src/db/jobs.repo", () => ({ listJobs: mocks.list, getJob: mocks.get, upsertJob: mocks.save }));
vi.mock("../src/auth/driver-account.service", () => ({ getDriverProfileByInitials: mocks.profile }));
vi.mock("../src/integrations/geocode", () => ({ geocodeAddress: mocks.geocode }));
vi.mock("../src/integrations/gpslive", async original => ({ ...await original<typeof import("../src/integrations/gpslive")>(), fetchGpsLiveDevices: mocks.devices }));
import { assessDropoffTracking, sweepDropoffArrivals } from "../src/jobs/dropoff-tracker.service";
const destination = { lat: 51.5, lng: -0.1 };
const makeJob = (changes: Partial<Job> = {}): Job => ({ jobId: "DROP", driverInitials: "AB", status: JobStatus.IN_PROGRESS,
  vanLoadedAt: "2026-10-14T09:30:00Z", actualStart: "2026-10-14T09:00:00Z", actualFinish: "", gpsliveImei: "123", dropoff: "London", dropoffLocation: destination, ...changes } as Job);
const device = (at: string, meters: number, speed = 0): GpsLiveDevice => ({ imei: "123", lat: destination.lat + meters / 6371000 * 180 / Math.PI,
  lng: destination.lng, dtTracker: at, speed, active: true, name: "AB", plateNumber: "TEST" });
const step = (job: Job, at: string, meters: number, speed = 0) => job.dropoffTracking = assessDropoffTracking(job, device(at, meters, speed), new Date(Date.parse(at) + 30000));
describe("Drop-off radius observations", () => {
  it("records first qualifying reports after two fresh confirmations and keeps billing boundaries untouched", () => {
    const job = makeJob();
    step(job, "2026-10-14T10:00:00Z", 600);
    step(job, "2026-10-14T10:01:00Z", 500);
    expect(job.dropoffTracking?.arrivalAt).toBeUndefined();
    step(job, "2026-10-14T10:02:00Z", 405);
    expect(job.dropoffTracking?.arrivalAt).toBe("2026-10-14T10:01:00.000Z");
    step(job, "2026-10-14T10:03:00Z", 501);
    step(job, "2026-10-14T10:04:00Z", 600);
    expect(job.dropoffTracking?.departureAt).toBe("2026-10-14T10:03:00.000Z");
    expect(job.actualFinish).toBe("");
    expect(job.status).toBe(JobStatus.IN_PROGRESS);
    const locked = job.dropoffTracking;
    step(job, "2026-10-14T10:05:00Z", 100);
    expect(job.dropoffTracking).toBe(locked);
  });
  it("does not confuse pickup, a drive-by, duplicate reports or long gaps with drop-off arrival", () => {
    const job = makeJob();
    step(job, "2026-10-14T09:29:00Z", 600);
    step(job, "2026-10-14T10:00:00Z", 100);
    expect(job.dropoffTracking?.arrivalCandidateAt).toBeUndefined();
    step(job, "2026-10-14T10:01:00Z", 600);
    step(job, "2026-10-14T10:02:00Z", 100, 30);
    expect(job.dropoffTracking?.arrivalCandidateAt).toBeUndefined();
    step(job, "2026-10-14T10:03:00Z", 100);
    step(job, "2026-10-14T10:03:00Z", 100);
    expect(job.dropoffTracking?.arrivalAt).toBeUndefined();
    step(job, "2026-10-14T10:10:00Z", 100);
    expect(job.dropoffTracking?.arrivalAt).toBeUndefined();
    step(job, "2026-10-14T10:11:00Z", 100);
    expect(job.dropoffTracking?.arrivalAt).toBe("2026-10-14T10:10:00.000Z");
  });
  it("requires consecutive outside reports and rejects stale signal and tracker changes", () => {
    const job = makeJob({ dropoffTracking: { imei: "123", arrivalAt: "2026-10-14T10:00:00Z" } });
    step(job, "2026-10-14T10:01:00Z", 600);
    step(job, "2026-10-14T10:02:00Z", 500);
    step(job, "2026-10-14T10:03:00Z", 600);
    expect(job.dropoffTracking?.departureAt).toBeUndefined();
    job.dropoffTracking = assessDropoffTracking(job, device("2026-10-14T10:03:00Z", 600), new Date("2026-10-14T10:06:00Z"));
    expect(job.dropoffTracking.departureCandidateAt).toBeUndefined();
    const changed = { ...device("2026-10-14T10:07:00Z", 600), imei: "456" };
    job.dropoffTracking = assessDropoffTracking(job, changed, new Date("2026-10-14T10:07:30Z"));
    expect(job.dropoffTracking.departureAt).toBeUndefined();
    expect(job.dropoffTracking.unverifiedReason).toContain("Tracker changed");
  });
});
describe("Drop-off tracking sweep", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.save.mockResolvedValue(undefined); mocks.profile.mockResolvedValue({ initials: "AB", imei: "123" }); });
  it("geocodes an existing job using the shared geocoder and persists observations", async () => {
    const job = makeJob({ dropoffLocation: undefined });
    mocks.list.mockResolvedValue([job]); mocks.get.mockResolvedValue(job); mocks.geocode.mockResolvedValue(destination);
    mocks.devices.mockResolvedValue([device("2026-10-14T10:00:00Z", 600)]);
    await sweepDropoffArrivals(new Date("2026-10-14T10:00:30Z"));
    expect(mocks.geocode).toHaveBeenCalledWith("London");
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ dropoffLocation: destination, dropoffTracking: expect.objectContaining({ outsideObservedAt: "2026-10-14T10:00:00.000Z" }) }));
  });
  it("continues after completion to record departure, stopping when the next job is loaded", async () => {
    const prior = makeJob({ status: JobStatus.COMPLETED, actualFinish: "2026-10-14T09:55:00Z", dropoffTracking: { imei: "123", arrivalAt: "2026-10-14T09:50:00Z" } });
    mocks.list.mockResolvedValue([prior]); mocks.get.mockResolvedValue(prior); mocks.devices.mockResolvedValue([device("2026-10-14T10:00:00Z", 600)]);
    await sweepDropoffArrivals(new Date("2026-10-14T10:00:30Z"));
    expect(prior.dropoffTracking?.departureCandidateAt).toBeDefined();
    mocks.save.mockClear();
    const next = makeJob({ jobId: "NEXT", vanLoadedAt: "2026-10-14T10:01:00Z" });
    mocks.list.mockResolvedValue([prior, next]); mocks.get.mockResolvedValue(next);
    await sweepDropoffArrivals(new Date("2026-10-14T10:02:00Z"));
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(mocks.save.mock.calls[0][0].jobId).toBe("NEXT");
  });
});
