/**
 * Booking workspace: a centred dialog over whichever Bookings view is open (`?booking=ID`, tab in `?bookingTab=`).
 * Everything shown comes from the booking record. A missing price or payment figure reads "Not recorded". Actions
 * are the ones the server allows; assignment checks are the server's (hard conflicts block, warnings are shown).
 */
import React, { useRef, useState } from "react";
import { DISPLAY_LABEL, DISPLAY_TONE, ASSIGNMENT_LABEL, BOOKING_LABEL, PRICING_LABEL, QUOTATION_LABEL, agreedTotalPence, displayStatus, newIdempotencyKey, type AssignResult, type Booking, type Conflict, type Recommendation } from "../../../../lib/booking";
import { BookingWriteError } from "../../../../lib/booking/client";
import { useBooking, useBookingActivity, useBookingWrite, useRecommendations } from "./hooks";
import { BosDialog, BosTabs, Button, EmptyState, ErrorState, LoadingBlock, Missing, StatusPill } from "./ui";
import { formatMoney, formatShortDateTime, formatCalendarDate } from "../utils/format";
import { openJob, updateUrlParams } from "../navigation";

export const TABS = [
  { id: "overview", label: "Overview" }, { id: "moving", label: "Moving details" }, { id: "pricing", label: "Pricing" },
  { id: "assignment", label: "Assignment" }, { id: "activity", label: "Activity" }, { id: "payments", label: "Payments" }
] as const;
export type TabId = typeof TABS[number]["id"];

