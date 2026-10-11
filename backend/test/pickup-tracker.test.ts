import { beforeEach, describe, expect, it, vi } from "vitest";
import { JobStatus, type Job } from "../src/jobs/job.types";

const listJobs = vi.fn();
const jobsCollection = vi.fn();
const getDriverProfileByInitials = vi.fn();
const fetchGpsLiveDevices = vi.fn();
const sendPushToDriver = vi.fn();

vi.mock("../src/db/jobs.repo", () => ({ listJobs: (...args: any[]) => listJobs(...args), getJob: async (id: string) => (await listJobs()).find((row: Job) => row.jobId === id) }));
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
const north = (meters: number) => ({ lat: pickup.lat + meters / 6371000 * 180 / Math.PI, lng: pickup.lng });

describe("assessPickupPosition", () => {
  it.each([[405, "inside"], [500, "inside"], [501, "outside"]])("uses an inclusive 500m pickup radius at %im", (meters, state) => {
    expect(assessPickupPosition({ ...north(meters as number), dtTracker: "2026-10-01 09:59:30" }, pickup, now)).toMatchObject({ state, distanceMeters: meters });
  });
  it("rejects future timestamps, invalid coordinates and an unset GPS fix", () => {
    expect(assessPickupPosition({ lat: pickup.lat, lng: pickup.lng, dtTracker: "2026-10-01 10:00:01" }, pickup, now).state).toBe("stale");
    expect(assessPickupPosition({ lat: 95, lng: 0, dtTracker: "2026-10-01 09:59:30" }, pickup, now).state).toBe("stale");
    expect(assessPickupPosition({ lat: 0, lng: 0, dtTracker: "2026-10-01 09:59:30" }, pickup, now).state).toBe("stale");
  });
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
  it("confirms arrival beyond 300m and freezes the distance of the first report", async () => {
    const job = { jobId: "RADIUS", driverInitials: "AB", status: JobStatus.READY, actualStart: "", onMyWayAt: "2026-10-01T09:50:00Z", pickupLocation: pickup } as Job;
    listJobs.mockResolvedValue([job]);
    jobsCollection.mockResolvedValue({ updateOne: vi.fn(async (_filter, update) => {
      Object.assign(job, update.$set); for (const field of Object.keys(update.$unset ?? {})) delete (job as any)[field]; return { modifiedCount: 1 };
    }) });
    fetchGpsLiveDevices.mockResolvedValueOnce([{ imei: "123", ...north(405), dtTracker: "2026-10-01 09:59:30", speed: 0 }]);
    await sweepPickupArrivals(now);
    expect(job.trackerArrivalAt).toBeUndefined();
    expect(job.trackerArrivalCandidateDistanceMeters).toBe(405);
    fetchGpsLiveDevices.mockResolvedValueOnce([{ imei: "123", ...north(470), dtTracker: "2026-10-01 10:00:30", speed: 0 }]);
    await sweepPickupArrivals(new Date("2026-10-01T10:01:00Z"));
    expect(job.trackerArrivalAt).toBe("2026-10-01T09:59:30.000Z");
    expect(job.trackerArrivalDistanceMeters).toBe(405);
    expect(job.trackerDistanceMeters).toBe(470);
    expect(job.trackerArrivalCandidateDistanceMeters).toBeUndefined();
    fetchGpsLiveDevices.mockResolvedValueOnce([{ imei: "123", ...north(200), dtTracker: "2026-10-01 10:01:30", speed: 0 }]);
    await sweepPickupArrivals(new Date("2026-10-01T10:02:00Z"));
    expect(job.trackerDistanceMeters).toBe(200);
    expect(job.trackerArrivalDistanceMeters).toBe(405);
  });
  it("confirms the same radius and candidate distance at proof upload", async () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    try {
      const job = { jobId: "PHOTO-RADIUS", driverInitials: "AB", pickupLocation: pickup, gpsliveImei: "123", onMyWayAt: "2026-10-01T09:50:00Z",
        trackerArrivalCandidateAt: "2026-10-01T09:59:00Z", trackerArrivalCandidateDistanceMeters: 405 } as Job;
      jobsCollection.mockResolvedValue({ updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }) });
      fetchGpsLiveDevices.mockResolvedValue([{ imei: "123", ...north(500), dtTracker: "2026-10-01 09:59:30", speed: 0 }]);
      await verifyArrivalAtPhotoUpload(job, { initials: "AB", imei: "123" });
      expect(job.trackerArrivalAt).toBe("2026-10-01T09:59:00Z");
      expect(job.trackerArrivalDistanceMeters).toBe(405);
      expect(job.trackerDistanceMeters).toBe(500);
    } finally { vi.useRealTimers(); }
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
    const report = (dtTracker: string) => [{ imei: "123", lat: pickup.lat, lng: pickup.lng, dtTracker, speed: 0 }];

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
      trackerArrivalCandidateAt: "2026-10-01T09:59:00Z",
      trackerDistanceMeters: 20,
      trackerLocationName: "Old location",
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
          trackerUnverifiedReason: "Tracker device signal was stale / offline"
        }),
        $unset: expect.objectContaining({ trackerDistanceMeters: "", trackerLocationName: "" })
      })
    );
    expect(job.trackerArrivalCandidateAt).toBeUndefined();
    expect(job.trackerDistanceMeters).toBeUndefined();
    expect(job.trackerLocationName).toBeUndefined();
  });
  it("does not confirm arrival from a moving drive-by at pickup", async () => {
    const job = { jobId: "DRIVE-BY", driverInitials: "AB", status: JobStatus.READY, actualStart: "", onMyWayAt: "2026-10-01T09:50:00Z", pickupLocation: pickup, gpsliveImei: "123", trackerArrivalCandidateAt: "2026-10-01T09:59:00Z" } as Job;
    listJobs.mockResolvedValue([job]);
    const updateOne = vi.fn(async (_filter, update) => { Object.assign(job, update.$set); for (const field of Object.keys(update.$unset ?? {})) delete (job as any)[field]; return { modifiedCount: 1 }; });
    jobsCollection.mockResolvedValue({ updateOne });
    fetchGpsLiveDevices.mockResolvedValue([{ imei: "123", lat: pickup.lat, lng: pickup.lng, dtTracker: "2026-10-01 09:59:30", speed: 25 }]);
    await sweepPickupArrivals(now);
    expect(job.trackerArrivalAt).toBeUndefined();
    expect(job.trackerArrivalCandidateAt).toBeUndefined();
    expect(job.trackerUnverifiedReason).toContain("drive-by");
  });
});
