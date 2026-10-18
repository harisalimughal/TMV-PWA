/**
 * Booked vs billed vs actual time for one job.
 *
 * The audit found a booking text saying 1h 30m beside "Original Calendar duration
 * 120 min". These are different facts from different sources, so each row now names
 * its source and none is called "original" unless it really is the untouched input:
 *
 * - Booking text duration: what the office typed in the booking (parsed hire duration).
 * - Calendar event length: the Calendar event's own start -> finish.
 * - Scheduled minutes used for billing: `timeBilling.scheduledMinutes`. Shown under the
 *   event-length label only when the two are equal; otherwise as a separate billing input.
 * - Allowance before extra time: `allocatedMinutes`, the time included before overtime
 *   blocks are billed.
 * - Actual working time: recorded arrival -> finish.
 */
import React from "react";
import type { NormalizedJob } from "../types";
import { formatMinutes, formatMoney } from "../utils/format";
import { Facts, type FactRow } from "./ds";

const RATE_SOURCE: Record<string, string> = {
  calendar: "Rate from the Calendar booking", settings: "Overtime rate from Pricing settings",
  "settings-crew-rate": "Crew rate from Pricing settings", "settings-packing-rate": "Packing rate from Pricing settings",
  unavailable: "Rate unavailable"
};

const validMinutes = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

export function calendarEventMinutes(job: Pick<NormalizedJob, "bookedStart" | "bookedFinish">): number | null {
  const minutes = (Date.parse(job.bookedFinish) - Date.parse(job.bookedStart)) / 60_000;
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

export function JobTimeBreakdown({ job }: { job: NormalizedJob }) {
  const billing = job.timeBilling;
  const eventMinutes = calendarEventMinutes(job);
  const bookingText = job.bookingDetails?.hireDuration?.trim();
  const rows: FactRow[] = [];
  if (bookingText) rows.push({ label: "Booking text duration", value: bookingText, hint: "As written in the booking description" });

  if (billing) {
    const scheduled = validMinutes(billing.scheduledMinutes);
    const sameAsEvent = scheduled !== null && eventMinutes !== null && Math.round(scheduled) === Math.round(eventMinutes);
    if (eventMinutes !== null && !sameAsEvent) rows.push({ label: "Calendar event length", value: formatMinutes(eventMinutes), hint: "Calendar start to finish" });
    rows.push({
      label: sameAsEvent ? "Calendar event length" : "Scheduled minutes used for billing",
      value: formatMinutes(scheduled),
      hint: sameAsEvent ? "Calendar start to finish; used as the billing input" : "Billing input; differs from the Calendar event length"
    });
    rows.push({ label: "Allowance before extra time", value: formatMinutes(validMinutes(billing.allocatedMinutes)), hint: "Time included before extra-time blocks are billed" });
    rows.push({ label: "Actual working time", value: formatMinutes(validMinutes(billing.actualMinutes)), hint: "Recorded arrival to finish" });
    rows.push({ label: "Extra time", value: formatMinutes(validMinutes(billing.extraMinutes)), hint: `${billing.billedExtraBlocks} billed 30-minute block${billing.billedExtraBlocks === 1 ? "" : "s"}` });
    rows.push({ label: "Rate per 30 minutes", value: formatMoney(billing.ratePer30Pence, "Unknown"), hint: RATE_SOURCE[billing.rateSource] ?? billing.rateSource });
    rows.push({ label: "Extra-time charge", value: formatMoney(billing.extraChargePence, "Unknown") });
  } else {
    rows.push({ label: "Calendar event length", value: formatMinutes(validMinutes(job.bookedMinutes) ?? eventMinutes), hint: "Calendar start to finish" });
    rows.push({ label: "Actual working time", value: formatMinutes(validMinutes(job.actualMinutes)), hint: "Recorded arrival to finish" });
    rows.push({ label: "Recorded extra-time charge", value: formatMoney(job.overtimeCharge, "Unknown") });
  }
  const reported = validMinutes(job.driverReportedOvertimeMinutes);
  if (reported !== null) rows.push({ label: "Driver-reported extra time", value: formatMinutes(reported), hint: "From the driver's job summary" });

  return (
    <section aria-label="Job time breakdown">
      <h3 className="mb-3 text-[15px] font-semibold text-admin-ink">Booked, billed and actual time</h3>
      <Facts rows={rows} />
      {(job.timeBillingIssue || !billing) && (
        <p className="mt-3 text-[13px] text-admin-ink-2">
          {job.timeBillingIssue || (job.status === "COMPLETED" ? "Historical billing: the charges saved on this job are kept as recorded." : "Calculated once arrival and finish times are recorded.")}
        </p>
      )}
    </section>
  );
}
