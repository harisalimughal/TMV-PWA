/**
 * Drivers / Cards: one card per driver with the figures the deployed Drivers page
 * showed for the selected range -- completed jobs, revenue handled (final charges) with
 * its payment-method split, average start delay, working time ("Total Move Time" on
 * the deployed page, which was the working time) and review reports sent / not sent.
 *
 * Figures come from `/api/admin/drivers/summary`, the same source as the Performance
 * table, so the two views agree. A card opens that driver's report for the same range.
 * A final-charges total far above every recorded payment is flagged for checking
 * rather than shown as if it were ordinary.
 */
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowUpRight, Briefcase, Mail, Pencil, Phone, ShieldCheck, Truck } from "lucide-react";
import { fetchDrivers } from "../api";
import type { DriverSummaryItem } from "../types";
import { formatDelay, formatMinutes, formatPounds, formatRange, plural } from "../utils/format";
import { formatVanReg } from "../utils/drivers";
import { Badge, EmptyState, ErrorState, LoadingState, Missing, focusRing, panel } from "./ds";
import { cx } from "../../../../ui/cx";

const METHODS: Array<{ key: keyof DriverSummaryItem; label: string }> = [
  { key: "cashCollectedPounds", label: "cash" }, { key: "cardCollectedPounds", label: "card" }, { key: "linkCollectedPounds", label: "link" },
  { key: "bankCollectedPounds", label: "bank" }, { key: "invoiceCollectedPounds", label: "invoice" }
];

const num = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;

/** Sum of every payment recorded against the driver's jobs, invoices included. */
export function recordedPaymentsPounds(row: DriverSummaryItem): number {
  return METHODS.reduce((sum, method) => sum + num(row[method.key]), 0);
}

/**
 * True when final charges are implausibly far above all recorded payments: more than
 * ten times as much and at least £10,000 more. Such a total usually means one job's
 * final charge was mistyped; the figure is shown, but flagged for checking.
 */
export function revenueAnomaly(row: DriverSummaryItem): boolean {
  const final = num(row.revenuePounds), recorded = recordedPaymentsPounds(row);
  return final > 10 * recorded && final - recorded >= 10_000;
}

export function cardRows(drivers: DriverSummaryItem[], needle: string): DriverSummaryItem[] {
  const q = needle.trim().toLowerCase();
  return drivers.filter(row => row.initials !== "UNASSIGNED" && row.hasAccount)
    .filter(row => !q || [row.fullName, row.initials, row.email, row.phone, row.vanRegistration].some(value => (value || "").toLowerCase().includes(q)))
    .sort((a, b) => Number(b.active) - Number(a.active) || b.completed - a.completed || a.fullName.localeCompare(b.fullName));
}

function Stat({ label, value, detail, tone }: { label: string; value: React.ReactNode; detail?: React.ReactNode; tone?: "warn" }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12.5px] font-medium text-admin-ink-2">{label}</dt>
      <dd className={cx("mt-0.5 text-[19px] font-bold leading-7 tabular-nums tracking-tight", tone === "warn" ? "text-admin-status-amber" : "text-admin-ink")}>{value}</dd>
      {detail && <dd className="text-[12px] leading-4 text-admin-ink-2">{detail}</dd>}
    </div>
  );
}

