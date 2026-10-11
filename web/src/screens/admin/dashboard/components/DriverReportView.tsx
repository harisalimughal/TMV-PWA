import { withArrivalDistance } from "../../../../lib/trackerArrival";
import React, { lazy, Suspense, useEffect, useState } from "react";
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { ArrowLeft, ArrowUpRight, CheckCircle2, AlertTriangle, Clock, Banknote, Route, Users, ChevronLeft, ChevronRight, ChevronDown, FileDown, Loader2, RefreshCw } from "lucide-react";
import { DateTime } from "luxon";
import type { DriverReport, DriverReportJob, ReportPage } from "../driverReport.types";
import { DateRangePicker } from "./DateRangePicker";
import "./driverReport.css";
import { DriverRoadAlerts } from "./DriverRoadAlerts";
import { JobRoadChargeSummaries } from "./JobRoadChargeSummaries";
import { manualRoadFee } from "./ManualRoadChargeCard";
import { expectedJobRoadCharge, jobRoadChargeSummary } from "../utils/jobRoadChargeSummary";
const DriverPerformanceCharts = lazy(() => import("./DriverPerformanceCharts").then(module => ({ default: module.DriverPerformanceCharts })));

export const REPORT_TABS = ["jobs", "performance", "payments", "comparison", "tunnels", "congestion"] as const;
export type ReportTab = typeof REPORT_TABS[number];
const labels: Record<ReportTab, string> = { performance: "Performance & Timings", payments: "Payments", comparison: "Comparison", jobs: "Jobs", tunnels: "Tunnel Charges", congestion: "Congestion Charges" };
export const reportMoney = (value: number | null | undefined) => value === null || value === undefined ? "Unknown" : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value / 100);
export const reportTime = (value: number | null | undefined) => value === null || value === undefined ? "Unavailable" : `${Math.floor(Math.round(value) / 60)}h ${Math.round(value) % 60}m`;
const date = (value: string | null | undefined) => value ? DateTime.fromISO(value, { zone: "utc" }).setZone("Europe/London").toFormat("dd LLL yyyy, HH:mm") : "Unknown";
const timingTime = (value: string | null | undefined) => {
  const at = value ? DateTime.fromISO(value, { zone: "utc" }).setZone("Europe/London") : null;
  return at?.isValid ? at.toFormat("HH:mm") : "Not recorded";
};
const jobDate = (value: string | null | undefined) => {
  const at = value ? DateTime.fromISO(value, { zone: "utc" }).setZone("Europe/London") : null;
  return at?.isValid ? at.toFormat("dd LLL yyyy") : "Not recorded";
};
function arrivalProofGap(job: DriverReportJob): number | null {
  const arrival = job.timings?.trackerArrivalAt, proof = job.timings?.proofPhotoAt;
  if (!arrival || !proof) return null;
  const start = DateTime.fromISO(arrival, { zone: "utc" }), end = DateTime.fromISO(proof, { zone: "utc" });
  if (!start.isValid || !end.isValid) return null;
  const minutes = Math.floor(end.diff(start, "minutes").minutes);
  return minutes >= 15 ? minutes : null;
}
function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "good" | "warning" | "bad" | "neutral" }) { return <span className={`rpt-badge rpt-${tone}`}>{children}</span>; }
function Metric({ label, value, caption, detail, children, incomplete, icon: Icon = Banknote }: { label: string; value: string | number; caption?: string; detail?: React.ReactNode; children?: React.ReactNode; incomplete?: boolean; icon?: typeof Banknote }) {
  const length = String(value).length;
  return <div className={`rpt-metric${incomplete ? " rpt-metric-incomplete" : ""}`}><div className="rpt-metric-label"><Icon size={18} /><span>{label}</span></div>{caption && <small className="rpt-metric-caption">{caption}</small>}<strong style={{ fontSize: length > 16 ? 18 : length > 13 ? 21 : length > 11 ? 24 : undefined }}>{value}</strong>{detail && <small>{detail}</small>}{children}</div>;
}
function Pager({ data, name, change }: { data: ReportPage<unknown>; name: string; change: (key: string, page: number) => void }) {
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  return <div className="rpt-pager"><span>{data.total} records · Page {data.page} of {pages}</span><div>
    <button title={`Previous ${name} page`} aria-label={`Previous ${name} page`} disabled={data.page <= 1} onClick={() => change(name, data.page - 1)}><ChevronLeft size={18} /></button>
    <button title={`Next ${name} page`} aria-label={`Next ${name} page`} disabled={data.page >= pages} onClick={() => change(name, data.page + 1)}><ChevronRight size={18} /></button>
  </div></div>;
}
function JobLink({ id, open }: { id: string | null; open: (id: string) => void }) { return id ? <button className="rpt-job-link" onClick={() => open(id)} title={`Open job ${id}`}>{id}<ArrowUpRight size={13} /></button> : <span>Unmatched</span>; }
function Empty({ children }: { children: React.ReactNode }) { return <div className="rpt-empty">{children}</div>; }
function JobRowIdentity({ job }: { job: DriverReportJob }) {
  return <div className="rpt-job-identity"><strong>{job.customer.name}</strong><small className="rpt-job-reference"><time>{jobDate(job.operationalDate)}</time><span aria-hidden="true">|</span><span>{job.jobId}</span></small></div>;
}
function JobPerformanceDetails({ job, gpsLoading = false, gpsUnavailable = false }: { job: DriverReportJob; gpsLoading?: boolean; gpsUnavailable?: boolean }) {
  const { finance, duration, timings, manualDetails: manual } = job;
  const manualAmount = manual ? finance.manualPayments?.collectedPence ?? null : null;
  const outstanding = finance.acceptedPence !== null && manualAmount !== null ? finance.acceptedPence - manualAmount : null;
  const performance: Array<[string, React.ReactNode, React.ReactNode?]> = [
    ["Date", jobDate(job.operationalDate)],
    ["Completed Jobs", job.status === "COMPLETED" ? 1 : 0],
    ["Total Charges", reportMoney(finance.systemCalculatedPence)],
    ["Driver Collected", reportMoney(finance.acceptedPence), finance.adjustmentNote || ""],
    ["Calendar duration", reportTime(duration.bookedMinutes)],
    ["Allocated time", reportTime(duration.allocatedMinutes)],
    ["Working Hours", reportTime(duration.workingMinutes)],
    ["Moving Hours", gpsLoading ? "Loading..." : reportTime(job.movement?.onJob.movingSeconds == null ? null : job.movement.onJob.movingSeconds / 60), gpsLoading ? undefined : job.movement?.onJob.coverage || "Unavailable"],
    ["Overtime", reportTime(duration.overtimeMinutes), reportMoney(finance.overtimePence)],
    ["Arrival Delays", reportTime(duration.arrivalDelayMinutes), duration.arrivalSource],
    ["Review report", job.reviewSent ? "Sent" : "Not sent"],
    ["Reviews Sent / Not Sent", `${job.status === "COMPLETED" && job.reviewSent ? 1 : 0} / ${job.status === "COMPLETED" && !job.reviewSent ? 1 : 0}`],
    ["Helper", manual ? manual.helperName || "None reported" : "Not submitted"],
    ["Manual Helper Hours", manual ? `${manual.helperHours}h` : "Not submitted"],
    ["Reported Time", manual ? reportTime(duration.manualMinutes) : "Not submitted"],
  ];
  const gap = arrivalProofGap(job);
  const milestones = [
    ["Tracker Arrival", timings?.trackerArrivalAt ? withArrivalDistance(timingTime(timings.trackerArrivalAt), timings.trackerArrivalDistanceMeters) : "Not recorded"],
    ["Proof Photo", timingTime(timings?.proofPhotoAt)],
    ["Van Loaded", timingTime(timings?.vanLoadedAt)],
    ["Empty Van", timingTime(timings?.emptyVanAt)],
    ["Customer Signed", timingTime(timings?.customerSignedAt)],
  ];
  const payments: Array<[string, React.ReactNode, string?]> = [
    ["Total Charges", reportMoney(finance.systemCalculatedPence)],
    ["Driver Collected", reportMoney(finance.acceptedPence)],
    ["Adjustment reason", finance.adjustmentNote || "No recorded adjustments"],
    ["Manual Entries", manual ? reportMoney(manualAmount) : "Not submitted", !manual ? "Missing entry" : manualAmount === null ? "Invalid entry" : "Locked submission"],
    ["Outstanding", reportMoney(outstanding), "Driver Collected - Manual Entries"],
    ["Base price", reportMoney(finance.basePence)],
    ["Extra time charges", reportMoney(finance.overtimePence)],
    ["Saved congestion fee", reportMoney(finance.congestionPence)],
    ["Saved tunnel fee", reportMoney(finance.tunnelPence)],
  ];
  const methodTotal = finance.systemPayments.issues.length ? null : Object.values(finance.systemPayments.byMethod).reduce((total, amount) => total + amount, 0);
  return <>
    <section className="rpt-section rpt-job-section rpt-job-section-blue">
      <h3>Performance &amp; Timings</h3><div className="rpt-table-scroll"><table className="rpt-job-detail-table rpt-performance-table" aria-label="Job Performance & Timings">
        <thead><tr><th scope="col">Detail</th><th scope="col">Value</th><th scope="col">Timing</th><th scope="col">Time</th></tr></thead>
        <tbody>{performance.map(([label, value, detail], index) => <tr key={label}>
          <th scope="row">{label}</th><td>{value}{detail && <small className="rpt-block">{detail}</small>}</td>
          <td>{milestones[index]?.[0]}{index === 1 && gap !== null && <small className="rpt-block"><Badge tone="bad">Arrival to proof gap ({gap} min)</Badge></small>}</td><td>{milestones[index]?.[1]}{index === 0 && !timings?.trackerArrivalAt && <small className="rpt-block rpt-unavailable-count">{timings?.trackerUnverifiedReason || "Tracker arrival was not recorded."}</small>}</td>
        </tr>)}</tbody>
      </table></div>
    </section>
    <section className="rpt-section rpt-job-section rpt-job-section-white">
      <h3>Payments</h3><div className="rpt-table-scroll"><table className="rpt-job-detail-table" aria-label="Job Payments">
        <thead><tr><th scope="col">Detail</th><th scope="col">Value</th></tr></thead>
        <tbody>{payments.map(([label, value, detail]) => <tr key={label}><th scope="row">{label}</th><td>{value}{detail && <small className="rpt-block">{detail}</small>}</td></tr>)}</tbody>
      </table></div>
    </section>
    <section className="rpt-section rpt-job-section rpt-job-section-blue"><h3>Financial breakdown</h3><div className="rpt-table-scroll"><table className="rpt-job-detail-table" aria-label="Job financial breakdown">
      <thead><tr><th scope="col">Method</th><th scope="col">Recorded amount</th><th scope="col">Basis</th></tr></thead>
      <tbody>{Object.entries(finance.systemPayments.byMethod).filter(([method]) => method !== "Unknown").map(([method, amount]) => <tr key={method}><th scope="row">{method}</th><td>{reportMoney(amount)}</td><td>{method === "Invoice" ? "Uncollected" : method === "Unknown" ? "Unverified" : "Job-flow receipt"}</td></tr>)}</tbody>
      <tfoot><tr><th scope="row">Total</th><td>{reportMoney(methodTotal)}</td><td>{finance.systemPayments.issues.length ? "Unverified job-flow entries" : "Job flow, including invoices"}</td></tr></tfoot>
    </table></div>{finance.systemPayments.byMethod.Unknown > 0 && <p className="rpt-warning" role="status">Unclassified payment: {reportMoney(finance.systemPayments.byMethod.Unknown)}. Payment method requires verification.</p>}</section>
    {gpsLoading ? <section className="rpt-section" role="status"><Loader2 className="animate-spin inline-block mr-2" size={18} />Loading job road activity...</section>
      : gpsUnavailable ? <section className="rpt-section">Job road activity unavailable.</section> : <JobRoadChargeSummaries job={job} />}
  </>;
}
function SideRow({ name, value, warning }: { name: string; value: React.ReactNode; warning?: boolean }) { return <div className={`rpt-comparison-row ${warning ? "rpt-difference" : ""}`}><span>{name}</span><strong>{value}</strong></div>; }