const Item = ({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) => <div className={wide ? "sm:col-span-2" : undefined}><dt className="text-[12px] text-[var(--bos-ink-3)]">{label}</dt><dd className="text-[14px] text-[var(--bos-ink)]">{children}</dd></div>;
const Value = ({ value, reason }: { value: string | null | undefined; reason?: string }) => (value ? <>{value}</> : <Missing reason={reason ?? "Not recorded on this booking"} />);
const money = (pence: number | null) => (pence === null ? <Missing reason="Not recorded" /> : <>{formatMoney(pence)}</>);

function ConflictList({ conflicts }: { conflicts: Conflict[] }) {
  if (!conflicts.length) return null;
  return (
    <ul className="space-y-1.5" aria-label="Checks">
      {conflicts.map((c, i) => (
        <li key={i} className={`rounded-xl px-3 py-2 text-[13px] ${c.severity === "blocking" ? "bg-[var(--bos-coral-soft)] text-[var(--bos-coral-fg)]" : "bg-[var(--bos-amber-soft)] text-[var(--bos-amber-fg)]"}`}>
          <span className="font-semibold">{c.severity === "blocking" ? "Blocked: " : "Check: "}</span>{c.message}
        </li>
      ))}
    </ul>
  );
}

export function AssignmentTab({ booking }: { booking: Booking }) {
  const recs = useRecommendations(booking.id, booking.allowedActions.includes("assign") || booking.allowedActions.includes("reassign"));
  const key = useRef(newIdempotencyKey("assign"));
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<{ ok: boolean; conflicts: Conflict[]; who?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const assign = useBookingWrite((api, v: { rec: Recommendation }) => api.assign({ bookingId: booking.id, driverInitials: v.rec.driverInitials, vehicleRegistration: v.rec.vehicle?.registration ?? null, version: booking.version, reason: reason.trim() || undefined }, key.current));
  const reassigning = booking.assignment?.status === "confirmed";
  const canChange = booking.allowedActions.includes("assign") || booking.allowedActions.includes("reassign");
  const go = (rec: Recommendation) => {
    setError(null); setResult(null);
    assign.mutate({ rec }, {
      onSuccess: (r: AssignResult) => { setResult({ ok: r.ok, conflicts: r.conflicts, who: rec.driverName }); if (r.ok) { key.current = newIdempotencyKey("assign"); setReason(""); } },
      onError: e => setError(e instanceof BookingWriteError ? (e.detail.code === "version_conflict" ? "Someone else changed this booking. It has been reloaded; check it and try again." : e.detail.fields?.reason ?? e.detail.message) : "That did not go through. Nothing was changed.")
    });
  };
  return (
    <div className="space-y-5">
      <section aria-label="Current assignment">
        <h3 className="mb-2 text-[14px] font-semibold text-[var(--bos-ink)]">Current assignment</h3>
        {booking.assignment?.status === "confirmed"
          ? <p className="text-[14px]">{booking.assignment.driverName} ({booking.assignment.driverInitials}), {booking.assignment.vehicle ? `${booking.assignment.vehicle.registration}, ${booking.assignment.vehicle.category}` : "no van recorded"}. Assigned {formatShortDateTime(booking.assignment.assignedAt)} by {booking.assignment.assignedBy}.</p>
          : <p className="text-[14px] text-[var(--bos-ink-2)]">No driver is assigned.</p>}
      </section>

      {result && <div role="status" className="space-y-2"><p className={`rounded-xl px-3 py-2 text-[13px] ${result.ok ? "bg-[var(--bos-emerald-soft)] text-[var(--bos-emerald-fg)]" : "bg-[var(--bos-coral-soft)] text-[var(--bos-coral-fg)]"}`}>{result.ok ? `${result.who} assigned.` : "Not assigned. The checks below stopped it."}</p><ConflictList conflicts={result.conflicts} /></div>}
      {error && <p role="alert" className="rounded-xl bg-[var(--bos-coral-soft)] px-3 py-2 text-[13px] text-[var(--bos-coral-fg)]">{error}</p>}

      {canChange ? (
        <section aria-label="Recommendations">
          <h3 className="mb-1 text-[14px] font-semibold text-[var(--bos-ink)]">{reassigning ? "Reassign to another driver" : "Choose a driver"}</h3>
          <p className="mb-3 text-[12px] text-[var(--bos-ink-3)]">Drivers with no recorded shift or availability are never treated as free. Travel time is not available, so it is not used.</p>
          {reassigning && <label className="mb-3 block text-[13px] font-medium text-[var(--bos-ink)]">Reason for the change (required)<input value={reason} onChange={event => setReason(event.target.value)} className="mt-1 block min-h-10 w-full rounded-xl border border-[var(--bos-line-strong)] bg-[var(--bos-surface)] px-3 text-[14px]" /></label>}
          {recs.isPending ? <LoadingBlock label="Checking drivers" /> : recs.isError ? <ErrorState message="Driver checks could not be loaded." onRetry={() => recs.refetch()} /> : (
            <ul className="space-y-2">
              {recs.data.map(rec => (
                <li key={rec.driverInitials} className="rounded-2xl border border-[var(--bos-line)] bg-[var(--bos-surface)] p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div><p className="text-[14px] font-semibold text-[var(--bos-ink)]">{rec.driverName} <span className="font-normal text-[var(--bos-ink-3)]">{rec.driverInitials}{rec.vehicle ? `, ${rec.vehicle.registration}` : ""}</span></p>
                      <p className="text-[12px] text-[var(--bos-ink-3)]">Workload today: {rec.workloadHoursToday === null ? "not recorded" : `${rec.workloadHoursToday.toFixed(1)} h`}</p></div>
                    <div className="flex items-center gap-2"><StatusPill tone={rec.eligible ? "success" : "danger"}>{rec.eligible ? "Can take it" : "Cannot take it"}</StatusPill>
                      <Button variant="primary" disabled={!rec.eligible || assign.isPending || (reassigning && reason.trim().length < 3)} onClick={() => go(rec)} aria-label={`${reassigning ? "Reassign to" : "Assign"} ${rec.driverName}`}>{reassigning ? "Reassign" : "Assign"}</Button></div>
                  </div>
                  {rec.reasons.length > 0 && <ul className="mt-2 list-disc pl-5 text-[13px] text-[var(--bos-ink-2)]">{rec.reasons.map(r => <li key={r}>{r}</li>)}</ul>}
                  <div className="mt-2 space-y-1.5"><ConflictList conflicts={rec.hardViolations} />{rec.warnings.map(w => <p key={w} className="rounded-xl bg-[var(--bos-amber-soft)] px-3 py-2 text-[13px] text-[var(--bos-amber-fg)]">Check: {w}</p>)}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : <p className="text-[13px] text-[var(--bos-ink-2)]">This booking cannot be assigned or changed in its current state.</p>}

      <section aria-label="Assignment history">
        <h3 className="mb-2 text-[14px] font-semibold text-[var(--bos-ink)]">History</h3>
        {booking.assignmentHistory.length ? <ol className="space-y-1.5 border-l border-[var(--bos-line)] pl-3 text-[13px]">{[...booking.assignmentHistory].reverse().map(a => <li key={a.id}><span className="text-[var(--bos-ink-3)]">{formatShortDateTime(a.assignedAt)} · {a.assignedBy}</span><br />{a.driverName}, {ASSIGNMENT_LABEL[a.status]}{a.releasedAt ? `, released ${formatShortDateTime(a.releasedAt)}` : ""}{a.reason ? `. Reason: ${a.reason}` : ""}</li>)}</ol> : <p className="text-[13px] text-[var(--bos-ink-2)]">No assignments yet.</p>}
      </section>
    </div>
  );
}

function CancelPanel({ booking }: { booking: Booking }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const cancel = useBookingWrite((api, v: { reason: string }) => api.cancelBooking(booking.id, booking.version, v.reason));
  if (!booking.allowedActions.includes("cancel")) return null;
  return (
    <div className="space-y-2">
      <Button variant="danger" aria-expanded={open} onClick={() => setOpen(!open)}>Cancel booking</Button>
      {open && (
        <form className="space-y-2 rounded-2xl border border-[var(--bos-coral)] bg-[var(--bos-coral-soft)] p-4" onSubmit={event => { event.preventDefault(); setError(null); cancel.mutate({ reason: reason.trim() }, { onError: e => setError(e instanceof BookingWriteError ? e.detail.message : "That did not go through. The booking was not cancelled.") }); }}>
          <label className="block text-[13px] font-medium text-[var(--bos-ink)]">Reason for cancelling (required)<input value={reason} onChange={event => setReason(event.target.value)} className="mt-1 block min-h-10 w-full rounded-xl border border-[var(--bos-line-strong)] bg-[var(--bos-surface)] px-3 text-[14px]" /></label>
          <p className="text-[12px] text-[var(--bos-ink-2)]">This records the cancellation. It does not send a message to the customer or the driver.</p>
          {error && <p role="alert" className="text-[13px] text-[var(--bos-coral-fg)]">{error}</p>}
          <Button type="submit" variant="danger" disabled={cancel.isPending || reason.trim().length < 3}>Confirm cancellation</Button>
        </form>
      )}
    </div>
  );
}

function Panel({ booking, tab }: { booking: Booking; tab: TabId }) {
  const activity = useBookingActivity(booking.id, tab === "activity");
  const q = booking.quotation;
  const agreed = agreedTotalPence(q);
  if (tab === "overview") return (
    <div className="space-y-5">
      <dl className="grid gap-4 sm:grid-cols-2">
        <Item label="Customer"><Value value={booking.customer.name} /></Item>
        <Item label="Contact"><Value value={[booking.customer.phone, booking.customer.email].filter(Boolean).join(" · ")} /></Item>
        <Item label="Pickup"><Value value={[booking.pickup.line, booking.pickup.postcode].filter(Boolean).join(", ")} /></Item>
        <Item label="Drop-off"><Value value={[booking.dropoff.line, booking.dropoff.postcode].filter(Boolean).join(", ")} /></Item>
        <Item label="Starts (London)">{formatShortDateTime(booking.start)}</Item>
        <Item label="Ends (London)">{formatShortDateTime(booking.end)}</Item>
        <Item label="Driver and van">{booking.assignment?.status === "confirmed" ? `${booking.assignment.driverName}, ${booking.assignment.vehicle?.registration ?? "no van recorded"}` : <span className="text-[var(--bos-ink-3)]">Not assigned</span>}</Item>
        <Item label="Agreed price">{money(agreed)}</Item>
        <Item label="Source">{booking.source}</Item><Item label="Created">{formatShortDateTime(booking.createdAt)}</Item>
      </dl>
      <div className="flex flex-wrap gap-2">
        {booking.jobId && <Button variant="secondary" onClick={() => openJob(booking.jobId!)}>Open job {booking.jobId}</Button>}
        {(booking.allowedActions.includes("assign") || booking.allowedActions.includes("reassign")) && <Button variant="primary" onClick={() => updateUrlParams({ bookingTab: "assignment" }, true)}>{booking.allowedActions.includes("reassign") ? "Reassign" : "Assign a driver"}</Button>}
      </div>
      <CancelPanel booking={booking} />
    </div>
  );
  if (tab === "moving") { const r = booking.requirements; return (
    <dl className="grid gap-4 sm:grid-cols-2">
      <Item label="Property"><Value value={r.propertySize} /></Item><Item label="Van type"><Value value={r.vanType} /></Item>
      <Item label="Helpers">{r.helpers === null ? <Missing /> : r.helpers}</Item><Item label="Estimated hours">{r.estimatedHours === null ? <Missing /> : r.estimatedHours}</Item>
      <Item label="Pickup stairs"><Value value={r.pickupStairs} /></Item><Item label="Destination stairs"><Value value={r.dropoffStairs} /></Item>
      <Item label="Extras">{r.extras.length ? r.extras.join(", ") : <Missing />}</Item><Item label="Moving date">{formatCalendarDate(booking.start)}</Item>
      <Item label="Inventory" wide><Value value={r.inventory} /></Item><Item label="Notes" wide><Value value={r.notes} /></Item>
    </dl>
  ); }
  if (tab === "pricing") return !q ? <EmptyState title="No quotation is recorded" body="No price is shown because none was calculated or entered." /> : (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2"><StatusPill tone={q.pricingState === "calculated" ? "success" : "warning"}>{PRICING_LABEL[q.pricingState]}</StatusPill><StatusPill tone="neutral">Quotation {QUOTATION_LABEL[q.status]}</StatusPill></div>
      <p className="text-[24px] font-semibold text-[var(--bos-ink)]">{agreed === null ? <span className="text-[16px]"><Missing reason="No version is approved" /></span> : formatMoney(agreed)}</p>
      {q.problem && <p className="text-[13px] text-[var(--bos-ink-2)]">{q.problem}</p>}
      {[...q.versions].reverse().map(v => (
        <section key={v.id} aria-label={`Quote version ${v.version}`} className="rounded-2xl border border-[var(--bos-line)] bg-[var(--bos-surface)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[14px] font-semibold">Version {v.version}{v.id === q.approvedVersionId ? " (approved)" : ""}</p><p className="text-[13px] text-[var(--bos-ink-3)]">{v.source === "manual" ? "Manual price" : v.source === "sample" ? "Sample price" : `Calculated${v.ruleVersion ? `, rules ${v.ruleVersion}` : ""}`} · {formatShortDateTime(v.createdAt)} · {v.createdBy}</p></div>
          {v.reason && <p className="mt-1 text-[13px] text-[var(--bos-ink-2)]">Reason: {v.reason}</p>}
          {v.lines.length > 0 && <ul className="mt-2 divide-y divide-[var(--bos-line)] text-[13px]">{v.lines.map((l, i) => <li key={i} className="flex justify-between gap-3 py-1.5"><span>{l.label}</span><span>{formatMoney(l.amountPence)}</span></li>)}</ul>}
          <p className="mt-2 text-right text-[14px] font-semibold">{money(v.totalPence)}</p>
        </section>
      ))}
    </div>
  );
  if (tab === "assignment") return <AssignmentTab booking={booking} />;
  if (tab === "activity") return activity.isPending ? <LoadingBlock label="Loading activity" /> : activity.isError ? <ErrorState message="Activity could not be loaded." onRetry={() => activity.refetch()} /> :
    !activity.data.length ? <EmptyState title="No activity yet" /> : <ol className="space-y-2 border-l border-[var(--bos-line)] pl-3 text-[13px]">{activity.data.map(a => <li key={a.id}><span className="text-[var(--bos-ink-3)]">{formatShortDateTime(a.at)} · {a.actorName}</span><br />{a.text}</li>)}</ol>;
  const p = booking.payments;
  return (
    <div className="space-y-4">
      <dl className="grid gap-4 sm:grid-cols-3"><Item label="Agreed">{money(p.agreedPence)}</Item><Item label="Collected">{money(p.collectedPence)}</Item><Item label="Outstanding">{money(p.outstandingPence)}</Item></dl>
      <p className="text-[13px] text-[var(--bos-ink-2)]">{p.state === "unknown" ? "Payment status is not known. Payments are reported by the existing payment system, which is not connected here, so nothing is assumed." : `Payment state: ${p.state.replace("_", " ")}.`}</p>
    </div>
  );
}

export function BookingDetails({ id, tab, onTab, onClose }: { id: string; tab: TabId; onTab: (tab: TabId) => void; onClose: () => void }) {
  const booking = useBooking(id);
  const data = booking.data;
  const status = data ? displayStatus(data) : null;
  return (
    <BosDialog open onClose={onClose} title={data ? `${data.reference}, ${data.customer.name}` : "Booking"} subtitle={data ? `${formatShortDateTime(data.start)} (London)` : undefined}
      badges={data && status ? <><StatusPill tone={DISPLAY_TONE[status]}>{DISPLAY_LABEL[status]}</StatusPill><StatusPill tone="neutral">Booking {BOOKING_LABEL[data.status]}</StatusPill></> : undefined}
      tabs={<BosTabs tabs={TABS.map(t => ({ id: t.id, label: t.label }))} value={tab} onChange={onTab} label="Booking sections" idBase="bk" />}>
      <div role="tabpanel" id="bk-panel" aria-labelledby={`bk-${tab}`}>
        {booking.isPending ? <LoadingBlock label="Loading booking" rows={4} /> : booking.isError ? <ErrorState title="This booking could not be opened" message={booking.error instanceof BookingWriteError ? booking.error.message : undefined} onRetry={() => booking.refetch()} /> : <Panel booking={data!} tab={tab} />}
      </div>
    </BosDialog>
  );
}
