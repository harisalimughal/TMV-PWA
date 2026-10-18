/**
 * All Bookings: a server-paged table. Search, filters, sort and page all live in the URL and are sent to the
 * server, which does the filtering; the table never filters a partial page in the browser. Row actions are the
 * ones the server allows for that booking. Unpriced bookings show "Not recorded", never £0.00.
 */
import React from "react";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { DISPLAY_LABEL, DISPLAY_TONE, agreedTotalPence, displayStatus, type Booking, type DisplayStatus } from "../../../../lib/booking";
import { useBookings } from "./hooks";
import { Button, EmptyState, ErrorState, LoadingBlock, Missing, StatusPill } from "./ui";
import { useUrlState } from "../hooks/useUrlState";
import { formatMoney, formatShortDateTime, plural } from "../utils/format";
import { updateUrlParams } from "../navigation";

const COLUMNS: Array<{ id: string; label: string; sort?: string; align?: "right" }> = [
  { id: "ref", label: "Reference" }, { id: "customer", label: "Customer", sort: "customer" }, { id: "route", label: "Route" }, { id: "date", label: "Starts (London)", sort: "date" },
  { id: "status", label: "Status", sort: "status" }, { id: "crew", label: "Driver and van" }, { id: "price", label: "Price", sort: "price", align: "right" }, { id: "actions", label: "Actions" }
];
const STATUSES = Object.keys(DISPLAY_LABEL) as DisplayStatus[];

export function openBooking(id: string, tab?: string) { updateUrlParams({ booking: id, bookingTab: tab ?? null }, true); }

function Row({ b }: { b: Booking }) {
  const status = displayStatus(b);
  const price = agreedTotalPence(b.quotation);
  const needsDriver = b.allowedActions.includes("assign");
  return (
    <tr className="border-t border-[var(--bos-line)] align-top">
      <th scope="row" className="whitespace-nowrap py-3 pr-3 text-left font-semibold"><button type="button" onClick={() => openBooking(b.id)} className="text-[var(--bos-azure-fg)] underline-offset-2 hover:underline">{b.reference}</button></th>
      <td className="py-3 pr-3"><p className="text-[var(--bos-ink)]">{b.customer.name}</p><p className="text-[12px] text-[var(--bos-ink-3)]">{b.source}</p></td>
      <td className="py-3 pr-3 whitespace-nowrap text-[var(--bos-ink-2)]">{b.pickup.postcode} to {b.dropoff.postcode}</td>
      <td className="py-3 pr-3 whitespace-nowrap">{formatShortDateTime(b.start)}</td>
      <td className="py-3 pr-3"><StatusPill tone={DISPLAY_TONE[status]}>{DISPLAY_LABEL[status]}</StatusPill></td>
      <td className="py-3 pr-3 text-[var(--bos-ink-2)]">{b.assignment?.status === "confirmed" ? <>{b.assignment.driverName}<br /><span className="text-[12px] text-[var(--bos-ink-3)]">{b.assignment.vehicle?.registration ?? "No van recorded"}</span></> : <span className="text-[var(--bos-ink-3)]">None</span>}</td>
      <td className="py-3 pr-3 text-right whitespace-nowrap">{price !== null ? <span className="font-semibold">{formatMoney(price)}</span> : <Missing reason="No agreed price is recorded" />}</td>
      <td className="py-3"><div className="flex gap-1.5">
        <Button variant="secondary" onClick={() => openBooking(b.id)} aria-label={`Open ${b.reference}`}>Open</Button>
        {needsDriver && <Button variant="primary" onClick={() => openBooking(b.id, "assignment")} aria-label={`Assign a driver to ${b.reference}`}>Assign</Button>}
      </div></td>
    </tr>
  );
}

