/**
 * Enquiry inbox: categories, list and preview. Actions shown are exactly the ones the server lists in
 * `allowedActions` for that enquiry's state, so a button never offers something the state machine would refuse.
 * Prices come only from recorded quotation versions; an enquiry without one says why, never "£0.00".
 * A possible duplicate is flagged and left alone: merging is a person's decision and is not automated.
 */
import React, { useState } from "react";
import { ArrowLeft, Copy, Search } from "lucide-react";
import { ENQUIRY_CATEGORIES, ENQUIRY_LABEL, PRICING_LABEL, newIdempotencyKey, type ActionId, type Enquiry, type EnquiryCategory, type PricingState, type Tone } from "../../../../lib/booking";
import { BookingWriteError } from "../../../../lib/booking/client";
import { useBookingWrite, useEnquiries, useEnquiryCounts } from "./hooks";
import { Button, Card, EmptyState, ErrorState, LoadingBlock, Missing, StatusPill } from "./ui";
import { useUrlState } from "../hooks/useUrlState";
import { formatMoney, formatShortDateTime, formatCalendarDate, formatAge, plural } from "../utils/format";
import { navigateTo, sectionHref } from "../navigation";

const PRICING_TONE: Record<PricingState, Tone> = { pending: "neutral", calculated: "success", failed: "danger", manual_review: "warning", unavailable: "warning" };
const STATUS_TONE: Record<string, Tone> = { new: "info", needs_info: "warning", quoted: "success", awaiting_customer: "cyan", accepted: "success", declined: "neutral", expired: "neutral", closed: "neutral" };

/** The price staff would act on: the approved version, else the newest version with a total. Null when none. */
export function shownPrice(e: Pick<Enquiry, "quotation">): { pence: number; source: string } | null {
  const q = e.quotation;
  if (!q) return null;
  const version = q.versions.find(v => v.id === q.approvedVersionId) ?? [...q.versions].reverse().find(v => v.totalPence !== null);
  return version && version.totalPence !== null ? { pence: version.totalPence, source: version.source === "manual" ? "Manual price" : version.source === "sample" ? "Sample price" : "Calculated" } : null;
}
export const pricingProblem = (e: Pick<Enquiry, "quotation">): string => {
  const q = e.quotation;
  if (!q) return "No quotation has been started.";
  return q.problem ?? (q.missingFields.length ? `Missing: ${q.missingFields.join(", ")}` : PRICING_LABEL[q.pricingState]);
};

function Price({ enquiry }: { enquiry: Enquiry }) {
  const price = shownPrice(enquiry);
  if (price) return <span className="font-semibold">{formatMoney(price.pence)}</span>;
  return <StatusPill tone={PRICING_TONE[enquiry.quotation?.pricingState ?? "pending"]}>{PRICING_LABEL[enquiry.quotation?.pricingState ?? "pending"]}</StatusPill>;
}

function EnquiryCard({ enquiry, selected, onSelect }: { enquiry: Enquiry; selected: boolean; onSelect: () => void }) {
  return (
    <li>
      <button type="button" onClick={onSelect} aria-current={selected ? "true" : undefined}
        className={`w-full rounded-2xl border p-3.5 text-left transition-colors ${selected ? "border-[var(--bos-primary)] bg-[var(--bos-azure-soft)]" : "border-[var(--bos-line)] bg-[var(--bos-surface)] hover:bg-[var(--bos-surface-2)]"}`}>
        <div className="flex items-start justify-between gap-2"><p className="truncate text-[14px] font-semibold text-[var(--bos-ink)]">{enquiry.customer.name}</p><span className="shrink-0 text-[12px] text-[var(--bos-ink-3)]">{formatAge(enquiry.submittedAt)}</span></div>
        <p className="mt-0.5 truncate text-[12px] text-[var(--bos-ink-3)]">{enquiry.reference} · {enquiry.source}</p>
        <p className="mt-1.5 truncate text-[13px] text-[var(--bos-ink-2)]">{enquiry.pickup.postcode || "No pickup"} to {enquiry.dropoff.postcode || "no drop-off"}</p>
        <p className="text-[13px] text-[var(--bos-ink-2)]">{enquiry.movingDate ? formatCalendarDate(enquiry.movingDate) : "No moving date"}{enquiry.startTime ? `, ${enquiry.startTime}` : ""}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusPill tone={STATUS_TONE[enquiry.status] ?? "neutral"}>{ENQUIRY_LABEL[enquiry.status]}</StatusPill>
          <Price enquiry={enquiry} />
          {enquiry.duplicateOf && <StatusPill tone="warning">Possible duplicate</StatusPill>}
        </div>
      </button>
    </li>
  );
}