export function JobComparison({ job, openJob, gpsLoading = false, gpsUnavailable = false }: { job: DriverReportJob; openJob: (id: string) => void; gpsLoading?: boolean; gpsUnavailable?: boolean }) {
  const finance = job.finance, manual = job.manualDetails;
  const hoursDiffer = job.duration.differenceMinutes !== null && Math.abs(job.duration.differenceMinutes) > 0.01;
  const startDiff = !!manual && !!job.actualStart && Date.parse(job.actualStart) !== Date.parse(manual.startTime);
  const finishDiff = !!manual && !!job.actualFinish && Date.parse(job.actualFinish) !== Date.parse(manual.endTime);
  const manualAmount = finance.manualPayments?.collectedPence ?? null;
  const amountDiffers = finance.acceptedPence !== null && manualAmount !== null && finance.acceptedPence !== manualAmount;
  const pendingInvoice = !!manual && finance.acceptedPence !== null && manualAmount !== null && finance.acceptedPence > manualAmount && finance.acceptedPence - manualAmount === finance.manualPayments?.invoicePence;
  const congestion = manualRoadFee(manual, "congestion"), tunnel = manualRoadFee(manual, "tunnel");
  const expectedCongestion = gpsLoading || gpsUnavailable ? null : expectedJobRoadCharge(job, "congestion");
  const expectedTunnel = gpsLoading || gpsUnavailable ? null : expectedJobRoadCharge(job, "tunnel");
  const unverified = finance.systemPayments.collectedPence === null || finance.acceptedPence === null || !!manual && manualAmount === null ||
    expectedCongestion === null || expectedTunnel === null || !!job.alertHistoryTruncated ||
    (["tunnel", "congestion"] as const).some(type => !!jobRoadChargeSummary(job, type)?.unpricedEntries);
  const congestionDiffers = congestion !== null && expectedCongestion !== null && congestion !== expectedCongestion;
  const tunnelDiffers = tunnel !== null && expectedTunnel !== null && tunnel !== expectedTunnel;
  const expectedValue = (amount: number | null) => gpsLoading ? "Loading..." : amount === null ? "Unavailable" : reportMoney(amount);
  const difference = amountDiffers || congestionDiffers || tunnelDiffers || finance.paymentMethodDifferences.length > 0 || hoursDiffer || startDiff || finishDiff;
  const visibleIssues = job.issues.filter(issue => issue !== "Prepayment provenance or overlap with manual collections requires verification." &&
    issue !== "Manual details are missing; outstanding and manual hours are unknown.");
  const fields: Array<{ systemName: string; manualName?: string; system: React.ReactNode; driver: React.ReactNode; warning?: boolean }> = [
    { systemName: "Start", system: date(job.actualStart), driver: date(manual?.startTime), warning: startDiff },
    { systemName: "Finish", system: date(job.actualFinish), driver: date(manual?.endTime), warning: finishDiff },
    { systemName: "Working Time", manualName: "Reported Time", system: reportTime(job.duration.workingMinutes), driver: reportTime(job.duration.manualMinutes), warning: hoursDiffer },
    { systemName: "Driver Collected", manualName: "Total Amount", system: reportMoney(finance.acceptedPence), driver: reportMoney(manualAmount), warning: amountDiffers },
    { systemName: "Congestion Charges (Expected)", manualName: "Congestion Charges (reported)", system: expectedValue(expectedCongestion), driver: reportMoney(congestion), warning: congestionDiffers },
    { systemName: "Tunnel Charges (Expected)", manualName: "Tunnel Charges (reported)", system: expectedValue(expectedTunnel), driver: reportMoney(tunnel), warning: tunnelDiffers },
    { systemName: "Recorded receipts", manualName: "Collected", system: reportMoney(finance.systemPayments.collectedPence), driver: reportMoney(finance.manualPayments?.collectedPence), warning: !!finance.systemVsManualCollectionDifferencePence },
    { systemName: "Helper", system: "Not recorded", driver: manual?.helperName || "None reported" },
    { systemName: "Helper Hours", system: "Not recorded", driver: manual ? `${manual.helperHours}h` : "Unknown" },
    ...Object.keys(finance.systemPayments.byMethod).map(method => ({ systemName: method === "Invoice" ? "Invoice pending" : method,
      system: reportMoney(finance.systemPayments.byMethod[method]), driver: reportMoney(finance.manualPayments?.byMethod[method]),
      warning: finance.paymentMethodDifferences.includes(method) || method === "Invoice" && !!finance.manualPayments && finance.systemPayments.invoicePence !== finance.manualPayments.invoicePence })),
    { systemName: "Submission", system: "System record", driver: date(manual?.submittedAt) }
  ];
  return <article className="rpt-comparison-job"><header><div><JobLink id={job.jobId} open={openJob} /><span className="rpt-muted">{job.customer.name}</span></div>
    <Badge tone={!manual || unverified || pendingInvoice ? "warning" : difference ? "bad" : "good"}>{!manual ? "Pending submission" : unverified ? "Needs verification" : pendingInvoice ? "Invoice pending" : difference ? "Discrepancy" : "Financial match"}</Badge></header>
    <div className="rpt-comparison-sides" style={{ gridTemplateRows: `repeat(${fields.length + 1}, auto)` }}>
      <section style={{ gridRow: `span ${fields.length + 1}` }}><h3>System calculation</h3>{fields.map((field, index) => <SideRow key={index} name={field.systemName} value={field.system} warning={field.warning} />)}</section>
      <section style={{ gridRow: `span ${fields.length + 1}` }}><h3>Driver manual details</h3>{manual ? fields.map((field, index) => <SideRow key={index} name={field.manualName || field.systemName} value={field.driver} warning={field.warning} />) : <Empty>Manual details not submitted</Empty>}</section>
    </div>
    {finance.adjustmentNote && <p className="rpt-note">Adjustment: {finance.adjustmentNote}</p>}
    {job.firstEntryHints && <p className="rpt-note">First-entry hints are incomplete evidence, not confirmed crossing counts or automatic charge proof. Congestion: {date(job.firstEntryHints.congestionAt)}; tunnel: {date(job.firstEntryHints.tunnelAt)}.</p>}
    {visibleIssues.length > 0 && <ul className="rpt-issues">{visibleIssues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>}
  </article>;
}

interface Props {
  report: DriverReport; tab: ReportTab; from: string; to: string; groupBy: "day" | "week" | "month"; refreshing?: boolean;
  onTab: (tab: ReportTab) => void; onDates: (from?: string, to?: string) => void; onGroup: (group: "day" | "week" | "month") => void;
  onPage: (key: string, page: number) => void; onJob: (id: string) => void; onBack: () => void; onRefresh: () => void;
  onExport?: (format: "pdf" | "xlsx") => void; exporting?: "pdf" | "xlsx" | null; exportError?: string;
  driverFilter?: React.ReactNode;
  gpsLoading?: boolean; gpsError?: string; onRetryGps?: () => void;
}
export function DriverReportView({ report, tab, from, to, onTab, onDates, onPage, onJob, onBack, onExport, exporting, exportError, driverFilter, gpsLoading = false, gpsError, onRetryGps }: Props) {
  const s = report.summary;
  const movingValue = gpsLoading ? "Loading..." : s.movingKnownSeconds == null || s.movingKnownSeconds === 0 && s.completedJobs > 0 && s.movingUnknownJobs >= s.completedJobs ? "Unavailable" : reportTime(s.movingKnownSeconds / 60);
  const movingDetail = gpsLoading ? undefined : <>{s.movingUnknownJobs > 0 && <span className="rpt-unavailable-count">{s.movingUnknownJobs} unavailable</span>}{s.movingUnknownJobs > 0 && s.movingPartialJobs > 0 && " · "}{s.movingPartialJobs > 0 && `${s.movingPartialJobs} partial`}</>;
  const roadTotals = s.roadChargeTotals;
  const paymentCards = s.paymentCards;
  const missingManualEntries = paymentCards?.manualEntryMissingJobs ?? paymentCards?.manualEntryUnknownJobs ?? 0;
  const invalidManualEntries = (paymentCards?.manualEntryUnknownJobs ?? 0) - missingManualEntries;
  const manualEntryWarning = [missingManualEntries ? `${missingManualEntries} missing ${missingManualEntries === 1 ? "entry" : "entries"}` : "",
    invalidManualEntries ? `${invalidManualEntries} invalid ${invalidManualEntries === 1 ? "entry" : "entries"}` : ""].filter(Boolean).join(" · ");
  const [selectedJob, setSelectedJob] = useState("");
  const [comparisonScope, setComparisonScope] = useState("all");
  useEffect(() => { setSelectedJob(""); }, [report.driver.initials, report.range.from, report.range.to, report.jobs.page]);
  const currentJobs = report.jobs.items.filter(job => !selectedJob || job.jobId === selectedJob);
  const compared = currentJobs.filter(job => {
    if (comparisonScope === "all") return true;
    if (comparisonScope === "pending") return !job.manualDetails;
    const manualAmount = job.finance.manualPayments?.collectedPence;
    return job.finance.acceptedPence !== null && manualAmount != null && job.finance.acceptedPence !== manualAmount ||
      job.finance.paymentMethodDifferences.length > 0 || job.duration.differenceMinutes !== null && Math.abs(job.duration.differenceMinutes) > 0.01 ||
      (!gpsLoading && !gpsError && report.meta.gpsIncluded !== false && (["tunnel", "congestion"] as const).some(type => { const expected = expectedJobRoadCharge(job, type), reported = manualRoadFee(job.manualDetails, type); return expected !== null && reported !== null && expected !== reported; }));
  });
  const paymentPlot = Object.entries(s.systemPaymentsByMethodPence).filter(([method, amount]) => method !== "Invoice" && method !== "Unknown" && amount > 0).map(([name, amount]) => ({ name, amount: amount / 100 }));
  const colors = ["#1678b5", "#23956b", "#d9a327", "#b85d62"];
  const pageControls = <Pager data={report.jobs} name="jobs" change={onPage} />;
  const totalChargesCard = <Metric label="Total Charges" caption="(Expected)" value={reportMoney(paymentCards?.totalChargesPence)} detail={paymentCards?.totalChargeUnknownJobs ? `${paymentCards.totalChargeUnknownJobs} unknown job totals` : undefined} />;
  const driverCollectionCard = <Metric label="Driver Collected" value={reportMoney(paymentCards?.driverCollectionPence)} detail={paymentCards?.driverCollectionUnknownJobs ? `${paymentCards.driverCollectionUnknownJobs} unknown charged amounts` : undefined}>
    {paymentCards?.adjustmentReasons.length ? <details className="rpt-adjustment-reasons"><summary>Adjustment reasons ({paymentCards.adjustmentReasons.length})</summary><ul>{paymentCards.adjustmentReasons.map(row => <li key={row.jobId}><JobLink id={row.jobId} open={onJob} /><span>{row.reason}</span><small>{reportMoney(row.calculatedPence)} → {reportMoney(row.driverCollectionPence)}</small></li>)}</ul></details> : <small>No recorded adjustments</small>}
  </Metric>;
  const manualEntriesCard = <Metric label="Manual Entries" caption="(reported)" value={reportMoney(paymentCards?.manualEntriesKnownPence ?? paymentCards?.manualEntriesPence)} detail={manualEntryWarning ? <span className="rpt-unavailable-count">{manualEntryWarning}</span> : undefined} />;
  const rangeRoadValue = (type: "tunnel" | "congestion", reported: boolean) => {
    if (reported) {
      const totals = s.manualRoadChargeTotals?.[type];
      const value = totals?.knownJobs ? reportMoney(totals.knownPence) : totals?.missingJobs && !totals.unavailableJobs ? "Not submitted" : "Unavailable";
      return <>{value}{!!totals?.missingJobs && <small className="rpt-block rpt-unavailable-count">{totals.missingJobs} missing {totals.missingJobs === 1 ? "entry" : "entries"}</small>}{!!totals?.unavailableJobs && <small className="rpt-block rpt-unavailable-count">{totals.unavailableJobs} unavailable job charges</small>}</>;
    }
    const totals = s.expectedRoadChargeTotals?.[type];
    const value = gpsLoading ? "Loading..." : gpsError || report.meta.gpsIncluded === false || totals?.pence == null ? "Unavailable" : reportMoney(totals.pence);
    return <>{value}{!gpsLoading && !gpsError && !!totals?.unpricedEntries && <small className="rpt-block rpt-unavailable-count">{totals.unpricedEntries} unavailable charge entries</small>}</>;
  };
  return <div className="rpt-page">
    <header className="rpt-header"><div className="rpt-title"><button title="Back to driver summary" aria-label="Back to driver summary" onClick={onBack}><ArrowLeft size={20} /></button><img src="/tmv-logo.png" alt="The Man Van" /><div><p>Driver Reports &amp; Performance</p><h1>{report.driver.name}</h1><div className="rpt-identity"><span>{report.driver.initials}</span><span>{report.driver.email || "Historical driver"}</span><Badge>{report.driver.hasCurrentAccount ? "Registered driver" : "Archived identity"}</Badge></div></div></div>
      <div className="rpt-export-actions">{driverFilter}{onExport && <button title="Download complete PDF report" aria-label="Download complete PDF report" disabled={!!exporting} onClick={() => onExport("pdf")}>{exporting === "pdf" ? <Loader2 size={18} className="animate-spin" /> : <FileDown size={18} />}<span>PDF</span></button>}
      </div></header>
    {exportError && <div role="alert" className="rpt-warning">{exportError}</div>}
    {exporting && <div role="status" className="rpt-note">Preparing complete {exporting === "pdf" ? "PDF" : "Excel"} report...</div>}
    <div className="rpt-toolbar"><DateRangePicker from={from} to={to} onChange={onDates} /></div>
    {gpsError && <div role="alert" className="rpt-warning"><span>Movement and charge details could not be loaded. {gpsError}</span>{onRetryGps && <button type="button" title="Retry movement and charge details" aria-label="Retry movement and charge details" onClick={onRetryGps}><RefreshCw size={16} />Retry</button>}</div>}
    <nav className="rpt-tabs" aria-label="Report views" role="tablist">{REPORT_TABS.map((key, index) => <button key={key} role="tab" id={`report-tab-${key}`} tabIndex={tab === key ? 0 : -1} aria-selected={tab === key} aria-controls={`report-panel-${key}`} onClick={() => onTab(key)} onKeyDown={event => {
      if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
      event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? REPORT_TABS.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + REPORT_TABS.length) % REPORT_TABS.length;
      onTab(REPORT_TABS[next]); document.getElementById(`report-tab-${REPORT_TABS[next]}`)?.focus();
    }}>{labels[key]}</button>)}</nav>
    <div role="tabpanel" id={`report-panel-${tab}`} aria-labelledby={`report-tab-${tab}`}>
    {s.completedJobs === 0 ? <Empty>No finished job data</Empty> : <>
    {tab === "performance" && <>
      <div className="rpt-metrics"><Metric label="Completed Jobs" value={s.completedJobs} detail={`${s.assignedJobs} assigned · ${s.cancelledJobs} cancelled`} icon={CheckCircle2} />{totalChargesCard}{driverCollectionCard}
        <Metric label="Working Hours" value={reportTime(s.workingMinutesKnown)} detail={s.workingMinutesUnknownJobs ? `${s.workingMinutesUnknownJobs} unknown durations` : "Recorded job boundaries"} icon={Clock} /><Metric label="Moving Hours" value={movingValue} detail={movingDetail} icon={Route} />
        <Metric label="Overtime" value={reportTime(s.overtimeMinutesKnown)} icon={Clock} /><Metric label="Arrival Delays" value={reportTime(s.arrivalDelayMinutesKnown)} icon={Clock} /><Metric label="Reviews Sent / Not Sent" value={`${s.reviewSentJobs} / ${s.reviewNotSentJobs}`} icon={CheckCircle2} /><Metric label="Manual Helper Hours" value={`${s.helperHoursKnown.toFixed(1)}h`} detail={`${s.helpers.length} reported helper names`} icon={Users} /></div>
      <section className="rpt-section"><h2>Job timings</h2><div className="rpt-table-scroll"><table className="rpt-timings-table" aria-label="Job timings"><thead><tr>{["Job", "Date", "Customer", "Tracker Arrival", "Proof Photo", "Van Loaded", "Empty Van", "Customer Signed"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{currentJobs.map(job => { const gap = arrivalProofGap(job); return <React.Fragment key={job.jobId}><tr className={gap !== null ? "rpt-timing-has-gap" : undefined}><td><JobLink id={job.jobId} open={onJob} /></td><td>{jobDate(job.operationalDate)}</td><td>{job.customer.name}</td>{[job.timings?.trackerArrivalAt, job.timings?.proofPhotoAt, job.timings?.vanLoadedAt, job.timings?.emptyVanAt, job.timings?.customerSignedAt].map((at, index) => <td key={index}>{index === 0 && at ? withArrivalDistance(timingTime(at), job.timings?.trackerArrivalDistanceMeters) : timingTime(at)}{index === 0 && !at && <small className="rpt-block rpt-unavailable-count">{job.timings?.trackerUnverifiedReason || "Tracker arrival was not recorded."}</small>}</td>)}</tr>{gap !== null && <tr className="rpt-timing-gap-row"><td colSpan={3} /><td colSpan={2}><Badge tone="bad">Arrival to proof gap ({gap} min)</Badge></td><td colSpan={3} /></tr>}</React.Fragment>; })}</tbody></table></div>{!currentJobs.length && <Empty>No jobs for the selected dates.</Empty>}{pageControls}</section>
      <Suspense fallback={<section className="rpt-section" aria-label="Selected range performance charts"><h2>Daily performance</h2><div role="status" className="rpt-chart flex items-center justify-center gap-2"><Loader2 className="animate-spin" size={20} />Loading charts...</div></section>}><DriverPerformanceCharts trends={report.trends} /></Suspense>
      <section className="rpt-section"><h2>Manual helper hours</h2>{s.helpers.length ? <div className="rpt-table-scroll"><table><thead><tr><th>Helper</th><th>Reported hours</th><th>Jobs</th></tr></thead><tbody>{s.helpers.map(helper => <tr key={helper.name}><td>{helper.name}</td><td>{helper.hours.toFixed(1)}h</td><td>{helper.jobs}</td></tr>)}</tbody></table></div> : <Empty>No helper entries for this range.</Empty>}</section>
    </>}
    {tab === "payments" && <>
      <div className="rpt-metrics rpt-payment-metrics">{totalChargesCard}{driverCollectionCard}{manualEntriesCard}
        <Metric label="Outstanding" value={reportMoney(paymentCards?.outstandingPence)} detail={`Driver Collected - Manual Entries${paymentCards?.manualEntryUnknownJobs ? " · Entries incomplete" : ""}`} />
        <Metric label="Overtime Charges" value={reportMoney(s.overtimeChargesPence)} icon={Clock} incomplete={!!s.overtimeChargesUnknownJobs || !!s.overtimeMinutesUnknownJobs}
          detail={`${s.completedJobs > 0 && s.overtimeMinutesUnknownJobs === s.completedJobs ? "Hours unavailable" : `${reportTime(s.overtimeMinutesKnown)} overtime`}${s.overtimeMinutesUnknownJobs ? ` · ${s.overtimeMinutesUnknownJobs} missing durations` : ""}${s.overtimeChargesUnknownJobs ? ` · ${s.overtimeChargesUnknownJobs} missing charges` : ""}`} /></div>
      <div className="rpt-chart-pair"><section className="rpt-section"><h2>Received payment methods</h2>{paymentPlot.length ? <div className="rpt-chart" role="img" aria-label="Payment method distribution"><ResponsiveContainer><PieChart><Pie data={paymentPlot} dataKey="amount" nameKey="name" innerRadius={65} outerRadius={100} paddingAngle={3} isAnimationActive={false}>{paymentPlot.map((item, index) => <Cell key={item.name} fill={colors[index % colors.length]} />)}</Pie><Tooltip formatter={(value: number) => reportMoney(value * 100)} /></PieChart></ResponsiveContainer></div> : <Empty>No recorded receipts.</Empty>}</section>
        <section className="rpt-section"><h2>Financial breakdown</h2><div className="rpt-table-scroll"><table><thead><tr><th>Method</th><th>Recorded amount</th><th>Basis</th></tr></thead><tbody>{Object.entries(s.systemPaymentsByMethodPence).filter(([method]) => method !== "Unknown").map(([method, amount]) => <tr key={method}><td>{method}</td><td>{reportMoney(amount)}</td><td>{method === "Invoice" ? <Badge tone="warning">Uncollected</Badge> : method === "Unknown" ? <Badge tone="warning">Unverified</Badge> : "Job-flow receipt"}</td></tr>)}</tbody><tfoot><tr><th scope="row">Total</th><td>{reportMoney(paymentCards?.jobFlowTotalPence)}</td><td>{paymentCards?.jobFlowUnknownJobs ? `${paymentCards.jobFlowUnknownJobs} unverified job-flow entries` : "Job flow, including invoices"}</td></tr></tfoot></table></div>{s.systemPaymentsByMethodPence.Unknown > 0 && <p className="rpt-warning" role="status">Unclassified payment: {reportMoney(s.systemPaymentsByMethodPence.Unknown)}. Payment method requires verification.</p>}</section></div>
    </>}
    {tab === "comparison" && <section className="rpt-section"><div className="rpt-comparison-sides rpt-range-totals"><section><h3>System totals · selected range</h3><SideRow name="Expected Amount" value={reportMoney(paymentCards?.totalChargesPence)} /><SideRow name="Driver Collected" value={reportMoney(paymentCards?.driverCollectionPence)} /><SideRow name="Working Time" value={reportTime(s.workingMinutesKnown)} /><SideRow name="Helper Hours" value="Not recorded" /><SideRow name="Tunnel Charges (Expected)" value={rangeRoadValue("tunnel", false)} /><SideRow name="Congestion Charges (Expected)" value={rangeRoadValue("congestion", false)} /></section><section><h3>Manual totals · selected range</h3><SideRow name="Reported Amount" value={reportMoney(paymentCards?.manualEntriesKnownPence ?? paymentCards?.manualEntriesPence)} /><SideRow name="Reported Time" value={reportTime(s.manualMinutesKnown)} /><SideRow name="Helper Hours" value={`${s.helperHoursKnown.toFixed(1)}h`} /><SideRow name="Tunnel Charges (reported)" value={rangeRoadValue("tunnel", true)} /><SideRow name="Congestion Charges (reported)" value={rangeRoadValue("congestion", true)} /></section></div>
      <div className="rpt-section-heading rpt-comparison-heading"><h2>System / Manual comparison</h2><div className="rpt-filter-row"><label>Jobs<select aria-label="Comparison jobs" value={selectedJob} onChange={event => setSelectedJob(event.target.value)}><option value="">All jobs on this page</option>{report.jobs.items.map(job => <option key={job.jobId} value={job.jobId}>{job.jobId}</option>)}</select></label><label>Status<select aria-label="Comparison status" value={comparisonScope} onChange={event => setComparisonScope(event.target.value)}><option value="all">All statuses</option><option value="differences">Discrepancies</option><option value="pending">Pending submissions</option></select></label></div></div>
      {compared.length ? compared.map((job, index) => <details className="rpt-job" key={job.jobId} open={index === 0}><summary><ChevronDown size={16} className="rpt-expand-indicator" aria-hidden="true" /><JobRowIdentity job={job} /><div><Badge tone={!job.manualDetails ? "warning" : "neutral"}>{job.manualDetails ? "Submitted" : "Pending"}</Badge><span>{reportMoney(job.finance.acceptedPence)} / {reportMoney(job.finance.manualPayments?.collectedPence)}</span></div></summary><JobComparison job={job} openJob={onJob} gpsLoading={gpsLoading} gpsUnavailable={!!gpsError || report.meta.gpsIncluded === false && !gpsLoading} /></details>) : <Empty>No matching comparisons on this page.</Empty>}{pageControls}</section>}
    {tab === "jobs" && <section className="rpt-section"><h2>Selected range totals</h2><div className="rpt-metrics"><Metric label="Total Jobs" value={s.assignedJobs} detail={`${s.completedJobs} completed · ${s.cancelledJobs} cancelled`} icon={CheckCircle2} />{totalChargesCard}{driverCollectionCard}{manualEntriesCard}<Metric label="Tunnel Charges" value={reportMoney(roadTotals?.tunnelPence)} detail={roadTotals?.tunnelUnknownJobs ? <span className="rpt-unavailable-count">{roadTotals.tunnelUnknownJobs} unavailable job charges</span> : "Saved completed-job charges"} /><Metric label="Congestion Charges" value={reportMoney(roadTotals?.congestionPence)} detail={roadTotals?.congestionUnknownJobs ? <span className="rpt-unavailable-count">{roadTotals.congestionUnknownJobs} unavailable job charges</span> : "Saved completed-job charges"} /><Metric label="Working Time" value={reportTime(s.workingMinutesKnown)} detail={s.workingMinutesUnknownJobs ? `${s.workingMinutesUnknownJobs} unavailable durations` : undefined} icon={Clock} /><Metric label="Moving Time" value={movingValue} detail={movingDetail} icon={Route} /><Metric label="Overtime" value={reportTime(s.overtimeMinutesKnown)} icon={Clock} /><Metric label="Reviews Sent / Not Sent" value={`${s.reviewSentJobs} / ${s.reviewNotSentJobs}`} icon={CheckCircle2} /></div><h2>Job history</h2>{currentJobs.length ? currentJobs.map(job => <details className="rpt-job" key={job.jobId}><summary><ChevronDown size={16} className="rpt-expand-indicator" aria-hidden="true" /><JobRowIdentity job={job} /><div><Badge tone={job.status === "COMPLETED" ? "good" : "neutral"}>{job.status}</Badge><strong>{reportMoney(job.finance.expectedPence)}</strong></div></summary><div className="rpt-job-body"><div className="rpt-job-heading"><span>{job.pickup} → {job.dropoff}</span><JobLink id={job.jobId} open={onJob} /></div>
      <section className="rpt-section rpt-job-section rpt-job-section-white"><h3>Customer &amp; schedule</h3><div className="rpt-job-facts"><SideRow name="Customer" value={job.customer.name} /><SideRow name="Phone" value={job.customer.phone || "Not recorded"} /><SideRow name="Email" value={job.customer.email || "Not recorded"} /></div>
        <div className="rpt-table-scroll"><table className="rpt-job-detail-table rpt-schedule-table" aria-label="Scheduled and actual timings"><thead><tr><th scope="col">Timing</th><th scope="col">Scheduled</th><th scope="col">Actual</th></tr></thead><tbody><tr><th scope="row">Start</th><td>{date(job.bookedStart)}</td><td>{date(job.actualStart)}</td></tr><tr><th scope="row">Finish</th><td>{date(job.bookedFinish)}</td><td>{date(job.actualFinish)}</td></tr></tbody></table></div>
      </section>
      <JobPerformanceDetails job={job} gpsLoading={gpsLoading} gpsUnavailable={!!gpsError || report.meta.gpsIncluded === false && !gpsLoading} />
      <details className="rpt-chart-data rpt-job-section rpt-job-section-white"><summary>System / Manual comparison</summary><JobComparison job={job} openJob={onJob} gpsLoading={gpsLoading} gpsUnavailable={!!gpsError || report.meta.gpsIncluded === false && !gpsLoading} /></details></div></details>) : <Empty>No jobs for this range.</Empty>}{pageControls}</section>}
    {(tab === "tunnels" || tab === "congestion") && gpsLoading && <div role="status" className="rpt-section flex min-h-[240px] items-center justify-center gap-2"><Loader2 className="animate-spin" size={20} />Loading movement and charge details...</div>}
    {(tab === "tunnels" || tab === "congestion") && !gpsLoading && !gpsError && report.roadAlerts && <DriverRoadAlerts report={report} type={tab === "tunnels" ? "tunnel" : "congestion"} onJob={onJob} onPage={onPage} />}
    {(tab === "tunnels" || tab === "congestion") && !gpsLoading && (gpsError || !report.roadAlerts) && <Empty>Alert history unavailable.</Empty>}
    </>}
    </div>
  </div>;
}
