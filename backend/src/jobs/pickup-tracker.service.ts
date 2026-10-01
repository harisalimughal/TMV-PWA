import { DateTime } from "luxon";
import { getDriverProfileByInitials } from "../auth/driver-account.service";
import { jobsCollection } from "../db/mongo";
import { listJobs } from "../db/jobs.repo";
import { fetchGpsLiveDevices, type GpsLiveDevice } from "../integrations/gpslive";
import { sendPushToDriver } from "../push/push.service";
import { log } from "../utils/logger";
import { JobStatus } from "./job.types";

const ARRIVAL_RADIUS_METERS = 150;
const MAX_REPORT_AGE_MS = 2 * 60_000;
const PROOF_REMINDER_MS = 15 * 60_000;

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (degrees: number) => degrees * Math.PI / 180;
  const deltaLat = rad(b.lat - a.lat);
  const deltaLng = rad(b.lng - a.lng);
  const h = Math.sin(deltaLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(deltaLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

export function assessPickupPosition(
  device: Pick<GpsLiveDevice, "lat" | "lng" | "dtTracker">,
  pickup: { lat: number; lng: number },
  now: Date
): { state: "inside" | "outside" | "stale"; reportedAt?: string } {
  const report = DateTime.fromSQL(device.dtTracker || "", { zone: "utc" });
  const age = now.getTime() - report.toMillis();
  if (!report.isValid || !Number.isFinite(age) || age < -60_000 || age > MAX_REPORT_AGE_MS ||
      !Number.isFinite(device.lat) || !Number.isFinite(device.lng)) return { state: "stale" };
  const reportedAt = report.toUTC().toISO()!;
  return {
    state: distanceMeters(device, pickup) <= ARRIVAL_RADIUS_METERS ? "inside" : "outside",
    reportedAt
  };
}

let running = false;

/** Poll GPSLive once per minute for active pickup jobs. Only two distinct fresh in-radius
 * reports confirm arrival; no tracker signal means no reminder or late label. */
export async function sweepPickupArrivals(now = new Date()): Promise<void> {
  if (running) return;
  running = true;
  try {
    const allJobs = await listJobs();
    const busyDrivers = new Set(allJobs.filter(job => job.status === JobStatus.IN_PROGRESS && job.actualStart)
      .map(job => job.driverInitials));
    const seenDrivers = new Set<string>();
    const jobs = allJobs.filter(job =>
      (job.status === JobStatus.READY || job.status === JobStatus.IN_PROGRESS) &&
      job.onMyWayAt && job.pickupLocation && job.driverInitials && !job.actualStart && !busyDrivers.has(job.driverInitials)
    ).sort((a, b) =>
      Number(b.status === JobStatus.IN_PROGRESS) - Number(a.status === JobStatus.IN_PROGRESS) ||
      a.bookedStart.localeCompare(b.bookedStart)
    ).filter(job => {
      if (seenDrivers.has(job.driverInitials)) return false;
      seenDrivers.add(job.driverInitials);
      return true;
    });
    if (!jobs.length) return;
    const devices = await fetchGpsLiveDevices();
    const byImei = new Map(devices.map(device => [device.imei, device]));
    const col = await jobsCollection();
    const profileCache = new Map<string, string>();

    for (const job of jobs) {
      try {
        let assignedImei = profileCache.get(job.driverInitials);
        if (assignedImei === undefined) {
          const profile = await getDriverProfileByInitials(job.driverInitials);
          assignedImei = profile?.imei || "";
          profileCache.set(job.driverInitials, assignedImei);
        }
        // A changed driver/device assignment needs review, never a guessed fallback.
        if (!assignedImei || (job.gpsliveImei && job.gpsliveImei !== assignedImei)) continue;
        const device = byImei.get(assignedImei);
        if (!device) continue;
        const position = assessPickupPosition(device, job.pickupLocation!, now);
        if (position.state === "stale" || !position.reportedAt) continue;
        const reportMs = new Date(position.reportedAt).getTime();
        if (reportMs < new Date(job.onMyWayAt!).getTime()) continue;
        const filter = { _id: job.jobId, actualStart: "" } as any;
        const seenAt = { trackerLastSeenAt: position.reportedAt, gpsliveImei: assignedImei };
        if (position.state === "outside") {
          await col.updateOne(filter, { $set: seenAt, $unset: { trackerArrivalCandidateAt: "" } } as any);
          continue;
        }
        if (!job.trackerArrivalAt) {
          const candidateMs = job.trackerArrivalCandidateAt ? new Date(job.trackerArrivalCandidateAt).getTime() : NaN;
          if (Number.isFinite(candidateMs) && reportMs > candidateMs && reportMs - candidateMs <= 5 * 60_000) {
            await col.updateOne(filter, { $set: { ...seenAt, trackerArrivalAt: job.trackerArrivalCandidateAt }, $unset: { trackerArrivalCandidateAt: "" } } as any);
            continue;
          }
          if (!Number.isFinite(candidateMs) || reportMs > candidateMs) {
            await col.updateOne(filter, { $set: { ...seenAt, trackerArrivalCandidateAt: position.reportedAt } } as any);
          }
          continue;
        }
        await col.updateOne(filter, { $set: seenAt } as any);
        if (job.arrivalProofReminderSentAt || now.getTime() - new Date(job.trackerArrivalAt).getTime() < PROOF_REMINDER_MS) continue;
        // Atomically claim the one reminder before sending, even if two sweeps overlap.
        const claimed = await col.updateOne({ ...filter, arrivalProofReminderSentAt: null } as any,
          { $set: { arrivalProofReminderSentAt: now.toISOString() } } as any);
        if (!claimed.modifiedCount) continue;
        await sendPushToDriver(job.driverInitials, {
          title: "Proof of arrival photo overdue",
          body: "Your van reached the pickup over 15 minutes ago. Please upload the proof of arrival photo if you have not already taken it.",
          url: "/?tab=jobs",
          tag: `arrival-proof-${job.jobId}`,
          data: { kind: "arrival_proof_overdue", jobId: job.jobId }
        });
      } catch (error) {
        log.warn("pickup tracker check failed", { job_id: job.jobId, error: String(error) });
      }
    }
  } finally {
    running = false;
  }
}
