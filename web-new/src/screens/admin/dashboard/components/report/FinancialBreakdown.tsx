/**
 * Financial breakdown table (range totals and per job): base price, overtime, extra
 * charges, each recorded payment method and the invoice line, with a total that
 * includes invoices. Unknown values show as "Unknown", never as £0.
 */
import React from "react";
import type { DriverReportJob, ReportExtraCharge } from "../../driverReport.types";
import { formatMinutes, formatMoney } from "../../utils/format";
import { Badge, Notice } from "../ds";

const chargeName = (label: string) => label === "London Congestion charge" ? "Congestion" : label === "Tunnel Charges" ? "Tunnel" : label;

export function FinancialBreakdown({ methods, base, overtime, congestion, tunnel, extras = [], invoiceJobs, total, issues = [], name, scheduledMinutes, issueJobs = [], onJob }: {
  methods: Record<string, number>; base: number | null | undefined; overtime: number | null | undefined;
  congestion: number | null | undefined; tunnel: number | null | undefined; extras?: ReportExtraCharge[];
  invoiceJobs: number; total: number; issues?: string[]; name: string; scheduledMinutes?: number | null; issueJobs?: string[]; onJob?: (id: string) => void;
}) {
  const chargeItems = [...extras];
  for (const [label, amountPence] of [["London Congestion charge", congestion], ["Tunnel Charges", tunnel]] as const) {
    if (amountPence && !chargeItems.some(charge => charge.label === label)) chargeItems.push({ label, amountPence, basis: "Included in job total" });
  }
  const money = (value: number | null | undefined) => formatMoney(value, "Unknown");
  return (
    <>
      <div tabIndex={0} role="region" aria-label="Financial breakdown, scrolls sideways" className="relative overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-admin-brand">
        <table className="w-full min-w-[420px] text-[14px]" aria-label={name}>
          <thead><tr className="border-b border-admin-line text-left text-[12.5px] text-admin-ink-2"><th scope="col" className="px-4 py-2 font-medium">Detail</th><th scope="col" className="px-4 py-2 text-right font-medium">Recorded amount</th><th scope="col" className="px-4 py-2 font-medium">Basis</th></tr></thead>
          <tbody className="divide-y divide-admin-line">
            {scheduledMinutes !== undefined && <tr><th scope="row" className="px-4 py-2 text-left font-normal">Scheduled hours</th><td className="px-4 py-2 text-right tabular-nums">{formatMinutes(scheduledMinutes)}</td><td className="px-4 py-2 text-admin-ink-2">Calendar duration</td></tr>}
            <tr><th scope="row" className="px-4 py-2 text-left font-normal">Base price</th><td className="px-4 py-2 text-right tabular-nums">{money(base)}</td><td className="px-4 py-2 text-admin-ink-2">Booking</td></tr>
            <tr><th scope="row" className="px-4 py-2 text-left font-normal">Overtime</th><td className="px-4 py-2 text-right tabular-nums">{money(overtime)}</td><td className="px-4 py-2 text-admin-ink-2">Included in job total</td></tr>
            {chargeItems.length ? chargeItems.map((charge, index) => (
              <tr key={charge.label}>
                <th scope="row" className="px-4 py-2 text-left font-normal">{index === 0 ? "Extra charges" : <span className="sr-only">Extra charges</span>}</th>
                <td className="px-4 py-2 text-right tabular-nums" title={charge.amountPence === null ? charge.basis : undefined}>{charge.amountPence === null ? "—" : money(charge.amountPence)}</td>
                <td className="px-4 py-2 text-admin-ink-2">{chargeName(charge.label)}</td>
              </tr>
            )) : <tr><th scope="row" className="px-4 py-2 text-left font-normal">Extra charges</th><td className="px-4 py-2 text-right">—</td><td className="px-4 py-2 text-admin-ink-2">—</td></tr>}
            {Object.entries(methods).filter(([method]) => method !== "Invoice" && method !== "Unknown").map(([method, amount]) => (
              <tr key={method}><th scope="row" className="px-4 py-2 text-left font-normal">{method}</th><td className="px-4 py-2 text-right tabular-nums">{money(amount)}</td><td className="px-4 py-2 text-admin-ink-2">Job-flow receipt</td></tr>
            ))}
            <tr><th scope="row" className="px-4 py-2 text-left font-normal">Invoice</th><td className="px-4 py-2 text-right tabular-nums">{invoiceJobs ? money(methods.Invoice ?? 0) : "—"}</td>
              <td className="px-4 py-2">{invoiceJobs ? <Badge tone="warning">{invoiceJobs > 1 ? `Invoice jobs (${invoiceJobs})` : "Invoice job"}</Badge> : "—"}</td></tr>
          </tbody>
          <tfoot><tr className="border-t-2 border-admin-line bg-admin-surface/60 font-semibold"><th scope="row" className="px-4 py-2 text-left">Total</th><td className="px-4 py-2 text-right tabular-nums">{money(total)}</td><td className="px-4 py-2 font-normal text-admin-ink-2">Payment methods including invoices</td></tr></tfoot>
        </table>
      </div>
      {methods.Unknown > 0 && <div className="px-4 pb-3"><Notice tone="warning">Unclassified payment: {money(methods.Unknown)}. Payment method requires verification.</Notice></div>}
      {issues.length > 0 && (
        <div className="px-4 pb-3"><Notice tone="warning"><span>{issues.join(" ")}</span>
          {onJob && issueJobs.length > 0 && <span className="mt-1 flex flex-wrap gap-2">{issueJobs.map(id => <button key={id} type="button" onClick={() => onJob(id)} className="font-semibold text-admin-brand hover:underline">{id}</button>)}</span>}
        </Notice></div>
      )}
    </>
  );
}

/** One job's breakdown, from its own finance record. */
export function JobFinancialBreakdown({ job }: { job: DriverReportJob }) {
  const finance = job.finance;
  return (
    <FinancialBreakdown name="Job financial breakdown" methods={finance.systemPayments.byMethod} base={finance.basePence} overtime={finance.overtimePence}
      congestion={finance.congestionPence} tunnel={finance.tunnelPence} extras={finance.extraCharges} scheduledMinutes={job.duration.bookedMinutes}
      invoiceJobs={finance.invoiceJob || finance.systemPayments.invoicePence > 0 ? 1 : 0}
      total={Object.values(finance.systemPayments.byMethod).reduce((sum, amount) => sum + amount, 0)} issues={finance.systemPayments.issues} />
  );
}
