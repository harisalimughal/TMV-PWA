/**
 * Drivers / Performance summary -- the former Overview "Driver Breakdown" table
 * (audit p.6), with plain financial labels that use the same definitions as the
 * driver report:
 *
 * - Calculated charges: `calculatedChargesPounds` (system-priced total).
 * - Final charges: `revenuePounds` -- the adjusted billed total entered at completion
 *   (labelled "Driver Collected" before; it includes invoiced amounts, so it is not money received).
 * - Recorded receipts: `totalCollectionsPounds` -- cash/card/link/bank recorded in the
 *   job flow, excluding invoices.
 *
 * One primary row action (View report) and an explicit secondary "Review payments".
 *
 * The page above the table is a small analytics dashboard (performance/): KPI cards, ranked
 * and financial comparisons, a charges trend, working time, review requests and payment
 * methods. All of it reads the same driver rows as the table. With one driver selected the
 * comparison charts give way to that driver's own figures.
 */
import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DateTime } from "luxon";
import { ArrowDownAZ, ArrowUpAZ, ExternalLink } from "lucide-react";
import { fetchDrivers } from "../api";
import type { DriverSummaryItem } from "../types";
import { driverReportHref, navigateAdmin } from "../utils/reportNavigation";
import { formatMinutes, formatPounds, formatRange, plural } from "../utils/format";
import { downloadCsv, toCsv } from "../utils/csv";
import { bucketsFor, grainFor, previousPeriod } from "../utils/overviewData";
import { SORT_LABEL, chargesTrend, sortDrivers, totalsOf, type SortKey } from "../utils/performanceData";
import { useRangeJobs } from "../hooks/useRangeJobs";
import { DateRangePicker } from "./DateRangePicker";
import { Action, CellStack, DataTable, EmptyState, ErrorState, ExportMenu, FilterSelect, LoadingState, Missing, Notice, Toolbar, controlBase, focusRing, panel, type Column } from "./ds";
import { PerformanceKpis } from "./performance/PerformanceKpis";
import { ChargesTrend, FinancialComparison, JobsRanking, PaymentMix, ReviewDonut, WorkingTimeChart } from "./performance/PerformanceCharts";
import { DriverAvatar, driverColor } from "./performance/shared";
import { cx } from "../../../../ui/cx";

export function performanceRows(drivers: DriverSummaryItem[], selected = ""): DriverSummaryItem[] {
  return drivers.filter(driver => driver.initials !== "UNASSIGNED" && driver.hasAccount && driver.completed > 0 && (!selected || driver.initials === selected))
    .sort((a, b) => b.completed - a.completed || a.fullName.localeCompare(b.fullName));
}

function workingTime(row: DriverSummaryItem): React.ReactNode {
  const unknown = row.workingUnknownJobs ?? 0;
  if (row.totalDurationMinutes == null || (row.totalDurationMinutes === 0 && unknown >= row.completed)) return <Missing>Not recorded</Missing>;
  return <CellStack className="text-right" primary={<span className="tabular-nums">{formatMinutes(row.totalDurationMinutes)}</span>} secondary={unknown ? <span className="text-admin-status-amber">{unknown} job{unknown === 1 ? "" : "s"} missing times</span> : undefined} />;
}