const LABELS: Partial<Record<ActionId, string>> = { request_info: "Request information", close: "Close enquiry", confirm: "Confirm as booking", calculate_quote: "Calculate quote" };
type Panel = null | "info" | "close" | "price";

function Detail({ enquiry, onBack }: { enquiry: Enquiry; onBack: () => void }) {
  const [panel, setPanel] = useState<Panel>(null);
  const [note, setNote] = useState(""), [pounds, setPounds] = useState(""), [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const key = React.useRef(newIdempotencyKey("confirm-enquiry"));
  const done = (text: string) => { setMessage({ tone: "ok", text }); setPanel(null); setNote(""); setPounds(""); setReason(""); };
  const fail = (error: unknown) => setMessage({ tone: "error", text: error instanceof BookingWriteError ? (error.detail.code === "version_conflict" ? "Someone else changed this enquiry. It has been reloaded; check it and try again." : error.detail.message) : "That did not go through. Nothing was changed." });
  const requestInfo = useBookingWrite((api, v: { note: string }) => api.requestInfo(enquiry.id, enquiry.version, v.note));
  const close = useBookingWrite((api, _v: void) => api.closeEnquiry(enquiry.id, enquiry.version));
  const manual = useBookingWrite((api, v: { pence: number; reason: string }) => api.addManualQuote(enquiry.id, v.pence, v.reason, enquiry.version));
  const calc = useBookingWrite((api, _v: void) => api.calculateQuote(enquiry.id));
  const confirm = useBookingWrite((api, _v: void) => api.confirmFromEnquiry(enquiry.id, enquiry.version, key.current));
  const busy = [requestInfo, close, manual, calc, confirm].some(m => m.isPending);
  const allowed = new Set(enquiry.allowedActions);
  const price = shownPrice(enquiry);
  const penceInput = Math.round(Number(pounds) * 100);
  const priceValid = pounds.trim() !== "" && Number.isFinite(Number(pounds)) && Number(pounds) > 0 && reason.trim().length >= 5;

  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={onBack} className="lg:hidden"><ArrowLeft aria-hidden className="h-4 w-4" />Back to list</Button>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h2 className="text-[18px] font-semibold text-[var(--bos-ink)]">{enquiry.customer.name}</h2><p className="text-[13px] text-[var(--bos-ink-2)]">{enquiry.reference} · received {formatShortDateTime(enquiry.submittedAt)} · {enquiry.source}</p></div>
        <StatusPill tone={STATUS_TONE[enquiry.status] ?? "neutral"}>{ENQUIRY_LABEL[enquiry.status]}</StatusPill>
      </div>

      {enquiry.duplicateOf && (
        <div role="note" className="flex gap-2 rounded-xl border border-[var(--bos-amber)] bg-[var(--bos-amber-soft)] p-3 text-[13px]"><Copy aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-[var(--bos-amber-fg)]" />
          <p className="text-[var(--bos-ink)]"><span className="font-semibold">Possible duplicate of {enquiry.duplicateOf}.</span> {enquiry.duplicateReason} Nothing has been merged. Compare both before deciding.</p></div>
      )}

      <dl className="grid gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2">
        {[["Phone", enquiry.customer.phone], ["Email", enquiry.customer.email], ["Pickup", [enquiry.pickup.line, enquiry.pickup.postcode].filter(Boolean).join(", ")], ["Drop-off", [enquiry.dropoff.line, enquiry.dropoff.postcode].filter(Boolean).join(", ")],
          ["Moving date", enquiry.movingDate ? `${formatCalendarDate(enquiry.movingDate)}${enquiry.startTime ? `, ${enquiry.startTime}` : ""} (London)` : null], ["Property", enquiry.requirements.propertySize], ["Van", enquiry.requirements.vanType],
          ["Helpers", enquiry.requirements.helpers === null ? null : String(enquiry.requirements.helpers)], ["Estimated hours", enquiry.requirements.estimatedHours === null ? null : String(enquiry.requirements.estimatedHours)], ["Notes", enquiry.requirements.notes]].map(([label, value]) => (
          <div key={label as string}><dt className="text-[12px] text-[var(--bos-ink-3)]">{label}</dt><dd className="text-[var(--bos-ink)]">{value || <Missing reason="Not provided on the enquiry" />}</dd></div>
        ))}
      </dl>

      <Card title="Pricing" className="!p-4">
        {price ? <p className="text-[22px] font-semibold text-[var(--bos-ink)]">{formatMoney(price.pence)} <span className="text-[13px] font-normal text-[var(--bos-ink-3)]">{price.source}</span></p>
          : <div className="space-y-1"><StatusPill tone={PRICING_TONE[enquiry.quotation?.pricingState ?? "pending"]}>{PRICING_LABEL[enquiry.quotation?.pricingState ?? "pending"]}</StatusPill><p className="text-[13px] text-[var(--bos-ink-2)]">{pricingProblem(enquiry)}</p><p className="text-[12px] text-[var(--bos-ink-3)]">No price is shown until one is calculated or recorded with a reason.</p></div>}
      </Card>

      {message && <p role={message.tone === "error" ? "alert" : "status"} className={`rounded-xl px-3 py-2 text-[13px] ${message.tone === "error" ? "bg-[var(--bos-coral-soft)] text-[var(--bos-coral-fg)]" : "bg-[var(--bos-emerald-soft)] text-[var(--bos-emerald-fg)]"}`}>{message.text}</p>}

      <div className="flex flex-wrap gap-2">
        {allowed.has("confirm") && <Button variant="primary" disabled={busy} onClick={() => confirm.mutate(undefined, { onSuccess: () => done("Booking created from this enquiry."), onError: fail })}>{LABELS.confirm}</Button>}
        {allowed.has("calculate_quote") && <Button disabled={busy} onClick={() => calc.mutate(undefined, { onSuccess: () => done("Quote calculated."), onError: fail })}>{LABELS.calculate_quote}</Button>}
        {allowed.has("calculate_quote") && <Button disabled={busy} onClick={() => setPanel(panel === "price" ? null : "price")} aria-expanded={panel === "price"}>Record manual price</Button>}
        {allowed.has("request_info") && <Button disabled={busy} onClick={() => setPanel(panel === "info" ? null : "info")} aria-expanded={panel === "info"}>{LABELS.request_info}</Button>}
        {allowed.has("close") && <Button variant="danger" disabled={busy} onClick={() => setPanel(panel === "close" ? null : "close")} aria-expanded={panel === "close"}>{LABELS.close}</Button>}
        {enquiry.bookingId && <Button onClick={() => navigateTo(sectionHref("bookings", { view: "bookings", booking: enquiry.bookingId! }))}>Open booking</Button>}
      </div>

      {panel === "price" && (
        <form className="space-y-3 rounded-2xl border border-[var(--bos-line)] bg-[var(--bos-surface-2)] p-4" onSubmit={event => { event.preventDefault(); if (priceValid) manual.mutate({ pence: penceInput, reason: reason.trim() }, { onSuccess: () => done("Manual price recorded."), onError: fail }); }}>
          <label className="block text-[13px] font-medium text-[var(--bos-ink)]">Price (£)<input inputMode="decimal" value={pounds} onChange={event => setPounds(event.target.value)} className="mt-1 block min-h-10 w-full rounded-xl border border-[var(--bos-line-strong)] bg-[var(--bos-surface)] px-3" /></label>
          <label className="block text-[13px] font-medium text-[var(--bos-ink)]">Reason (required)<textarea value={reason} onChange={event => setReason(event.target.value)} rows={2} className="mt-1 block w-full rounded-xl border border-[var(--bos-line-strong)] bg-[var(--bos-surface)] px-3 py-2" /></label>
          <p className="text-[12px] text-[var(--bos-ink-3)]">Recorded as a manual price with your reason. It is not a calculated quote.</p>
          <Button type="submit" variant="primary" disabled={busy || !priceValid}>Save manual price</Button>
        </form>
      )}
      {panel === "info" && (
        <form className="space-y-3 rounded-2xl border border-[var(--bos-line)] bg-[var(--bos-surface-2)] p-4" onSubmit={event => { event.preventDefault(); if (note.trim()) requestInfo.mutate({ note: note.trim() }, { onSuccess: () => done("Marked as needing information."), onError: fail }); }}>
          <label className="block text-[13px] font-medium text-[var(--bos-ink)]">What do you need from the customer?<textarea value={note} onChange={event => setNote(event.target.value)} rows={2} className="mt-1 block w-full rounded-xl border border-[var(--bos-line-strong)] bg-[var(--bos-surface)] px-3 py-2" /></label>
          <p className="text-[12px] text-[var(--bos-ink-3)]">This records the request on the enquiry. It does not send a message to the customer.</p>
          <Button type="submit" variant="primary" disabled={busy || !note.trim()}>Record request</Button>
        </form>
      )}
      {panel === "close" && (
        <div className="space-y-3 rounded-2xl border border-[var(--bos-coral)] bg-[var(--bos-coral-soft)] p-4"><p className="text-[13px] text-[var(--bos-ink)]">Close this enquiry? It moves to Closed and stops appearing in the open lists.</p>
          <div className="flex gap-2"><Button variant="danger" disabled={busy} onClick={() => close.mutate(undefined, { onSuccess: () => done("Enquiry closed."), onError: fail })}>Close enquiry</Button><Button variant="ghost" onClick={() => setPanel(null)}>Keep open</Button></div></div>
      )}

      <section aria-label="History"><h3 className="mb-2 text-[13px] font-semibold text-[var(--bos-ink)]">History</h3>
        <ol className="space-y-1.5 border-l border-[var(--bos-line)] pl-3 text-[13px]">{enquiry.history.map((h, i) => <li key={i}><span className="text-[var(--bos-ink-3)]">{formatShortDateTime(h.at)} · {h.by}</span><br />{h.text}</li>)}</ol></section>
    </div>
  );
}

