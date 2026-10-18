/**
 * Tunnel Charges and Congestion Charges: one tab each, as on the deployed dashboard,
 * built from the same component. Scheme logic stays separate -- each row keeps its scheme,
 * rate basis and the fee the backend calculated for it; nothing here multiplies
 * entries into fees.
 *
 * Every event the server returns is listed. Events with no linked job are shown as
 * "Needs job match" instead of being dropped after pagination (which made counts and
 * rows disagree). "No recorded entry" is only stated together with tracker coverage.
 */
import React, { useState } from "react";
import { createPortal } from "react-dom";
import type { DriverReport, ReportRoadAlert } from "../../driverReport.types";
import { formatDateTime, formatMinutes, formatMoney, plural } from "../../utils/format";
import { expectedJobRoadCharge } from "../../utils/jobRoadChargeSummary";
import { manualRoadFee } from "../ManualRoadChargeCard";
import { roadZoneLabel } from "../../utils/roadZone";
import { Modal } from "../../../../../ui/Modal";
import { Clock3 } from "lucide-react";
import { Action, Badge, ChoiceChips, EmptyState, ErrorState, LoadingState, Metric, MetricRow, Missing, Notice, Pagination, Section, type Tone } from "../ds";
import type { ReportTabProps, RoadType } from "./types";

export const CHARGE_RULES = [
  { scheme: "Congestion Charge (London)", hours: "Mon–Fri 07:00–18:00 · Sat–Sun 12:00–18:00", unit: "Counted as chargeable jobs (one per job in charging hours)" },
  { scheme: "Tunnels (Blackwall / Silvertown, Dartford)", hours: "Every day 06:00–22:00", unit: "Counted as chargeable passages" }
];

/** Chargeable times per scheme, as the deployed report's info card showed them. */
const CHARGING_TIMES: Record<RoadType, Array<{ days: string; hours: string }>> = {
  tunnel: [{ days: "Monday – Sunday", hours: "6:00 AM – 10:00 PM" }],
  congestion: [{ days: "Monday – Friday", hours: "7:00 AM – 6:00 PM" }, { days: "Saturday – Sunday", hours: "12:00 PM – 6:00 PM" }]
};

const SCHEME_TEXT: Record<RoadType, { entries: string; chargeable: string; chargeableDetail: string; noun: string }> = {
  tunnel: { entries: "Tunnel zone entries", chargeable: "Chargeable passages", chargeableDetail: "Passages inside charging hours", noun: "tunnel" },
  congestion: { entries: "Congestion zone entries", chargeable: "Chargeable jobs", chargeableDetail: "Entries inside charging hours", noun: "congestion" }
};

function ChargingTimes({ roadType }: { roadType: RoadType }) {
  return (
    <section aria-label="Chargeable times" className="tmv-panel flex flex-wrap items-start gap-x-8 gap-y-3 px-5 py-4">
      <h2 className="flex items-center gap-2 text-[14px] font-semibold text-admin-ink"><Clock3 aria-hidden className="h-4 w-4 text-admin-brand" />Chargeable times</h2>
      {CHARGING_TIMES[roadType].map(row => (
        <div key={row.days}><p className="text-[12.5px] text-admin-ink-2">{row.days}</p><p className="text-[15px] font-semibold tabular-nums text-admin-ink">{row.hours}</p></div>
      ))}
      <p className="basis-full text-[12.5px] text-admin-ink-2">London time. Each event's fee uses the rate basis shown on it: a job pricing snapshot is kept as saved; an estimate from current Pricing settings is labelled as such.</p>
    </section>
  );
}

export function eventStatus(row: ReportRoadAlert): { label: string; tone: Tone } {
  if (!row.jobId) return { label: "Needs job match", tone: "warning" };
  if (row.estimatedPence === null) return { label: "Fee not calculable", tone: "warning" };
  if (row.inChargeableHours === false) return { label: "Outside charging hours", tone: "neutral" };
  if (row.chargeable) return { label: "Chargeable", tone: "info" };
  return { label: "Not chargeable", tone: "neutral" };
}

export function rateBasisLabel(row: ReportRoadAlert): string {
  if (/current pricing settings/i.test(row.rateBasis)) return "Estimate from current Pricing settings";
  if (/snapshot|saved/i.test(row.rateBasis)) return "Saved on the job";
  return row.rateBasis || "Basis not recorded";
}

