import type { DriverReportJob } from "../driverReport.types";
import { RoadChargeMetricItems } from "./DriverRoadAlerts";

export function JobRoadChargeSummaries({ job }: { job: DriverReportJob }) {
  return <div className="rpt-job-road-summary">{(["tunnel", "congestion"] as const).map(type => {
    const rows = job.roadAlerts?.filter(row => row.jobId === job.jobId && row.type === type);
    const summary = rows ? { entries: rows.length, chargeableEntries: rows.filter(row => row.chargeable).length,
      estimatedKnownPence: rows.reduce((sum, row) => sum + (row.estimatedPence ?? 0), 0),
      unpricedEntries: rows.filter(row => row.estimatedPence === null).length } : undefined;
    return <section className={`rpt-section rpt-job-section ${type === "tunnel" ? "rpt-job-section-white" : "rpt-job-section-blue"}`} key={type} aria-label={`${type === "tunnel" ? "Tunnel" : "Congestion"} charges for ${job.jobId}`}>
      <h3>{type === "tunnel" ? "Tunnel Charges" : "Congestion Charges"}</h3>
      <div className="rpt-metrics"><RoadChargeMetricItems summary={summary} type={type} /></div>
    </section>;
  })}{job.alertHistoryTruncated && <p className="rpt-muted">Showing returned job-linked GPSLive history.</p>}</div>;
}
