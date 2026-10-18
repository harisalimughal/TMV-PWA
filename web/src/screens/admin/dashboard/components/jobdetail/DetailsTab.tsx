/** Details: customer, booking and schedule, route, driver and vehicle, original booking. */
import React, { useState } from "react";
import { Mail, Phone } from "lucide-react";
import type { NormalizedJob } from "../../types";
import { htmlToPlainText } from "../../../../../lib/htmlText";
import { RawBookingText } from "../../../../../components/driver/RawBookingText";
import { cx } from "../../../../../ui/cx";
import { formatDateTime, formatTime } from "../../utils/format";
import { isUnassigned } from "../../hooks/useAttention";
import { jobServiceType } from "../../utils/workBreakdown";
import { Facts, Missing, focusRing, type FactRow } from "../ds";
import { Block, CopyButton, TEXT_MISSING, useRosterDriver } from "./parts";
import { mailHref, telHref } from "./model";

const linkClass = "inline-flex min-h-[28px] items-center gap-1.5 text-admin-brand hover:underline";

function Contact({ value, kind }: { value?: string; kind: "phone" | "email" }) {
  if (!value?.trim()) return <Missing>{TEXT_MISSING.recorded}</Missing>;
  const href = kind === "phone" ? telHref(value) : mailHref(value);
  return (
    <span className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
      {href
        ? <a className={cx(linkClass, "break-all", focusRing)} href={href} aria-label={`${kind === "phone" ? "Call" : "Email"} ${value}`}>{kind === "phone" ? <Phone aria-hidden className="h-3.5 w-3.5" /> : <Mail aria-hidden className="h-3.5 w-3.5" />}{value}</a>
        : <span className="break-all">{value}</span>}
      <CopyButton text={value} label={`Copy ${kind === "phone" ? "phone number" : "email address"}`} />
    </span>
  );
}

function Address({ value, floor }: { value?: string; floor?: string }) {
  if (!value?.trim()) return <Missing>{TEXT_MISSING.recorded}</Missing>;
  return <span className="flex flex-wrap items-start gap-x-1"><span className="min-w-0 break-words">{value}</span><CopyButton text={value} label="Copy address" />{floor && <span className="basis-full text-[12.5px] font-normal text-admin-ink-2">Floor: {floor}</span>}</span>;
}

/** The booking text as imported, with a structured/original switch. Never rendered as HTML. */
function OriginalBooking({ job }: { job: NormalizedJob }) {
  const [mode, setMode] = useState<"structured" | "original">("structured");
  const booking = job.bookingDetails || {};
  const description = job.rawDescription ? htmlToPlainText(job.rawDescription) : "";
  const structured: FactRow[] = [
    ...(booking.notes ? [{ label: "Notes", value: <span className="whitespace-pre-wrap break-words">{booking.notes}</span> }] : []),
    ...(booking.inventory ? [{ label: "Inventory", value: <span className="whitespace-pre-wrap break-words">{booking.inventory}</span> }] : []),
    ...(booking.extraChargeText ? [{ label: "Extras mentioned in booking", value: <span className="break-words">{booking.extraChargeText}</span> }] : [])
  ];
  const hasAny = !!(job.rawTitle || description || structured.length);
  if (!hasAny) return <Block title="Original booking information"><Missing>Not available for this job</Missing></Block>;
  return (
    <Block title="Original booking information" description="Exactly as imported from the Calendar booking."
      aside={<span role="group" aria-label="Booking text view" className="inline-flex rounded-lg border border-admin-line p-0.5">
        {(["structured", "original"] as const).map(id => (
          <button key={id} type="button" aria-pressed={mode === id} onClick={() => setMode(id)}
            className={cx("rounded-md px-2.5 py-1 text-[12.5px] font-semibold", focusRing, mode === id ? "bg-admin-brand-soft text-admin-brand" : "text-admin-ink-2 hover:text-admin-ink")}>{id === "structured" ? "Structured details" : "Original text"}</button>
        ))}
      </span>}>
      {mode === "structured"
        ? (structured.length ? <Facts columns={1} rows={structured} /> : <p className="text-[13.5px] text-admin-ink-2">No structured notes were found. Switch to Original text to read the full booking.</p>)
        : (
          <div className="space-y-3">
            <div><p className="text-[12.5px] font-medium text-admin-ink-2">Calendar title</p><p className="mt-0.5 break-words font-mono text-[13px] text-admin-ink">{job.rawTitle || <Missing />}</p></div>
            <div>
              <div className="flex items-center justify-between"><p className="text-[12.5px] font-medium text-admin-ink-2">Calendar description</p>{description && <CopyButton text={description} label="Copy original booking text" />}</div>
              {description ? <div className="max-h-[420px] overflow-auto break-words [overflow-wrap:anywhere]" tabIndex={0} aria-label="Original booking text"><RawBookingText text={description} /></div> : <Missing />}
            </div>
          </div>
        )}
    </Block>
  );
}

