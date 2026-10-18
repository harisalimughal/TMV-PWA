/**
 * Bookings overview ("Command Centre"). Every figure comes from the summary endpoint; a figure the server cannot
 * provide arrives as `value: null` and is shown as "Not available", never 0. Revenue is a known subtotal with its
 * coverage stated.
 */
import React from "react";
import { DateTime } from "luxon";
import { CalendarCheck, Inbox, PoundSterling, UserX, Truck, Gauge } from "lucide-react";
import { agreedTotalPence, DISPLAY_LABEL, DISPLAY_TONE, displayStatus, londonDay, type AttentionItem, type CommandCentreSummary } from "../../../../lib/booking";
import { useBookings, useBookingSummary } from "./hooks";
import { useBookingSource } from "./source";
import { Button, Card, EmptyState, ErrorState, KpiCard, LoadingBlock, Missing, RadialGauge, Donut, SampleBanner, StatusPill } from "./ui";
import { formatMoney, formatShortDateTime, plural } from "../utils/format";
import { navigateTo, sectionHref } from "../navigation";

export const RANGES = { today: "Today", "7d": "Last 7 days", "30d": "Last 30 days" } as const;
export type RangeId = keyof typeof RANGES;

export function rangeFor(id: RangeId, now: DateTime = DateTime.now()): { from: string; to: string } {
  const today = now.setZone("Europe/London").startOf("day");
  const first = id === "today" ? today : today.minus({ days: id === "7d" ? 6 : 29 });
  return { from: first.toUTC().toISO()!, to: today.endOf("day").toUTC().toISO()! };
}

const KIND_ACCENT: Record<AttentionItem["kind"], string> = { unreviewed_enquiry: "azure", awaiting_assignment: "amber", conflict: "coral", missing_information: "amber", awaiting_customer: "cyan" };
const ACTION_LABEL: Record<string, string> = { review: "Review", assign: "Assign", resolve_conflict: "Resolve", request_info: "Request info", chase: "Open", confirm: "Review" };

function openTarget(item: AttentionItem) {
  navigateTo(item.target === "enquiry" ? sectionHref("bookings", { view: "enquiries", enquiry: item.targetId }) : sectionHref("bookings", { view: "bookings", booking: item.targetId }));
}

function Attention({ items }: { items: AttentionItem[] }) {
  if (!items.length) return <EmptyState title="Nothing needs your attention" body="New enquiries, unassigned bookings and conflicts appear here as they happen." />;
  return (
    <ul className="divide-y divide-[var(--bos-line)]">
      {items.map(item => (
        <li key={item.id} className="flex items-center gap-3 py-3">
          <span aria-hidden className="h-8 w-1 shrink-0 rounded-full" style={{ background: `var(--bos-${KIND_ACCENT[item.kind]})` }} />
          <div className="min-w-0 flex-1"><p className="truncate text-[14px] font-semibold text-[var(--bos-ink)]">{item.title}</p><p className="truncate text-[13px] text-[var(--bos-ink-2)]">{item.detail}</p></div>
          <Button variant="secondary" onClick={() => openTarget(item)} aria-label={`${ACTION_LABEL[item.action] ?? "Open"}: ${item.title}`}>{ACTION_LABEL[item.action] ?? "Open"}</Button>
        </li>
      ))}
    </ul>
  );
}

