import { withArrivalDistance } from "../../../../lib/trackerArrival";
import React, { lazy, Suspense, useEffect, useState } from "react";
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { ArrowLeft, ArrowUpRight, CheckCircle2, AlertTriangle, Clock, Banknote, Route, Users, ChevronLeft, ChevronRight, ChevronDown, FileDown, Loader2, RefreshCw } from "lucide-react";
import { DateTime } from "luxon";
import type { DriverReport, DriverReportJob, ReportPage, ReportExtraCharge } from "../driverReport.types";
import { DateRangePicker } from "./DateRangePicker";
import "./driverReport.css";
import { DriverRoadAlerts } from "./DriverRoadAlerts";
import { JobRoadChargeSummaries } from "./JobRoadChargeSummaries";
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
function FinancialBreakdown({ methods, base, overtime, congestion, tunnel, extras = [], invoiceJobs, total, issues = [], name, scheduledMinutes, issueJobs = [], onJob }: {
  methods: Record<string, number>; base: number | null | undefined; overtime: number | null | undefined;
  congestion: number | null | undefined; tunnel: number | null | undefined; extras?: ReportExtraCharge[];
  invoiceJobs: number; total: number; issues?: string[]; name: string; scheduledMinutes?: number | null; issueJobs?: string[]; onJob?: (id: string) => void;
}) {
  const chargeItems = [...extras];
  for (const [label, amountPence] of [["London Congestion charge", congestion], ["Tunnel Charges", tunnel]] as const) {
    if (amountPence && !chargeItems.some(charge => charge.label === label)) chargeItems.push({ label, amountPence, basis: "Included in job total" });
  }
  const chargeName = (label: string) => label === "London Congestion charge" ? "Congestion" : label === "Tunnel Charges" ? "Tunnel" : label;
  return <><div className="rpt-table-scroll"><table className="rpt-job-detail-table" aria-label={name}>
    <thead><tr><th scope="col">Detail</th><th scope="col">Recorded amount</th><th scope="col">Basis</th></tr></thead>
    <tbody>
      {scheduledMinutes !== undefined && <tr><th scope="row">Scheduled Hours</th><td>{reportTime(scheduledMinutes)}</td><td>Calendar duration</td></tr>}
      <tr><th scope="row">Base price</th><td>{reportMoney(base)}</td><td>Booking</td></tr>
      <tr><th scope="row">Overtime</th><td>{reportMoney(overtime)}</td><td>Included in job total</td></tr>
      {chargeItems.length ? chargeItems.map((charge, index) => <tr key={charge.label}>
        {index === 0 && <th scope="rowgroup" rowSpan={chargeItems.length}>Extra Charges</th>}
        <td title={charge.amountPence === null ? charge.basis : undefined}>{charge.amountPence === null ? "-" : reportMoney(charge.amountPence)}</td>
        <td>{chargeName(charge.label)}</td>
      </tr>) : <tr><th scope="row">Extra Charges</th><td>-</td><td>-</td></tr>}
      {Object.entries(methods).filter(([method]) => method !== "Invoice" && method !== "Unknown").map(([method, amount]) => <tr key={method}><th scope="row">{method}</th><td>{reportMoney(amount)}</td><td>Job-flow receipt</td></tr>)}
      <tr><th scope="row">Invoice</th><td>{invoiceJobs ? reportMoney(methods.Invoice ?? 0) : "-"}</td><td>{invoiceJobs ? <Badge tone="warning">{invoiceJobs > 1 ? `Invoice jobs (${invoiceJobs})` : "Invoice job"}</Badge> : "-"}</td></tr>
    </tbody>
    <tfoot><tr><th scope="row">Total</th><td>{reportMoney(total)}</td><td>Payment methods including invoices</td></tr></tfoot>
  </table></div>{methods.Unknown > 0 && <p className="rpt-warning" role="status">Unclassified payment: {reportMoney(methods.Unknown)}. Payment method requires verification.</p>}{issues.length > 0 && <div className="rpt-warning" role="status"><span>{issues.join(" ")}</span>{onJob && issueJobs.map(id => <JobLink key={id} id={id} open={onJob} />)}</div>}</>;
}
function JobFinancialBreakdown({ job }: { job: DriverReportJob }) {
  const finance = job.finance;
  return <FinancialBreakdown name="Job financial breakdown" methods={finance.systemPayments.byMethod} base={finance.basePence}
    overtime={finance.overtimePence} congestion={finance.congestionPence} tunnel={finance.tunnelPence} extras={finance.extraCharges} scheduledMinutes={job.duration.bookedMinutes}
    invoiceJobs={finance.invoiceJob || finance.systemPayments.invoicePence > 0 ? 1 : 0}
    total={Object.values(finance.systemPayments.byMethod).reduce((sum, amount) => sum + amount, 0)} issues={finance.systemPayments.issues} />;
}
function JobPerformanceDetails({ job, gpsLoading = false, gpsUnavailable = false, showRoadCharges = true, showPayments = true }: { job: DriverReportJob; gpsLoading?: boolean; gpsUnavailable?: boolean; showRoadCharges?: boolean; showPayments?: boolean }) {
  const { finance, duration, timings, manualDetails: manual } = job;
  const manualAmount = manual ? finance.manualPayments?.collectedPence ?? null : null;
  const outstanding = finance.acceptedPence !== null && manualAmount !== null ? finance.acceptedPence - manualAmount : null;
  const performance: Array<[string, React.ReactNode, React.ReactNode?]> = [
    ["Date", jobDate(job.operationalDate)],
    ["Completed Jobs", job.status === "COMPLETED" ? 1 : 0],
    ["Scheduled Hours", reportTime(duration.bookedMinutes)],
    ["Allocated time", reportTime(duration.allocatedMinutes)],
    ["Working Hours", reportTime(duration.workingMinutes)],
    ["Moving Hours", gpsLoading ? "Loading..." : reportTime(job.movement?.onJob.movingSeconds == null ? null : job.movement.onJob.movingSeconds / 60), gpsLoading ? undefined : job.movement?.onJob.coverage || "Unavailable"],
    ["Overtime", reportTime(duration.overtimeMinutes)],
    ["Arrival Delays", reportTime(duration.arrivalDelayMinutes), duration.arrivalSource],
    ["Review report", job.reviewSent ? "Sent" : "Not sent"],
    ["Reviews Sent / Not Sent", `${job.status === "COMPLETED" && job.reviewSent ? 1 : 0} / ${job.status === "COMPLETED" && !job.reviewSent ? 1 : 0}`],
    ["Helper", manual ? manual.helperName || "None reported" : "Not submitted"],
    ["Manual Helper Hours", manual ? `${manual.helperHours}h` : "Not submitted"],
    ["Reported Hours", manual ? reportTime(duration.manualMinutes) : "Not submitted"],
  ];
  const gap = arrivalProofGap(job);
  const milestones = [
    ["On the Way", timingTime(timings?.onMyWayAt)],
    ["Tracker Pick-up arrival", timings?.trackerArrivalAt ? withArrivalDistance(timingTime(timings.trackerArrivalAt), timings.trackerArrivalDistanceMeters) : "Not recorded"],
    ["Proof Photo", timingTime(timings?.proofPhotoAt)],
    ["Van Loaded", timingTime(timings?.vanLoadedAt)],
    ["Tracker Drop-off arrival", timingTime(timings?.trackerDropoffArrivalAt)],
    ["Empty Van", timingTime(timings?.emptyVanAt)],
    ["Tracker Drop-off departure", timingTime(timings?.trackerDropoffDepartureAt)],
    ["Customer Signed", timingTime(timings?.customerSignedAt)],
  ];
  const payments: Array<[string, React.ReactNode, string?]> = [
    ["Scheduled Hours", reportTime(duration.bookedMinutes)],
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
  return <>
    <section className="rpt-section rpt-job-section rpt-job-section-blue">
      <h3>Performance &amp; Timings</h3><div className="rpt-table-scroll"><table className="rpt-job-detail-table rpt-performance-table" aria-label="Job Performance & Timings">
        <thead><tr><th scope="col">Detail</th><th scope="col">Value</th><th scope="col">Timing</th><th scope="col">Time</th></tr></thead>
        <tbody>{performance.map(([label, value, detail], index) => <tr key={label}>
          <th scope="row">{label}</th><td>{value}{detail && <small className="rpt-block">{detail}</small>}</td>
          <td>{milestones[index]?.[0]}{milestones[index]?.[0] === "Proof Photo" && gap !== null && <small className="rpt-block"><Badge tone="bad">Arrival to proof gap ({gap} min)</Badge></small>}</td><td>{milestones[index]?.[1]}{milestones[index]?.[0] === "Tracker Pick-up arrival" && !timings?.trackerArrivalAt && <small className="rpt-block rpt-unavailable-count">{timings?.trackerUnverifiedReason || "Tracker arrival was not recorded."}</small>}</td>
        </tr>)}</tbody>
      </table></div>
    </section>
    {showPayments && <><section className="rpt-section rpt-job-section rpt-job-section-white">
      <h3>Payments</h3><div className="rpt-table-scroll"><table className="rpt-job-detail-table" aria-label="Job Payments">
        <thead><tr><th scope="col">Detail</th><th scope="col">Value</th></tr></thead>
        <tbody>{payments.map(([label, value, detail]) => <tr key={label}><th scope="row">{label}</th><td>{value}{detail && <small className="rpt-block">{detail}</small>}</td></tr>)}</tbody>
      </table></div>
    </section>
    <section className="rpt-section rpt-job-section rpt-job-section-blue"><h3>Financial breakdown</h3><JobFinancialBreakdown job={job} /></section></>}
    {showRoadCharges && (gpsLoading ? <section className="rpt-section" role="status"><Loader2 className="animate-spin inline-block mr-2" size={18} />Loading job road activity...</section>
      : gpsUnavailable ? <section className="rpt-section">Job road activity unavailable.</section> : <JobRoadChargeSummaries job={job} />)}
  </>;
}
function SideRow({ name, value, warning }: { name: string; value: React.ReactNode; warning?: boolean }) { return <div aria-hidden={!name || undefined} className={`rpt-comparison-row ${!name ? "rpt-comparison-placeholder" : ""} ${warning ? "rpt-difference" : ""}`}><span>{name}</span><strong>{value}</strong></div>; }
function hasHoursDiscrepancy(job: DriverReportJob): boolean {
  const { workingMinutes, manualMinutes } = job.duration;
  return !!job.manualDetails && workingMinutes !== null && manualMinutes !== null && manualMinutes - workingMinutes >= 30;
}

export function JobComparison({ job, openJob, gpsLoading = false, gpsUnavailable = false }: { job: DriverReportJob; openJob: (id: string) => void; gpsLoading?: boolean; gpsUnavailable?: boolean }) {
  const finance = job.finance, manual = job.manualDetails;
  const hoursDiffer = hasHoursDiscrepancy(job);
  const driverAmount = finance.acceptedPence;
  const pendingInvoice = finance.systemPayments.invoicePence > 0;
  const unverified = job.duration.workingMinutes === null || job.duration.manualMinutes === null;
  const visibleIssues = job.issues.filter(issue => issue !== "Prepayment provenance or overlap with manual collections requires verification." &&
    issue !== "Manual details are missing; outstanding and manual hours are unknown.");
  const fields: Array<{ systemName: string; manualName?: string; system: React.ReactNode; driver: React.ReactNode; warning?: boolean }> = [
    { systemName: "Expected Amount", manualName: "Driver Collected", system: reportMoney(finance.systemCalculatedPence), driver: <>{reportMoney(driverAmount)}{finance.adjustmentNote && <details className="rpt-chart-data"><summary>Adjustment reason</summary><p>{finance.adjustmentNote}</p></details>}</> },
    { systemName: "Scheduled Hours", manualName: "", system: reportTime(job.duration.bookedMinutes), driver: null },
    { systemName: "Working Hours", manualName: "Reported Hours", system: reportTime(job.duration.workingMinutes), driver: reportTime(job.duration.manualMinutes), warning: hoursDiffer },
    { systemName: "", manualName: "Helper Hours", system: null, driver: manual ? reportTime(manual.helperHours * 60) : "Not submitted" },
    ...Object.keys(finance.systemPayments.byMethod).filter(method => method !== "Unknown" || finance.systemPayments.byMethod.Unknown > 0).map(method => ({ systemName: "", manualName: method === "Invoice" ? "Invoice pending" : method,
      system: null, driver: reportMoney(finance.systemPayments.byMethod[method]) })),
    { systemName: "", manualName: "Submission", system: null, driver: date(manual?.submittedAt) }
  ];
  return <article className="rpt-comparison-job"><header><div><JobLink id={job.jobId} open={openJob} /><span className="rpt-muted">{job.customer.name}</span></div>
    <Badge tone={!manual ? "warning" : hoursDiffer ? "bad" : unverified || pendingInvoice ? "warning" : "good"}>{!manual ? "Pending submission" : hoursDiffer ? "Discrepancy" : unverified ? "Needs verification" : pendingInvoice ? "Invoice pending" : "Hours match"}</Badge></header>
    <div className="rpt-comparison-sides" style={{ gridTemplateRows: `repeat(${fields.length + 1}, auto)` }}>
      <section style={{ gridRow: `span ${fields.length + 1}` }}><h3>System calculation</h3>{fields.map((field, index) => <SideRow key={index} name={field.systemName} value={field.system} warning={field.warning} />)}</section>
      <section style={{ gridRow: `span ${fields.length + 1}` }}><h3>Driver manual details</h3>{fields.map((field, index) => <SideRow key={index} name={field.manualName ?? field.systemName} value={field.driver} warning={field.warning} />)}</section>
    </div>
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
  const scheduledValue = s.scheduledMinutesUnknownJobs === s.completedJobs && s.completedJobs > 0 ? "Unavailable" : reportTime(s.scheduledMinutesKnown);
  const scheduledHoursCard = <Metric label="Scheduled Hours" value={scheduledValue} detail={s.scheduledMinutesUnknownJobs ? `${s.scheduledMinutesUnknownJobs} unavailable calendar durations` : undefined} icon={Clock} />;
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
    return hasHoursDiscrepancy(job);
  });
  const paymentPlot = Object.entries(s.systemPaymentsByMethodPence).filter(([method, amount]) => method !== "Invoice" && method !== "Unknown" && amount > 0).map(([name, amount]) => ({ name, amount: amount / 100 }));
  const colors = ["#1678b5", "#23956b", "#d9a327", "#b85d62"];
  const pageControls = <Pager data={report.jobs} name="jobs" change={onPage} />;
  const totalChargesCard = <Metric label="Total Charges" caption="(Expected)" value={reportMoney(paymentCards?.totalChargesPence)} detail={paymentCards?.totalChargeUnknownJobs ? `${paymentCards.totalChargeUnknownJobs} unknown job totals` : undefined} />;
  const driverCollectionCard = <Metric label="Driver Collected" value={reportMoney(paymentCards?.driverCollectionPence)} detail={paymentCards?.driverCollectionUnknownJobs ? `${paymentCards.driverCollectionUnknownJobs} unknown charged amounts` : undefined}>
    {paymentCards?.adjustmentReasons.length ? <details className="rpt-adjustment-reasons"><summary>Adjustment reasons ({paymentCards.adjustmentReasons.length})</summary><ul>{paymentCards.adjustmentReasons.map(row => <li key={row.jobId}><JobLink id={row.jobId} open={onJob} /><span>{row.reason}</span><small>{reportMoney(row.calculatedPence)} → {reportMoney(row.driverCollectionPence)}</small></li>)}</ul></details> : <small>No recorded adjustments</small>}
  </Metric>;
  const manualEntriesCard = <Metric label="Manual Entries" caption="(reported)" value={reportMoney(paymentCards?.manualEntriesKnownPence ?? paymentCards?.manualEntriesPence)} detail={manualEntryWarning ? <span className="rpt-unavailable-count">{manualEntryWarning}</span> : undefined} />;
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
      <div className="rpt-metrics"><Metric label="Completed Jobs" value={s.completedJobs} detail={`${s.assignedJobs} assigned · ${s.cancelledJobs} cancelled`} icon={CheckCircle2} />
        {scheduledHoursCard}<Metric label="Working Hours" value={reportTime(s.workingMinutesKnown)} detail={s.workingMinutesUnknownJobs ? `${s.workingMinutesUnknownJobs} unknown durations` : "Recorded job boundaries"} icon={Clock} /><Metric label="Moving Hours" value={movingValue} detail={movingDetail} icon={Route} />
        <Metric label="Overtime" value={reportTime(s.overtimeMinutesKnown)} icon={Clock} /><Metric label="Arrival Delays" value={reportTime(s.arrivalDelayMinutesKnown)} icon={Clock} /><Metric label="Reviews Sent / Not Sent" value={`${s.reviewSentJobs} / ${s.reviewNotSentJobs}`} icon={CheckCircle2} /><Metric label="Manual Helper Hours" value={`${s.helperHoursKnown.toFixed(1)}h`} detail={`${s.helpers.length} reported helper names`} icon={Users} /></div>
      <section className="rpt-section"><h2>Job timings</h2><div className="rpt-table-scroll"><table className="rpt-timings-table" aria-label="Job timings"><thead><tr>{["Job", "Date", "Customer", "On the Way", "Tracker Pick-up arrival", "Proof Photo", "Van Loaded", "Tracker Drop-off arrival", "Empty Van", "Tracker Drop-off departure", "Customer Signed"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{currentJobs.map(job => { const gap = arrivalProofGap(job); return <React.Fragment key={job.jobId}><tr className={gap !== null ? "rpt-timing-has-gap" : undefined}><td><JobLink id={job.jobId} open={onJob} /></td><td>{jobDate(job.operationalDate)}</td><td>{job.customer.name}</td>{[job.timings?.onMyWayAt, job.timings?.trackerArrivalAt, job.timings?.proofPhotoAt, job.timings?.vanLoadedAt, job.timings?.trackerDropoffArrivalAt, job.timings?.emptyVanAt, job.timings?.trackerDropoffDepartureAt, job.timings?.customerSignedAt].map((at, index) => <td key={index}>{index === 1 && at ? withArrivalDistance(timingTime(at), job.timings?.trackerArrivalDistanceMeters) : timingTime(at)}{index === 1 && !at && <small className="rpt-block rpt-unavailable-count">{job.timings?.trackerUnverifiedReason || "Tracker arrival was not recorded."}</small>}</td>)}</tr>{gap !== null && <tr className="rpt-timing-gap-row"><td colSpan={4} /><td colSpan={2}><Badge tone="bad">Arrival to proof gap ({gap} min)</Badge></td><td colSpan={5} /></tr>}</React.Fragment>; })}</tbody></table></div>{!currentJobs.length && <Empty>No jobs for the selected dates.</Empty>}{pageControls}</section>
      <section className="rpt-section"><div className="rpt-section-heading"><h2>Job-wise performance &amp; timings</h2><label>Job<select aria-label="Performance job" value={selectedJob} onChange={event => setSelectedJob(event.target.value)}><option value="">All jobs on this page</option>{report.jobs.items.map(job => <option key={job.jobId} value={job.jobId}>{job.jobId} - {job.customer.name}</option>)}</select></label></div>
        {currentJobs.map(job => <details className="rpt-job" key={job.jobId}><summary><ChevronDown size={16} aria-hidden="true" /><JobRowIdentity job={job} /><span>{reportTime(job.duration.workingMinutes)}</span></summary><div className="rpt-job-body"><JobPerformanceDetails job={job} gpsLoading={gpsLoading} showRoadCharges={false} showPayments={false} /></div></details>)}
        {!currentJobs.length && <Empty>No jobs for the selected dates.</Empty>}{pageControls}
      </section>
      <Suspense fallback={<section className="rpt-section" aria-label="Selected range performance charts"><h2>Daily performance</h2><div role="status" className="rpt-chart flex items-center justify-center gap-2"><Loader2 className="animate-spin" size={20} />Loading charts...</div></section>}><DriverPerformanceCharts trends={report.trends} /></Suspense>
      <section className="rpt-section"><h2>Manual helper hours</h2>{s.helpers.length ? <div className="rpt-table-scroll"><table><thead><tr><th>Helper</th><th>Reported hours</th><th>Jobs</th></tr></thead><tbody>{s.helpers.map(helper => <tr key={helper.name}><td>{helper.name}</td><td>{helper.hours.toFixed(1)}h</td><td>{helper.jobs}</td></tr>)}</tbody></table></div> : <Empty>No helper entries for this range.</Empty>}</section>
    </>}
    {tab === "payments" && <>
      <div className="rpt-metrics rpt-payment-metrics">{totalChargesCard}{driverCollectionCard}{scheduledHoursCard}
        <Metric label="Overtime Charges" value={reportMoney(s.overtimeChargesPence)} icon={Clock} incomplete={!!s.overtimeChargesUnknownJobs || !!s.overtimeMinutesUnknownJobs}
          detail={`${s.completedJobs > 0 && s.overtimeMinutesUnknownJobs === s.completedJobs ? "Hours unavailable" : `${reportTime(s.overtimeMinutesKnown)} overtime`}${s.overtimeMinutesUnknownJobs ? ` · ${s.overtimeMinutesUnknownJobs} missing durations` : ""}${s.overtimeChargesUnknownJobs ? ` · ${s.overtimeChargesUnknownJobs} missing charges` : ""}`} /></div>
      <div className="rpt-chart-pair"><section className="rpt-section"><h2>Received payment methods</h2>{paymentPlot.length ? <div className="rpt-chart" role="img" aria-label="Payment method distribution"><ResponsiveContainer><PieChart><Pie data={paymentPlot} dataKey="amount" nameKey="name" innerRadius={65} outerRadius={100} paddingAngle={3} isAnimationActive={false}>{paymentPlot.map((item, index) => <Cell key={item.name} fill={colors[index % colors.length]} />)}</Pie><Tooltip formatter={(value: number) => reportMoney(value * 100)} /></PieChart></ResponsiveContainer></div> : <Empty>No recorded receipts.</Empty>}</section>
        <section className="rpt-section"><h2>Financial breakdown</h2><FinancialBreakdown name="Financial breakdown" methods={s.systemPaymentsByMethodPence}
          base={s.financialBreakdown?.basePence} overtime={s.overtimeChargesPence} congestion={roadTotals?.congestionPence} tunnel={roadTotals?.tunnelPence}
          extras={s.financialBreakdown?.extraCharges} invoiceJobs={s.financialBreakdown?.invoiceJobs ?? (s.systemPaymentsByMethodPence.Invoice > 0 ? 1 : 0)}
          total={Object.values(s.systemPaymentsByMethodPence).reduce((sum, amount) => sum + amount, 0)}
          issueJobs={paymentCards?.jobFlowUnverifiedJobIds ?? report.jobs.items.filter(job => job.finance.systemPayments.issues.length > 0).map(job => job.jobId)} onJob={onJob}
          issues={paymentCards?.jobFlowUnknownJobs ? [`${paymentCards.jobFlowUnknownJobs} job payment records need verification. Total shows recorded amounts.`] : []} /></section></div>
      <section className="rpt-section"><div className="rpt-section-heading"><h2>Job-wise payment breakdown</h2><label>Job<select aria-label="Payment job" value={selectedJob} onChange={event => setSelectedJob(event.target.value)}><option value="">All jobs on this page</option>{report.jobs.items.map(job => <option key={job.jobId} value={job.jobId}>{job.jobId} - {job.customer.name}</option>)}</select></label></div>
        {currentJobs.map(job => <details className="rpt-job" key={job.jobId}><summary><ChevronDown size={16} aria-hidden="true" /><JobRowIdentity job={job} /><span>{reportMoney(Object.values(job.finance.systemPayments.byMethod).reduce((sum, amount) => sum + amount, 0))}</span></summary><div className="rpt-job-body"><JobFinancialBreakdown job={job} />{job.finance.adjustmentNote && <details className="rpt-chart-data"><summary>Adjustment reason</summary><p>{job.finance.adjustmentNote}</p></details>}</div></details>)}
        {!currentJobs.length && <Empty>No jobs for the selected dates.</Empty>}{pageControls}
      </section>
    </>}
    {tab === "comparison" && <section className="rpt-section"><div className="rpt-comparison-sides rpt-range-totals" style={{ gridTemplateRows: `repeat(${5 + Object.keys(s.systemPaymentsByMethodPence).length}, auto)` }}>
      <section style={{ gridRow: `span ${5 + Object.keys(s.systemPaymentsByMethodPence).length}` }}><h3>System totals · selected range</h3>
        <SideRow name="Expected Amount" value={reportMoney(paymentCards?.totalChargesPence)} />
        <SideRow name="Scheduled Hours" value={scheduledValue} />
        <SideRow name="Working Hours" value={reportTime(s.workingMinutesKnown)} />
        <SideRow name="" value={null} />
        {Object.keys(s.systemPaymentsByMethodPence).map(method => <SideRow key={method} name="" value={null} />)}
      </section>
      <section style={{ gridRow: `span ${5 + Object.keys(s.systemPaymentsByMethodPence).length}` }}><h3>Manual totals · selected range</h3>
        <SideRow name="Driver Collected" value={<>{reportMoney(paymentCards?.driverCollectionPence)}{!!paymentCards?.adjustmentReasons.length && <details className="rpt-chart-data"><summary>Adjustment reasons ({paymentCards.adjustmentReasons.length})</summary>{paymentCards.adjustmentReasons.map(row => <p key={row.jobId}><JobLink id={row.jobId} open={onJob} />: {row.reason}</p>)}</details>}</>} />
        <SideRow name="" value={null} />
        <SideRow name="Reported Hours" value={reportTime(s.manualMinutesKnown)} />
        <SideRow name="Helper Hours" value={reportTime(s.helperHoursKnown * 60)} />
        {Object.entries(s.systemPaymentsByMethodPence).map(([method, amount]) => <SideRow key={method} name={method === "Invoice" ? "Invoice pending" : method} value={reportMoney(amount)} />)}
      </section></div>
      <div className="rpt-section-heading rpt-comparison-heading"><h2>System / Manual comparison</h2><div className="rpt-filter-row"><label>Jobs<select aria-label="Comparison jobs" value={selectedJob} onChange={event => setSelectedJob(event.target.value)}><option value="">All jobs on this page</option>{report.jobs.items.map(job => <option key={job.jobId} value={job.jobId}>{job.jobId}</option>)}</select></label><label>Status<select aria-label="Comparison status" value={comparisonScope} onChange={event => setComparisonScope(event.target.value)}><option value="all">All statuses</option><option value="differences">Discrepancies</option><option value="pending">Pending submissions</option></select></label></div></div>
      {compared.length ? compared.map((job, index) => <details className="rpt-job" key={job.jobId} open={index === 0}><summary><ChevronDown size={16} className="rpt-expand-indicator" aria-hidden="true" /><JobRowIdentity job={job} /><div><Badge tone={!job.manualDetails ? "warning" : "neutral"}>{job.manualDetails ? "Submitted" : "Pending"}</Badge><span>{reportMoney(job.finance.acceptedPence)} / {reportMoney(job.finance.manualPayments?.collectedPence)}</span></div></summary><JobComparison job={job} openJob={onJob} gpsLoading={gpsLoading} gpsUnavailable={!!gpsError || report.meta.gpsIncluded === false && !gpsLoading} /></details>) : <Empty>No matching comparisons on this page.</Empty>}{pageControls}</section>}
    {tab === "jobs" && <section className="rpt-section"><h2>Selected range totals</h2><div className="rpt-metrics"><Metric label="Total Jobs" value={s.assignedJobs} detail={`${s.completedJobs} completed · ${s.cancelledJobs} cancelled`} icon={CheckCircle2} />{totalChargesCard}{driverCollectionCard}{manualEntriesCard}<Metric label="Tunnel Charges" value={reportMoney(roadTotals?.tunnelPence)} detail={roadTotals?.tunnelUnknownJobs ? <span className="rpt-unavailable-count">{roadTotals.tunnelUnknownJobs} unavailable job charges</span> : "Saved completed-job charges"} /><Metric label="Congestion Charges" value={reportMoney(roadTotals?.congestionPence)} detail={roadTotals?.congestionUnknownJobs ? <span className="rpt-unavailable-count">{roadTotals.congestionUnknownJobs} unavailable job charges</span> : "Saved completed-job charges"} />{scheduledHoursCard}<Metric label="Working Hours" value={reportTime(s.workingMinutesKnown)} detail={s.workingMinutesUnknownJobs ? `${s.workingMinutesUnknownJobs} unavailable durations` : undefined} icon={Clock} /><Metric label="Moving Time" value={movingValue} detail={movingDetail} icon={Route} /><Metric label="Overtime" value={reportTime(s.overtimeMinutesKnown)} icon={Clock} /><Metric label="Reviews Sent / Not Sent" value={`${s.reviewSentJobs} / ${s.reviewNotSentJobs}`} icon={CheckCircle2} /></div><h2>Job history</h2>{currentJobs.length ? currentJobs.map(job => <details className="rpt-job" key={job.jobId}><summary><ChevronDown size={16} className="rpt-expand-indicator" aria-hidden="true" /><JobRowIdentity job={job} /><div><Badge tone={job.status === "COMPLETED" ? "good" : "neutral"}>{job.status}</Badge><strong>{reportMoney(job.finance.expectedPence)}</strong></div></summary><div className="rpt-job-body"><div className="rpt-job-heading"><span>{job.pickup} → {job.dropoff}</span><JobLink id={job.jobId} open={onJob} /></div>
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
