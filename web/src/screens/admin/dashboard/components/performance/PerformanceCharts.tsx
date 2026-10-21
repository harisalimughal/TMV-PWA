/**
 * The Performance charts. Each answers one question and is built from the same driver
 * rows as the table, so a chart can never disagree with it:
 *
 *   JobsRanking          who completed how many jobs, and each driver's share
 *   FinancialComparison  calculated against final charges per driver (never combined)
 *   ChargesTrend         calculated and final charges per day, from real jobs
 *   WorkingTimeChart     recorded working time, average over jobs that have a time
 *   ReviewDonut          review requests sent, as a share of those tracked
 *   PaymentMix           money received by method; invoices are billed, not received
 */
import React, { useState } from "react";
import { Briefcase, Clock, Mail, PoundSterling, TrendingUp, Wallet } from "lucide-react";
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DriverSummaryItem } from "../../types";
import { chartMotion } from "../../hooks/useMotion";
import { formatMinutes, formatPounds, plural } from "../../utils/format";
import { jobShares, receiptMix, reviewShare, workingRows, type TrendRow } from "../../utils/performanceData";
import { CHART, ChartLegend, ChartPanel, ChartTooltipBox, DonutChart, axisProps } from "../ds";
import { compactGBP, niceTicks } from "../overview/helpers";
import { RankedBars, driverColor } from "./shared";

type PanelState = "loading" | "error" | "ready" | "empty";

/* ------------------------------------------------------------- jobs ranking ---- */

export function JobsRanking({ rows, roster, onOpen, state, error, onRetry }: {
  rows: DriverSummaryItem[]; roster: string[]; onOpen: (initials: string) => void; state: PanelState; error?: string; onRetry: () => void;
}) {
  const shares = jobShares(rows).sort((a, b) => b.completed - a.completed || a.name.localeCompare(b.name));
  const total = shares.reduce((sum, item) => sum + item.completed, 0);
  return (
    <ChartPanel title="Completed jobs" icon={<Briefcase />} question="Which drivers completed the jobs, and each driver's share of the total." state={total === 0 && state === "ready" ? "empty" : state}
      error={error} onRetry={onRetry} emptyText="No completed jobs in this period." minHeight={240}
      basis="Each completed job belongs to one driver, so the shares add up to 100%. Select a driver to open their report."
      table={{ caption: "Completed jobs by driver", columns: ["Driver", "Completed jobs", "Share"], rows: shares.map(item => [item.name, item.completed, item.share === null ? "—" : `${Math.round(item.share * 100)}%`]) }}>
      <RankedBars label="Completed jobs by driver" onOpen={onOpen} openLabel={item => `${item.label}: ${item.display}. Open their report`}
        items={shares.map(item => ({ key: item.initials, label: item.name, initials: item.initials, color: driverColor(item.initials, roster), value: item.completed,
          display: `${item.completed}${item.share === null ? "" : ` · ${Math.round(item.share * 100)}%`}` }))} />
    </ChartPanel>
  );
}

/* ----------------------------------------------------- financial comparison ---- */

