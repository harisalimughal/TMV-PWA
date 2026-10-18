/**
 * Payments: what was charged, what was received, what is still invoiced, and what the
 * driver reported -- each with its own label (audit p.11). The financial breakdown keeps
 * the deployed dashboard's Detail / Recorded amount / Basis table. The system / manual
 * comparison has its own tab (./ComparisonTab).
 */
import React from "react";
import { ChevronRight } from "lucide-react";
import type { DriverReport } from "../../driverReport.types";
import { formatDateTime, formatMinutes, formatMoney, plural } from "../../utils/format";
import { Metric, MetricRow, Section, type Tone } from "../ds";
import { FinancialBreakdown, JobFinancialBreakdown } from "./FinancialBreakdown";
import type { ReportTabProps } from "./types";

export function PaymentsTab(props: ReportTabProps) {
  return <div className="space-y-4"><PaymentTotals {...props} /></div>;
}

/** The legacy report's warning under Manual entries: submissions not made, and
 *  submissions whose amount could not be read. Same arithmetic as the live report. */
export function manualEntryWarning(cards: DriverReport["summary"]["paymentCards"]): string {
  const missing = cards?.manualEntryMissingJobs ?? cards?.manualEntryUnknownJobs ?? 0;
  const invalid = (cards?.manualEntryUnknownJobs ?? 0) - missing;
  return [missing ? `${missing} missing ${missing === 1 ? "entry" : "entries"}` : "", invalid > 0 ? `${invalid} invalid ${invalid === 1 ? "entry" : "entries"}` : ""].filter(Boolean).join(" · ");
}

const METHOD_MEANING: Record<string, { label: string; tone: Tone }> = {
  Invoice: { label: "Unpaid invoice — not a receipt", tone: "warning" },
  Unknown: { label: "Unclassified — needs verification", tone: "warning" }
};

