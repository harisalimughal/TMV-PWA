/**
 * Reschedule or reassign one booking. This is the keyboard and form route to the same server check a drag uses:
 * "Check" asks the server (dry run) for conflicts, and "Apply move" is only enabled for the exact values that
 * were checked and came back without a blocking conflict. Nothing is applied by dropping or by typing alone.
 */
import React, { useRef, useState } from "react";
import { DateTime } from "luxon";
import { LONDON, fromLondon, minutesBetween, newIdempotencyKey, addMinutes, type Conflict, type ScheduleItem } from "../../../../lib/booking";
import { BookingWriteError } from "../../../../lib/booking/client";
import { useBookingWrite } from "./hooks";
import { Button } from "./ui";

export interface MoveTarget { item: ScheduleItem; date: string; time: string; driver: string | null }
const input = "mt-1 block min-h-10 w-full rounded-xl border border-[var(--bos-line-strong)] bg-[var(--bos-surface)] px-3 text-[14px] text-[var(--bos-ink)]";

export function MovePanel({ target, drivers, onDone, onCancel, autoCheck }: { target: MoveTarget; drivers: Array<{ id: string; name: string }>; onDone: (message: string) => void; onCancel: () => void; autoCheck?: boolean }) {
  const { item } = target;
  const [date, setDate] = useState(target.date), [time, setTime] = useState(target.time), [driver, setDriver] = useState<string>(target.driver ?? "");
  const [checked, setChecked] = useState<{ sig: string; ok: boolean; conflicts: Conflict[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(newIdempotencyKey("move"));
  const sig = `${date}|${time}|${driver}`;
  const duration = minutesBetween(item.start, item.end);
  const start = fromLondon(date, time);
  const request = (dryRun: boolean) => ({ bookingId: item.bookingId, start: start!, end: addMinutes(start!, duration), driverInitials: driver === "" ? null : driver, version: item.version, dryRun });
  const move = useBookingWrite((api, v: { dryRun: boolean }) => api.move(request(v.dryRun), key.current));
  const fail = (e: unknown) => setError(e instanceof BookingWriteError ? (e.detail.code === "version_conflict" ? "Someone else changed this booking. The calendar has been reloaded; check it and try again." : e.detail.message) : "That did not go through. Nothing was changed.");
  const check = () => { setError(null); if (!start) { setError("That time does not exist on that date (clocks change). Choose another time."); return; } move.mutate({ dryRun: true }, { onSuccess: r => setChecked({ sig, ok: r.ok, conflicts: r.conflicts }), onError: fail }); };
  const apply = () => { setError(null); move.mutate({ dryRun: false }, { onSuccess: r => { if (r.ok) onDone(`${item.reference} moved to ${DateTime.fromISO(date, { zone: LONDON }).toFormat("d LLL")} ${time}.`); else setChecked({ sig, ok: false, conflicts: r.conflicts }); }, onError: fail }); };
  React.useEffect(() => { if (autoCheck) check(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const fresh = checked?.sig === sig;
  return (
    <form className="space-y-3 rounded-2xl border border-[var(--bos-line-strong)] bg-[var(--bos-surface)] p-4" aria-label={`Move ${item.reference}`} onSubmit={event => { event.preventDefault(); check(); }}>
      <p className="text-[14px] font-semibold text-[var(--bos-ink)]">Move {item.reference}, {item.customerName}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-[13px] font-medium">Date (London)<input type="date" className={input} value={date} onChange={e => setDate(e.target.value)} /></label>
        <label className="text-[13px] font-medium">Start (London, 24 hour)<input type="time" className={input} value={time} onChange={e => setTime(e.target.value)} /></label>
        <label className="text-[13px] font-medium">Driver<select className={input} value={driver} onChange={e => setDriver(e.target.value)}><option value="">Unassigned</option>{drivers.map(d => <option key={d.id} value={d.id}>{d.name} ({d.id})</option>)}</select></label>
      </div>
      <p className="text-[12px] text-[var(--bos-ink-3)]">The booking keeps its length ({Math.round(duration / 6) / 10} h). The server checks the move; nothing changes until you apply it.</p>
      {error && <p role="alert" className="rounded-xl bg-[var(--bos-coral-soft)] px-3 py-2 text-[13px] text-[var(--bos-coral-fg)]">{error}</p>}
      {fresh && (
        <div role="status" className="space-y-1.5">
          <p className={`rounded-xl px-3 py-2 text-[13px] font-semibold ${checked!.ok ? "bg-[var(--bos-emerald-soft)] text-[var(--bos-emerald-fg)]" : "bg-[var(--bos-coral-soft)] text-[var(--bos-coral-fg)]"}`}>{checked!.ok ? (checked!.conflicts.length ? "Allowed, with checks to read" : "No conflicts found") : "Blocked by the checks below"}</p>
          {checked!.conflicts.map((c, i) => <p key={i} className={`rounded-xl px-3 py-2 text-[13px] ${c.severity === "blocking" ? "bg-[var(--bos-coral-soft)] text-[var(--bos-coral-fg)]" : "bg-[var(--bos-amber-soft)] text-[var(--bos-amber-fg)]"}`}><span className="font-semibold">{c.severity === "blocking" ? "Blocked: " : "Check: "}</span>{c.message}</p>)}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={move.isPending}>Check move</Button>
        <Button type="button" variant="primary" disabled={move.isPending || !fresh || !checked!.ok} onClick={apply}>Apply move</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
