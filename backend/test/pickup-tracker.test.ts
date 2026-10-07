import { beforeEach, describe, expect, it, vi } from "vitest";
import { JobStatus, type Job } from "../src/jobs/job.types";

const listJobs = vi.fn();
const jobsCollection = vi.fn();
const getDriverProfileByInitials = vi.fn();
const fetchGpsLiveDevices = vi.fn();
const sendPushToDriver = vi.fn();

vi.mock("../src/db/jobs.repo", () => ({ listJobs: (...args: any[]) => listJobs(...args) }));
vi.mock("../src/db/mongo", () => ({ jobsCollection: (...args: any[]) => jobsCollection(...args) }));
vi.mock("../src/auth/driver-account.service", () => ({ getDriverProfileByInitials: (...args: any[]) => getDriverProfileByInitials(...args) }));
vi.mock("../src/integrations/gpslive", async importOriginal => {
  const actual = await importOriginal<typeof import("../src/integrations/gpslive")>();
  return { ...actual, fetchGpsLiveDevices: (...args: any[]) => fetchGpsLiveDevices(...args) };
});
vi.mock("../src/push/push.service", () => ({ sendPushToDriver: (...args: any[]) => sendPushToDriver(...args) }));

import {
  assessPickupPosition, sweepPickupArrivals, verifyArrivalAtPhotoUpload
} from "../src/jobs/pickup-tracker.service";

const now = new Date("2026-10-01T10:00:00.000Z");
const pickup = { lat: 51.501, lng: -0.1416 };

describe("assessPickupPosition", () => {
  it("accepts a fresh tracker report near the pickup", () => {
    expect(assessPickupPosition({ lat: 51.5012, lng: -0.1416, dtTracker: "2026-10-01 09:59:30" }, pickup, now))
      .toEqual({ state: "inside", distanceMeters: 22, reportedAt: "2026-10-01T09:59:30.000Z" });
  });

  it("rejects a stale position even when it is at the pickup", () => {
    expect(assessPickupPosition({ lat: 51.501, lng: -0.1416, dtTracker: "2026-10-01 09:56:00" }, pickup, now).state)
      .toBe("stale");
  });

  it("does not count a fresh position outside the pickup radius", () => {
    expect(assessPickupPosition({ lat: 51.51, lng: -0.1416, dtTracker: "2026-10-01 09:59:30" }, pickup, now).state)
      .toBe("outside");
  });
});