function DriverCard({ row, onOpen, onProfile, onEdit, work }: { row: DriverSummaryItem; onOpen: () => void; onProfile?: () => void; onEdit?: () => void; work?: React.ReactNode }) {
  const split = METHODS.filter(method => num(row[method.key]) > 0).map(method => `${formatPounds(num(row[method.key]))} ${method.label}`);
  const anomaly = revenueAnomaly(row);
  const delay = row.completed > 0 ? Math.round(num(row.avgDelayMinutes)) : null;
  const working = row.totalDurationMinutes == null || (row.totalDurationMinutes === 0 && num(row.workingUnknownJobs) >= row.completed && row.completed > 0) ? null : row.totalDurationMinutes;
  const sent = num(row.reviewSentCount), notSent = num(row.reviewNotSentCount);
  return (
    <article className="tmv-gloss tmv-lift group relative flex flex-col gap-4 p-5" aria-label={`${row.fullName} (${row.initials})`}>
      <header className="flex items-start gap-3">
        <span aria-hidden className="tmv-avatar grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-[14px] font-bold">{row.initials.slice(0, 2)}</span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[17px] font-bold leading-6 text-admin-ink">
            <button type="button" onClick={onOpen} className={cx("text-left after:absolute after:inset-0 after:rounded-[inherit] after:content-['']", focusRing)}>{row.fullName}</button>
            {row.hasAccount && <span title="Has a driver app account" className="ml-1.5 inline-block align-[-2px]"><ShieldCheck aria-hidden className="h-4 w-4 text-admin-status-green" /><span className="sr-only">Has a driver app account</span></span>}
          </h2>
          <p className="font-mono text-[12.5px] font-semibold text-admin-ink-2">{row.initials}</p>
        </div>
        <div className="relative z-10 flex shrink-0 items-center gap-1.5">
          {row.active ? <Badge tone="success">ACTIVE</Badge> : <Badge>INACTIVE</Badge>}
          {onEdit && (
            <button type="button" onClick={onEdit} aria-label={`Edit driver ${row.fullName}`} title="Edit driver"
              className={cx("grid h-8 w-8 place-items-center rounded-lg border border-admin-line bg-surface text-admin-ink-2 transition hover:border-admin-line-strong hover:text-admin-ink", focusRing)}>
              <Pencil aria-hidden className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      <ul className="space-y-1 text-[13.5px] text-admin-ink-2">
        <li className="flex min-w-0 items-center gap-2"><Mail aria-hidden className="h-4 w-4 shrink-0" />{row.email ? <span className="truncate">{row.email}</span> : <Missing>Email not recorded</Missing>}</li>
        <li className="flex items-center gap-2"><Phone aria-hidden className="h-4 w-4 shrink-0" />{row.phone ? <span className="tabular-nums">{row.phone}</span> : <Missing>Phone not recorded</Missing>}</li>
        {work != null && <li className="flex items-center gap-2"><Briefcase aria-hidden className="h-4 w-4 shrink-0" /><span className="truncate" title="Current or next job today">{work}</span></li>}
        <li className="flex items-center gap-2"><Truck aria-hidden className="h-4 w-4 shrink-0" />{row.vanRegistration ? <span className="rounded-md border border-admin-line bg-admin-surface px-1.5 py-0.5 font-mono text-[12.5px] font-semibold tracking-wide text-admin-ink">{formatVanReg(row.vanRegistration)}</span> : <Missing>No vehicle</Missing>}</li>
      </ul>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 border-t border-admin-line pt-4">
        <Stat label="Completed Jobs" value={row.completed} detail={row.cancelled ? `${row.cancelled} cancelled` : undefined} />
        <Stat label="Revenue Handled" value={formatPounds(row.revenuePounds)} tone={anomaly ? "warn" : undefined}
          detail={split.length ? <span className="uppercase">{split.join(" · ")}</span> : row.completed ? "No recorded payments" : undefined} />
        <Stat label="Avg Start Delay" value={delay === null ? <Missing>No jobs</Missing> : formatDelay(delay)} detail="Average across completed jobs" />
        <Stat label="Total Move Time" value={working === null ? <Missing>Not recorded</Missing> : formatMinutes(working)}
          detail={num(row.workingUnknownJobs) ? `${plural(num(row.workingUnknownJobs), "job")} missing times` : "Working time on completed jobs"} />
      </dl>

      <div className="flex items-center justify-between gap-3 border-t border-admin-line pt-3 text-[13.5px]">
        <span><span className="text-admin-ink-2">Review Reports </span><strong className="tabular-nums text-admin-ink">{sent} sent</strong><span className={notSent > 0 ? "text-admin-status-amber" : "text-admin-ink-2"}> · {notSent} not sent</span></span>
        <span className="relative z-10 inline-flex items-center gap-3">
          {onProfile && <button type="button" onClick={onProfile} aria-label={`View profile for ${row.fullName}`} className={cx("font-semibold text-admin-ink-2 hover:text-admin-ink hover:underline", focusRing)}>Profile</button>}
          <span aria-hidden className="inline-flex items-center gap-1 font-semibold text-admin-brand opacity-80 transition group-hover:opacity-100">Report<ArrowUpRight className="h-4 w-4" /></span>
        </span>
      </div>

      {anomaly && (
        <p className="relative z-10 flex gap-2 rounded-xl border border-admin-status-amber/30 bg-admin-status-amber-bg px-3 py-2 text-[12.5px] text-admin-ink">
          <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-admin-status-amber" />
          <span>Revenue handled is far above every recorded payment ({formatPounds(recordedPaymentsPounds(row))}). A job's final charge may have been mistyped; check this driver's jobs.</span>
        </p>
      )}
    </article>
  );
}

export function DriverCards({ from, to, search, onOpen, onProfile, onEdit, workFor }: { from: string; to: string; search: string; onOpen: (initials: string) => void; onProfile?: (initials: string) => void; onEdit?: (driver: DriverSummaryItem) => void; workFor?: (initials: string) => React.ReactNode }) {
  const query = useQuery({ queryKey: ["drivers_summary", from, to, "core", "completed"], queryFn: ({ signal }) => fetchDrivers(from, to, false, signal, true), staleTime: 30_000, gcTime: 5 * 60_000 });
  const rows = cardRows(query.data?.drivers ?? [], search);
  if (query.isLoading) return <div className={panel}><LoadingState label="Loading drivers" /></div>;
  if (query.isError) return <div className={panel}><ErrorState title="Couldn't load driver figures" message={(query.error as Error)?.message} onRetry={() => void query.refetch()} /></div>;
  if (!rows.length) return <div className={panel}><EmptyState kind={search ? "no-matches" : "empty"} title={search ? `No drivers match “${search}”` : "No drivers yet"} /></div>;
  return (
    <section aria-label={`Drivers, ${formatRange(from, to)}`} className="space-y-3">
      <p className="text-[13px] text-admin-ink-2">Completed jobs in {formatRange(from, to)}, London time. Revenue handled is final charges billed at completion, including invoices.</p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map(row => <DriverCard key={row.initials} row={row} onOpen={() => onOpen(row.initials)} onProfile={onProfile ? () => onProfile(row.initials) : undefined} onEdit={onEdit ? () => onEdit(row) : undefined} work={workFor?.(row.initials)} />)}
      </div>
    </section>
  );
}
