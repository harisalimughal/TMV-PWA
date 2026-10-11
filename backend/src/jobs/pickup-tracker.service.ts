import { DateTime } from "luxon";
import { getDriverProfileByInitials } from "../auth/driver-account.service";
import { jobsCollection } from "../db/mongo";
import { getJob, listJobs } from "../db/jobs.repo";
import { reverseGeocode } from "../integrations/geocode";
import {
  fetchGpsLiveDevices, findDeviceForDriver, isGpsLiveDeviceActive, type GpsLiveDevice
} from "../integrations/gpslive";
import { sendPushToDriver } from "../push/push.service";
import { log } from "../utils/logger";
import { Job, JobStatus } from "./job.types";
import { recordGpsAssignment } from "../gps/gps.association";
import { withJobLock } from "../utils/lock";
import { gpsLocation, gpsTime } from "../gps/gps.parse";

const ARRIVAL_RADIUS_METERS = 300;
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
  now: Date,
  maxReportAgeMs = MAX_REPORT_AGE_MS
): { state: "inside" | "outside" | "stale"; distanceMeters: number; reportedAt?: string } {
  const parsed = gpsTime(device.dtTracker, now.toISOString());
  const report = parsed.occurredAt ? DateTime.fromISO(parsed.occurredAt) : DateTime.invalid("missing GPS time");
  const age = now.getTime() - report.toMillis();
  if (!report.isValid || !Number.isFinite(age) || age < 0 || age > maxReportAgeMs ||
      !gpsLocation(device.lat, device.lng) || (device.lat === 0 && device.lng === 0) || !gpsLocation(pickup.lat, pickup.lng)) return { state: "stale", distanceMeters: NaN };
  const reportedAt = report.toUTC().toISO()!;
  const distance = Math.round(distanceMeters(device, pickup));
  return {
    state: distance <= ARRIVAL_RADIUS_METERS ? "inside" : "outside",
    distanceMeters: distance,
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
      job.onMyWayAt && job.pickupLocation && job.driverInitials &&
      ((!job.actualStart && !busyDrivers.has(job.driverInitials)) ||
        (job.actualStart && !job.trackerArrivalAt && now.getTime() - Date.parse(job.actualStart) <= 5 * 60_000))
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
    const profileCache = new Map<string, Awaited<ReturnType<typeof getDriverProfileByInitials>>>();

    for (const queuedJob of jobs) {
      await withJobLock(queuedJob.jobId, async () => {
      try {
        const job = await getJob(queuedJob.jobId);
        if (!job || job.status === JobStatus.COMPLETED) return;
        let profile = profileCache.get(job.driverInitials);
        if (profile === undefined) {
          profile = await getDriverProfileByInitials(job.driverInitials);
          profileCache.set(job.driverInitials, profile);
        }
        if (!profile) return;
        const pinned = job.gpsliveImei ? byImei.get(job.gpsliveImei) : undefined;
        const device = pinned && isGpsLiveDeviceActive(pinned) ? pinned : findDeviceForDriver(profile, devices);
        if (!device) return;
        // Keep an active tracker pinned to an in-flight job. An inactive/removed pin
        // may be repaired by the driver's one unique active initials match.
        if (job.gpsliveImei && job.gpsliveImei !== device.imei && pinned && isGpsLiveDeviceActive(pinned)) return;
        const assignedImei = device.imei;
        const priorDeviceMatches = job.gpsliveImei === assignedImei;
        const deviceChanged = !!job.gpsliveImei && job.gpsliveImei !== assignedImei;
        const position = assessPickupPosition(device, job.pickupLocation!, now);
        if (position.state === "stale" || !position.reportedAt) return;
        const reportMs = new Date(position.reportedAt).getTime();
        if (reportMs < new Date(job.onMyWayAt!).getTime()) return;
        const filter = { _id: job.jobId, actualStart: job.actualStart || "" } as any;
        const dist = position.distanceMeters;
        const seenAt: Record<string, any> = {
          trackerLastSeenAt: position.reportedAt,
          gpsliveImei: assignedImei,
          trackerDistanceMeters: dist
        };
        recordGpsAssignment(job, assignedImei, position.reportedAt, "pickup-report");
        seenAt.gpsDeviceHistory = job.gpsDeviceHistory;
        if (position.state === "outside" || !Number.isFinite(device.speed) || device.speed < 0 || device.speed > 5) {
          let reason: string;
          if (!Number.isFinite(device.speed) || device.speed < 0) {
            reason = "Tracker speed is unavailable; stationary arrival is unverified.";
          } else if (device.speed > 5 && position.state === "inside") {
            reason = "Tracker is moving near pickup; a drive-by is not confirmed arrival.";
          } else if (dist >= 1000) {
            reason = `Van was ${(dist / 1000).toFixed(1)} km away from pickup point`;
          } else {
            reason = `Van was ${dist}m away from pickup point (outside 300m radius)`;
          }
          let locName = deviceChanged ? undefined : job.trackerLocationName;
          if (!locName && dist >= 500) {
            locName = (await reverseGeocode(device.lat, device.lng).catch(() => null)) || undefined;
          }
          if (locName) {
            seenAt.trackerLocationName = locName;
            reason += ` in ${locName}`;
          }
          seenAt.trackerUnverifiedReason = reason;
          await col.updateOne(filter, {
            $set: seenAt,
            $unset: {
              trackerArrivalCandidateAt: "",
              ...(locName ? {} : { trackerLocationName: "" })
            }
          } as any);
          return;
        }
        if (!job.trackerArrivalAt) {
          const candidateMs = priorDeviceMatches && job.trackerArrivalCandidateAt
            ? new Date(job.trackerArrivalCandidateAt).getTime()
            : NaN;
          if (Number.isFinite(candidateMs) && reportMs > candidateMs && reportMs - candidateMs <= 5 * 60_000) {
            await col.updateOne(filter, {
              $set: { ...seenAt, trackerArrivalAt: job.trackerArrivalCandidateAt, trackerArrivalSource: "two-fresh-reports" },
              $unset: {
                trackerArrivalCandidateAt: "", trackerUnverifiedReason: "", trackerLocationName: ""
              }
            } as any);
            return;
          }
          if (!Number.isFinite(candidateMs) || reportMs > candidateMs) {
            await col.updateOne(filter, {
              $set: { ...seenAt, trackerArrivalCandidateAt: position.reportedAt },
              $unset: { trackerUnverifiedReason: "", trackerLocationName: "" }
            } as any);
          }
          return;
        }
        await col.updateOne(filter, {
          $set: seenAt,
          $unset: { trackerUnverifiedReason: "", trackerLocationName: "" }
        } as any);
        if (job.actualStart || job.arrivalProofReminderSentAt || now.getTime() - new Date(job.trackerArrivalAt).getTime() < PROOF_REMINDER_MS) return;
        // Atomically claim the one reminder before sending, even if two sweeps overlap.
        const claimed = await col.updateOne({ ...filter, arrivalProofReminderSentAt: null } as any,
          { $set: { arrivalProofReminderSentAt: now.toISOString() } } as any);
        if (!claimed.modifiedCount) return;
        await sendPushToDriver(job.driverInitials, {
          title: "Proof of arrival photo overdue",
          body: "Your van reached the pickup over 15 minutes ago. Please upload the proof of arrival photo if you have not already taken it.",
          url: "/?tab=jobs",
          tag: `arrival-proof-${job.jobId}`,
          data: { kind: "arrival_proof_overdue", jobId: job.jobId }
        });
      } catch (error) {
        log.warn("pickup tracker check failed", { job_id: queuedJob.jobId, error: String(error) });
      }
      });
    }
  } finally {
    running = false;
  }
}