function Trend({ data }: { data: NonNullable<CommandCentreSummary["trend"]> }) {
  const max = Math.max(1, ...data.flatMap(d => [d.enquiries, d.confirmed]));
  const w = 520, h = 140, pad = 20, slot = (w - pad * 2) / Math.max(1, data.length), bar = Math.min(14, slot / 3);
  const label = DateTime.fromISO;
  return (
    <figure>
      <svg viewBox={`0 0 ${w} ${h + 22}`} className="w-full" role="img" aria-label={`Enquiries and confirmed bookings per day: ${data.map(d => `${d.day} ${d.enquiries} and ${d.confirmed}`).join("; ")}`}>
        {[0, 0.5, 1].map(f => <line key={f} x1={pad} x2={w - pad} y1={h - f * (h - 10)} y2={h - f * (h - 10)} stroke="var(--bos-line)" />)}
        {data.map((d, i) => {
          const x = pad + i * slot + slot / 2;
          return (
            <g key={d.day}>
              <rect x={x - bar - 1} width={bar} y={h - (d.enquiries / max) * (h - 10)} height={(d.enquiries / max) * (h - 10)} rx={3} fill="var(--bos-azure)" />
              <rect x={x + 1} width={bar} y={h - (d.confirmed / max) * (h - 10)} height={(d.confirmed / max) * (h - 10)} rx={3} fill="var(--bos-emerald)" />
              {(data.length <= 10 || i % Math.ceil(data.length / 8) === 0) && <text x={x} y={h + 16} textAnchor="middle" fontSize="10" fill="var(--bos-ink-3)">{label(d.day).toFormat("d LLL")}</text>}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex gap-4 text-[12px] text-[var(--bos-ink-2)]"><span><span aria-hidden className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: "var(--bos-azure)" }} />Enquiries</span><span><span aria-hidden className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: "var(--bos-emerald)" }} />Confirmed</span></figcaption>
    </figure>
  );
}

function Upcoming() {
  const now = new Date().toISOString();
  const bookings = useBookings({ from: now, sort: "start", dir: "asc", pageSize: 6 });
  return (
    <Card title="Upcoming bookings" subtitle="Next confirmed moves, London time" action={<Button variant="ghost" onClick={() => navigateTo(sectionHref("bookings", { view: "bookings" }))}>View all</Button>}>
      {bookings.isPending ? <LoadingBlock label="Loading upcoming bookings" /> : bookings.isError ? <ErrorState message="Upcoming bookings could not be loaded." onRetry={() => bookings.refetch()} /> : !bookings.data.items.length ? <EmptyState title="No upcoming bookings" /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[13px]">
            <caption className="sr-only">Upcoming bookings</caption>
            <thead><tr className="text-[12px] text-[var(--bos-ink-3)]"><th scope="col" className="pb-2 font-medium">Reference</th><th scope="col" className="pb-2 font-medium">Customer</th><th scope="col" className="pb-2 font-medium">Starts</th><th scope="col" className="pb-2 font-medium">Status</th><th scope="col" className="pb-2 text-right font-medium">Price</th></tr></thead>
            <tbody className="divide-y divide-[var(--bos-line)]">
              {bookings.data.items.map(b => {
                const status = displayStatus(b);
                return (
                  <tr key={b.id}>
                    <th scope="row" className="py-2.5 font-semibold"><button type="button" className="text-[var(--bos-azure-fg)] underline-offset-2 hover:underline" onClick={() => navigateTo(sectionHref("bookings", { view: "bookings", booking: b.id }))}>{b.reference}</button></th>
                    <td className="py-2.5">{b.customer.name}</td>
                    <td className="py-2.5">{formatShortDateTime(b.start)}</td>
                    <td className="py-2.5"><StatusPill tone={DISPLAY_TONE[status]}>{DISPLAY_LABEL[status]}</StatusPill></td>
                    <td className="py-2.5 text-right">{agreedTotalPence(b.quotation) !== null ? formatMoney(agreedTotalPence(b.quotation)) : <Missing reason="No price recorded for this booking" />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function CommandCentre({ range }: { range: RangeId }) {
  const { from, to } = React.useMemo(() => rangeFor(range), [range]);
  const { source } = useBookingSource();
  const summary = useBookingSummary(from, to);
  if (summary.isPending) return <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><LoadingBlock rows={2} label="Loading booking figures" /><LoadingBlock rows={2} label="" /><LoadingBlock rows={2} label="" /></div></div>;
  if (summary.isError) return <ErrorState message={summary.error instanceof Error ? summary.error.message : undefined} onRetry={() => summary.refetch()} />;
  const s = summary.data;
  const revenue = s.bookingRevenuePence;
  const conv = s.conversion;
  return (
    <div className="space-y-4">
      {s.sample && source === "live" && <SampleBanner>This server answered with sample data (a demo or development mock). Nothing here is a real customer or booking.</SampleBanner>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard label="New enquiries" accent="azure" icon={<Inbox className="h-4 w-4" />} value={s.newEnquiries.value} unavailableReason={s.newEnquiries.unavailableReason} />
        <KpiCard label="Confirmed bookings" accent="emerald" icon={<CalendarCheck className="h-4 w-4" />} value={s.confirmedBookings.value} unavailableReason={s.confirmedBookings.unavailableReason} />
        <KpiCard label="Today's jobs" accent="cyan" icon={<Truck className="h-4 w-4" />} value={s.todaysJobs.value} unavailableReason={s.todaysJobs.unavailableReason} />
        <KpiCard label="Unassigned bookings" accent="amber" icon={<UserX className="h-4 w-4" />} value={s.unassignedBookings.value} unavailableReason={s.unassignedBookings.unavailableReason} />
        <KpiCard label={revenue.knownOnly ? "Known booking revenue" : "Booking revenue"} accent="violet" icon={<PoundSterling className="h-4 w-4" />} value={revenue.value === null ? null : formatMoney(revenue.value)} unavailableReason={revenue.unavailableReason}
          hint={revenue.unpricedBookings ? `${plural(revenue.unpricedBookings, "booking")} without a recorded price are not included` : "Agreed prices of confirmed bookings"} />
        <KpiCard label="Driver utilisation" accent="violet" icon={<Gauge className="h-4 w-4" />} value={s.driverUtilizationPct.value === null ? null : `${Math.round(s.driverUtilizationPct.value)}%`} unavailableReason={s.driverUtilizationPct.unavailableReason} />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card title="Needs your attention" subtitle={`${plural(s.attention.length, "item")}, most urgent first`}><Attention items={s.attention} /></Card>
        <Card title="Enquiries and confirmations" subtitle="Per London day">{s.trend ? <Trend data={s.trend} /> : <Missing reason="The server did not provide a daily trend" />}</Card>
      </div>

      <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card title="Driver utilisation" subtitle="Booked hours against recorded shift hours"><RadialGauge pct={s.driverUtilizationPct.value} label="Driver utilisation" />{s.driverUtilizationPct.value === null && s.driverUtilizationPct.unavailableReason && <p className="mt-2 text-center text-[12px] text-[var(--bos-ink-3)]">{s.driverUtilizationPct.unavailableReason}</p>}</Card>
        <Card title="Enquiry outcome" subtitle="Enquiries received and confirmed in the period">
          {conv.enquiries.value === null || conv.confirmed.value === null ? <Missing reason={conv.enquiries.unavailableReason ?? conv.confirmed.unavailableReason} /> : <Donut label="Enquiry outcome" segments={[{ label: "Confirmed", value: conv.confirmed.value, accent: "emerald" }, { label: "Not yet confirmed", value: Math.max(0, conv.enquiries.value - conv.confirmed.value), accent: "amber" }]} />}
        </Card>
        <Card title="Driver workload" subtitle="Booked hours in the period">
          {!s.workload ? <Missing reason="The server did not provide workload" /> : !s.workload.length ? <EmptyState title="No assigned bookings in the period" /> : (
            <ul className="space-y-2.5">
              {s.workload.map(w => (
                <li key={w.driverInitials} className="text-[13px]"><div className="flex justify-between"><span className="text-[var(--bos-ink)]">{w.driverName}</span><span className="font-semibold">{w.hours === null ? <Missing /> : `${w.hours.toFixed(1)} h`}</span></div>
                  <div className="mt-1 h-1.5 rounded-full bg-[var(--bos-surface-3)]"><div className="h-full rounded-full" style={{ width: `${w.hours === null ? 0 : Math.min(100, (w.hours / Math.max(8, ...s.workload!.map(x => x.hours ?? 0))) * 100)}%`, background: "var(--bos-violet)" }} /></div></li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Upcoming />
      <p className="text-[12px] text-[var(--bos-ink-3)]">{londonDay(s.from)} to {londonDay(s.to)}, London time. Generated {formatShortDateTime(s.generatedAt)}.</p>
    </div>
  );
}
