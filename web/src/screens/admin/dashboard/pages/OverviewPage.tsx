/**
 * Operations Command Center (the overview). Answers, in order: what is happening,
 * what needs attention, how the business is performing, which drivers need review,
 * and what was charged vs received. Every KPI and chart reads the same dataset --
 * all jobs scheduled in the selected range (see utils/overviewData.ts for the
 * definitions) -- except Needs attention, Fleet now, Today's jobs
 * and Today's jobs, which are labelled as today / live. The driver filter
 * (`?driver=` initials) narrows the range dataset only; the live panels stay fleet-wide.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DateTime } from "luxon";
import { ArrowRight, CheckCircle2, ClipboardList, FileText, PoundSterling, RefreshCw, Timer, Wallet } from "lucide-react";
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchVanDriverRecords } from "../api";
import { useIncludeMA } from "../../../../lib/adminDriverScope";
import { IncludeMaToggle } from "../components/IncludeMaToggle";
import { DateRangePicker, dateRangeForPreset } from "../components/DateRangePicker";
import { useAttention } from "../hooks/useAttention";
import { useDriverOptions } from "../hooks/useDriverOptions";
import { useRangeJobs } from "../hooks/useRangeJobs";
import { useUrlState } from "../hooks/useUrlState";
import { sectionHref, navigateTo, updateUrlParams, urlParam } from "../navigation";
import { chartMotion } from "../hooks/useMotion";
import { formatMinutes, formatMoney, formatPounds, formatRange, plural } from "../utils/format";
import { vehicleAttention } from "../utils/vehicleStatus";
import {
  RECEIPT_METHODS, STATUS_LABEL, activitySeries, bucketsFor, change, driverRows, finalChargesSeries, grainFor, kpisFor,
  paymentMix, previousPeriod, timingSummary, type DriverRow, type StatusKey
} from "../utils/overviewData";
import { cx } from "../../../../ui/cx";
import {
  Action, CHART, ChartLegend, ChartPanel, ChartTooltipBox, ChoiceChips, FilterSelect, KpiCard, Notice, CountUp, Tabs, TabPanel, axisProps, focusRing, type Comparison
} from "../components/ds";
import { STATUS_COLOR, STATUS_ORDER, compactGBP, compareCounts, londonTime, niceTicks, percent, periodName } from "../components/overview/helpers";
import { OperationsPerformance } from "../components/overview/OperationsPerformance";
import { ActivityPanel } from "../components/overview/ActivityPanel";
import { AttentionCenter } from "../components/overview/AttentionCenter";
import { FleetIntelligence } from "../components/overview/FleetIntelligence";
import { LiveOperations } from "../components/overview/LiveOperations";
import { GenerateReportModal } from "../reports/GenerateReportModal";

export { compareCounts, niceTicks, periodName };

interface Props { onSelectSection?: (id: string, params?: Record<string, string | undefined>) => void }

const STATUS_FILTER: Record<StatusKey, string | undefined> = { completed: "completed", inProgress: "in_progress", scheduled: "scheduled", cancelled: "cancelled" };

export function OverviewPage({ onSelectSection }: Props) {
  const includeMA = useIncludeMA();
  const week = dateRangeForPreset("7d");
  const [range, setRange] = useUrlState({ from: week.from!, to: week.to!, driver: "" });
  const queryClient = useQueryClient();
  const prev = previousPeriod(range.from, range.to);
  const current = useRangeJobs(range.from, range.to, true, range.driver, includeMA);
  const previous = useRangeJobs(prev.from, prev.to, true, range.driver, includeMA);
  const drivers = useDriverOptions();
  const driverLabel = range.driver ? drivers.options.find(option => option.initials === range.driver)?.fullName || range.driver : null;
  const attention = useAttention({ includeMA });
  const vehicles = useQuery({ queryKey: ["vehicles_attention", includeMA], queryFn: () => fetchVanDriverRecords({ page: 1, ...(!includeMA ? { includeMA: "0" } : {}) }), staleTime: 10 * 60_000 });
  const [refreshing, setRefreshing] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  // `?report=generate` (global search's "Generate report") opens the modal once.
  useEffect(() => {
    const read = () => { if (urlParam("report") === "generate") { setReportOpen(true); updateUrlParams({ report: null }); } };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  const grain = grainFor(range.from, range.to);
  const buckets = useMemo(() => bucketsFor(range.from, range.to, grain), [range.from, range.to, grain]);
  const jobs = current.data?.jobs ?? [];
  const complete = !!current.data?.complete;
  const kpis = useMemo(() => kpisFor(jobs), [jobs]);
  const prevKpis = useMemo(() => previous.data?.complete ? kpisFor(previous.data.jobs) : null, [previous.data]);
  const activity = useMemo(() => activitySeries(jobs, buckets, grain), [jobs, buckets, grain]);
  const charges = useMemo(() => finalChargesSeries(jobs, buckets, grain), [jobs, buckets, grain]);
  const prevCharges = useMemo(() => {
    if (!previous.data?.complete) return null;
    const prevBuckets = bucketsFor(prev.from, prev.to, grain);
    return finalChargesSeries(previous.data.jobs, prevBuckets, grain);
  }, [previous.data, prev.from, prev.to, grain]);

  // Payment methods remain available in the panel below.
  const mix = useMemo(() => paymentMix(jobs), [jobs]);
  const timing = useMemo(() => timingSummary(jobs, buckets, grain), [jobs, buckets, grain]);
  const prevTiming = useMemo(() => (previous.data?.complete ? timingSummary(previous.data.jobs, bucketsFor(prev.from, prev.to, grain), grain) : null), [previous.data, prev.from, prev.to, grain]);

  const vehicleCount = vehicles.data ? vehicles.data.items.filter(item => vehicleAttention(item.compliance).length > 0).length : null;
  const vehiclesPartial = !!vehicles.data && vehicles.data.pagination.total > vehicles.data.items.length;

  const period = periodName(range.from, range.to);
  const comparable = complete && !!prevKpis;
  const loading = current.isLoading;
  const panelState = loading ? "loading" as const : current.isError ? "error" as const : "ready" as const;
  const updatedAt = current.dataUpdatedAt ? londonTime(DateTime.fromMillis(current.dataUpdatedAt).toISO()) : null;
  const goJobs = (params: Record<string, string | undefined> = {}) => onSelectSection?.("jobs", { from: range.from, to: range.to, ...(range.driver ? { driver: range.driver } : {}), ...params });
  const includesToday = DateTime.fromISO(range.to) >= DateTime.now().startOf("day");

  const refresh = async () => {
    setRefreshing(true);
    try { await Promise.all([current.refetch(), previous.refetch(), queryClient.refetchQueries({ queryKey: ["today_jobs"] }), queryClient.refetchQueries({ queryKey: ["fleet_live"] })]); }
    finally { setRefreshing(false); }
  };

  const final = kpis.finalCharges;
  const total = kpis.totalCharges;
  const partialNote = !complete && current.data ? `Based on the first ${current.data.jobs.length} of ${current.data.total} jobs` : null;
  const completion = percent(kpis.byStatus.completed, kpis.total);
  const inProgressShare = percent(kpis.byStatus.inProgress, kpis.total);
  const statusSegments = STATUS_ORDER.map(key => ({ key, label: STATUS_LABEL[key], value: kpis.byStatus[key], color: STATUS_COLOR[key] }));

  return (
    <>
      <section aria-labelledby="overview-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <h1 id="overview-title" className="text-[26px] font-bold leading-8 tracking-tight text-admin-ink">TMV Dashboard</h1>
          <div className="flex flex-wrap items-center gap-2">
            <span role="status" className="text-[13px] text-admin-ink-2">{current.isFetching ? "Updating…" : updatedAt ? `Updated ${updatedAt}` : ""}</span>
            <Action icon={<RefreshCw className={cx(refreshing && "animate-spin motion-reduce:animate-none")} />} onClick={() => void refresh()} disabled={refreshing} aria-label="Refresh overview data">Refresh</Action>
            <IncludeMaToggle />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <DateRangePicker presets="overview" from={range.from} to={range.to} onChange={(from, to) => { if (from && to) setRange({ from, to }, { push: true }); }} />
          <FilterSelect label="Driver" value={range.driver} onChange={driver => setRange({ driver }, { push: true })}
            allLabel={drivers.isLoading ? "Loading drivers…" : "All drivers"} disabled={drivers.isLoading && !range.driver}
            options={[
              ...drivers.options.map(option => ({ value: option.initials, label: `${option.fullName || option.initials}${option.active ? "" : " (inactive)"}` })),
              // A shared link may name a driver who is not in the roster (or the roster failed to load): keep it selectable.
              ...(range.driver && !drivers.options.some(option => option.initials === range.driver) ? [{ value: range.driver, label: range.driver }] : [])
            ]} className="w-full min-[420px]:w-[200px]" />
          <Action variant="primary" icon={<FileText />} onClick={() => setReportOpen(true)}>Generate Report</Action>
        </div>
        <p className="text-[12.5px] text-admin-ink-2">
          Jobs {driverLabel ? <>for <strong className="font-semibold text-admin-ink">{driverLabel}</strong> </> : null}scheduled {formatRange(range.from, range.to)}, London time · compared with {period}.
          {driverLabel ? " Needs attention, Fleet now and Today's jobs show the whole fleet." : null}
        </p>
      </section>
      <GenerateReportModal open={reportOpen} onClose={() => setReportOpen(false)} initial={{ from: range.from, to: range.to, drivers: range.driver ? [range.driver] : [] }} />

      {current.isError && <Notice tone="danger" title="Couldn't load jobs for this period" action={<Action size="sm" onClick={() => void current.refetch()}>Try again</Action>}>{(current.error as Error)?.message} Figures below need this data and are not shown.</Notice>}
      {partialNote && <Notice tone="warning" title="Partial data">{partialNote}. Totals and charts below cover only the loaded jobs.</Notice>}

      <div role="group" aria-label="Key figures" className="tmv-stagger grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total jobs" accent="violet" icon={<ClipboardList />} loading={loading} value={current.isError ? "—" : <CountUp value={kpis.total} />}
          comparison={comparable ? compareCounts(kpis.total, prevKpis!.total, period, null) : null}
          detail={current.isError ? "Unavailable" : "Scheduled in this period, any status"} onOpen={() => goJobs()} openLabel="View these jobs" />
        <KpiCard label={total.missing ? "Total Charges (known)" : "Total Charges"} accent="coral" icon={<PoundSterling />} loading={loading}
          value={current.isError ? "—" : total.counted === 0 && total.missing > 0 ? "Not recorded" : <CountUp value={total.known} format={formatMoney} />}
          comparison={comparable && !total.missing && !prevKpis!.totalCharges.missing ? (() => {
            const c = change(total.known, prevKpis!.totalCharges.known)!;
            return { direction: c.delta > 0 ? "up" : c.delta < 0 ? "down" : "flat", meaning: "neutral", text: `${c.delta >= 0 ? "+" : "−"}${formatMoney(Math.abs(c.delta))} vs ${period}` } as Comparison;
          })() : null}
          detail={<><span className="block">(Base + overtime + road charges)</span>{current.isError ? "Unavailable" : total.missing ? `${plural(total.missing, "completed job")} without calculated charges` : "Completed jobs in this period"}</>} />
        <KpiCard label={final.missing ? "Driver Collected (known)" : "Driver Collected"} accent="teal" icon={<Wallet />} loading={loading}
          value={current.isError ? "—" : final.counted === 0 && final.missing > 0 ? "Not recorded" : <CountUp value={final.known} format={formatMoney} />}
          comparison={comparable && !final.missing && !prevKpis!.finalCharges.missing ? (() => {
            const c = change(final.known, prevKpis!.finalCharges.known)!;
            return { direction: c.delta > 0 ? "up" : c.delta < 0 ? "down" : "flat", meaning: "neutral", text: `${c.delta >= 0 ? "+" : "−"}${formatMoney(Math.abs(c.delta))} vs ${period}` } as Comparison;
          })() : null}
          detail={current.isError ? "Unavailable" : final.missing ? `${plural(final.missing, "completed job")} without a final charge · includes invoices, not money received` : "Billed at completion · includes invoices, not money received"} />
        <KpiCard label="Late arrivals" accent="blue" icon={<Timer />} loading={loading}
          value={current.isError ? "—" : timing.eligible === 0 ? "—" : <CountUp value={timing.lateJobs} />}
          comparison={comparable && prevTiming && prevTiming.eligible > 0 && timing.eligible > 0 ? compareCounts(timing.lateJobs, prevTiming.lateJobs, period, false) : null}
          detail={current.isError ? "Unavailable" : timing.eligible === 0 ? "No started or completed jobs in this period" : `${timing.verified} of ${timing.eligible} arrivals verified · unverified are not scored`} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <OperationsPerformance kpis={kpis} previous={comparable ? prevKpis : null} period={period} state={panelState} error={(current.error as Error)?.message}
          onRetry={() => void current.refetch()} updating={current.isFetching && !loading} partialNote={partialNote}
          onOpenStatus={status => goJobs({ status: STATUS_FILTER[status] })} />
        <AttentionCenter attention={attention} vehicleCount={vehicleCount} vehiclesPartial={vehiclesPartial} onSelectSection={onSelectSection} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <ActivityPanel jobs={jobs} from={range.from} to={range.to} state={panelState} error={(current.error as Error)?.message}
          onRetry={() => void current.refetch()} updating={current.isFetching && !loading} />
        <FleetIntelligence vehicles={attention.fleetVehicles} todayJobs={attention.todayJobs}
          state={attention.fleetQuery.isLoading ? "loading" : attention.fleetQuery.isError ? "error" : "ready"} error={(attention.fleetQuery.error as Error | null)?.message}
          onRetry={() => void attention.fleetQuery.refetch()} vehicleCount={vehicleCount} vehiclesPartial={vehiclesPartial}
          onOpenFleet={() => onSelectSection?.("livefleet")} onOpenVehicles={() => onSelectSection?.("vehicles", { show: "attention" })} />
      </div>

      <LiveOperations jobs={attention.todayJobs} loading={attention.jobsQuery.isLoading} error={attention.jobsQuery.isError ? (attention.jobsQuery.error as Error)?.message : undefined}
        onRetry={() => void attention.jobsQuery.refetch()} truncated={attention.jobsTruncated} total={attention.jobsQuery.data?.pagination.total}
        updatedAt={attention.jobsQuery.dataUpdatedAt || null} onOpenJobs={() => onSelectSection?.("jobs")} />

      <div className="grid gap-5 xl:grid-cols-2">
        <ChargesChart rows={charges} previous={prevCharges} period={period} state={panelState} error={(current.error as Error)?.message}
          onRetry={() => void current.refetch()} updating={current.isFetching && !loading} grain={grain} total={final} />
        <DriverChart rows={driverRows(jobs)} state={panelState} error={(current.error as Error)?.message} onRetry={() => void current.refetch()}
          from={range.from} to={range.to} />
      </div>

      <SecondaryAnalysis mix={mix} timing={timing} state={panelState} />
    </>
  );
}

/* --------------------------------------------------------- final charges ---- */