export function EnquiryInbox() {
  const [state, update] = useUrlState({ cat: "all", q: "", pricing: "", source: "", enquiry: "", page: "1" });
  const category = (ENQUIRY_CATEGORIES.some(c => c.id === state.cat) ? state.cat : "all") as EnquiryCategory;
  const counts = useEnquiryCounts();
  const list = useEnquiries({ category, q: state.q || undefined, pricing: state.pricing || undefined, source: state.source || undefined, page: Number(state.page) || 1, pageSize: 20 });
  const selected = list.data?.items.find(e => e.id === state.enquiry) ?? null;
  const filtered = !!(state.q || state.pricing || state.source);
  return (
    <div className="grid gap-4 lg:grid-cols-[210px_minmax(280px,360px)_1fr]">
      <nav aria-label="Enquiry categories" className={`${state.enquiry ? "hidden lg:block" : ""} flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible`}>
        {ENQUIRY_CATEGORIES.map(c => (
          <button key={c.id} type="button" aria-current={c.id === category ? "page" : undefined} onClick={() => update({ cat: c.id, enquiry: "", page: "1" })}
            className={`flex shrink-0 items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-[13px] font-semibold ${c.id === category ? "bg-[var(--bos-surface)] text-[var(--bos-ink)] shadow-sm ring-1 ring-[var(--bos-line-strong)]" : "text-[var(--bos-ink-2)] hover:bg-[var(--bos-surface-2)]"}`}>
            {c.label}<span className="rounded-full bg-[var(--bos-surface-3)] px-2 text-[11px]">{counts.data ? counts.data[c.id] : "…"}</span>
          </button>
        ))}
      </nav>

      <div className={`${state.enquiry ? "hidden lg:block" : ""} min-w-0 space-y-3`}>
        <div className="space-y-2">
          <label className="relative block"><span className="sr-only">Search enquiries</span><Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--bos-ink-3)]" />
            <input type="search" value={state.q} onChange={event => update({ q: event.target.value, page: "1" })} placeholder="Search enquiries" className="min-h-10 w-full rounded-xl border border-[var(--bos-line-strong)] bg-[var(--bos-surface)] pl-9 pr-3 text-[13px]" /></label>
          <div className="flex gap-2">
            <select aria-label="Pricing state" value={state.pricing} onChange={event => update({ pricing: event.target.value, page: "1" })} className="min-h-9 flex-1 rounded-xl border border-[var(--bos-line-strong)] bg-[var(--bos-surface)] px-2 text-[13px] text-[var(--bos-ink)]"><option value="">Any pricing</option>{(Object.keys(PRICING_LABEL) as PricingState[]).map(p => <option key={p} value={p}>{PRICING_LABEL[p]}</option>)}</select>
            <select aria-label="Source" value={state.source} onChange={event => update({ source: event.target.value, page: "1" })} className="min-h-9 flex-1 rounded-xl border border-[var(--bos-line-strong)] bg-[var(--bos-surface)] px-2 text-[13px] text-[var(--bos-ink)]"><option value="">Any source</option>{["website", "phone", "email", "staff", "other"].map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</select>
            {filtered && <Button variant="ghost" onClick={() => update({ q: "", pricing: "", source: "", page: "1" })}>Clear</Button>}
          </div>
        </div>
        {list.isPending ? <LoadingBlock label="Loading enquiries" rows={4} /> : list.isError ? <ErrorState message="Enquiries could not be loaded." onRetry={() => list.refetch()} /> :
          !list.data.items.length ? <EmptyState title={filtered ? "No enquiries match these filters" : "No enquiries in this list"} body={filtered ? "Clear the filters to see everything in this category." : undefined} /> : (
            <>
              <p className="text-[12px] text-[var(--bos-ink-3)]" aria-live="polite">{plural(list.data.pagination.total, "enquiry", "enquiries")}</p>
              <ul className="space-y-2">{list.data.items.map(e => <EnquiryCard key={e.id} enquiry={e} selected={e.id === state.enquiry} onSelect={() => update({ enquiry: e.id }, { push: true })} />)}</ul>
              {list.data.pagination.totalPages > 1 && <div className="flex items-center justify-between text-[13px]"><Button disabled={list.data.pagination.page <= 1} onClick={() => update({ page: String(list.data.pagination.page - 1) })}>Previous</Button><span>Page {list.data.pagination.page} of {list.data.pagination.totalPages}</span><Button disabled={!list.data.pagination.hasMore} onClick={() => update({ page: String(list.data.pagination.page + 1) })}>Next</Button></div>}
            </>
          )}
      </div>

      <div className={`${state.enquiry ? "" : "hidden lg:block"} min-w-0`}>
        <Card className="min-h-[320px]">
          {selected ? <Detail key={selected.id} enquiry={selected} onBack={() => update({ enquiry: "" })} />
            : state.enquiry && !list.isPending ? <EmptyState title="That enquiry is not in this list" body="It may have moved to another category or been closed." action={<Button onClick={() => update({ enquiry: "" })}>Back to list</Button>} />
            : <EmptyState title="Select an enquiry" body="Its details, pricing and the actions available for its current state appear here." />}
        </Card>
      </div>
    </div>
  );
}
