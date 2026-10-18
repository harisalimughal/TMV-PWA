/** Charges & payment: calculated, final and received are three different numbers. */
import React, { useEffect, useState } from "react";
import { Save } from "lucide-react";
import type { NormalizedJob } from "../../types";
import { saveJobReview } from "../../api";
import { formatDateTime, formatMinutes, formatMoney, formatTime } from "../../utils/format";
import { hasInvoice } from "../../hooks/useAttention";
import { Action, Badge, Facts, Missing, Notice, controlBase } from "../ds";
import { JobTimeBreakdown } from "../JobTimeBreakdown";
import { Block } from "./parts";
import { chargeLines, comparisonRows, isInvoiceMethod, lifecycleOf, recordedReceiptsPence } from "./model";

export function ChargesTab({ job, onUpdated, onToast }: { job: NormalizedJob; onUpdated: (job: NormalizedJob) => void; onToast: (message: string) => void }) {
  const stage = lifecycleOf(job);
  const calculated = job.totalCharges ?? job.calculatedTotalCharges ?? null;
  const final = stage === "completed" ? job.amountCharged : null;
  const adjusted = final !== null && calculated !== null && final !== calculated;
  const received = recordedReceiptsPence(job);
  const invoiced = hasInvoice(job);
  const summary = job.driverJobSummary;
  const lines = chargeLines(job);
  const comparison = comparisonRows(job, { minutes: value => value === null ? "Not recorded" : formatMinutes(value), money: value => value === null ? "Not recorded" : formatMoney(value) });

  return (
    <div className="space-y-4">
      <Block title="Financial summary" description="Three separate measures. A calculated charge is not a final charge, and a final charge is not money received.">
        <dl className="grid gap-2.5 sm:grid-cols-3">
          {[
            { label: "Calculated", value: formatMoney(calculated), hint: "From the booking and pricing settings" },
            { label: "Final charge", value: stage === "completed" ? formatMoney(final) : stage === "cancelled" ? "—" : "Not yet charged", hint: stage === "completed" ? "Entered at completion" : stage === "cancelled" ? "Job cancelled" : "Set when the job is completed", muted: stage !== "completed" },
            { label: "Recorded receipts", value: received === null ? (stage === "completed" ? "Not recorded" : "Not yet") : formatMoney(received), hint: invoiced ? "Excludes invoices to collect" : "Recorded in the job flow", muted: received === null }
          ].map(item => (
            <div key={item.label} className="rounded-xl border border-admin-line px-3 py-2.5">
              <dt className="text-[12.5px] font-medium text-admin-ink-2">{item.label}</dt>
              <dd className={`mt-0.5 text-[18px] font-bold tabular-nums ${item.muted ? "text-admin-ink-2" : "text-admin-ink"}`}>{item.value}</dd>
              <dd className="text-[12px] text-admin-ink-2">{item.hint}</dd>
            </div>
          ))}
        </dl>
        {adjusted && <div className="mt-3"><Notice tone="warning" title={`Final charge differs from calculated by ${formatMoney((final ?? 0) - (calculated ?? 0))}`}>Adjustment reason: {job.totalAdjustmentNote?.trim() || "not recorded"}</Notice></div>}
      </Block>

      <Block title="Charge breakdown" description="The calculated charge, line by line.">
        <table className="w-full text-[14px]">
          <caption className="sr-only">Calculated charge breakdown</caption>
          <thead className="sr-only"><tr><th scope="col">Item</th><th scope="col">Amount</th></tr></thead>
          <tbody className="divide-y divide-admin-line">
            {lines.map((line, index) => <tr key={`${line.label}-${index}`}><th scope="row" className="py-2 text-left font-normal text-admin-ink-2">{line.label}</th><td className="py-2 text-right tabular-nums">{formatMoney(line.pence)}</td></tr>)}
            <tr><th scope="row" className="py-2 text-left font-semibold">Calculated charge</th><td className="py-2 text-right font-semibold tabular-nums">{formatMoney(calculated)}</td></tr>
            <tr><th scope="row" className="py-2 text-left font-semibold">Final charge</th><td className="py-2 text-right font-semibold tabular-nums">{stage === "completed" ? formatMoney(final) : <Missing>Not yet charged</Missing>}</td></tr>
          </tbody>
        </table>
      </Block>

      <Block title="Payment methods recorded at completion" description="What the driver recorded in the job flow. An invoice is an amount billed, not money received.">
        {job.paymentBreakdown?.length ? (
          <ul className="divide-y divide-admin-line text-[14px]">
            {job.paymentBreakdown.map((row, index) => {
              const invoice = isInvoiceMethod(row.method);
              return <li key={`${row.method}-${index}`} className="flex items-center justify-between gap-3 py-2">
                <span className="flex flex-wrap items-center gap-2">{row.method || "Method not recorded"}<Badge tone={invoice ? "warning" : "success"}>{invoice ? "Invoice to collect" : "Recorded receipt"}</Badge></span>
                <span className="tabular-nums">{invoice && row.amount === 0 ? <Missing>Amount not recorded</Missing> : formatMoney(row.amount)}</span>
              </li>;
            })}
          </ul>
        ) : <p className="text-[13.5px] text-admin-ink-2">{stage === "completed" ? "No payment recorded in the job flow." : stage === "cancelled" ? "No payment expected." : "Recorded when the job is completed."}</p>}
        {invoiced && <p className="mt-2 text-[13px] text-admin-ink-2">Later payment of invoices is not tracked in this dashboard.</p>}
      </Block>

      <Block title="Time billing"><JobTimeBreakdown job={job} /></Block>

      <Block title="System record and driver submission" description="Compared only where both measure the same thing. A difference is a prompt to check, not an error.">
        {summary ? (
          <>
            <Facts rows={[
              { label: "Submitted", value: formatDateTime(summary.submittedAt) },
              { label: "Reported start – finish", value: `${formatTime(summary.startTime)} – ${formatTime(summary.endTime)}` },
              { label: "Driver-reported amount", value: formatMoney(summary.amountCollectedPence), hint: summary.paymentMethod },
              { label: "Helper", value: summary.helperName ? `${summary.helperName} · ${summary.helperHours}h` : "None reported" }
            ]} />
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[460px] text-[13.5px]">
                <caption className="sr-only">System record compared with the driver's submission</caption>
                <thead><tr className="text-left text-[12.5px] text-admin-ink-2"><th scope="col" className="py-1.5 font-medium">Measure</th><th scope="col" className="py-1.5 text-right font-medium">System</th><th scope="col" className="py-1.5 text-right font-medium">Driver</th><th scope="col" className="py-1.5 text-right font-medium">Difference</th></tr></thead>
                <tbody className="divide-y divide-admin-line">
                  {comparison.map(row => (
                    <tr key={row.key}><th scope="row" className="py-2 text-left font-normal">{row.label}</th><td className="py-2 text-right tabular-nums">{row.system}</td><td className="py-2 text-right tabular-nums">{row.driver}</td>
                      <td className={`py-2 text-right ${row.state === "differs" ? "font-semibold text-admin-status-amber" : "text-admin-ink-2"}`}>{row.difference}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : <p className="text-[13.5px] text-admin-ink-2">{stage === "completed" ? "Not submitted. The driver has not sent a job summary." : stage === "cancelled" ? "Not required." : "Submitted by the driver after the job."}</p>}
      </Block>

      {stage === "completed" && <ManagerReview job={job} onUpdated={onUpdated} onToast={onToast} />}
    </div>
  );
}

/** Manager review is stored separately from the job's evidence and charges: recording
 *  a decision never edits the driver's or system's values. */
function ManagerReview({ job, onUpdated, onToast }: { job: NormalizedJob; onUpdated: (job: NormalizedJob) => void; onToast: (message: string) => void }) {
  const [status, setStatus] = useState(job.managerReviewStatus || "Pending");
  const [note, setNote] = useState(job.managerReviewNote || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setStatus(job.managerReviewStatus || "Pending"); setNote(job.managerReviewNote || ""); }, [job.managerReviewStatus, job.managerReviewNote]);
  const dirty = status !== (job.managerReviewStatus || "Pending") || note !== (job.managerReviewNote || "");
  const save = async () => {
    if (status === "Flagged" && !note.trim()) { setError("Add a note explaining why this job is flagged."); return; }
    setSaving(true); setError("");
    try {
      const result = await saveJobReview(job.jobId, { status, note });
      onUpdated(result.job ?? { ...job, managerReviewStatus: result.review.status, managerReviewNote: result.review.note, managerReviewedAt: result.review.reviewedAt });
      onToast("Manager review saved");
    } catch (err) {
      setError((err as Error)?.message || "Couldn't save the review. Your note is kept below, try again.");
    } finally { setSaving(false); }
  };
  return (
    <Block title="Manager review" description={job.managerReviewedAt ? `Last saved ${formatDateTime(job.managerReviewedAt)}` : "Not reviewed yet"}>
      <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
        <label className="text-[13px] font-medium text-admin-ink-2">Review status
          <select value={status} onChange={event => setStatus(event.target.value as typeof status)} className={`${controlBase} mt-1 w-full`}>
            <option value="Pending">Not reviewed</option><option value="Approved">Approved</option><option value="Flagged">Flagged</option>
          </select>
        </label>
        <label className="text-[13px] font-medium text-admin-ink-2">Note {status === "Flagged" && <span className="text-admin-status-red">(required when flagged)</span>}
          <textarea value={note} maxLength={2000} rows={3} onChange={event => setNote(event.target.value)} aria-invalid={!!error || undefined}
            className="mt-1 w-full rounded-lg border border-admin-line px-3 py-2 text-[14px] text-admin-ink outline-none focus:border-admin-brand focus:ring-2 focus:ring-admin-brand/20" />
        </label>
      </div>
      {error && <p role="alert" className="mt-2 text-[13px] text-admin-status-red">{error}</p>}
      <div className="mt-3 flex justify-end"><Action variant="primary" icon={<Save />} loading={saving} disabled={!dirty} onClick={() => void save()}>Save review</Action></div>
    </Block>
  );
}
