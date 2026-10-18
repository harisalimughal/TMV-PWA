import React from "react";
import { Notice, Section } from "../ds";

const GATES = [
  "Versioned rate plans, each with its own effective date. A new version never edits an old one.",
  "Golden test cases: known jobs with known prices, run against every version before it can be used.",
  "A parity run against the current Make.com pricing on the same inputs. Differences are listed and must be explained.",
  "Activation only after the parity run passes and a named person approves it. Until then quotes stay manual."
];

/**
 * Honest status of the Booking OS pricing engine. There is no engine in this repository and no rate data is copied
 * from the job rates above: this panel shows no prices, and no control here changes any. The plan and its gates are
 * in docs/booking-os/06-PRICING.md.
 */
export function BookingPricingStatus() {
  return (
    <Section id="booking-pricing" title="Booking quotes" description="How prices for new enquiries and bookings are produced.">
      <div className="space-y-3 p-4 md:p-5">
        <Notice tone="warning" title="Pricing engine not connected">
          Bookings cannot be priced automatically yet. Staff record a manual price with a reason, and it is stored as a manual price. The rates above are the ones used for jobs today; they are not applied to booking quotes.
        </Notice>
        <div>
          <p className="text-[14px] font-semibold text-admin-ink">Before automatic quotes are switched on</p>
          <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-[14px] text-admin-ink-2">{GATES.map(gate => <li key={gate}>{gate}</li>)}</ol>
        </div>
      </div>
    </Section>
  );
}
