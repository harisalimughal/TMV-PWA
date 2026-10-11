import type { Job } from "../../jobs/job.types";
import type { GpsDrive, GpsPosition } from "../../gps/gps.types";
import { createGpsAssociator } from "../../gps/gps.association";
import { gpsMovement } from "../../gps/gps.movement";
import { readGpsMovementRange } from "../../gps/gps.repo";
import { loadReportContextJobs } from "../../reports/driver-report.repo";

export interface DriverMovingSummary { movingKnownSeconds: number; movingUnknownJobs: number; movingPartialJobs: number }
export function summarizeDriverMovement(jobs: Job[], identities: Map<string, string>, contexts: Job[], positions: GpsPosition[], drives: GpsDrive[], truncated = false) {
  const now = new Date().toISOString();
  const associate = createGpsAssociator(contexts, now);
  const pointsByJob = new Map<string, GpsPosition[]>(), drivesByJob = new Map<string, GpsDrive[]>();
  for (const point of positions) {
    const owner = associate(point);
    if (!owner.jobId || owner.driverInitials !== identities.get(owner.jobId)) continue;
    const group = pointsByJob.get(owner.jobId) ?? []; group.push(point); pointsByJob.set(owner.jobId, group);
  }
  for (const drive of drives) {
    if (!Number.isFinite(Date.parse(drive.start)) || !Number.isFinite(Date.parse(drive.end))) continue;
    const first = associate({ imei: drive.imei, occurredAt: drive.start, timeSource: "provider-assumed-utc" });
    const last = associate({ imei: drive.imei, occurredAt: new Date(Date.parse(drive.end) - 1).toISOString(), timeSource: "provider-assumed-utc" });
    if (!first.jobId || first.jobId !== last.jobId || first.driverInitials !== identities.get(first.jobId) || last.driverInitials !== first.driverInitials) continue;
    const group = drivesByJob.get(first.jobId) ?? []; group.push(drive); drivesByJob.set(first.jobId, group);
  }
  const totals = new Map<string, DriverMovingSummary>();
  for (const job of jobs) {
    const initials = identities.get(job.jobId);
    if (job.status !== "COMPLETED" || !initials) continue;
    const movement = gpsMovement(pointsByJob.get(job.jobId) ?? [], drivesByJob.get(job.jobId) ?? [], job.actualStart, job.actualFinish);
    const total = totals.get(initials) ?? { movingKnownSeconds: 0, movingUnknownJobs: 0, movingPartialJobs: 0 };
    total.movingKnownSeconds += movement.movingSeconds ?? 0;
    if (movement.movingSeconds === null) total.movingUnknownJobs++;
    else if (movement.coverage === "partial" || truncated) total.movingPartialJobs++;
    totals.set(initials, total);
  }
  return totals;
}

export async function loadDriverMovement(jobs: Job[], identities: Map<string, string>) {
  const completed = jobs.filter(job => job.status === "COMPLETED" && identities.has(job.jobId));
  const empty = () => summarizeDriverMovement(completed, identities, completed, [], []);
  const imeis = [...new Set(completed.flatMap(job => [job.gpsliveImei, ...(job.gpsDeviceHistory ?? []).map(segment => segment.imei)]).filter((imei): imei is string => !!imei))];
  const starts = completed.map(job => Date.parse(job.actualStart || job.bookedStart)).filter(Number.isFinite);
  const ends = completed.map(job => Date.parse(job.actualFinish)).filter(Number.isFinite);
  if (!imeis.length || imeis.length > 50 || !starts.length || !ends.length) return empty();
  const from = new Date(Math.min(...starts) - 6 * 3600000).toISOString(), to = new Date(Math.max(...ends) + 6 * 3600000).toISOString();
  try {
    const shared = await loadReportContextJobs("", from, to, imeis);
    const contexts = [...new Map([...shared, ...jobs].map(job => [job.jobId, job])).values()];
    const positions: GpsPosition[] = [], drives: GpsDrive[] = [];
    let truncated = false;
    // Read each historical device once so a busy tracker cannot consume the whole fleet cap.
    for (const imei of imeis) {
      const gps = await readGpsMovementRange([imei], from, to);
      positions.push(...gps.positions); drives.push(...gps.drives); truncated ||= gps.truncated;
    }
    return summarizeDriverMovement(completed, identities, contexts, positions, drives, truncated);
  } catch { return empty(); }
}
