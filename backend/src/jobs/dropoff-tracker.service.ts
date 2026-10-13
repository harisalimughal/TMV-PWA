import { getJob, listJobs, upsertJob } from "../db/jobs.repo";
import { getDriverProfileByInitials } from "../auth/driver-account.service";
import { geocodeAddress } from "../integrations/geocode";
import { fetchGpsLiveDevices, findDeviceForDriver, isGpsLiveDeviceActive, type GpsLiveDevice } from "../integrations/gpslive";
import { withJobLock } from "../utils/lock";
import { log } from "../utils/logger";
import { assessPickupPosition } from "./pickup-tracker.service";
import { JobStatus, type Job } from "./job.types";

const MAX_PAIR_GAP_MS = 5 * 60_000;
const COMPLETED_TRACKING_MS = 6 * 3_600_000;

export function assessDropoffTracking(job: Job, device: GpsLiveDevice, now: Date): NonNullable<Job["dropoffTracking"]> {
  const prior = job.dropoffTracking;
  if (prior?.departureAt) return prior;
  if (prior?.arrivalAt && prior.imei !== device.imei) return { ...prior, unverifiedReason: "Tracker changed after drop-off arrival; departure is unverified." };
  const state = prior?.imei === device.imei ? { ...prior } : { imei: device.imei };
  if (!job.dropoffLocation) return { ...state, unverifiedReason: "Drop-off address could not be geocoded." };
  const position = assessPickupPosition(device, job.dropoffLocation, now);
  if (position.state === "stale" || !position.reportedAt) {
    return { ...state, arrivalCandidateAt: undefined, departureCandidateAt: undefined, unverifiedReason: "Tracker signal is stale or unavailable." };
  }
  const at = Date.parse(position.reportedAt), loaded = Date.parse(job.vanLoadedAt ?? "");
  if (!Number.isFinite(loaded) || at < loaded || at <= Date.parse(state.lastSeenAt ?? "")) return state;
  state.lastSeenAt = position.reportedAt;
  state.distanceMeters = position.distanceMeters;
  state.unverifiedReason = undefined;
  const confirmed = (candidate?: string) => !!candidate && at > Date.parse(candidate) && at - Date.parse(candidate) <= MAX_PAIR_GAP_MS;
  if (!state.arrivalAt) {
    if (position.state === "outside") {
      state.outsideObservedAt = position.reportedAt;
      state.arrivalCandidateAt = undefined;
    } else if (!state.outsideObservedAt) {
      state.unverifiedReason = "Entry into the drop-off radius has not been observed.";
    } else if (!Number.isFinite(device.speed) || device.speed < 0 || device.speed > 5) {
      state.arrivalCandidateAt = undefined;
      state.unverifiedReason = "Van is moving near drop-off; stationary arrival is unverified.";
    } else if (confirmed(state.arrivalCandidateAt)) {
      state.arrivalAt = state.arrivalCandidateAt;
      state.arrivalCandidateAt = undefined;
      state.source = "two-fresh-reports";
    } else state.arrivalCandidateAt = position.reportedAt;
  } else if (position.state === "inside") state.departureCandidateAt = undefined;
  else if (confirmed(state.departureCandidateAt)) {
    state.departureAt = state.departureCandidateAt;
    state.departureCandidateAt = undefined;
    state.source = "two-fresh-reports";
  } else state.departureCandidateAt = position.reportedAt;
  return state;
}

let running = false;
export async function sweepDropoffArrivals(now = new Date()): Promise<void> {
  if (running) return;
  running = true;
  try {
    const eligible = (job: Job) => !!job.vanLoadedAt && !job.dropoffTracking?.departureAt &&
      (job.status === JobStatus.IN_PROGRESS || job.status === JobStatus.COMPLETED &&
        now.getTime() - Date.parse(job.actualFinish) >= 0 && now.getTime() - Date.parse(job.actualFinish) <= COMPLETED_TRACKING_MS);
    const jobs = (await listJobs()).filter(job => !!job.vanLoadedAt && job.status !== JobStatus.CANCELLED)
      .sort((a, b) => Date.parse(b.vanLoadedAt!) - Date.parse(a.vanLoadedAt!));
    const drivers = new Set<string>();
    const selected = jobs.filter(job => {
      if (drivers.has(job.driverInitials)) return false;
      drivers.add(job.driverInitials);
      return eligible(job);
    });
    if (!selected.length) return;
    const devices = await fetchGpsLiveDevices();
    for (const queued of selected) await withJobLock(queued.jobId, async () => {
      try {
        const job = await getJob(queued.jobId);
        if (!job || !eligible(job)) return;
        if (!job.dropoffLocation && (!job.dropoffGeocodeAttemptAt || now.getTime() - Date.parse(job.dropoffGeocodeAttemptAt) >= 3_600_000)) {
          job.dropoffGeocodeAttemptAt = now.toISOString();
          job.dropoffLocation = (await geocodeAddress(job.dropoff)) ?? undefined;
        }
        const pinned = devices.find(device => device.imei === job.gpsliveImei && isGpsLiveDeviceActive(device));
        const profile = pinned ? null : await getDriverProfileByInitials(job.driverInitials);
        const device = pinned ?? (profile ? findDeviceForDriver(profile, devices) : null);
        if (device) job.dropoffTracking = assessDropoffTracking(job, device, now);
        else job.dropoffTracking = { ...job.dropoffTracking, imei: job.dropoffTracking?.imei ?? job.gpsliveImei ?? "", arrivalCandidateAt: undefined, departureCandidateAt: undefined, unverifiedReason: "No active tracker signal is available." };
        await upsertJob(job);
      } catch (error) { log.warn("drop-off tracker check failed", { job_id: queued.jobId, error: String(error) }); }
    });
  } catch (error) { log.warn("drop-off tracker sweep failed", { error: String(error) }); }
  finally { running = false; }
}
