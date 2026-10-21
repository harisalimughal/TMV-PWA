import type { DriverReport } from "../driverReport.types";

/** Add tracker evidence without replacing the independently loaded job and financial records. */
export function mergeReportGps(core: DriverReport, tracker?: DriverReport): DriverReport {
  if (!tracker || tracker.driver.initials !== core.driver.initials || tracker.range.from !== core.range.from || tracker.range.to !== core.range.to) return core;
  const jobs = new Map(tracker.jobs.items.map(job => [job.jobId, job]));
  const trends = new Map(tracker.trends.map(row => [row.period, row]));
  const withMovement = tracker.meta.movementIncluded !== false;
  const movement = (row: DriverReport["summary"]) => ({ movingKnownSeconds: row.movingKnownSeconds, movingUnknownJobs: row.movingUnknownJobs, movingPartialJobs: row.movingPartialJobs, arrivalDelayMinutesKnown: row.arrivalDelayMinutesKnown });
  return {
    ...core,
    summary: { ...core.summary, ...(withMovement ? movement(tracker.summary) : {}), expectedRoadChargeTotals: tracker.summary.expectedRoadChargeTotals },
    trends: withMovement ? core.trends.map(row => trends.has(row.period) ? { ...row, ...movement(trends.get(row.period)!) } : row) : core.trends,
    jobs: { ...core.jobs, items: core.jobs.items.map(job => {
      const gps = jobs.get(job.jobId);
      return gps ? { ...job, movement: withMovement ? gps.movement : job.movement, roadCharges: gps.roadCharges, roadAlerts: gps.roadAlerts, alertHistoryTruncated: gps.alertHistoryTruncated,
        duration: withMovement ? { ...job.duration, arrivalDelayMinutes: gps.duration.arrivalDelayMinutes, arrivalSource: gps.duration.arrivalSource } : job.duration,
        timings: withMovement && gps.timings ? { proofPhotoAt: null, vanLoadedAt: null, emptyVanAt: null, customerSignedAt: null, ...job.timings,
          trackerArrivalAt: gps.timings.trackerArrivalAt, trackerArrivalDistanceMeters: gps.timings.trackerArrivalDistanceMeters, trackerUnverifiedReason: gps.timings.trackerUnverifiedReason,
          trackerDropoffArrivalAt: gps.timings.trackerDropoffArrivalAt, trackerDropoffDepartureAt: gps.timings.trackerDropoffDepartureAt, trackerDropoffUnverifiedReason: gps.timings.trackerDropoffUnverifiedReason } : job.timings
      } : job;
    }) },
    events: tracker.events, visits: tracker.visits, charges: tracker.charges,
    roadAlerts: tracker.roadAlerts, roadAlertSummary: tracker.roadAlertSummary,
    activitySummary: tracker.activitySummary, alertHistoryTruncated: tracker.alertHistoryTruncated,
    gpsSummary: tracker.gpsSummary, contextJobs: tracker.contextJobs,
    meta: { ...core.meta, gpsIncluded: tracker.meta.gpsIncluded, movementIncluded: tracker.meta.movementIncluded }
  };
}