function ChargesChart({ rows, previous, period, state, error, onRetry, updating, grain, total }: {
  rows: ReturnType<typeof finalChargesSeries>; previous: ReturnType<typeof finalChargesSeries> | null; period: string; state: "loading" | "error" | "ready"; error?: string;
  onRetry: () => void; updating: boolean; grain: string; total: { known: number; missing: number; counted: number };
}) {
  const data = rows.map((row, index) => ({ ...row, previous: previous?.[index]?.amount ?? null }));
  const empty = state === "ready" && rows.every(row => row.completed === 0);
  const missing = rows.reduce((sum, row) => sum + row.missing, 0);
  const yTicks = niceTicks(Math.max(...data.flatMap(row => [row.amount ?? 0, row.previous ?? 0])));
  return (
    <ChartPanel title="Final charges" icon={<PoundSterling />} question={`Final charges per ${grain}.`}
      state={empty ? "empty" : state} error={error} onRetry={onRetry} updating={updating} emptyText="No completed jobs in this period."
      legend={<ChartLegend items={[{ label: missing ? "Final charges (known)" : "Final charges", color: CHART.violet, value: formatMoney(total.known) },
        ...(previous ? [{ label: `Same measure, ${period}`, color: CHART.slate, dashed: true }] : [])]} />}
      coverage={missing ? <span className="text-admin-status-amber">{plural(missing, "completed job")} had no final charge recorded and {missing === 1 ? "is" : "are"} not included.</span> : undefined}
      basis="Amount entered at completion on completed jobs, by scheduled day. Includes amounts left to invoice; it is not money received. Receipts are under Payment methods."
      table={{ caption: "Final charges per period", columns: ["Period", "Completed jobs", "Final charges", ...(previous ? [`Previous period`] : [])],
        rows: data.map(row => [row.label, row.completed, row.amount === null ? "Not recorded" : formatPounds(row.amount), ...(previous ? [row.previous === null ? "Not recorded" : formatPounds(row.previous)] : [])]) }}>
      <div className="h-[240px]" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -4 }}>
            <defs><linearGradient id="charges-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={CHART.violet} stopOpacity={0.32} /><stop offset="100%" stopColor={CHART.violet} stopOpacity={0.02} /></linearGradient></defs>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={16} />
            <YAxis {...axisProps} axisLine={false} width={56} tickFormatter={compactGBP} ticks={yTicks} domain={[0, yTicks[yTicks.length - 1]]} />
            <Tooltip content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as (typeof data)[number];
              return <ChartTooltipBox title={String(label)} rows={[
                { label: "Final charges", value: row.amount === null ? "Not recorded" : formatPounds(row.amount), color: CHART.violet },
                { label: "Completed jobs", value: String(row.completed) },
                ...(row.missing ? [{ label: "Without a charge", value: String(row.missing) }] : []),
                ...(previous ? [{ label: "Previous period", value: row.previous === null ? "Not recorded" : formatPounds(row.previous), color: CHART.slate }] : [])
              ]} note="Charges entered at completion, not money received." />;
            }} />
            {previous && <Line type="linear" dataKey="previous" stroke={CHART.slate} strokeWidth={2} strokeDasharray="5 4" dot={false} {...chartMotion()} connectNulls={false} />}
            <Area type="linear" dataKey="amount" stroke={CHART.violet} strokeWidth={2.5} fill="url(#charges-fill)" connectNulls={false} {...chartMotion()}
              dot={{ r: 3.5, fill: CHART.violet, stroke: CHART.surface, strokeWidth: 2 }} activeDot={{ r: 6, fill: CHART.violet, stroke: CHART.surface, strokeWidth: 2 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartPanel>
  );
}

