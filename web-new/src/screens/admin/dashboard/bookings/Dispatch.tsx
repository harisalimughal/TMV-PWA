/**
 * Dispatch centre: bookings that need a driver, the checked options for the selected booking, and who is
 * actually available. It adds no rules of its own: the checks, the conflict results and the version control all
 * come from the server through the same Assignment panel the booking workspace uses. A driver with no shift data
 * shows "Unknown", never "Available".
 */
import React from "react";
import { DateTime } from "luxon";
import { londonDay, londonDayBounds, type AvailabilityState, type Tone } from "../../../../lib/booking";
import { useBooking, useBookings, useDriverAvailability } from "./hooks";
import { AssignmentTab } from "./BookingDetails";
import { openBooking } from "./AllBookings";
import { Button, Card, EmptyState, ErrorState, LoadingBlock, StatusPill } from "./ui";
import { useUrlState } from "../hooks/useUrlState";
import { formatShortDateTime, formatAge, plural } from "../utils/format";

const STATE: Record<AvailabilityState, { label: string; tone: Tone }> = {
  available: { label: "Available", tone: "success" }, busy: { label: "Busy", tone: "info" }, off_shift: { label: "Off shift", tone: "neutral" }, unavailable: { label: "Unavailable", tone: "danger" }, unknown: { label: "Unknown", tone: "warning" }
};

function Selected({ id }: { id: string }) {
  const booking = useBooking(id);
  if (booking.isPending) return <LoadingBlock label="Loading booking" />;
  if (booking.isError) return <ErrorState message="This booking could not be loaded." onRetry={() => booking.refetch()} />;
  const b = booking.data;
  return (
    <div className="space-y-3">
      <div><p className="text-[15px] font-semibold text-[var(--bos-ink)]">{b.reference}, {b.customer.name}</p>
        <p className="text-[13px] text-[var(--bos-ink-2)]">{formatShortDateTime(b.start)} to {formatShortDateTime(b.end)} (London)<br />{b.pickup.postcode} to {b.dropoff.postcode}{b.requirements.vanType ? `, ${b.requirements.vanType}` : ""}{b.requirements.helpers !== null ? `, ${b.requirements.helpers} helpers` : ""}</p>
        <Button variant="ghost" className="mt-1" onClick={() => openBooking(b.id)}>Open full booking</Button></div>
      <AssignmentTab booking={b} />
    </div>
  );
}

export function Dispatch() {
  const [state, update] = useUrlState({ dispatch: "" });
  const today = londonDay(new Date().toISOString());
  const unassigned = useBookings({ assignment: "unassigned", from: today, sort: "date", dir: "asc", pageSize: 30 });
  const window_ = { from: londonDayBounds(today).start, to: londonDayBounds(DateTime.fromISO(today, { zone: "Europe/London" }).plus({ days: 1 }).toISODate()!).end };
  const people = useDriverAvailability(window_.from, window_.to);
  const selected = state.dispatch && unassigned.data?.items.some(b => b.id === state.dispatch) ? state.dispatch : "";
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[300px_1fr_300px]">
      <Card title="Needs a driver" subtitle="From today, earliest first" className="min-w-0">
        {unassigned.isPending ? <LoadingBlock label="Loading unassigned bookings" /> : unassigned.isError ? <ErrorState message="Bookings could not be loaded." onRetry={() => unassigned.refetch()} /> :
          !unassigned.data.items.length ? <EmptyState title="Every upcoming booking has a driver" /> : (
            <>
              <p className="mb-2 text-[12px] text-[var(--bos-ink-3)]" aria-live="polite">{plural(unassigned.data.pagination.total, "booking")}</p>
              <ul className="space-y-2">{unassigned.data.items.map(b => (
                <li key={b.id}><button type="button" aria-current={b.id === selected ? "true" : undefined} onClick={() => update({ dispatch: b.id })}
                  className={`w-full rounded-2xl border p-3 text-left ${b.id === selected ? "border-[var(--bos-primary)] bg-[var(--bos-azure-soft)]" : "border-[var(--bos-line)] bg-[var(--bos-surface)] hover:bg-[var(--bos-surface-2)]"}`}>
                  <p className="text-[14px] font-semibold text-[var(--bos-ink)]">{b.reference} <span className="font-normal text-[var(--bos-ink-2)]">{b.customer.name}</span></p>
                  <p className="text-[12px] text-[var(--bos-ink-2)]">{formatShortDateTime(b.start)}</p>
                  <p className="text-[12px] text-[var(--bos-ink-3)]">{b.pickup.postcode} to {b.dropoff.postcode}</p></button></li>))}</ul>
            </>
          )}
      </Card>

      <Card title="Assign" subtitle="Checked by the server before anything is saved" className="min-w-0">
        {selected ? <Selected key={selected} id={selected} /> : <EmptyState title="Select a booking" body="Pick a booking that needs a driver to see who can take it and why." />}
      </Card>

      <Card title="Drivers today and tomorrow" subtitle="Availability as recorded" className="min-w-0">
        {people.isPending ? <LoadingBlock label="Loading drivers" /> : people.isError ? <ErrorState message="Availability could not be loaded." onRetry={() => people.refetch()} /> : (
          <ul className="space-y-2.5">{people.data.filter(r => r.kind === "driver").map(r => (
            <li key={r.id} className="rounded-2xl border border-[var(--bos-line)] bg-[var(--bos-surface)] p-3">
              <div className="flex items-start justify-between gap-2"><p className="text-[14px] font-semibold text-[var(--bos-ink)]">{r.name} <span className="font-normal text-[var(--bos-ink-3)]">{r.id}</span></p><StatusPill tone={STATE[r.state].tone}>{STATE[r.state].label}</StatusPill></div>
              <p className="mt-1 text-[12px] text-[var(--bos-ink-2)]">{r.basis}</p>
              <p className="text-[12px] text-[var(--bos-ink-3)]">{r.nextBookingAt ? `Next booking ${formatShortDateTime(r.nextBookingAt)}` : "No booking recorded"}{r.todayHours !== null ? ` · ${r.todayHours.toFixed(1)} h today` : ""}</p>
              <p className="text-[12px] text-[var(--bos-ink-3)]">{r.location ? `Last seen ${formatAge(r.location.at)}${r.location.place ? `, ${r.location.place}` : ""}` : "No location recorded"}</p>
            </li>))}</ul>
        )}
      </Card>
    </div>
  );
}