export function AllBookings() {
  const [state, update] = useUrlState({ q: "", status: "", assignment: "", source: "", from: "", to: "", sort: "date", dir: "asc", page: "1" });
  const query = { q: state.q || undefined, status: state.status || undefined, assignment: state.assignment || undefined, source: state.source || undefined, from: state.from || undefined, to: state.to || undefined, sort: state.sort, dir: state.dir === "desc" ? "desc" as const : "asc" as const, page: Number(state.page) || 1, pageSize: 15 };
  const list = useBookings(query);
  const filtered = !!(state.q || state.status || state.assignment || state.source || state.from || state.to);
  const sortBy = (sort: string) => update({ sort, dir: state.sort === sort && state.dir === "asc" ? "desc" : "asc", page: "1" });
  const select = "min-h-9 rounded-xl border border-[var(--bos-line-strong)] bg-[var(--bos-surface)] px-2 text-[13px] text-[var(--bos-ink)]";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="relative min-w-[220px] flex-1"><span className="sr-only">Search bookings</span><Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--bos-ink-3)]" />
          <input type="search" value={state.q} onChange={event => update({ q: event.target.value, page: "1" })} placeholder="Search bookings" className="min-h-10 w-full rounded-xl border border-[var(--bos-line-strong)] bg-[var(--bos-surface)] pl-9 pr-3 text-[13px] text-[var(--bos-ink)]" /></label>
        <select aria-label="Status" className={select} value={state.status} onChange={event => update({ status: event.target.value, page: "1" })}><option value="">Any status</option>{STATUSES.map(s => <option key={s} value={s}>{DISPLAY_LABEL[s]}</option>)}</select>
        <select aria-label="Assignment" className={select} value={state.assignment} onChange={event => update({ assignment: event.target.value, page: "1" })}><option value="">Any assignment</option><option value="unassigned">Needs a driver</option><option value="assigned">Has a driver</option></select>
        <select aria-label="Source" className={select} value={state.source} onChange={event => update({ source: event.target.value, page: "1" })}><option value="">Any source</option>{["website", "phone", "email", "staff", "other"].map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</select>
        <label className="text-[12px] text-[var(--bos-ink-2)]">From<input type="date" aria-label="Moving from" className={`${select} ml-1`} value={state.from} onChange={event => update({ from: event.target.value, page: "1" })} /></label>
        <label className="text-[12px] text-[var(--bos-ink-2)]">To<input type="date" aria-label="Moving to" className={`${select} ml-1`} value={state.to} onChange={event => update({ to: event.target.value, page: "1" })} /></label>
        {filtered && <Button variant="ghost" onClick={() => update({ q: "", status: "", assignment: "", source: "", from: "", to: "", page: "1" })}>Clear filters</Button>}
      </div>

      {list.isPending ? <LoadingBlock label="Loading bookings" rows={5} /> : list.isError ? <ErrorState message="Bookings could not be loaded." onRetry={() => list.refetch()} /> :
        !list.data.items.length ? <EmptyState title={filtered ? "No bookings match these filters" : "No bookings yet"} body={filtered ? "Clear the filters to see every booking." : "Confirmed bookings appear here."} /> : (
          <>
            <p className="text-[12px] text-[var(--bos-ink-3)]" aria-live="polite">{plural(list.data.pagination.total, "booking")}{list.isFetching ? ", updating…" : ""}</p>
            <div className="bos-card overflow-x-auto px-4">
              <table className="w-full min-w-[900px] text-left text-[13px]">
                <caption className="sr-only">All bookings, sorted by {state.sort} {state.dir === "desc" ? "descending" : "ascending"}</caption>
                <thead><tr className="text-[12px] text-[var(--bos-ink-3)]">{COLUMNS.map(c => (
                  <th key={c.id} scope="col" aria-sort={c.sort && state.sort === c.sort ? (state.dir === "desc" ? "descending" : "ascending") : c.sort ? "none" : undefined} className={`py-3 pr-3 font-medium ${c.align === "right" ? "text-right" : ""}`}>
                    {c.sort ? <button type="button" onClick={() => sortBy(c.sort!)} className="inline-flex items-center gap-1 font-medium hover:text-[var(--bos-ink)]">{c.label}{state.sort === c.sort && (state.dir === "desc" ? <ArrowDown aria-hidden className="h-3 w-3" /> : <ArrowUp aria-hidden className="h-3 w-3" />)}</button> : c.label}
                  </th>))}</tr></thead>
                <tbody>{list.data.items.map(b => <Row key={b.id} b={b} />)}</tbody>
              </table>
            </div>
            {list.data.pagination.totalPages > 1 && <div className="flex items-center justify-between text-[13px]"><Button disabled={list.data.pagination.page <= 1} onClick={() => update({ page: String(list.data.pagination.page - 1) })}>Previous</Button><span>Page {list.data.pagination.page} of {list.data.pagination.totalPages}</span><Button disabled={!list.data.pagination.hasMore} onClick={() => update({ page: String(list.data.pagination.page + 1) })}>Next</Button></div>}
          </>
        )}
    </div>
  );
}