function PaymentTotals({ report, onJob }: ReportTabProps) {
  const s = report.summary, cards = s.paymentCards;
  const methods = Object.entries(s.systemPaymentsByMethodPence);
  const receiptMethods = methods.filter(([method]) => method !== "Invoice" && method !== "Unknown");
  const receiptsPartial = s.unknownSystemCollectionJobs > 0;
  const scheduledValue = s.completedJobs > 0 && s.scheduledMinutesUnknownJobs === s.completedJobs ? "Unavailable" : formatMinutes(s.scheduledMinutesKnown ?? null);
  const roadTotals = s.roadChargeTotals;
  const invoice = s.systemPaymentsByMethodPence.Invoice ?? 0;
  return (
    <>
      <MetricRow label="Payment totals">
        <Metric label="Final charges" value={formatMoney(cards?.driverCollectionPence)}
          detail={<>Billed at completion, incl. invoices{cards?.totalChargesPence != null ? ` · calculated ${formatMoney(cards.totalChargesPence)}` : ""}</>} />
        <Metric label={receiptsPartial ? "Recorded receipts (known subtotal)" : "Recorded receipts"} value={formatMoney(s.systemKnownCollectionsPence)}
          detail={receiptsPartial ? `${plural(s.unknownSystemCollectionJobs, "job")} unverified` : "Cash, card, link and bank"} />
        <Metric label="Unpaid invoices" value={formatMoney(invoice)} detail="Recorded as invoice at completion; later payment is not tracked here" tone={invoice ? "attention" : "default"} />
        <Metric label="Scheduled hours" value={scheduledValue}
          detail={s.scheduledMinutesUnknownJobs ? `${s.scheduledMinutesUnknownJobs} unavailable calendar duration${s.scheduledMinutesUnknownJobs === 1 ? "" : "s"}` : "Calendar duration of completed jobs"} />
      </MetricRow>

      <MetricRow label="Driver-reported">
        <Metric label="Manual entries (reported)" value={formatMoney(cards?.manualEntriesKnownPence ?? cards?.manualEntriesPence)}
          detail={manualEntryWarning(cards) || "What the driver reported collecting in their job submissions"} tone={manualEntryWarning(cards) ? "attention" : "default"} />
        <Metric label="Outstanding" value={formatMoney(cards?.outstandingPence)}
          detail={cards?.outstandingPence == null && cards ? "Shown once every manual entry is in" : "Final charges minus manual entries"} />
      </MetricRow>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Financial breakdown" description="Base price, overtime, extra charges and each recorded payment method. Invoices are billed amounts, not receipts.">
          <FinancialBreakdown name="Financial breakdown" methods={s.systemPaymentsByMethodPence} base={s.financialBreakdown?.basePence} overtime={s.overtimeChargesPence}
            congestion={roadTotals?.congestionPence} tunnel={roadTotals?.tunnelPence} extras={s.financialBreakdown?.extraCharges}
            invoiceJobs={s.financialBreakdown?.invoiceJobs ?? (invoice > 0 ? 1 : 0)} total={Object.values(s.systemPaymentsByMethodPence).reduce((sum, amount) => sum + amount, 0)}
            issueJobs={cards?.jobFlowUnverifiedJobIds ?? report.jobs.items.filter(job => job.finance.systemPayments.issues.length > 0).map(job => job.jobId)} onJob={onJob}
            issues={cards?.jobFlowUnknownJobs ? [`${cards.jobFlowUnknownJobs} job payment records need verification. Total shows recorded amounts.`] : []} />
        </Section>

        <Section title="Charge components and adjustments">
          <dl className="divide-y divide-admin-line text-[14px]">
            <Row label="Calculated charges" value={formatMoney(cards?.totalChargesPence)} hint={cards?.totalChargeUnknownJobs ? `${cards.totalChargeUnknownJobs} jobs unknown` : undefined} />
            <Row label="Extra-time charges" value={formatMoney(s.overtimeChargesPence)} hint={`${formatMinutes(s.overtimeMinutesKnown)} extra time${s.overtimeMinutesUnknownJobs ? ` · ${s.overtimeMinutesUnknownJobs} jobs missing durations` : ""}`} />
            <Row label="Saved tunnel charges" value={formatMoney(s.roadChargeTotals?.tunnelPence)} hint={s.roadChargeTotals?.tunnelUnknownJobs ? `${s.roadChargeTotals.tunnelUnknownJobs} jobs unknown` : "Saved on completed jobs"} />
            <Row label="Saved congestion charges" value={formatMoney(s.roadChargeTotals?.congestionPence)} hint={s.roadChargeTotals?.congestionUnknownJobs ? `${s.roadChargeTotals.congestionUnknownJobs} jobs unknown` : "Saved on completed jobs"} />
          </dl>
          <div className="border-t border-admin-line px-4 py-3">
            <h3 className="text-[14px] font-semibold">Adjustments ({cards?.adjustmentReasons.length ?? 0})</h3>
            {cards?.adjustmentReasons.length ? (
              <ul className="mt-2 space-y-1.5 text-[13.5px]">
                {cards.adjustmentReasons.map(row => <li key={row.jobId}><span className="font-medium">{row.jobId}</span> · {formatMoney(row.calculatedPence)} → {formatMoney(row.driverCollectionPence)} · <span className="text-admin-ink-2">{row.reason}</span></li>)}
              </ul>
            ) : <p className="mt-1 text-[13px] text-admin-ink-2">No final charge differs from its calculated charge.</p>}
          </div>
        </Section>
      </div>

      <Section title="Job-wise payment breakdown" description="Open a job to see its own base price, extras, receipts and invoice.">
        {report.jobs.items.length === 0 ? <p className="px-4 py-6 text-center text-[14px] text-admin-ink-2">No jobs for the selected dates.</p> : (
          <ul className="divide-y divide-admin-line">
            {report.jobs.items.map(job => (
              <li key={job.jobId}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-2.5 hover:bg-admin-surface">
                    <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-admin-ink-2 transition group-open:rotate-90" />
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium">{job.customer.name || "Unnamed customer"}</span><span className="block truncate text-[12.5px] text-admin-ink-2">{formatDateTime(job.bookedStart)} · {job.jobId}</span></span>
                    <span className="tabular-nums">{formatMoney(Object.values(job.finance.systemPayments.byMethod).reduce((sum, amount) => sum + amount, 0), "Unknown")}</span>
                  </summary>
                  <div className="border-t border-admin-line bg-admin-surface/40 py-2">
                    <JobFinancialBreakdown job={job} />
                    {job.finance.adjustmentNote && <details className="px-4 pb-2 text-[13.5px]"><summary className="inline-flex min-h-6 cursor-pointer items-center py-1 font-semibold text-admin-brand">Adjustment reason</summary><p className="mt-1 text-admin-ink-2">{job.finance.adjustmentNote}</p></details>}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

function Row({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return <div className="flex items-start justify-between gap-3 px-4 py-2"><dt><span>{label}</span>{hint && <span className="block text-[12.5px] text-admin-ink-2">{hint}</span>}</dt><dd className="tabular-nums">{value}</dd></div>;
}