export function FinancialComparison({ rows, onOpen, state, error, onRetry }: {
  rows: DriverSummaryItem[]; onOpen: (initials: string) => void; state: PanelState; error?: string; onRetry: () => void;
}) {
  const data = rows.map(row => ({
    initials: row.initials, name: row.fullName, calculated: row.calculatedChargesPounds ?? row.totalChargesPounds ?? null, final: Number.isFinite(row.revenuePounds) ? row.revenuePounds : null,
    base: Number.isFinite(row.basePricePounds) ? row.basePricePounds! : null
  })).sort((a, b) => (b.final ?? -1) - (a.final ?? -1));
  const empty = data.every(row => !row.calculated && !row.final);
  const ticks = niceTicks(Math.max(0, ...data.flatMap(row => [row.calculated ?? 0, row.final ?? 0])));
  return (
    <ChartPanel title="Charges by driver" icon={<PoundSterling />} question="Total charges and driver collected for each driver, side by side." state={empty && state === "ready" ? "empty" : state}
      error={error} onRetry={onRetry} emptyText="No charges in this period." minHeight={260}
      legend={<ChartLegend items={[{ label: "Total charges", color: CHART.blue }, { label: "Driver collected", color: CHART.violet }]} />}
      basis="Total charges are the system-priced total. Driver collected is the amount entered at completion and includes invoices. They are different measures and are not added or subtracted."
      table={{ caption: "Total charges and driver collected by driver", columns: ["Driver", "Total charges", "Driver collected", "Base price"],
        rows: data.map(row => [row.name, formatPounds(row.calculated), formatPounds(row.final), row.base === null ? "Not recorded" : formatPounds(row.base)]), numericFrom: 1 }}>
      <div>
      <div style={{ height: Math.max(220, data.length * 58 + 36) }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 4 }} barCategoryGap="22%" barGap={3}>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" {...axisProps} axisLine={false} tickFormatter={compactGBP} ticks={ticks} domain={[0, ticks[ticks.length - 1]]} />
            <YAxis type="category" dataKey="name" {...axisProps} width={86} />
            <Tooltip cursor={{ fill: "rgb(var(--fg) / 0.05)" }} content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as (typeof data)[number];
              return <ChartTooltipBox title={row.name} rows={[
                { label: "Total charges", value: formatPounds(row.calculated), color: CHART.blue }, { label: "Driver collected", value: formatPounds(row.final), color: CHART.violet },
                { label: "Base price", value: row.base === null ? "Not recorded" : formatPounds(row.base) }]}
                note="Base price is the calendar amount before overtime and road charges. Driver collected includes invoices." />;
            }} />
            <Bar dataKey="calculated" fill={CHART.blue} radius={[0, 6, 6, 0]} maxBarSize={16} cursor="pointer" onClick={(entry: { initials?: string }) => entry.initials && onOpen(entry.initials)} {...chartMotion()} />
            <Bar dataKey="final" fill={CHART.violet} radius={[0, 6, 6, 0]} maxBarSize={16} cursor="pointer" onClick={(entry: { initials?: string }) => entry.initials && onOpen(entry.initials)} {...chartMotion()} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="px-2 pt-1 text-[12px] text-admin-muted">Select a bar to open that driver's report.</p>
      </div>
    </ChartPanel>
  );
}

/* ------------------------------------------------------------------- trend ---- */

export function ChargesTrend({ rows, grain, partial, missing, state, error, onRetry, rangeMissing = false }: {
  rows: TrendRow[]; grain: string; partial: boolean; missing: number; state: PanelState; error?: string; onRetry: () => void; rangeMissing?: boolean;
}) {
  const empty = rows.every(row => row.completed === 0);
  const ticks = niceTicks(Math.max(0, ...rows.flatMap(row => [row.calculated ?? 0, row.final ?? 0])));
  return (
    <ChartPanel title="Charges over time" icon={<TrendingUp />} question={`Total charges and driver collected per ${grain}.`} state={empty && state === "ready" ? "empty" : state}
      error={error} onRetry={onRetry} emptyText={rangeMissing ? "Choose both start and end dates to show the charges trend." : "No completed jobs in this period."} minHeight={280}
      legend={<ChartLegend items={[{ label: "Driver collected", color: CHART.violet }, { label: "Total charges", color: CHART.blue, dashed: true }]} />}
      coverage={<>{partial && <span className="block text-admin-status-amber">This range has more jobs than could be loaded, so the trend is not shown as complete.</span>}
        {missing > 0 && <span className="block text-admin-status-amber">{plural(missing, "completed job")} had no driver-collected amount and {missing === 1 ? "is" : "are"} left out of the line, not drawn as £0.</span>}</>}
      basis="Completed jobs by actual start day, or booked day when no genuine start is recorded (London time). Driver collected includes invoices."
      table={{ caption: "Charges per period", columns: ["Period", "Completed jobs", "Total charges", "Driver collected"],
        rows: rows.map(row => [row.label, row.completed, row.calculated === null ? "Not recorded" : formatPounds(row.calculated), row.final === null ? "Not recorded" : formatPounds(row.final)]), numericFrom: 1 }}>
      <div className="h-[250px]" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -4 }}>
            <defs><linearGradient id="perf-final" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={CHART.violet} stopOpacity={0.32} /><stop offset="100%" stopColor={CHART.violet} stopOpacity={0.02} /></linearGradient></defs>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={16} />
            <YAxis {...axisProps} axisLine={false} width={56} tickFormatter={compactGBP} ticks={ticks} domain={[0, ticks[ticks.length - 1]]} />
            <Tooltip content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as TrendRow;
              return <ChartTooltipBox title={String(label)} rows={[
                { label: "Driver collected", value: row.final === null ? "Not recorded" : formatPounds(row.final), color: CHART.violet },
                { label: "Total charges", value: row.calculated === null ? "Not recorded" : formatPounds(row.calculated), color: CHART.blue },
                { label: "Completed jobs", value: String(row.completed) }]} note={row.finalMissing ? `${plural(row.finalMissing, "job")} without a driver-collected amount.` : undefined} />;
            }} />
            <Area type="linear" dataKey="final" stroke={CHART.violet} strokeWidth={2.5} fill="url(#perf-final)" connectNulls={false} {...chartMotion()}
              dot={{ r: 3, fill: CHART.violet, stroke: CHART.surface, strokeWidth: 2 }} activeDot={{ r: 6, fill: CHART.violet, stroke: CHART.surface, strokeWidth: 2 }} />
            <Line type="linear" dataKey="calculated" stroke={CHART.blue} strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls={false} {...chartMotion()} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartPanel>
  );
}

