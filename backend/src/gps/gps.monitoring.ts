import { getJob, listJobs } from "../db/jobs.repo";
import { getSetting } from "../db/settings.repo";
import { associateGpsEvent } from "./gps.association";
import { readGpsRange } from "./gps.repo";
import { reconstructGpsVisits } from "./gps.visits";
import { parsePortalRules, verifyPortalTraversals } from "./gps.portals";
import { gpsMovement } from "./gps.movement";

export async function gpsJobMonitoring(jobId: string) {
  const job = await getJob(jobId);
  if (!job) return null;
  const now = new Date().toISOString();
  const imeis = [...new Set([job.gpsliveImei, ...(job.gpsDeviceHistory ?? []).map(row => row.imei)].filter((id): id is string => !!id))];
  const start = Date.parse(job.onMyWayAt || job.actualStart || job.bookedStart);
  const end = Date.parse(job.actualFinish || now);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return { jobId, coverage: "unavailable", reason: "Recorded job time range is invalid." };
  const from = new Date(Math.max(start - 6 * 3_600_000, end - 7 * 86400_000)).toISOString();
  const to = new Date(end + 1000).toISOString();
  const data = await readGpsRange(imeis, from, to);
  const jobs = imeis.length ? [...new Map((await Promise.all(imeis.map(imei => listJobs({ gpsliveImei: imei })))).flat().map(row => [row.jobId, row])).values()] : [job];
  const events = data.events.map(event => ({ ...event, association: associateGpsEvent(event, jobs, now) }));
  const zones = data.runs.find(run => run.zoneSnapshot.length)?.zoneSnapshot ?? [];
  let visits = reconstructGpsVisits(data.events, data.positions, zones, jobs, now);
  let portalIssue: string | null = null;
  try {
    const portals = parsePortalRules(await getSetting("GPS_TUNNEL_PORTAL_RULES", "[]"));
    visits = verifyPortalTraversals(visits, data.positions, zones, portals, jobs, now);
    if (!portals.length) portalIssue = "Tunnel portal geometry is not configured; geofence passages require verification.";
  } catch { portalIssue = "Tunnel portal configuration is invalid; no physical traversal verified."; }
  const linkedVisits = visits.filter(visit => visit.association.jobId === jobId || visit.association.candidateJobIds.includes(jobId) ||
    (Date.parse(visit.firstInsideAt) <= end && (!visit.exitAt || Date.parse(visit.exitAt) >= start)));
  const linkedEvents = events.filter(event => event.association.jobId === jobId || event.association.candidateJobIds.includes(jobId));
  const scopedPositions = data.positions.filter(p => associateGpsEvent(p, jobs, now).jobId === jobId);
  const scopedDrives = data.drives.filter(drive => associateGpsEvent({ imei: drive.imei, occurredAt: drive.start, timeSource: "provider-assumed-utc" }, jobs, now).jobId === jobId &&
    associateGpsEvent({ imei: drive.imei, occurredAt: new Date(Date.parse(drive.end) - 1).toISOString(), timeSource: "provider-assumed-utc" }, jobs, now).jobId === jobId);
  const knownBoundaries = job.actualStart && job.actualFinish && Date.parse(job.actualFinish) >= Date.parse(job.actualStart) && job.actualStartSource !== "completion-fallback" &&
    !["admin-manual", "completion-fallback"].includes(job.actualFinishSource ?? "");
  const onJob = job.actualStart ? gpsMovement(scopedPositions, scopedDrives, job.actualStart, job.actualFinish || now) : null;
  const approach = job.onMyWayAt ? gpsMovement(scopedPositions, scopedDrives, job.onMyWayAt, job.actualStart || job.actualFinish || now) : null;
  const present = data.events.length > 0 || data.positions.length > 0;
  return { jobId, from, to, imeis, events: linkedEvents, visits: linkedVisits,
    contextEvents: events.filter(event => !event.association.jobId && event.occurredAt && Date.parse(event.occurredAt) >= start && Date.parse(event.occurredAt) <= end),
    proofPositions: data.positions.filter(point => linkedVisits.some(visit => visit.proofPositionIds?.includes(point._id))),
    coverage: data.truncated || data.runs.some(run => run.status !== "queried") ? "partial" : present ? "sampled" : "unavailable", providerCoverage: "unknown",
    truncated: data.truncated, geometrySource: data.runs.find(run => run.zoneSnapshot.length)?._id ?? null, portalIssue,
    counts: { observedEntries: linkedVisits.filter(v => v.entryObserved && v.association.jobId === jobId).length,
      congestionEntries: linkedVisits.filter(v => v.scheme === "congestion" && v.entryObserved && v.association.jobId === jobId).length,
      tunnelGeofencePassages: linkedVisits.filter(v => v.scheme !== "congestion" && v.status === "observed-pair" && v.association.jobId === jobId).length,
      confirmedTunnelCrossings: present ? linkedVisits.filter(v => v.physicalCrossingConfirmed && v.association.jobId === jobId).length : null,
      unresolvedVisits: linkedVisits.filter(v => v.issues.length || v.association.jobId !== jobId).length },
    workingSeconds: knownBoundaries ? (Date.parse(job.actualFinish) - Date.parse(job.actualStart)) / 1000 : null,
    approach, onJob, provisional: !job.actualFinish,
    arrival: { trackerAt: job.trackerArrivalAt ?? null, source: job.trackerArrivalSource ?? "legacy-or-unverified",
      reportAt: job.trackerLastSeenAt ?? null, proofAcceptedAt: job.actualStart || null,
      reason: job.trackerUnverifiedReason ?? null, radiusMeters: 300, maxFreshAgeSeconds: 120 },
    syncRuns: data.runs.map(({ zoneSnapshot: _zones, ...run }) => run)
  };
}