/** Proof upload retains GPS evidence separately from photo acceptance. Arrival
 * requires two distinct fresh stationary reports from the same pinned tracker. */
export async function verifyArrivalAtPhotoUpload(
  job: Job,
  driver: { initials?: string; imei?: string },
  photoTakenAt = new Date().toISOString()
): Promise<void> {
  if (job.trackerArrivalAt) return;
  const col = await jobsCollection();
  const filter = { _id: job.jobId };

  if (!job.pickupLocation) {
    job.trackerUnverifiedReason = "Pickup address could not be geocoded";
    await col.updateOne(filter, { $set: { trackerUnverifiedReason: job.trackerUnverifiedReason } } as any);
    return;
  }

  if (!driver.initials) {
    job.trackerUnverifiedReason = "No GPS tracker device assigned to driver";
    await col.updateOne(filter, { $set: { trackerUnverifiedReason: job.trackerUnverifiedReason } } as any);
    return;
  }

  try {
    const devices = await fetchGpsLiveDevices();
    const profile = await getDriverProfileByInitials(driver.initials);
    const pinned = devices.find(row => row.imei === job.gpsliveImei && isGpsLiveDeviceActive(row));
    const device = pinned || findDeviceForDriver({
      initials: driver.initials,
      vanRegistration: profile?.vanRegistration || "",
      imei: driver.imei || profile?.imei || job.gpsliveImei
    }, devices);
    if (!device) {
      job.trackerUnverifiedReason = "Tracker device signal offline / not found";
      await col.updateOne(filter, { $set: { trackerUnverifiedReason: job.trackerUnverifiedReason } } as any);
      return;
    }

    const now = new Date();
    // Old sleeping-tracker coordinates do not establish arrival at photo upload.
    const position = assessPickupPosition(device, job.pickupLocation, now);
    if (position.state === "stale" || !position.reportedAt) {
      job.trackerUnverifiedReason = "Tracker device signal was stale / offline";
      job.trackerArrivalCandidateAt = undefined;
      job.trackerDistanceMeters = undefined;
      job.trackerLocationName = undefined;
      await col.updateOne(filter, {
        $set: { trackerUnverifiedReason: job.trackerUnverifiedReason },
        $unset: { trackerArrivalCandidateAt: "", trackerDistanceMeters: "", trackerLocationName: "" }
      } as any);
      return;
    }

    const dist = position.distanceMeters;
    const reportedAt = position.reportedAt;
    const assignedImei = device.imei;
    if (job.onMyWayAt && Date.parse(reportedAt) < Date.parse(job.onMyWayAt)) {
      job.trackerUnverifiedReason = "Tracker report predates this job's on-my-way timestamp.";
      return;
    }
    const previousImei = job.gpsliveImei;
    recordGpsAssignment(job, assignedImei, reportedAt, "pickup-report");

    if (position.state === "inside" && Number.isFinite(device.speed) && device.speed >= 0 && device.speed <= 5) {
      const candidate = previousImei === assignedImei ? job.trackerArrivalCandidateAt : undefined;
      const confirmed = candidate && Date.parse(reportedAt) > Date.parse(candidate) && Date.parse(reportedAt) - Date.parse(candidate) <= 5 * 60_000;
      if (confirmed) {
        job.trackerArrivalAt = candidate;
        job.trackerArrivalSource = "two-fresh-reports";
        job.trackerArrivalCandidateAt = undefined;
        job.trackerUnverifiedReason = undefined;
      } else {
        job.trackerArrivalCandidateAt = reportedAt;
        job.trackerUnverifiedReason = "Awaiting a second distinct fresh stationary tracker report.";
      }
      job.trackerLastSeenAt = reportedAt;
      job.trackerDistanceMeters = dist;
      job.trackerLocationName = undefined;
      job.gpsliveImei = assignedImei;
      await col.updateOne(filter, {
        $set: {
          ...(confirmed ? { trackerArrivalAt: candidate, trackerArrivalSource: "two-fresh-reports" } : { trackerArrivalCandidateAt: reportedAt, trackerUnverifiedReason: job.trackerUnverifiedReason }),
          trackerLastSeenAt: reportedAt,
          trackerDistanceMeters: dist,
          gpsliveImei: assignedImei,
          gpsDeviceHistory: job.gpsDeviceHistory
        },
        $unset: {
          ...(confirmed ? { trackerArrivalCandidateAt: "", trackerUnverifiedReason: "" } : {}), trackerLocationName: ""
        }
      } as any);
      log.info(confirmed ? "tracker arrival verified at photo upload" : "tracker arrival awaiting another report", { job_id: job.jobId, distance_meters: dist });
    } else {
      // Van was outside the radius at photo time
      let locName: string | undefined;
      if (dist >= 500) {
        locName = (await reverseGeocode(device.lat, device.lng).catch(() => null)) || undefined;
      }
      let reason: string;
      if (position.state === "inside") {
        reason = "Tracker is moving near pickup; GPS arrival is unverified.";
      } else if (dist >= 1000) {
        reason = `Van was ${(dist / 1000).toFixed(1)} km away from pickup point${locName ? ` in ${locName}` : ""}`;
      } else {
        reason = `Van was ${dist}m away from pickup point (outside 300m radius)${locName ? ` in ${locName}` : ""}`;
      }
      job.trackerDistanceMeters = dist;
      job.trackerArrivalCandidateAt = undefined;
      job.trackerLocationName = locName;
      job.trackerUnverifiedReason = reason;
      job.trackerLastSeenAt = reportedAt;
      job.gpsliveImei = assignedImei;
      await col.updateOne(filter, {
        $set: {
          trackerDistanceMeters: dist,
          trackerLocationName: locName,
          trackerUnverifiedReason: reason,
          trackerLastSeenAt: reportedAt,
          gpsliveImei: assignedImei,
          gpsDeviceHistory: job.gpsDeviceHistory
        },
        $unset: { trackerArrivalCandidateAt: "" }
      } as any);
      log.info("tracker outside radius at photo upload", { job_id: job.jobId, distance_meters: dist, reason });
    }
  } catch (error) {
    log.warn("verifyArrivalAtPhotoUpload failed", { job_id: job.jobId, error: String(error) });
  }
}