/* ------------------------------------------------------------ working time ---- */

export function WorkingTimeChart({ rows, roster, onOpen, state, error, onRetry }: {
  rows: DriverSummaryItem[]; roster: string[]; onOpen?: (initials: string) => void; state: PanelState; error?: string; onRetry: () => void;
}) {
  const items = workingRows(rows).sort((a, b) => (b.minutes ?? -1) - (a.minutes ?? -1) || a.name.localeCompare(b.name));
  const empty = items.every(item => item.minutes === null);
  return (
    <ChartPanel title="Working time" icon={<Clock />} question="Recorded working time for each driver." state={empty && state === "ready" ? "empty" : state}
      error={error} onRetry={onRetry} emptyText="No working time was recorded in this period." minHeight={240}
      basis="Recorded arrival to finish. The average only uses jobs that have a recorded time, so a driver with missing times is never averaged over all jobs."
      table={{ caption: "Working time by driver", columns: ["Driver", "Working time", "Jobs with a time", "Jobs missing a time", "Average per job with a time"],
        rows: items.map(item => [item.name, item.minutes === null ? "Not recorded" : formatMinutes(item.minutes), item.knownJobs, item.unknownJobs, item.averageMinutes === null ? "—" : formatMinutes(Math.round(item.averageMinutes))]), numericFrom: 1 }}>
      {items.length === 1 ? (
        <dl className="grid grid-cols-2 gap-3 py-2 sm:grid-cols-4" aria-label={`Working time for ${items[0].name}`}>
          {[
            { label: "Recorded working time", value: items[0].minutes === null ? "Not recorded" : formatMinutes(items[0].minutes) },
            { label: "Average per job with a time", value: items[0].averageMinutes === null ? "—" : formatMinutes(Math.round(items[0].averageMinutes)) },
            { label: "Jobs with a time", value: String(items[0].knownJobs) },
            { label: "Jobs missing a time", value: String(items[0].unknownJobs), warn: items[0].unknownJobs > 0 }
          ].map(tile => (
            <div key={tile.label} className="rounded-xl border border-admin-line px-3 py-2.5">
              <dt className="text-[12.5px] font-medium text-admin-ink-2">{tile.label}</dt>
              <dd className={`mt-0.5 text-[20px] font-bold tabular-nums ${tile.warn ? "text-admin-status-amber" : "text-admin-ink"}`}>{tile.value}</dd>
            </div>
          ))}
        </dl>
      ) : <RankedBars label="Working time by driver" onOpen={onOpen} openLabel={item => `${item.label}: ${item.display}. Open their report`}
        items={items.map(item => ({ key: item.initials, label: item.name, initials: item.initials, color: driverColor(item.initials, roster), value: item.minutes,
          display: item.minutes === null ? "Not recorded" : formatMinutes(item.minutes),
          detail: item.minutes === null ? `${plural(item.unknownJobs, "job")} without times`
            : `${item.averageMinutes === null ? "" : `${formatMinutes(Math.round(item.averageMinutes))} per job with a time`}${item.unknownJobs ? ` · ${plural(item.unknownJobs, "job")} missing times` : ""}`,
          warn: item.unknownJobs > 0 }))} />}
    </ChartPanel>
  );
}

/* ------------------------------------------------------------------ reviews ---- */

