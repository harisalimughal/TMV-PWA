import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { DateTime } from "luxon";
import { Modal } from "../../../../ui/Modal";
import type { DriverReport, ReportRoadAlert } from "../driverReport.types";

const money = (pence: number | null) => pence === null ? "Not calculated" : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
const date = (instant: string | null) => instant ? DateTime.fromISO(instant).setZone("Europe/London").toFormat("dd LLL yyyy, HH:mm") : "Not recorded";
export function roadZoneLabel(row: ReportRoadAlert) {
  const names = row.zone.split(",").map(name => name.replace(/\bcharges?\s*(?:[-\x3a|/&]|\band\b)?\s*alerts?\b/gi, "")
    .replace(/\b(?:charges?|alerts?)\b/gi, "").replace(/\s*[-\x3a|/]\s*(?=[-\x3a|/]|$)/g, "").replace(/^\s*[-\x3a|/]\s*/, "").replace(/\s+/g, " ").trim()).filter(Boolean);
  return [...new Set(names)].join(", ") || (row.scheme === "congestion" ? "Congestion Zone" : row.scheme === "dartford" ? "Dartford Crossing" : "Blackwall / Silvertown Tunnels");
}
const feeLabel = (row: ReportRoadAlert) => row.estimatedPence !== null ? money(row.estimatedPence) : row.feeReason || (!row.jobId ? "No matching job" : "Fee unavailable");
export function RoadChargeMetricItems({ summary, type }: { summary: DriverReport["roadAlertSummary"]; type: "tunnel" | "congestion" }) {
  const values: Array<[string, string | number]> = [
    [type === "tunnel" ? "Tunnel Zone Entries" : "Congestion Zone Entries", summary?.entries ?? "Unavailable"],
    [type === "tunnel" ? "Chargeable Passages" : "Chargeable Jobs", summary?.chargeableEntries ?? "Unavailable"],
    [type === "tunnel" ? "Total Tunnel Charges" : "Estimated Charges", !summary ? "Unavailable" : summary.unpricedEntries === summary.entries && !!summary.entries ? "Fees unavailable" : money(summary.estimatedKnownPence)]
  ];
  return <>{values.map(([label, value]) => <div className="rpt-metric" key={label}><div className="rpt-metric-label">{label}</div><strong className={String(value).length > 10 ? "rpt-road-value-long" : undefined}>{value}</strong></div>)}</>;
}
export function DriverRoadAlerts({ report, type, onJob, onPage, embedded = false }: { report: DriverReport; type: "tunnel" | "congestion"; onJob: (id: string) => void; onPage: (key: string, page: number) => void; embedded?: boolean }) {
  const [selected, setSelected] = useState<ReportRoadAlert | null>(null);
  useEffect(() => setSelected(null), [report.driver.initials, report.range.from, report.range.to, type]);
  const page = { ...report.roadAlerts!, items: report.roadAlerts!.items.filter(row => !!row.jobId) }, summary = report.roadAlertSummary;
  const related = selected ? [selected] : [];
  const rateLabel = (row: ReportRoadAlert) => type === "tunnel" && row.rateBasis === "Current Pricing Settings estimate" ? "Current Pricing Settings" : row.rateBasis;
  return <>
    <div className="rpt-metrics"><RoadChargeMetricItems summary={summary} type={type} />
      {!embedded && <section className="rpt-metric rpt-chargeable-times" aria-label="Chargeable Times">
        <div className="rpt-metric-label"><Clock size={18} aria-hidden="true" /><span>Chargeable Times</span></div>
        <dl>{(type === "tunnel" ? [["Monday - Sunday", "6:00 AM - 10:00 PM"]] : [["Monday - Friday", "7:00 AM - 6:00 PM"], ["Saturday - Sunday", "12:00 PM - 6:00 PM"]]).map(([days, hours]) => <div key={days}><dt>{days}</dt><dd>{hours}</dd></div>)}</dl>
        <small>London time</small>
      </section>}
    </div>
    <section className="rpt-section"><h2>{embedded ? type === "tunnel" ? "Tunnel activity" : "Congestion activity" : "Zones"}</h2>
      {!!summary?.unpricedEntries && <p className="rpt-muted mb-3">{summary.unpricedEntries} {summary.unpricedEntries === 1 ? "entry" : "entries"} without a calculated fee</p>}
      <div className="rpt-table-scroll"><table><thead><tr><th>Zones</th><th>Entered</th><th>Time inside</th><th>Charging hours</th><th>{type === "tunnel" ? "Tunnel Fee" : "Estimated fee"}</th><th>Job</th></tr></thead><tbody>{page.items.map(row => <tr key={row.id}>
        <td><button className="rpt-job-link" title="View zone alerts" onClick={() => setSelected(row)}>{roadZoneLabel(row)}<ArrowUpRight size={13} /></button></td>
        <td>{date(row.enteredAt)}</td><td>{row.durationSeconds === null ? "Not recorded" : `${Math.round(row.durationSeconds / 60)} min`}</td><td>{row.inChargeableHours === null ? "Not recorded" : row.inChargeableHours ? "Chargeable hours" : "Outside hours"}</td>
        <td>{feeLabel(row)}<small className="rpt-block">{rateLabel(row)}</small></td>
        <td>{row.jobId ? <button className="rpt-job-link" title={`Open job ${row.jobId}`} onClick={() => onJob(row.jobId!)}>{row.jobId}<ArrowUpRight size={13} /></button> : <span className="rpt-muted">No matching job</span>}</td>
      </tr>)}</tbody></table></div>
      {!page.items.length && <div className="rpt-empty">{embedded ? "No zone-entry alerts for this job in the selected dates." : "No zone-entry alerts for this driver and date range."}</div>}
      {!embedded && <div className="rpt-pager"><span>{page.total} entries · Page {page.page} of {Math.max(1, Math.ceil(page.total / page.pageSize))}{report.alertHistoryTruncated ? " · Returned alert history" : ""}</span><div>
        <button aria-label="Previous road alerts page" title="Previous road alerts page" disabled={page.page <= 1} onClick={() => onPage("roadAlerts", page.page - 1)}><ChevronLeft size={18} /></button>
        <button aria-label="Next road alerts page" title="Next road alerts page" disabled={page.page * page.pageSize >= page.total} onClick={() => onPage("roadAlerts", page.page + 1)}><ChevronRight size={18} /></button>
      </div></div>}
    </section>
    {selected && createPortal(<Modal open title={`Zone alerts · ${selected.jobId || "Unlinked"}`} onClose={() => setSelected(null)} size="lg" footer={selected.jobId ? <button className="rpt-job-link" onClick={() => { onJob(selected.jobId!); setSelected(null); }}>Open job {selected.jobId}<ArrowUpRight size={16} /></button> : undefined}>
      {related.map(row => <section key={row.id} className="mb-5"><h3 className="font-semibold mb-2">{roadZoneLabel(row)}</h3><p className="text-sm mb-2">Job ID: {row.jobId || "Not linked"} · {feeLabel(row)}</p>
        <p className="text-xs text-fg-muted mb-3">{row.linkBasis === "driver-time-match" ? "Driver / job-time match" : row.linkBasis === "recorded-device" ? "Recorded job device" : "No matching job"} · {rateLabel(row)}</p>
        {row.alerts.map(alert => <div key={alert.id} className="border-t border-line py-3"><strong className="text-sm">{alert.type === "entry" ? "Zone entered" : "Zone exited"}</strong><p className="text-sm whitespace-pre-wrap break-words">{alert.description}</p><time className="text-xs text-fg-muted">{date(alert.occurredAt)}</time></div>)}
      </section>)}
    </Modal>, document.body)}
  </>;
}