export function RoadChargesTab({ report, gps, onJob, onPage, go, roadType, view }: ReportTabProps & { roadType: RoadType; view: "events" | "jobs" }) {
  const text = SCHEME_TEXT[roadType];
  const [selected, setSelected] = useState<ReportRoadAlert | null>(null);
  const page = report.roadAlerts;
  const summary = report.roadAlertSummary;
  const manual = report.summary.manualRoadChargeTotals;
  const types = [roadType] as const;
  const manualKnown = manual ? types.reduce((sum, type) => sum + (manual[type]?.knownPence ?? 0), 0) : null;
  const manualMissing = manual ? Math.max(...types.map(type => manual[type]?.missingJobs ?? 0)) : 0;
  const manualKnownJobs = manual ? Math.min(...types.map(type => manual[type]?.knownJobs ?? 0)) : 0;
  const coverage = report.gpsSummary?.coverage;
  const unlinked = page?.items.filter(row => !row.jobId).length ?? 0;
  const unpriced = summary?.unpricedEntries ?? 0;

  const filter = <ChargingTimes roadType={roadType} />;
  const rules = (
    <details className="rounded-xl border border-admin-line bg-white px-4 py-3">
      <summary className="inline-flex min-h-6 cursor-pointer items-center py-1 text-[14px] font-semibold">View charge rules</summary>
      <table className="mt-2 w-full text-[13.5px]">
        <thead><tr className="text-left text-admin-ink-2"><th className="py-1 pr-3 font-medium">Scheme</th><th className="py-1 pr-3 font-medium">Charging hours (London time)</th><th className="py-1 font-medium">Charging unit</th></tr></thead>
        <tbody className="divide-y divide-admin-line">{CHARGE_RULES.map(rule => <tr key={rule.scheme}><td className="py-1.5 pr-3">{rule.scheme}</td><td className="py-1.5 pr-3">{rule.hours}</td><td className="py-1.5">{rule.unit}</td></tr>)}</tbody>
      </table>
      <p className="mt-2 text-[12.5px] text-admin-ink-2">Reference only. Timezone Europe/London. Effective dates are not recorded in the dashboard, and these hours have not been checked against the operators' published schedules. Each event's fee uses the rate basis shown on that event.</p>
    </details>
  );

  if (gps.loading) return <div className="space-y-3">{filter}<LoadingState label="Loading road-charge events" /></div>;
  if (gps.error) return <div className="space-y-3">{filter}<ErrorState title="Couldn't load tracker history" message={`${gps.error} No entries can be confirmed or ruled out until it loads.`} onRetry={gps.retry} />{rules}</div>;
  if (!page) return <div className="space-y-3">{filter}<Notice tone="warning" title="Tracker history unavailable">Road-charge events were not returned for this range, so entries can't be confirmed or ruled out.</Notice>{rules}</div>;

  return (
    <div className="space-y-4">
      <MetricRow label="Road charge totals">
        <Metric label={text.entries} value={summary?.entries ?? "Unavailable"} detail="Recorded by the tracker; one visit can produce several alerts" />
        <Metric label={text.chargeable} value={summary?.chargeableEntries ?? "Unavailable"} detail={text.chargeableDetail} />
        <Metric label={unpriced ? "Expected (known subtotal)" : "Expected"} value={summary ? formatMoney(summary.estimatedKnownPence) : "Unavailable"}
          detail={unpriced ? `${plural(unpriced, "event")} without a calculable fee` : "Calculated per event by scheme"} />
        <Metric label={manualMissing ? "Manual entry (reported, known)" : "Manual entry (reported)"} value={manualKnown === null ? "Unavailable" : manualKnownJobs === 0 && manualMissing ? "Not submitted" : formatMoney(manualKnown)}
          detail={manualMissing ? `${plural(manualMissing, "missing entry", "missing entries")}` : "From driver job summaries"} />
      </MetricRow>
      {filter}
      <Notice tone="info">GPS zone activity and the charges saved on jobs are separate: the saved charge is already in each job's total, and tracker activity is evidence for it, not an extra amount.</Notice>

      {coverage === "partial" && <Notice tone="warning" title="Partial tracker coverage">Some tracker history is missing for this range, so zone entries may be missing too. A missing entry is not proof that no crossing happened.</Notice>}
      {coverage === "unavailable" && <Notice tone="warning" title="Tracker history unavailable">Entries can't be confirmed or ruled out for this range.</Notice>}
      {report.alertHistoryTruncated && <Notice tone="info">The tracker returned a truncated alert history for this range; older events may be missing.</Notice>}
      {unlinked > 0 && <Notice tone="warning" title={`${plural(unlinked, "event")} on this page ${unlinked === 1 ? "needs" : "need"} a job match`}>The system couldn't link these entries to a job, so no driver or customer charge is assumed.</Notice>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[17px] font-bold text-admin-ink">Zones</h2>
        <ChoiceChips label="Road charges view" value={view} onChange={value => go({ roadView: value })} options={[{ value: "events", label: "Zone events" }, { value: "jobs", label: "By job" }]} />
      </div>
      {view === "events" ? (
        <Section title="Zone events" description="Every entry the tracker recorded for this driver's vehicle in the selected range.">
          {page.items.length === 0 ? (
            <EmptyState compact title="No zone entries recorded"
              message={coverage === "partial" || coverage === "unavailable" ? "Tracker coverage is incomplete, so this does not prove there were no entries." : "No entries in tracker history for this range."} />
          ) : (
            <div className="relative overflow-x-auto">
              <table aria-label="Zone events" className="w-full min-w-[820px] text-[14px]">
                <thead><tr className="border-b border-admin-line bg-admin-surface/60 text-left text-[12.5px] text-admin-ink-2">
                  {["Zone", "Entered", "Time inside", "Job", "Expected fee", "Charging hours", ""].map(label => <th key={label} className="px-4 py-2 font-semibold">{label || <span className="sr-only">Details</span>}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-admin-line">
                  {page.items.map(row => {
                    const status = eventStatus(row);
                    return (
                      <tr key={row.id} className={row.jobId ? undefined : "bg-admin-status-amber-bg/40"}>
                        <td className="px-4 py-2"><span className="block font-medium">{roadZoneLabel(row)}</span><span className="text-[12.5px] text-admin-ink-2">{row.type === "tunnel" ? "Tunnel" : "Congestion"}</span></td>
                        <td className="px-4 py-2 tabular-nums">{formatDateTime(row.enteredAt)}</td>
                        <td className="px-4 py-2 tabular-nums">{row.durationSeconds === null ? <Missing /> : formatMinutes(row.durationSeconds / 60)}</td>
                        <td className="px-4 py-2">{row.jobId ? <Action size="sm" variant="ghost" onClick={() => onJob(row.jobId!)} aria-label={`Open job ${row.jobId}`}>{row.jobId}</Action> : <Missing>No job linked</Missing>}</td>
                        <td className="px-4 py-2"><span className="block tabular-nums">{row.estimatedPence === null ? <Missing>{row.feeReason || "Not calculated"}</Missing> : formatMoney(row.estimatedPence)}</span><span className="text-[12.5px] text-admin-ink-2">{rateBasisLabel(row)}</span></td>
                        <td className="px-4 py-2"><Badge tone={status.tone}>{status.label}</Badge></td>
                        <td className="px-4 py-2 text-right"><Action size="sm" onClick={() => setSelected(row)} aria-label={`Evidence for ${roadZoneLabel(row)} entry at ${formatDateTime(row.enteredAt)}`}>Evidence</Action></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={page.page} pageSize={page.pageSize} total={page.total} noun="event" onPage={next => onPage("roadAlerts", next)} />
        </Section>
      ) : <ByJob report={report} types={types} onJob={onJob} onPage={onPage} />}
      {rules}

      {selected && createPortal(
        <Modal open onClose={() => setSelected(null)} size="lg" placement="center" title={`${roadZoneLabel(selected)} · ${formatDateTime(selected.enteredAt)}`}
          footer={selected.jobId ? <div className="flex justify-end"><Action variant="primary" onClick={() => { onJob(selected.jobId!); setSelected(null); }}>Open job {selected.jobId}</Action></div> : undefined}>
          <dl className="grid gap-2 text-[14px] sm:grid-cols-2">
            <div><dt className="text-[12.5px] text-admin-ink-2">Linked job</dt><dd>{selected.jobId || "Needs job match"}</dd></div>
            <div><dt className="text-[12.5px] text-admin-ink-2">How it was linked</dt><dd>{selected.linkBasis === "driver-time-match" ? "Driver and job time match" : selected.linkBasis === "recorded-device" ? "Vehicle recorded on the job" : "Not linked"}</dd></div>
            <div><dt className="text-[12.5px] text-admin-ink-2">Expected fee</dt><dd>{formatMoney(selected.estimatedPence, "Not calculated")} · {rateBasisLabel(selected)}</dd></div>
            <div><dt className="text-[12.5px] text-admin-ink-2">Exited</dt><dd>{formatDateTime(selected.exitedAt)}</dd></div>
          </dl>
          <h3 className="mt-4 text-[14px] font-semibold">Tracker alerts</h3>
          <ul className="mt-1 divide-y divide-admin-line text-[13.5px]">
            {selected.alerts.map(alert => <li key={alert.id} className="py-2"><span className="font-medium">{alert.type === "entry" ? "Zone entered" : alert.type === "exit" ? "Zone exited" : alert.type}</span> · {formatDateTime(alert.occurredAt)}<p className="whitespace-pre-wrap break-words text-admin-ink-2">{alert.description}</p></li>)}
          </ul>
        </Modal>, document.body)}
    </div>
  );
}

/** Expected (tracker) vs driver-reported road fees for the jobs on the current page. */
function ByJob({ report, types, onJob, onPage }: { report: DriverReport; types: ReadonlyArray<"tunnel" | "congestion">; onJob: (id: string) => void; onPage: (key: string, page: number) => void }) {
  const rows = report.jobs.items.map(job => {
    const expected = types.map(type => expectedJobRoadCharge(job, type));
    const reported = types.map(type => manualRoadFee(job.manualDetails, type));
    const expectedTotal = expected.some(value => value === null) ? null : expected.reduce<number>((sum, value) => sum + (value ?? 0), 0);
    const reportedTotal = !job.manualDetails ? undefined : reported.some(value => value === null) ? null : reported.reduce<number>((sum, value) => sum + (value ?? 0), 0);
    const entries = (job.roadAlerts ?? []).filter(row => types.includes(row.type)).length;
    return { job, expectedTotal, reportedTotal, entries };
  });
  return (
    <Section title="By job" description="Expected fees from tracker events compared with the fees the driver reported. Jobs from the current page of the job list.">
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[700px] text-[14px]">
          <thead><tr className="border-b border-admin-line bg-admin-surface/60 text-left text-[12.5px] text-admin-ink-2">{["Job", "Zone entries", "Expected", "Driver reported", "Difference", ""].map(label => <th key={label} className="px-4 py-2 font-semibold">{label || <span className="sr-only">Open</span>}</th>)}</tr></thead>
          <tbody className="divide-y divide-admin-line">
            {rows.map(({ job, expectedTotal, reportedTotal, entries }) => (
              <tr key={job.jobId}>
                <td className="px-4 py-2"><span className="block font-medium">{job.customer.name}</span><span className="text-[12.5px] text-admin-ink-2">{job.jobId}</span></td>
                <td className="px-4 py-2 tabular-nums">{entries}</td>
                <td className="px-4 py-2 tabular-nums">{formatMoney(expectedTotal, "Not calculated")}</td>
                <td className="px-4 py-2 tabular-nums">{reportedTotal === undefined ? <Missing>Not submitted</Missing> : formatMoney(reportedTotal, "Unreadable")}</td>
                <td className="px-4 py-2 tabular-nums">{typeof expectedTotal === "number" && typeof reportedTotal === "number" ? formatMoney(reportedTotal - expectedTotal) : <Missing>Unknown</Missing>}</td>
                <td className="px-4 py-2 text-right"><Action size="sm" onClick={() => onJob(job.jobId)} aria-label={`Open job ${job.jobId}`}>Open job</Action></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={report.jobs.page} pageSize={report.jobs.pageSize} total={report.jobs.total} noun="job" onPage={next => onPage("jobs", next)} />
    </Section>
  );
}
