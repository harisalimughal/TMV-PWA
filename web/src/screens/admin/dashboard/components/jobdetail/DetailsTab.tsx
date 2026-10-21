/** The Calendar description, displayed in the original booking layout. */
import React, { useId } from "react";
import { FileText } from "lucide-react";
import type { NormalizedJob } from "../../types";
import { htmlToPlainText } from "../../../../../lib/htmlText";
import { RawBookingText } from "../../../../../components/driver/RawBookingText";
import { Missing } from "../ds";

export function DetailsTab({ job }: { job: NormalizedJob }) {
  const headingId = useId();
  const booking = job.bookingDetails || {};
  const description = job.rawDescription ? htmlToPlainText(job.rawDescription) : "";
  const fallback = [
    booking.extraChargeText ? `Extra charges: ${booking.extraChargeText}` : "",
    booking.notes ? `Notes: ${booking.notes}` : "",
    booking.inventory ? `Inventory item: ${booking.inventory}` : ""
  ].filter(Boolean).join("\n\n");
  return (
    <section aria-labelledby={headingId} className="rounded-xl border border-admin-line bg-white p-4 md:p-5">
      <h3 id={headingId} className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-admin-muted">
        <FileText aria-hidden className="h-3.5 w-3.5 text-admin-brand" />Booking Description
      </h3>
      {description || fallback
        ? <div aria-label="Original booking text"><RawBookingText text={description || fallback} /></div>
        : <Missing>Not available for this job</Missing>}
    </section>
  );
}
