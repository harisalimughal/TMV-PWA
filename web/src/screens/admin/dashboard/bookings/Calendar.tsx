/**
 * Scheduling calendar: a resource timeline (day), a week grid and a month overview, all from one schedule read
 * in Europe/London time. Moving is never applied by a drop: a drop (or the "Move" button, the keyboard route)
 * opens the same server-checked MovePanel. Conflicts carry a text label as well as colour, and a driver with no
 * shift data is labelled "Availability unknown", never shown as free.
 */
import React, { useMemo, useState } from "react";
import { DateTime } from "luxon";
import { ChevronLeft, ChevronRight, MoveRight, TriangleAlert } from "lucide-react";
import { DISPLAY_LABEL, DISPLAY_TONE, assignLanes, londonDay, londonDayBounds, londonTime, type ResourceAvailability, type ScheduleItem, type ScheduleResponse } from "../../../../lib/booking";
import { useSchedule } from "./hooks";
import { MovePanel, type MoveTarget } from "./MovePanel";
import { openBooking } from "./AllBookings";
import { Button, EmptyState, ErrorState, LoadingBlock, StatusPill, toneClass } from "./ui";
import { useUrlState } from "../hooks/useUrlState";

const MODES = [{ id: "day", label: "Day" }, { id: "week", label: "Week" }, { id: "month", label: "Month" }] as const;
type Mode = typeof MODES[number]["id"];
const DAY_START = 6, DAY_END = 22, SPAN = (DAY_END - DAY_START) * 60;
const UNASSIGNED = "__unassigned";

export function rangeOf(mode: Mode, date: string): { days: string[]; from: string; to: string } {
  const d = DateTime.fromISO(date, { zone: "Europe/London" });
  const first = mode === "day" ? d : mode === "week" ? d.startOf("week") : d.startOf("month");
  const last = mode === "day" ? d : mode === "week" ? d.endOf("week") : d.endOf("month");
  const days: string[] = [];
  for (let c = first.startOf("day"); c <= last; c = c.plus({ days: 1 })) days.push(c.toISODate()!);
  return { days, from: londonDayBounds(days[0]).start, to: londonDayBounds(days[days.length - 1]).end };
}
const shift = (mode: Mode, date: string, dir: 1 | -1) => DateTime.fromISO(date, { zone: "Europe/London" }).plus(mode === "day" ? { days: dir } : mode === "week" ? { weeks: dir } : { months: dir }).toISODate()!;
const conflictOf = (data: ScheduleResponse, id: string) => data.conflicts.filter(c => c.bookingId === id);

function Chip({ item, data, onMove, draggable }: { item: ScheduleItem; data: ScheduleResponse; onMove: (item: ScheduleItem) => void; draggable?: boolean }) {
  const conflicts = conflictOf(data, item.bookingId);
  const blocking = conflicts.some(c => c.severity === "blocking");
  return (
    <div draggable={draggable} onDragStart={event => { event.dataTransfer.setData("text/plain", item.bookingId); event.dataTransfer.effectAllowed = "move"; }}
      className={`flex min-w-0 items-stretch overflow-hidden rounded-lg text-[12px] ${toneClass(DISPLAY_TONE[item.displayStatus])} ${blocking ? "ring-2 ring-[var(--bos-coral)]" : ""}`}>
      <button type="button" onClick={() => openBooking(item.bookingId)} className="min-w-0 flex-1 px-2 py-1 text-left" title={`${item.reference}, ${item.customerName}, ${item.route}, ${DISPLAY_LABEL[item.displayStatus]}`}
        aria-label={`Open ${item.reference}, ${item.customerName}, ${londonTime(item.start)} to ${londonTime(item.end)}, ${DISPLAY_LABEL[item.displayStatus]}${conflicts.length ? `, ${conflicts.length} ${conflicts.length === 1 ? "conflict" : "conflicts"}` : ""}`}>
        <span className="block truncate font-semibold">{item.reference} {londonTime(item.start)}</span>
        <span className="block truncate">{item.customerName}</span>
        {conflicts.length > 0 && <span className="mt-0.5 flex items-center gap-1 font-semibold"><TriangleAlert aria-hidden className="h-3 w-3" />{blocking ? "Conflict" : "Check"}</span>}
      </button>
      <button type="button" onClick={() => onMove(item)} aria-label={`Move ${item.reference}`} className="grid w-7 shrink-0 place-items-center border-l border-black/10 hover:bg-black/10"><MoveRight aria-hidden className="h-3.5 w-3.5" /></button>
    </div>
  );
}

