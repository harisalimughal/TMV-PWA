import type { DriverReportJob } from "../driverReport.types";

export function jobRoadChargeSummary(job: DriverReportJob, type: "tunnel" | "congestion") {
  const rows = job.roadAlerts?.filter(row => row.jobId === job.jobId && row.type === type);
  if (!rows) return undefined;
  return { entries: rows.length, chargeableEntries: rows.filter(row => row.chargeable).length,
    estimatedKnownPence: rows.reduce((sum, row) => sum + (row.estimatedPence ?? 0), 0),
    unpricedEntries: rows.filter(row => row.estimatedPence === null).length };
}
export function expectedJobRoadCharge(job: DriverReportJob, type: "tunnel" | "congestion"): number | null {
  const summary = jobRoadChargeSummary(job, type);
  return !summary || summary.entries > 0 && summary.unpricedEntries === summary.entries ? null : summary.estimatedKnownPence;
}