export function DriverPerformanceSummary({ from, to, driver, onRange, onDriver }: {
  from?: string; to?: string; driver: string; onRange: (from?: string, to?: string) => void; onDriver: (initials: string) => void;
}) {
  const query = useQuery({ queryKey: ["drivers_summary", from, to, "core", "completed"], queryFn: ({ signal }) => fetchDrivers(from, to, false, signal, true), staleTime: 30_000, gcTime: 5 * 60_000 });
  const prev = from && to ? previousPeriod(from, to) : null;
  const previousQuery = useQuery({ queryKey: ["drivers_summary", prev?.from, prev?.to, "core", "completed"], queryFn: ({ signal }) => fetchDrivers(prev!.from, prev!.to, false, signal, true), enabled: !!prev, staleTime: 60_000, gcTime: 5 * 60_000 });
  const jobs = useRangeJobs(from ?? "", to ?? "", !!from && !!to, driver);
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({ key: "completed", direction: "desc" });

  const roster = useMemo(() => (query.data?.drivers ?? []).filter(row => row.initials !== "UNASSIGNED" && row.hasAccount).sort((a, b) => a.fullName.localeCompare(b.fullName)), [query.data]);
  const rows = useMemo(() => performanceRows(query.data?.drivers ?? [], driver), [query.data, driver]);
  const rosterKeys = useMemo(() => roster.map(row => row.initials), [roster]);
  const previousRows = useMemo(() => performanceRows(previousQuery.data?.drivers ?? [], driver), [previousQuery.data, driver]);
  const totals = useMemo(() => totalsOf(rows), [rows]);
  const previousTotals = previousQuery.data && !previousQuery.isError ? totalsOf(previousRows) : null;
  const sorted = useMemo(() => sortDrivers(rows, sort.key, sort.direction), [rows, sort]);
  const known = (value: number | undefined) => typeof value === "number" && Number.isFinite(value) ? value : null;
  const receiptsKnown = rows.every(row => known(row.totalCollectionsPounds) !== null);

  const grain = from && to ? grainFor(from, to) : "day";
  const trend = useMemo(() => from && to && jobs.data ? chargesTrend(jobs.data.jobs, bucketsFor(from, to, grain), grain, DateTime.now().setZone("Europe/London").startOf(grain).toISODate()!) : null, [jobs.data, from, to, grain]);
  const trendMissing = trend ? trend.reduce((sum, row) => sum + row.finalMissing, 0) : 0;
  const trendPartial = !!jobs.data && !jobs.data.complete;
  const panelState = query.isLoading ? "loading" as const : query.isError ? "error" as const : "ready" as const;
  const trendState = jobs.isLoading ? "loading" as const : jobs.isError ? "error" as const : "ready" as const;
  const scope = formatRange(from, to);
  const single = !!driver && rows.length === 1 ? rows[0] : null;
  const open = (row: DriverSummaryItem | string, tab: "summary" | "comparison" = "summary") => navigateAdmin(driverReportHref(typeof row === "string" ? row : row.initials, from, to, tab));
  const retry = () => void query.refetch();

  const columns: Column<DriverSummaryItem>[] = [
    { id: "driver", header: "Driver", cell: row => (
      <span className="flex items-center gap-3"><DriverAvatar initials={row.initials} color={driverColor(row.initials, rosterKeys)} size={30} />
        <CellStack primary={row.fullName} secondary={`${row.initials}${row.active ? "" : " · account deactivated"}`} /></span>) },
    { id: "completed", header: "Completed jobs", align: "right", width: "100px", cell: row => <span className="tabular-nums">{row.completed}</span> },
    { id: "calculated", header: "Calculated charges", align: "right", width: "125px", cell: row => <span className="tabular-nums">{formatPounds(row.calculatedChargesPounds ?? row.totalChargesPounds)}</span> },
    { id: "final", header: "Final charges", align: "right", width: "115px", cell: row => <span className="font-semibold tabular-nums">{formatPounds(row.revenuePounds)}</span> },
    { id: "receipts", header: "Recorded receipts", align: "right", width: "140px", hideBelow: "lg",
      cell: row => known(row.totalCollectionsPounds) === null ? <Missing>Not recorded</Missing> : <CellStack className="text-right" primary={<span className="tabular-nums">{formatPounds(row.totalCollectionsPounds)}</span>}
        secondary={row.unknownCollectionJobs ? <span className="text-admin-status-amber">Known subtotal · {row.unknownCollectionJobs} unverified</span> : undefined} /> },
    { id: "working", header: "Working time", align: "right", width: "120px", cell: workingTime },
    { id: "reviews", header: "Review requests", align: "right", width: "115px", hideBelow: "xl",
      cell: row => <CellStack className="text-right" primary={`${row.reviewSentCount ?? 0} sent`} secondary={(row.reviewNotSentCount ?? 0) > 0 ? <span className="text-admin-status-amber">{row.reviewNotSentCount} not sent</span> : "All sent"} /> },
    { id: "actions", header: <span className="sr-only">Actions</span>, align: "right", width: "180px",
      cell: row => <div className="flex justify-end gap-2"><Action size="sm" variant="ghost" onClick={() => open(row, "comparison")} aria-label={`Review payments for ${row.fullName}`}>Payments</Action><Action size="sm" onClick={() => open(row)} aria-label={`View report for ${row.fullName}`}>View report</Action></div> }
  ];

  const exportCsv = () => {
    const csv = toCsv(sorted, [
      { header: "Driver", value: row => row.fullName }, { header: "Code", value: row => row.initials },
      { header: "Completed jobs", value: row => row.completed },
      { header: "Calculated charges (GBP)", value: row => row.calculatedChargesPounds ?? row.totalChargesPounds ?? "" },
      { header: "Final charges (GBP)", value: row => known(row.revenuePounds) ?? "" },
      { header: "Recorded receipts (GBP, excludes invoices)", value: row => known(row.totalCollectionsPounds) ?? "" },
      { header: "Working time (minutes)", value: row => row.totalDurationMinutes ?? "" }, { header: "Jobs missing working time", value: row => row.workingUnknownJobs ?? 0 },
      { header: "Review requests sent", value: row => row.reviewSentCount ?? 0 }, { header: "Review requests not sent", value: row => row.reviewNotSentCount ?? 0 }
    ]);
    downloadCsv(`driver-performance_${(from || "").slice(0, 10)}_${(to || "").slice(0, 10)}${driver ? `_${driver}` : ""}.csv`, csv);
  };

  return (
    <div className="space-y-5">
      <Toolbar count={query.data ? plural(rows.length, "driver") : undefined}
        activeFilters={driver ? [{ id: "driver", label: `Driver: ${roster.find(row => row.initials === driver)?.fullName || driver}`, onRemove: () => onDriver("") }] : []}
        onClearFilters={() => onDriver("")}
        actions={<ExportMenu options={[{ id: "csv", label: "CSV", scope: `${plural(rows.length, "driver")}, ${scope}, London time${driver ? `, ${driver} only` : ""}. Calculated, final and recorded receipts as separate columns.`, onSelect: exportCsv, disabled: rows.length === 0 }]} />}>
        <DateRangePicker presets="retrospective" from={from} to={to} onChange={onRange} />
        <FilterSelect label="Driver" value={driver} onChange={onDriver} allLabel="All drivers" disabled={query.isLoading || query.isError}
          options={roster.map(row => ({ value: row.initials, label: `${row.fullName} (${row.initials})${row.active ? "" : " · deactivated"}` }))} className="w-[220px]" />
      </Toolbar>

      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[20px] font-bold tracking-tight text-admin-ink">{single ? single.fullName : "Driver performance"}</h2>
          <p className="text-[13px] text-admin-ink-2">Completed jobs in {scope} (London time){single ? "" : `, ${plural(rows.length, "driver")}`}. Final charges are billed at completion, including invoices; recorded receipts exclude invoices.</p>
        </div>
        {single && <Action variant="primary" icon={<ExternalLink />} onClick={() => open(single)}>View full driver report</Action>}
      </header>

      {query.isError ? (
        <section className={panel}><ErrorState title="Couldn't load driver performance" message={(query.error as Error)?.message} onRetry={retry} /></section>
      ) : query.isLoading ? (
        <>
          <PerformanceKpis totals={totalsOf([])} previous={null} trend={null} trendPartial={false} period="previous period" loading />
          <section className={panel}><LoadingState label="Loading driver performance" /></section>
        </>
      ) : rows.length === 0 ? (
        <section className={panel}><EmptyState kind={driver ? "no-matches" : "empty"} title="No completed jobs in this range" message={driver ? "This driver has no completed jobs in the selected dates." : "Choose a wider date range to compare drivers."}
          actions={driver ? <Action onClick={() => onDriver("")}>Show all drivers</Action> : undefined} /></section>
      ) : (
        <>
          <PerformanceKpis totals={totals} previous={previousTotals} trend={trend} trendPartial={trendPartial} period="previous period" loading={false} />

          {single ? (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
              <ChargesTrend rows={trend ?? []} grain={grain} partial={trendPartial} missing={trendMissing} state={trendState} error={(jobs.error as Error)?.message} onRetry={() => void jobs.refetch()} />
              <ReviewDonut sent={totals.reviewSent} notSent={totals.reviewNotSent} state={panelState} onRetry={retry} />
              <WorkingTimeChart rows={rows} roster={rosterKeys} state={panelState} onRetry={retry} />
              <PaymentMix rows={rows} state={panelState} onRetry={retry} />
            </div>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
                <JobsRanking rows={rows} roster={rosterKeys} onOpen={open} state={panelState} onRetry={retry} />
                <ReviewDonut sent={totals.reviewSent} notSent={totals.reviewNotSent} state={panelState} onRetry={retry} />
              </div>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
                <FinancialComparison rows={rows} onOpen={open} state={panelState} onRetry={retry} />
                <PaymentMix rows={rows} state={panelState} onRetry={retry} />
              </div>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                <ChargesTrend rows={trend ?? []} grain={grain} partial={trendPartial} missing={trendMissing} state={trendState} error={(jobs.error as Error)?.message} onRetry={() => void jobs.refetch()} />
                <WorkingTimeChart rows={rows} roster={rosterKeys} onOpen={open} state={panelState} onRetry={retry} />
              </div>
            </>
          )}

          {!single && (
            <section className={cx(panel, "overflow-hidden")} aria-label="Driver performance summary">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-admin-line px-4 py-3">
                <h3 className="text-[15px] font-semibold text-admin-ink">Driver comparison</h3>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-[13px] text-admin-ink-2">Sort by
                    <select value={sort.key} onChange={event => setSort(current => ({ ...current, key: event.target.value as SortKey }))} className={cx(controlBase, "h-9")}>
                      {(Object.keys(SORT_LABEL) as SortKey[]).map(key => <option key={key} value={key}>{SORT_LABEL[key]}</option>)}
                    </select>
                  </label>
                  <button type="button" onClick={() => setSort(current => ({ ...current, direction: current.direction === "asc" ? "desc" : "asc" }))} aria-label={`Sort ${sort.direction === "asc" ? "descending" : "ascending"}`}
                    className={cx("grid h-9 w-9 place-items-center rounded-lg border border-admin-line text-admin-ink-2 hover:bg-admin-surface", focusRing)}>
                    {sort.direction === "asc" ? <ArrowUpAZ aria-hidden className="h-4 w-4" /> : <ArrowDownAZ aria-hidden className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <DataTable rows={sorted} columns={columns} keyOf={row => row.initials} onOpen={row => open(row)} openLabel={row => `View report for ${row.fullName}`} caption="Driver performance summary" minWidth={900}
                mobileRow={row => (
                  <div className="space-y-0.5">
                    <div className="flex justify-between gap-2"><span className="font-semibold">{row.fullName}</span><span className="tabular-nums text-admin-ink-2">{row.completed} completed</span></div>
                    <p className="text-[13px] text-admin-ink-2">Calculated {formatPounds(row.calculatedChargesPounds ?? row.totalChargesPounds)} · Final {formatPounds(row.revenuePounds)}</p>
                    <p className="text-[13px] text-admin-ink-2">Receipts {known(row.totalCollectionsPounds) === null ? "Not recorded" : formatPounds(row.totalCollectionsPounds)} · Working time {formatMinutes(row.totalDurationMinutes, "Not recorded")}</p>
                  </div>
                )} />
              <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-admin-line bg-admin-surface/60 px-4 py-2.5 text-[13px] text-admin-ink-2">
                <span>Total completed jobs <strong className="tabular-nums text-admin-ink">{totals.completed}</strong></span>
                <span>Calculated charges <strong className="tabular-nums text-admin-ink">{formatPounds(totals.calculated)}</strong></span>
                <span>Final charges <strong className="tabular-nums text-admin-ink">{formatPounds(totals.final)}</strong></span>
              </div>
            </section>
          )}
          {!receiptsKnown && <Notice tone="info">Recorded receipts are missing for some drivers in this range and are shown as "Not recorded", not £0.00.</Notice>}
        </>
      )}
    </div>
  );
}