function ResourceLabel({ r }: { r: ResourceAvailability }) {
  return (
    <div className="min-w-0"><p className="truncate text-[13px] font-semibold text-[var(--bos-ink)]">{r.name}</p>
      <p className="truncate text-[11px] text-[var(--bos-ink-3)]">{r.state === "unknown" ? "Availability unknown" : r.basis}</p></div>
  );
}

function DayTimeline({ date, data, drivers, onMove, onDrop }: { date: string; data: ScheduleResponse; drivers: ResourceAvailability[]; onMove: (item: ScheduleItem) => void; onDrop: (bookingId: string, driver: string | null, time: string) => void }) {
  const rows = [...drivers.map(d => ({ id: d.id, label: <ResourceLabel r={d} /> })), { id: UNASSIGNED, label: <p className="text-[13px] font-semibold text-[var(--bos-ink)]">Unassigned</p> }];
  const hours = Array.from({ length: DAY_END - DAY_START + 1 }, (_, i) => DAY_START + i);
  const day = londonDayBounds(date);
  const pct = (iso: string) => Math.max(0, Math.min(100, ((Date.parse(iso) - Date.parse(day.start)) / 60000 - DAY_START * 60) / SPAN * 100));
  return (
    <div className="bos-card overflow-x-auto">
      <div className="min-w-[860px]">
        <div className="grid grid-cols-[170px_1fr] border-b border-[var(--bos-line)]"><div />
          <div className="relative h-7">{hours.map((h, i) => <span key={h} className={`absolute top-1 text-[11px] text-[var(--bos-ink-3)] ${i === hours.length - 1 ? "-translate-x-full pr-1" : "-translate-x-1/2"}`} style={{ left: `${((h - DAY_START) * 60 / SPAN) * 100}%` }}>{String(h).padStart(2, "0")}:00</span>)}</div></div>
        {rows.map(row => {
          const items = assignLanes(data.items.filter(i => (row.id === UNASSIGNED ? !i.driverInitials : i.driverInitials === row.id) && londonDay(i.start) <= date && londonDay(i.end) >= date));
          const lanes = Math.max(1, ...items.map(i => i.lane + 1));
          const away = data.unavailable.filter(u => u.resourceId === row.id && Date.parse(u.start) < Date.parse(day.end) && Date.parse(u.end) > Date.parse(day.start));
          return (
            <div key={row.id} role="group" aria-label={row.id === UNASSIGNED ? "Unassigned bookings" : `Bookings for ${drivers.find(d => d.id === row.id)?.name}`} className="grid grid-cols-[170px_1fr] border-b border-[var(--bos-line)] last:border-b-0">
              <div className="flex items-center px-3 py-2">{row.label}</div>
              <div className="relative" style={{ height: lanes * 48 + 8 }}
                onDragOver={event => event.preventDefault()}
                onDrop={event => { event.preventDefault(); const id = event.dataTransfer.getData("text/plain"); if (!id) return; const rect = event.currentTarget.getBoundingClientRect(); const minutes = DAY_START * 60 + Math.round(((event.clientX - rect.left) / rect.width) * SPAN / 15) * 15; onDrop(id, row.id === UNASSIGNED ? null : row.id, `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`); }}>
                {hours.map(h => <span key={h} aria-hidden className="absolute inset-y-0 border-l border-[var(--bos-line)]" style={{ left: `${((h - DAY_START) * 60 / SPAN) * 100}%` }} />)}
                {away.map((u, i) => <div key={i} className="absolute inset-y-1 grid place-items-center rounded-lg border border-dashed border-[var(--bos-line-strong)] bg-[var(--bos-surface-3)] text-[11px] font-semibold text-[var(--bos-ink-2)]" style={{ left: `${pct(u.start)}%`, width: `${pct(u.end) - pct(u.start)}%` }}>{u.reason}</div>)}
                {items.map(item => <div key={item.bookingId} className="absolute" style={{ left: `${pct(item.start)}%`, width: `${Math.max(7, pct(item.end) - pct(item.start))}%`, top: 4 + item.lane * 48, height: 44 }}><Chip item={item} data={data} onMove={onMove} draggable /></div>)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekGrid({ days, data, drivers, onMove }: { days: string[]; data: ScheduleResponse; drivers: ResourceAvailability[]; onMove: (item: ScheduleItem) => void }) {
  const rows = [...drivers.map(d => ({ id: d.id, label: <ResourceLabel r={d} /> })), { id: UNASSIGNED, label: <p className="text-[13px] font-semibold">Unassigned</p> }];
  return (
    <div className="bos-card overflow-x-auto"><table className="w-full min-w-[900px] table-fixed text-left">
      <caption className="sr-only">Week schedule by driver</caption>
      <thead><tr><th scope="col" className="w-[150px] p-2 text-[12px] font-medium text-[var(--bos-ink-3)]">Driver</th>{days.map(d => <th key={d} scope="col" className="p-2 text-[12px] font-medium text-[var(--bos-ink-2)]">{DateTime.fromISO(d).toFormat("ccc d LLL")}</th>)}</tr></thead>
      <tbody>{rows.map(row => (
        <tr key={row.id} className="border-t border-[var(--bos-line)] align-top"><th scope="row" className="p-2 text-left font-normal">{row.label}</th>
          {days.map(d => { const items = data.items.filter(i => (row.id === UNASSIGNED ? !i.driverInitials : i.driverInitials === row.id) && londonDay(i.start) === d);
            const off = data.unavailable.some(u => u.resourceId === row.id && londonDay(u.start) === d);
            return <td key={d} className="space-y-1 p-1.5">{off && <p className="rounded-lg border border-dashed border-[var(--bos-line-strong)] bg-[var(--bos-surface-3)] px-2 py-1 text-[11px] font-semibold text-[var(--bos-ink-2)]">Unavailable</p>}{items.map(i => <Chip key={i.bookingId} item={i} data={data} onMove={onMove} />)}</td>; })}
        </tr>))}</tbody></table></div>
  );
}

function MonthGrid({ days, data, date, onDay }: { days: string[]; data: ScheduleResponse; date: string; onDay: (day: string) => void }) {
  const lead = DateTime.fromISO(days[0]).weekday - 1;
  return (
    <div className="bos-card p-3">
      <div aria-hidden className="mb-1.5 grid grid-cols-7 gap-1.5">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(n => <div key={n} className="px-1 text-[12px] font-medium text-[var(--bos-ink-2)]">{n}</div>)}</div>
      <ul aria-label="Month overview" className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: lead }, (_, i) => <li key={`l${i}`} aria-hidden />)}
        {days.map(d => {
          const items = data.items.filter(i => londonDay(i.start) === d);
          const unassigned = items.filter(i => !i.driverInitials).length;
          const conflicts = items.filter(i => conflictOf(data, i.bookingId).length).length;
          return (
            <li key={d}><button type="button" onClick={() => onDay(d)} aria-label={`${DateTime.fromISO(d).toFormat("cccc d LLLL")}: ${items.length} ${items.length === 1 ? "booking" : "bookings"}${unassigned ? `, ${unassigned} unassigned` : ""}${conflicts ? `, ${conflicts} with conflicts` : ""}`}
              className={`min-h-[72px] w-full overflow-hidden rounded-xl border p-1.5 text-left text-[12px] ${d === londonDay(new Date().toISOString()) ? "border-[var(--bos-primary)]" : "border-[var(--bos-line)]"} bg-[var(--bos-surface)] hover:bg-[var(--bos-surface-2)]`}>
              <span className="font-semibold text-[var(--bos-ink)]">{DateTime.fromISO(d).day}</span>
              {items.length > 0 && <><span className="mt-1 hidden text-[var(--bos-ink-2)] sm:block">{items.length} {items.length === 1 ? "booking" : "bookings"}</span><span aria-hidden className="mt-0.5 block text-[var(--bos-ink-2)] sm:hidden">{items.length}</span></>}
              {unassigned > 0 && <><span className="hidden font-semibold text-[var(--bos-amber-fg)] sm:block">{unassigned} unassigned</span><span aria-hidden className="block font-semibold text-[var(--bos-amber-fg)] sm:hidden">{unassigned}U</span></>}
              {conflicts > 0 && <><span className="hidden font-semibold text-[var(--bos-coral-fg)] sm:block">{conflicts} conflict{conflicts > 1 ? "s" : ""}</span><span aria-hidden className="block font-semibold text-[var(--bos-coral-fg)] sm:hidden">{conflicts}!</span></>}
            </button></li>
          );
        })}
      </ul>
      <p className="mt-2 text-[12px] text-[var(--bos-ink-3)] sm:hidden">Number = bookings, U = unassigned, ! = conflict. Tap a day to open it.</p>
      <p className="sr-only">{date}</p>
    </div>
  );
}

export function Calendar() {
  const [state, update] = useUrlState({ mode: "week", date: londonDay(new Date().toISOString()) });
  const mode = (MODES.some(m => m.id === state.mode) ? state.mode : "week") as Mode;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(state.date) ? state.date : londonDay(new Date().toISOString());
  const range = useMemo(() => rangeOf(mode, date), [mode, date]);
  const schedule = useSchedule(range.from, range.to);
  const [moving, setMoving] = useState<{ target: MoveTarget; auto: boolean } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const drivers = schedule.data?.resources.filter(r => r.kind === "driver") ?? [];
  const startMove = (item: ScheduleItem, patch?: Partial<MoveTarget>, auto = false) => setMoving({ auto, target: { item, date: londonDay(item.start), time: londonTime(item.start), driver: item.driverInitials, ...patch } });
  const heading = mode === "day" ? DateTime.fromISO(date).toFormat("cccc d LLLL yyyy") : mode === "week" ? `${DateTime.fromISO(range.days[0]).toFormat("d LLL")} to ${DateTime.fromISO(range.days[6]).toFormat("d LLL yyyy")}` : DateTime.fromISO(date).toFormat("LLLL yyyy");
  const clash = schedule.data ? new Set(schedule.data.conflicts.map(c => c.bookingId)).size : 0;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Button variant="secondary" onClick={() => update({ date: shift(mode, date, -1) })} aria-label="Previous"><ChevronLeft aria-hidden className="h-4 w-4" /></Button>
          <Button variant="secondary" onClick={() => update({ date: londonDay(new Date().toISOString()) })}>Today</Button>
          <Button variant="secondary" onClick={() => update({ date: shift(mode, date, 1) })} aria-label="Next"><ChevronRight aria-hidden className="h-4 w-4" /></Button>
          <h2 className="ml-2 text-[16px] font-semibold text-[var(--bos-ink)]" aria-live="polite">{heading}</h2>
        </div>
        <div role="group" aria-label="Calendar view" className="flex gap-1 rounded-2xl border border-[var(--bos-line)] bg-[var(--bos-surface)] p-1">{MODES.map(m => <button key={m.id} type="button" aria-pressed={m.id === mode} onClick={() => update({ mode: m.id })} className={`min-h-9 rounded-xl px-3 text-[13px] font-semibold ${m.id === mode ? "bg-[var(--bos-primary)] text-[var(--bos-on-accent)]" : "text-[var(--bos-ink-2)] hover:bg-[var(--bos-surface-2)]"}`}>{m.label}</button>)}</div>
      </div>
      <p className="text-[12px] text-[var(--bos-ink-3)]">All times are London time. {mode === "day" ? "Drag a booking onto a driver and time, or use its Move button. " : "Use a booking's Move button to reschedule it. "}Nothing changes until the server has checked the move and you apply it.</p>
      {notice && <p role="status" className="rounded-xl bg-[var(--bos-emerald-soft)] px-3 py-2 text-[13px] text-[var(--bos-emerald-fg)]">{notice}</p>}
      {clash > 0 && <p className="flex items-center gap-2 rounded-xl bg-[var(--bos-amber-soft)] px-3 py-2 text-[13px] text-[var(--bos-amber-fg)]"><TriangleAlert aria-hidden className="h-4 w-4" />{clash} {clash === 1 ? "booking has" : "bookings have"} a conflict or a check in this view. They are marked on the calendar.</p>}
      {moving && <MovePanel key={`${moving.target.item.bookingId}:${moving.target.date}:${moving.target.time}:${moving.target.driver}`} target={moving.target} drivers={drivers.map(d => ({ id: d.id, name: d.name }))} autoCheck={moving.auto} onCancel={() => setMoving(null)} onDone={message => { setMoving(null); setNotice(message); }} />}
      {schedule.isPending ? <LoadingBlock label="Loading the schedule" rows={5} /> : schedule.isError ? <ErrorState message="The schedule could not be loaded." onRetry={() => schedule.refetch()} /> :
        !schedule.data.items.length && mode !== "month" ? <EmptyState title="No bookings in this period" body="Try another day or week." /> :
        mode === "day" ? <DayTimeline date={date} data={schedule.data} drivers={drivers} onMove={item => { setNotice(null); startMove(item); }}
            onDrop={(id, driver, time) => { const item = schedule.data.items.find(i => i.bookingId === id); if (item) { setNotice(null); startMove(item, { date, time, driver }, true); } }} /> :
        mode === "week" ? <WeekGrid days={range.days} data={schedule.data} drivers={drivers} onMove={item => { setNotice(null); startMove(item); }} /> :
        <MonthGrid days={range.days} data={schedule.data} date={date} onDay={day => update({ mode: "day", date: day })} />}
    </div>
  );
}
