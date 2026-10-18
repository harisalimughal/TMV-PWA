/**
 * Bookings module shell: source banner, secondary navigation (kept in the URL) and the active view.
 * Views that belong to later stages show an explicit "not built yet" panel instead of pretending.
 */
import React from "react";
import { BookingUnavailableError } from "../../../../lib/booking/client";
import { BookingSourceProvider, useBookingSource } from "./source";
import { useBookingSummary } from "./hooks";
import { BookingWizard } from "./BookingWizard";
import { Calendar } from "./Calendar";
import { Dispatch } from "./Dispatch";
import { AllBookings } from "./AllBookings";
import { BookingDetails, TABS, type TabId } from "./BookingDetails";
import { EnquiryInbox } from "./EnquiryInbox";
import { CommandCentre, RANGES, type RangeId } from "./CommandCentre";
import { rangeFor } from "./CommandCentre";
import { useUrlState } from "../hooks/useUrlState";
import { navigateTo, sectionHref } from "../navigation";
import { BosRoot, Button, EmptyState, SampleBanner, SecondaryNav } from "./ui";
import "./bookingTheme.css";

export const VIEWS = [
  { id: "overview", label: "Overview" }, { id: "enquiries", label: "Enquiries" }, { id: "bookings", label: "All Bookings" }, { id: "calendar", label: "Calendar" }, { id: "dispatch", label: "Dispatch" }
] as const;
export type ViewId = typeof VIEWS[number]["id"];

function Unavailable() {
  const { setSource } = useBookingSource();
  return (
    <EmptyState title="Bookings are not available on this server yet"
      body="The booking service has not been connected to this dashboard. Nothing here is estimated or filled in. You can explore the screens with clearly labelled sample data instead."
      action={<Button variant="primary" onClick={() => setSource("preview")}>Explore with sample data</Button>} />
  );
}

function View({ view, range }: { view: ViewId | "new"; range: RangeId }) {
  const probe = useBookingSummary(rangeFor(range).from, rangeFor(range).to);
  if (probe.isError && probe.error instanceof BookingUnavailableError) return <Unavailable />;
  if (view === "new") return <BookingWizard onClose={() => navigateTo(sectionHref("bookings", { view: "enquiries" }))} />;
  if (view === "overview") return <CommandCentre range={range} />;
  if (view === "enquiries") return <EnquiryInbox />;
  if (view === "bookings") return <AllBookings />;
  if (view === "calendar") return <Calendar />;
  if (view === "dispatch") return <Dispatch />;
  return <EmptyState title={`${VIEWS.find(v => v.id === view)?.label} is not built yet`} body="This view arrives in a later stage of the Booking OS rollout." />;
}

function Shell() {
  const { source, setSource } = useBookingSource();
  const [state, update] = useUrlState({ view: "overview", range: "7d" });
  const view = (state.view === "new" || VIEWS.some(v => v.id === state.view) ? state.view : "overview") as ViewId | "new";
  const [detail, updateDetail] = useUrlState({ booking: "", bookingTab: "overview" });
  const range = (state.range in RANGES ? state.range : "7d") as RangeId;
  return (
    <BosRoot className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-[24px] font-semibold tracking-tight text-[var(--bos-ink)]">Bookings</h1><p className="text-[13px] text-[var(--bos-ink-2)]">Enquiries, bookings and dispatch in one place.</p></div>
        <div className="flex items-end gap-3">
        {view !== "new" && <Button variant="primary" onClick={() => update({ view: "new" }, { push: true })}>New booking</Button>}
        {view === "overview" && (
          <label className="flex items-center gap-2 text-[13px] text-[var(--bos-ink-2)]">Period
            <select value={range} onChange={event => update({ range: event.target.value })} className="min-h-9 rounded-xl border border-[var(--bos-line-strong)] bg-[var(--bos-surface)] px-3 text-[13px] text-[var(--bos-ink)]">
              {Object.entries(RANGES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
        )}
        </div>
      </header>
      {source === "preview" && <SampleBanner action={<Button variant="secondary" onClick={() => setSource("live")}>Use live data</Button>}>You are looking at fictional sample data. Nothing shown here is a real customer or booking, and nothing is sent to the backend.</SampleBanner>}
      {source === "live" && <p role="note" className="rounded-xl border border-[var(--bos-line)] bg-[var(--bos-surface)] px-4 py-3 text-[13px] text-[var(--bos-ink-2)]">Existing jobs are shown here for reference. Use Jobs to create a Calendar booking or change its driver. New enquiries and manual quotations can be saved here; enquiry confirmation, booking moves, cancellations and automatic pricing are not connected yet.</p>}
      <SecondaryNav label="Bookings views" items={VIEWS.map(v => ({ id: v.id, label: v.label }))} value={(view === "new" ? "enquiries" : view) as ViewId} onChange={id => update({ view: id }, { push: true })} />
      <View view={view} range={range} />
      {detail.booking && <BookingDetails id={detail.booking} tab={(TABS.some(t => t.id === detail.bookingTab) ? detail.bookingTab : "overview") as TabId} onTab={tab => updateDetail({ bookingTab: tab })} onClose={() => updateDetail({ booking: "", bookingTab: "overview" })} />}
    </BosRoot>
  );
}

export function BookingsPage() {
  return <BookingSourceProvider><Shell /></BookingSourceProvider>;
}
