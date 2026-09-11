import React from "react";
import type { Job } from "../../api/jobs";
import { AnimatedSuccessTick } from "./AnimatedSuccessTick";

function gbp(v: number): string {
  return `£${(v ?? 0).toFixed(2)}`;
}

function nowTime(): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London"
  }).format(new Date());
}

export interface CompletionSummaryProps {
  job: Job;
}

/**
 * Job complete — the same big animated green tick as a submitted issue report, then
 * a plain headline, then the record as ruled rows. Black text, no confetti.
 */
export function CompletionSummary({ job }: CompletionSummaryProps) {
  const totalCharges = job.totalCharges;
  const amountCharged = job.amountCharged ?? job.totalCharges;

  return (
    <div className="pt-6 text-center">
      <AnimatedSuccessTick />
      <h1 className="mt-6 text-title text-fg">Job complete</h1>
      <p className="mt-1.5 text-body text-fg-muted">
        Recorded at {nowTime()}. Everything's saved and the customer has been notified.
      </p>

      <dl className="mt-7 text-left">
        <Row label="Total Charges" value={gbp(totalCharges)} />
        <Row label="Amount Charged" value={gbp(amountCharged)} strong />
        <Row label="Payment" value={job.paymentMethod || "Not recorded"} />
        <Row label="Signed by" value={job.clientConfirmedBy || job.customerName || "—"} />
        <Row label="Status" value="Recorded" />
      </dl>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-3.5 first:border-t">
      <dt className="text-label font-normal text-fg-muted">{label}</dt>
      <dd className={strong ? "text-heading font-bold text-fg" : "text-body font-semibold text-fg"}>{value}</dd>
    </div>
  );
}
