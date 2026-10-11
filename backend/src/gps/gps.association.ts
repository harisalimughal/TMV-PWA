import type { Job } from "../jobs/job.types";
import type { GpsAssociation, GpsDeviceAssignment, GpsEvent } from "./gps.types";

const millis = (value?: string | null) => value ? Date.parse(value) : NaN;
export function createGpsAssociator(jobs: Job[], now: string) {
  const byDevice = new Map<string, Job[]>();
  for (const job of jobs) {
    const devices = new Set([job.gpsliveImei, ...(job.gpsDeviceHistory ?? []).map(segment => segment.imei)]);
    for (const imei of devices) if (imei) {
      const group = byDevice.get(imei) ?? []; group.push(job); byDevice.set(imei, group);
    }
  }
  return (event: Parameters<typeof associateGpsEvent>[0]) => associateGpsEvent(event, byDevice.get(event.imei ?? "") ?? [], now);
}

export function recordGpsAssignment(job: Job, imei: string, at: string, source: GpsDeviceAssignment["source"]): void {
  if (!imei || !Number.isFinite(millis(at))) return;
  const history = [...(job.gpsDeviceHistory ?? [])];
  if (!history.length && job.gpsliveImei && job.onMyWayAt && millis(job.onMyWayAt) < millis(at)) {
    history.push({ imei: job.gpsliveImei, from: job.onMyWayAt, to: at,
      driverInitials: job.timeBilling?.driverInitials ?? job.driverInitials, source: "legacy-pin" });
  }
  const last = history.at(-1);
  if (last && millis(at) < millis(last.from)) return;
  if (last?.imei === imei && last.driverInitials === job.driverInitials && !last.to) { job.gpsliveImei = imei; return; }
  if (last && !last.to) history[history.length - 1] = { ...last, to: at };
  history.push({ imei, from: at, to: null, driverInitials: job.driverInitials, source });
  job.gpsDeviceHistory = history;
  job.gpsliveImei = imei;
}

export function associateGpsEvent(event: Pick<GpsEvent, "imei" | "occurredAt" | "timeSource" | "conflicts">, jobs: Job[], now: string): GpsAssociation {
  const unmatched = (reason: string): GpsAssociation => ({ jobId: null, driverInitials: null, phase: null,
    confidence: "unmatched", candidateJobIds: [], reason });
  if (!event.imei) return unmatched("Device identity missing; current profile/name cannot establish historical ownership.");
  const time = millis(event.occurredAt);
  if (!Number.isFinite(time) || ["future", "missing", "invalid"].includes(event.timeSource) || event.conflicts?.length) return unmatched("Event time or source identity requires verification.");
  const candidates: Array<{ job: Job; assignment?: GpsDeviceAssignment }> = [];
  for (const job of jobs) {
    if (job.status === "CANCELLED") continue;
    const start = millis(job.onMyWayAt || job.actualStart);
    const finish = job.actualFinish ? millis(job.actualFinish) : job.status === "COMPLETED" ? NaN : millis(now);
    if (!Number.isFinite(start) || !Number.isFinite(finish) || time < start || time >= finish) continue;
    if (job.actualStartSource === "completion-fallback" || ["admin-manual", "completion-fallback"].includes(job.actualFinishSource ?? "")) continue;
    if (job.gpsDeviceHistory?.length) {
      const matches = job.gpsDeviceHistory.filter(segment => segment.imei === event.imei && time >= millis(segment.from) &&
        (!segment.to || time < millis(segment.to)));
      for (const assignment of matches) candidates.push({ job, assignment });
    } else if (job.gpsliveImei === event.imei) candidates.push({ job });
  }
  if (!candidates.length) return unmatched("No recorded device/job interval covers the event.");
  if (candidates.length > 1) return { ...unmatched("Overlapping job/device intervals require verification."),
    confidence: "ambiguous", candidateJobIds: [...new Set(candidates.map(row => row.job.jobId))] };
  const { job, assignment } = candidates[0];
  return { jobId: job.jobId, driverInitials: assignment?.driverInitials ?? job.timeBilling?.driverInitials ?? job.driverInitials,
    phase: job.actualStart && time >= millis(job.actualStart) ? "on-job" : "approach",
    confidence: assignment && assignment.source !== "legacy-pin" ? "recorded-assignment" : "legacy-pin", candidateJobIds: [job.jobId],
    reason: assignment && assignment.source !== "legacy-pin" ? null : "Legacy pin has no verified historical assignment time." };
}