describe("sweepPickupArrivals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDriverProfileByInitials.mockResolvedValue({ initials: "AB", imei: "123" });
    sendPushToDriver.mockResolvedValue({ sent: 1 });
  });

  it("requires two fresh reports at pickup, then sends only one reminder after 15 minutes", async () => {
    const job = {
      jobId: "TMV-ARRIVAL",
      driverInitials: "AB",
      status: JobStatus.READY,
      actualStart: "",
      onMyWayAt: "2026-10-01T09:50:00.000Z",
      pickupLocation: pickup
    } as Job;
    listJobs.mockImplementation(async () => [job]);
    const updateOne = vi.fn(async (_filter: unknown, update: any) => {
        Object.assign(job, update.$set);
        for (const key of Object.keys(update.$unset || {})) delete (job as any)[key];
        return { modifiedCount: 1 };
    });
    jobsCollection.mockResolvedValue({ updateOne });
    const report = (dtTracker: string) => [{ imei: "123", lat: pickup.lat, lng: pickup.lng, dtTracker }];

    fetchGpsLiveDevices.mockResolvedValueOnce(report("2026-10-01 09:55:00"));
    await sweepPickupArrivals(new Date("2026-10-01T10:00:00Z"));
    expect(job.trackerArrivalCandidateAt).toBeUndefined();

    fetchGpsLiveDevices.mockResolvedValueOnce(report("2026-10-01 10:00:30"));
    await sweepPickupArrivals(new Date("2026-10-01T10:01:00Z"));
    expect(job.trackerArrivalAt).toBeUndefined();

    fetchGpsLiveDevices.mockResolvedValueOnce(report("2026-10-01 10:01:30"));
    await sweepPickupArrivals(new Date("2026-10-01T10:02:00Z"));
    expect(job.trackerArrivalAt).toBe("2026-10-01T10:00:30.000Z");
    expect(sendPushToDriver).not.toHaveBeenCalled();

    fetchGpsLiveDevices.mockResolvedValueOnce(report("2026-10-01 10:15:30"));
    await sweepPickupArrivals(new Date("2026-10-01T10:16:00Z"));
    expect(sendPushToDriver).toHaveBeenCalledTimes(1);
    expect(job.arrivalProofReminderSentAt).toBe("2026-10-01T10:16:00.000Z");
    expect(updateOne).toHaveBeenCalledWith(expect.objectContaining({ arrivalProofReminderSentAt: null }), expect.anything());

    fetchGpsLiveDevices.mockResolvedValueOnce(report("2026-10-01 10:16:30"));
    await sweepPickupArrivals(new Date("2026-10-01T10:17:00Z"));
    expect(sendPushToDriver).toHaveBeenCalledTimes(1);
  });

  it("does not track the next job while the same driver has an in-progress job", async () => {
    const next = {
      jobId: "TMV-NEXT",
      driverInitials: "AB",
      status: JobStatus.READY,
      actualStart: "",
      onMyWayAt: "2026-10-01T09:50:00.000Z",
      pickupLocation: pickup
    } as Job;
    listJobs.mockResolvedValue([
      { jobId: "TMV-CURRENT", driverInitials: "AB", status: JobStatus.IN_PROGRESS, actualStart: "2026-10-01T09:00:00.000Z" },
      next
    ]);
    fetchGpsLiveDevices.mockResolvedValue([{ imei: "123", lat: pickup.lat, lng: pickup.lng, dtTracker: "2026-10-01 10:00:00" }]);
    jobsCollection.mockResolvedValue({ updateOne: vi.fn() });

    await sweepPickupArrivals(new Date("2026-10-01T10:00:30Z"));
    expect(fetchGpsLiveDevices).not.toHaveBeenCalled();
    expect(next.trackerArrivalCandidateAt).toBeUndefined();
  });

  it("replaces an inactive pinned tracker with one active initials match", async () => {
    const job = {
      jobId: "TMV-REPLACED-TRACKER",
      driverInitials: "AB",
      status: JobStatus.READY,
      actualStart: "",
      onMyWayAt: "2026-10-01T09:50:00.000Z",
      pickupLocation: pickup,
      gpsliveImei: "old"
    } as Job;
    listJobs.mockResolvedValue([job]);
    getDriverProfileByInitials.mockResolvedValue({
      initials: "AB", vanRegistration: "AB12 CDE", imei: "old"
    });
    const updateOne = vi.fn(async (_filter: unknown, update: any) => {
      Object.assign(job, update.$set);
      return { modifiedCount: 1 };
    });
    jobsCollection.mockResolvedValue({ updateOne });
    fetchGpsLiveDevices.mockResolvedValue([
      {
        imei: "old", name: "AB12 - AB", plateNumber: "AB12 CDE", active: "false",
        lat: 51.49, lng: -0.1, speed: 0, dtTracker: "2026-09-20 10:00:00"
      },
      {
        imei: "current", name: "AB12 CDE - AB", plateNumber: "AB12 CDE", active: "true",
        lat: pickup.lat, lng: pickup.lng, speed: 0, dtTracker: "2026-10-01 09:59:30"
      }
    ]);

    await sweepPickupArrivals(now);

    expect(job.gpsliveImei).toBe("current");
    expect(job.trackerArrivalCandidateAt).toBe("2026-10-01T09:59:30.000Z");
  });

  it("does not calculate proof-upload distance from a stale tracker position", async () => {
    const job = {
      jobId: "TMV-STALE-PROOF",
      driverInitials: "AB",
      pickupLocation: pickup,
      gpsliveImei: "123"
    } as Job;
    const updateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });
    jobsCollection.mockResolvedValue({ updateOne });
    fetchGpsLiveDevices.mockResolvedValue([{
      imei: "123", name: "AB12 CDE - AB", plateNumber: "AB12 CDE", active: "true",
      lat: 51.6, lng: -0.2, speed: 0, dtTracker: "2026-10-01 09:00:00"
    }]);

    await verifyArrivalAtPhotoUpload(job, { initials: "AB", imei: "123" });

    expect(updateOne).toHaveBeenCalledWith(
      { _id: "TMV-STALE-PROOF" },
      expect.objectContaining({
        $set: expect.objectContaining({
          trackerUnverifiedReason: "Tracker device signal was stale / offline",
          gpsliveImei: "123"
        }),
        $unset: expect.objectContaining({ trackerDistanceMeters: "", trackerLocationName: "" })
      })
    );
  });
});