/* ------------------------------------------------------ driver performance ---- */

type DriverMetric = "completed" | "finalCharges" | "workingMinutes";
const DRIVER_METRIC_LABEL: Record<DriverMetric, string> = { completed: "Completed jobs", finalCharges: "Final charges", workingMinutes: "Working time" };

export function driverMetricValue(row: DriverRow, metric: DriverMetric): number | null {
  if (metric === "completed") return row.completed;
  const sum = metric === "finalCharges" ? row.finalCharges : row.workingMinutes;
  return sum.counted ? sum.known : null;
}

function DriverChart({ rows, state, error, onRetry, from, to }: { rows: DriverRow[]; state: "loading" | "error" | "ready"; error?: string; onRetry: () => void; from: string; to: string }) {
  const [metric, setMetric] = useState<DriverMetric>("completed");
  const sorted = [...rows].sort((a, b) => (driverMetricValue(b, metric) ?? -1) - (driverMetricValue(a, metric) ?? -1));
  const max = Math.max(1, ...sorted.map(row => driverMetricValue(row, metric) ?? 0));
  const format = (row: DriverRow) => {
    const value = driverMetricValue(row, metric);
    if (value === null) return "Not recorded";
    return metric === "completed" ? String(value) : metric === "finalCharges" ? formatMoney(value) : formatMinutes(value);
  };
  const missingFor = (row: DriverRow) => metric === "finalCharges" ? row.finalCharges.missing : metric === "workingMinutes" ? row.workingMinutes.missing : 0;
  const open = (initials: string) => navigateTo(sectionHref("driverreport", { driver: initials, from, to }));
  return (
    <ChartPanel title="Driver performance" icon={<CheckCircle2 />} question="Completed jobs by driver in this period."
      state={state === "ready" && !rows.length ? "empty" : state} error={error} onRetry={onRetry} emptyText="No completed jobs with an assigned driver in this period."
      actions={<ChoiceChips label="Driver metric" value={metric} onChange={setMetric} options={(Object.keys(DRIVER_METRIC_LABEL) as DriverMetric[]).map(value => ({ value, label: DRIVER_METRIC_LABEL[value] }))} />}
      basis={metric === "finalCharges" ? "Final charges entered at completion; not money collected." : metric === "workingMinutes" ? "Recorded arrival to finish." : "Completed jobs scheduled in this period."}
      table={{ caption: `Drivers by ${DRIVER_METRIC_LABEL[metric].toLowerCase()}`, columns: ["Driver", "Completed jobs", "Final charges", "Working time"],
        rows: sorted.map(row => [row.name, row.completed, row.finalCharges.counted ? formatMoney(row.finalCharges.known) : "Not recorded", row.workingMinutes.counted ? formatMinutes(row.workingMinutes.known) : "Not recorded"]) }}>
      <ul className="space-y-1 px-2" aria-label={`Drivers by ${DRIVER_METRIC_LABEL[metric].toLowerCase()}`}>
        {sorted.slice(0, 8).map(row => {
          const value = driverMetricValue(row, metric);
          const missing = missingFor(row);
          return (
            <li key={row.initials}>
              <button type="button" onClick={() => open(row.initials)} aria-label={`${row.name}: ${format(row)}${missing ? `, ${missing} not recorded` : ""}. Open driver report`}
                className={cx("group grid w-full grid-cols-[minmax(90px,140px)_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 py-1.5 text-left transition hover:bg-admin-brand-soft/50", focusRing)}>
                <span className="truncate text-[13.5px] font-medium text-admin-ink">{row.name}</span>
                <span className="h-3 overflow-hidden rounded-full bg-admin-surface">
                  <span className="block h-full rounded-full bg-[image:var(--grad-brand)] transition-[width] duration-300" style={{ width: value === null ? 0 : `${Math.max(2, (value / max) * 100)}%` }} />
                </span>
                <span className="flex items-center gap-1 text-[13px] font-semibold tabular-nums text-admin-ink">
                  {format(row)}{missing > 0 && <span className="text-[12px] font-normal text-admin-status-amber">· {missing} missing</span>}
                  <ArrowRight aria-hidden className="h-3.5 w-3.5 text-admin-muted opacity-0 transition group-hover:opacity-100" />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {sorted.length > 8 && <p className="px-4 pt-2 text-[12.5px] text-admin-ink-2">Top 8 of {sorted.length} drivers. All drivers are in the data table and on Drivers → Performance summary.</p>}
    </ChartPanel>
  );
}

/* ------------------------------------------------------- secondary analysis ---- */

type SecondaryTab = "payments" | "timing";

function SecondaryAnalysis({ mix, timing, state }: { mix: ReturnType<typeof paymentMix>; timing: ReturnType<typeof timingSummary>; state: "loading" | "error" | "ready" }) {
  const [tab, setTab] = useState<SecondaryTab>("payments");
  return (
    <section aria-labelledby="overview-more-title" className="space-y-3">
      <div>
        <h2 id="overview-more-title" className="text-[17px] font-semibold tracking-tight text-admin-ink">Payments and timing</h2>
      </div>
      <Tabs label="Payments and timing" idBase="overview-more" value={tab} onChange={setTab}
        tabs={[{ id: "payments", label: "Payment methods" }, { id: "timing", label: "Timing" }]} />
      <TabPanel idBase="overview-more" id={tab}>
        {tab === "payments" && <PaymentMethods mix={mix} state={state} />}
        {tab === "timing" && <TimingPanel timing={timing} state={state} />}
      </TabPanel>
    </section>
  );
}

function PaymentMethods({ mix, state }: { mix: ReturnType<typeof paymentMix>; state: "loading" | "error" | "ready" }) {
  const colors = [CHART.violet, CHART.teal, CHART.amber, CHART.blue];
  const max = Math.max(1, ...RECEIPT_METHODS.map(method => mix.received[method]));
  return (
    <ChartPanel title="Payment methods" question="Payment methods of recorded receipts." minHeight={180}
      state={state === "ready" && mix.completedJobs === 0 ? "empty" : state} emptyText="No completed jobs in this period."
      basis="Receipts the driver recorded in the job flow on completed jobs. Invoices are amounts billed, not received, and are kept separate."
      table={{ caption: "Recorded receipts by method", columns: ["Method", "Amount", "Share of receipts"],
        rows: RECEIPT_METHODS.map(method => [method, formatMoney(mix.received[method]), mix.receivedTotal ? `${Math.round((mix.received[method] / mix.receivedTotal) * 100)}%` : "—"]) }}>
      <div className="grid gap-5 px-2 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div>
          <p className="px-2 text-[13px] text-admin-ink-2">Recorded receipts <span className="font-semibold tabular-nums text-admin-ink">{formatMoney(mix.receivedTotal)}</span></p>
          <ul className="mt-2 space-y-1">
            {RECEIPT_METHODS.map((method, index) => {
              const amount = mix.received[method];
              const share = mix.receivedTotal ? Math.round((amount / mix.receivedTotal) * 100) : 0;
              return (
                <li key={method} className="grid grid-cols-[110px_minmax(0,1fr)_auto] items-center gap-3 px-2 py-1">
                  <span className="inline-flex items-center gap-1.5 text-[13.5px] text-admin-ink"><span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: colors[index] }} />{method}</span>
                  <span className="h-3 overflow-hidden rounded-full bg-admin-surface"><span className="block h-full rounded-full" style={{ width: `${amount ? Math.max(2, (amount / max) * 100) : 0}%`, background: colors[index] }} /></span>
                  <span className="text-right text-[13px] tabular-nums text-admin-ink"><span className="font-semibold">{formatMoney(amount)}</span> <span className="text-admin-ink-2">{mix.receivedTotal ? `${share}%` : ""}</span></span>
                </li>
              );
            })}
          </ul>
        </div>
        <dl className="grid content-start gap-2 text-[13.5px]">
          <div className="rounded-xl border border-admin-line bg-admin-surface/50 px-3 py-2">
            <dt className="text-admin-ink-2">Unpaid invoices (billed, not received)</dt>
            <dd className="font-semibold tabular-nums text-admin-ink">{formatMoney(mix.invoices.pence)} <span className="font-normal text-admin-ink-2">· {plural(mix.invoices.jobs, "job")}{mix.invoices.amountMissing ? ` · ${mix.invoices.amountMissing} without an amount` : ""}</span></dd>
          </div>
          {mix.unclassified.jobs > 0 && <div className="rounded-xl border border-admin-line bg-admin-surface/50 px-3 py-2"><dt className="text-admin-ink-2">Unclassified method</dt><dd className="font-semibold tabular-nums">{formatMoney(mix.unclassified.pence)} <span className="font-normal text-admin-ink-2">· {plural(mix.unclassified.jobs, "job")}</span></dd></div>}
          <div className="rounded-xl border border-admin-line bg-admin-surface/50 px-3 py-2">
            <dt className="text-admin-ink-2">Completed jobs with no payment recorded</dt>
            <dd className="font-semibold tabular-nums text-admin-ink">{mix.noPaymentRecorded} <span className="font-normal text-admin-ink-2">of {mix.completedJobs}</span></dd>
          </div>
        </dl>
      </div>
    </ChartPanel>
  );
}

function TimingPanel({ timing, state }: { timing: ReturnType<typeof timingSummary>; state: "loading" | "error" | "ready" }) {
  const stats = [
    { label: "Verified arrivals", value: `${timing.verified} of ${timing.eligible}`, detail: timing.unverified ? `${timing.unverified} without trustworthy tracking — not counted as on time` : "All started jobs have a verified arrival" },
    { label: "Late arrivals", value: String(timing.lateJobs), detail: "Jobs with a verified arrival after the scheduled start" },
    { label: "Total lateness", value: formatMinutes(timing.totalLateMinutes), detail: "Sum of minutes late across late jobs" },
    { label: "Average lateness", value: timing.averageLateMinutes === null ? "No late jobs" : formatMinutes(Math.round(timing.averageLateMinutes)), detail: "Late jobs only" },
    { label: "Overtime", value: formatMinutes(timing.overtime.minutes), detail: `${plural(timing.overtime.jobs, "job")} of ${timing.overtime.completed} completed` }
  ];
  const data = timing.byBucket;
  return (
    <ChartPanel title="Timing" question="Arrival delays and overtime." minHeight={200}
      state={state === "ready" && timing.eligible === 0 ? "empty" : state} emptyText="No started or completed jobs in this period."
      legend={<ChartLegend items={[{ label: "Late", color: CHART.rose }, { label: "On time", color: CHART.teal }, { label: "Arrival unverified", color: CHART.slate }]} />}
      basis="Arrival delay uses the verified tracker or proof-photo basis only. Missing tracking is shown as unverified, never as zero delay."
      table={{ caption: "Arrivals per period", columns: ["Period", "Late", "On time", "Unverified"], rows: data.map(row => [row.label, row.late, row.onTime, row.unverified]) }}>
      <div className="grid gap-4 px-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <dl className="grid grid-cols-2 gap-2">
          {stats.map(stat => (
            <div key={stat.label} className="rounded-xl border border-admin-line bg-admin-surface/40 px-3 py-2">
              <dt className="text-[12.5px] font-medium text-admin-ink-2">{stat.label}</dt>
              <dd className="text-[18px] font-bold text-admin-ink">{stat.value}</dd>
              <dd className="text-[12px] leading-4 text-admin-ink-2">{stat.detail}</dd>
            </div>
          ))}
        </dl>
        <div className="h-[220px]" aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barCategoryGap="22%">
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={16} />
              <YAxis {...axisProps} axisLine={false} allowDecimals={false} width={44} />
              <Tooltip cursor={{ fill: "rgba(114,92,255,0.08)", radius: 8 }} content={({ active, payload, label }) => active && payload?.length ? (
                <ChartTooltipBox title={String(label)} rows={[
                  { label: "Late", value: String((payload[0].payload as { late: number }).late), color: CHART.rose },
                  { label: "On time", value: String((payload[0].payload as { onTime: number }).onTime), color: CHART.teal },
                  { label: "Unverified", value: String((payload[0].payload as { unverified: number }).unverified), color: CHART.slate }]} />
              ) : null} />
              <Bar dataKey="late" stackId="t" fill={CHART.rose} stroke={CHART.surface} strokeWidth={2} maxBarSize={24} {...chartMotion()} />
              <Bar dataKey="onTime" stackId="t" fill={CHART.teal} stroke={CHART.surface} strokeWidth={2} maxBarSize={24} {...chartMotion()} />
              <Bar dataKey="unverified" stackId="t" fill={CHART.slate} stroke={CHART.surface} strokeWidth={2} maxBarSize={24} radius={[4, 4, 0, 0]} {...chartMotion()} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </ChartPanel>
  );
}
