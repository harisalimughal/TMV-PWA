import type { DriverReportJob } from "../driverReport.types";
import { RoadChargeMetricItems } from "./DriverRoadAlerts";
import { ManualRoadChargeCard, manualRoadFee } from "./ManualRoadChargeCard";
import { jobRoadChargeSummary } from "../utils/jobRoadChargeSummary";

export function JobRoadChargeSummaries({ job }: { job: DriverReportJob }) {
  return <div className="rpt-job-road-summary">{(["tunnel", "congestion"] as const).map(type => {
    const summary = jobRoadChargeSummary(job, type);
    const manualAmount = manualRoadFee(job.manualDetails, type);
    return <section className={`rpt-section rpt-job-section ${type === "tunnel" ? "rpt-job-section-white" : "rpt-job-section-blue"}`} key={type} aria-label={`${type === "tunnel" ? "Tunnel" : "Congestion"} charges for ${job.jobId}`}>
      <h3>{type === "tunnel" ? "Tunnel Charges" : "Congestion Charges"}</h3>
      <div className="rpt-metrics"><RoadChargeMetricItems summary={summary} type={type} /><ManualRoadChargeCard totals={{ knownPence: manualAmount ?? 0,
        knownJobs: manualAmount === null ? 0 : 1, missingJobs: job.manualDetails ? 0 : 1,
        unavailableJobs: job.manualDetails && manualAmount === null ? 1 : 0 }} /></div>
    </section>;
  })}{job.alertHistoryTruncated && <p className="rpt-muted">Showing returned job-linked GPSLive history.</p>}</div>;
}