export function DetailsTab({ job }: { job: NormalizedJob }) {
  const booking = job.bookingDetails || {};
  const roster = useRosterDriver(job);
  const assigned = !isUnassigned(job);
  const schedule = job.bookedStart ? `${formatDateTime(job.bookedStart)}${job.bookedFinish ? ` – ${formatTime(job.bookedFinish)}` : ""}` : "";
  const customer: FactRow[] = [
    { label: "Customer", value: job.customerName || <Missing>{TEXT_MISSING.recorded}</Missing> },
    { label: "Phone", value: <Contact value={job.customerPhone} kind="phone" /> },
    { label: "Email", value: <Contact value={job.customerEmail} kind="email" /> }
  ];
  const bookingRows: FactRow[] = [
    { label: "Scheduled", value: schedule || <Missing>Not scheduled</Missing>, hint: schedule ? "London time, from the Calendar booking" : undefined },
    { label: "Service", value: jobServiceType(job) },
    { label: "Van size", value: booking.vanSize || <Missing>{TEXT_MISSING.recorded}</Missing> },
    { label: "Booked hire", value: booking.hireDuration || <Missing>{TEXT_MISSING.recorded}</Missing>, hint: booking.hireDuration ? "As written in the booking" : undefined },
    { label: "Crew", value: job.crewSize ? `${job.crewSize} ${job.crewSize === 1 ? "person" : "people"}` : <Missing>{TEXT_MISSING.recorded}</Missing> }
  ];
  const route: FactRow[] = [
    { label: "Pickup", value: <Address value={job.pickup} floor={job.floorFrom} /> },
    { label: "Drop-off", value: <Address value={job.dropoff} floor={job.floorTo} /> }
  ];
  const driver: FactRow[] = [
    { label: "Driver", value: assigned ? `${job.driverName || job.driverInitials}${job.driverInitials ? ` (${job.driverInitials})` : ""}` : <Missing>{TEXT_MISSING.driver}</Missing> },
    { label: "Driver phone", value: assigned ? <Contact value={roster?.phone} kind="phone" /> : <Missing>{TEXT_MISSING.driver}</Missing> },
    { label: "Van registration", value: assigned ? (roster?.vanRegistration ? <span className="font-mono">{roster.vanRegistration}</span> : <Missing>{TEXT_MISSING.unavailable}</Missing>) : <Missing>{TEXT_MISSING.driver}</Missing>, hint: assigned ? "From the driver roster" : undefined },
    { label: "Driver viewed job", value: job.driverViewedAt ? formatDateTime(job.driverViewedAt) : assigned ? <Missing>Not yet viewed</Missing> : <Missing>{TEXT_MISSING.driver}</Missing> }
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <Block title="Customer"><Facts columns={1} rows={customer} /></Block>
        <Block title="Booking & schedule"><Facts rows={bookingRows} /></Block>
      </div>
      <Block title="Route & locations"><Facts columns={1} rows={route} /></Block>
      <Block title="Driver & vehicle"><Facts rows={driver} /></Block>
      <OriginalBooking job={job} />
    </div>
  );
}
