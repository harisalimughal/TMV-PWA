import type { DriverReport, DriverReportJob } from "../driverReport.types";
import { DriverRoadAlerts } from "./DriverRoadAlerts";

export function DriverJobRoadActivity({ job, report, onJob }: { job: DriverReportJob; report: DriverReport; onJob: (id: string) => void }) {
  if (!job.roadAlerts) return <section className="rpt-section"><h3>Zone activity</h3><p className="rpt-muted">Job-level alert history unavailable.</p></section>;
  return <div className="rpt-job-road">{(["congestion", "tunnel"] as const).map(type => {
    const rows = job.roadAlerts!.filter(row => row.type === type && row.jobId === job.jobId);
    const scoped: DriverReport = { ...report, alertHistoryTruncated: job.alertHistoryTruncated,
      roadAlerts: { items: rows, total: rows.length, page: 1, pageSize: Math.max(1, rows.length) },
      roadAlertSummary: { entries: rows.length, chargeableEntries: rows.filter(row => row.chargeable).length,
        estimatedKnownPence: rows.reduce((sum, row) => sum + (row.estimatedPence ?? 0), 0), unpricedEntries: rows.filter(row => row.estimatedPence === null).length } };
    return <section key={type} aria-label={`${type === "tunnel" ? "Tunnel" : "Congestion"} activity for ${job.jobId}`}>
      <DriverRoadAlerts report={scoped} type={type} onJob={onJob} onPage={() => {}} embedded />
    </section>;
  })}{job.alertHistoryTruncated && <p className="rpt-muted">Showing returned GPSLive history for the selected dates.</p>}</div>;
}