export function ReviewDonut({ sent, notSent, state, error, onRetry }: { sent: number; notSent: number; state: PanelState; error?: string; onRetry: () => void }) {
  const share = reviewShare({ reviewSent: sent, reviewNotSent: notSent });
  const [active, setActive] = useState<string | null>(null);
  return (
    <ChartPanel title="Review requests" icon={<Mail />} question="How many review requests were sent, of those the system tracks." state={share.tracked === 0 && state === "ready" ? "empty" : state}
      error={error} onRetry={onRetry} emptyText="No review requests were tracked in this period." minHeight={220}
      basis="Sent as a share of tracked requests (sent plus not sent). A request that was not sent is not a failure on its own."
      table={{ caption: "Review requests", columns: ["Status", "Requests"], rows: [["Sent", sent], ["Not sent", notSent], ["Tracked in total", share.tracked]], numericFrom: 1 }}>
      <div className="flex flex-wrap items-center justify-center gap-6 py-2">
        <DonutChart size={200} stroke={22} active={active} onActive={setActive} centerValue={`${Math.round((share.fraction ?? 0) * 100)}%`} centerLabel="sent"
          label={`${sent} of ${share.tracked} tracked review requests sent`}
          segments={[{ key: "sent", label: "Sent", value: sent, color: CHART.teal }, { key: "not", label: "Not sent", value: notSent, color: CHART.slate }]} />
        <ChartLegend className="flex-col" items={[{ label: "Sent", color: CHART.teal, value: sent }, { label: "Not sent", color: CHART.slate, value: notSent }, { label: "Tracked", color: "transparent", value: share.tracked }]} />
      </div>
    </ChartPanel>
  );
}

/* ----------------------------------------------------------------- payments ---- */

export function PaymentMix({ rows, state, error, onRetry }: { rows: DriverSummaryItem[]; state: PanelState; error?: string; onRetry: () => void }) {
  const mix = receiptMix(rows);
  const [active, setActive] = useState<string | null>(null);
  const colors = { cash: CHART.teal, card: CHART.blue, link: CHART.violet, bank: CHART.cyan } as const;
  const empty = mix.receivedTotal === 0 && mix.invoiced === 0;
  return (
    <ChartPanel title="Payment methods" icon={<Wallet />} question="Recorded payments by method, with invoiced amounts shown separately." state={empty && state === "ready" ? "empty" : state}
      error={error} onRetry={onRetry} emptyText="No payments were recorded in this period." minHeight={220}
      coverage={mix.unverifiedJobs ? <span className="text-admin-status-amber">{plural(mix.unverifiedJobs, "job")} had no verified payment record, so received money is a known subtotal.</span> : undefined}
      basis="Recorded in the job flow at completion. Invoiced amounts do not confirm whether an invoice has been paid."
      table={{ caption: "Recorded receipts by method", columns: ["Method", "Amount"], rows: [...mix.segments.map(segment => [segment.label, formatPounds(segment.pounds)]), ["Invoiced", formatPounds(mix.invoiced)]], numericFrom: 1 }}>
      <div className="flex flex-wrap items-center justify-center gap-6 py-2">
        {mix.receivedTotal > 0
          ? <DonutChart size={200} stroke={22} active={active} onActive={setActive} centerValue={compactGBP(mix.receivedTotal)} centerLabel="received"
              label={`Recorded receipts ${formatPounds(mix.receivedTotal)}: ${mix.segments.filter(segment => segment.pounds > 0).map(segment => `${segment.label} ${formatPounds(segment.pounds)}`).join(", ")}`}
              segments={mix.segments.map(segment => ({ key: segment.key, label: segment.label, value: segment.pounds, color: colors[segment.key] }))} />
          : <p className="max-w-[220px] text-center text-[13px] text-admin-ink-2">No money received is recorded for this period.</p>}
        <div className="space-y-2">
          <ChartLegend className="flex-col" items={mix.segments.filter(segment => segment.pounds > 0).map(segment => ({ label: segment.label, color: colors[segment.key], value: formatPounds(segment.pounds) }))} />
          {mix.invoiced > 0 && (
            <p className="rounded-xl border border-admin-line px-3 py-2 text-[12.5px] text-admin-ink-2"><span className="font-semibold tabular-nums text-admin-ink">{formatPounds(mix.invoiced)}</span> invoiced.</p>
          )}
        </div>
      </div>
    </ChartPanel>
  );
}
