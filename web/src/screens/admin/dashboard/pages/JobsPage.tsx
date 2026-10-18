/**
 * Jobs: every booking, one list, one canonical job detail.
 *
 * - "Finished Jobs" is the Completed filter here, not a competing page (legacy
 *   `section=finished` links land on this filter).
 * - Two views over the same request: cards (default; route, driver, money and issues per
 *   job, see components/jobs/JobCard.tsx) and the compact table for comparing many
 *   jobs. The choice is kept in the URL and remembered in this browser.
 * - Status chips show how many jobs of each status match the other filters (one
 *   counting request per status, page size 1), so the counts are exact, not page-local.
 * - Every filter, the sort, the page and the view live in the URL, and the job detail
 *   opens over this page, so closing it returns to the same list and scroll position.
 * - One clearly labelled amount per row; a missing amount is "Not recorded", never £0.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, Download, LayoutGrid, List, Plus, RefreshCw, Trash2, UserPlus, UserX, X } from "lucide-react";
import { AddJobModal } from "../components/AddJobModal";
import { fetchJobs, reassignJob } from "../api";
import type { NormalizedJob } from "../types";
import { DateRangePicker, dateRangeForPreset } from "../components/DateRangePicker";
import { BulkDeleteModal } from "../components/BulkDeleteModal";
import { JobStatusBadge } from "../components/StatusBadge";
import { JobCard, JobCardGrid, JobCardSkeleton } from "../components/jobs/JobCard";
import { attentionOf, crewLine, rowCharge } from "../components/jobs/jobView";
import { useDriverOptions } from "../hooks/useDriverOptions";
import { useUrlState } from "../hooks/useUrlState";
import { isUnassigned, jobAttention } from "../hooks/useAttention";
import { openJob } from "../navigation";
import { downloadCsv, stampForFilename, toCsv } from "../utils/csv";
import { downloadServerCsv } from "../utils/serverDownload";
import { formatDate, formatDateTime, formatMoney, formatRange, formatTime } from "../utils/format";
import { resolveDriver } from "../utils/drivers";
import { Modal } from "../../../../ui/Modal";
import { cx } from "../../../../ui/cx";
import {
  Action, CellStack, ChoiceChips, DataTable, EmptyState, ErrorState, ExportMenu, FilterSelect, LoadingState, Missing,
  PageHeader, Pagination, SearchField, Toolbar, Notice, controlBase, focusRing, panel, type ActiveFilter, type Column
} from "../components/ds";

type StatusFilter = "all" | "scheduled" | "in_progress" | "completed" | "cancelled";
const STATUS_PARAM: Record<StatusFilter, string | undefined> = { all: undefined, scheduled: "READY", in_progress: "IN_PROGRESS", completed: "COMPLETED", cancelled: "CANCELLED" };
const STATUS_LABEL: Record<StatusFilter, string> = { all: "All statuses", scheduled: "Scheduled", in_progress: "In progress", completed: "Completed", cancelled: "Cancelled" };
const SORT_FIELD: Record<string, string> = { time: "bookedStart", amount: "amountCharged", status: "status" };

export { rowCharge };

const VIEW_KEY = "tmv:jobs-view";
function rememberedView(): "cards" | "table" {
  try { return window.localStorage.getItem(VIEW_KEY) === "table" ? "table" : "cards"; } catch { return "cards"; }
}

export function JobsPage() {
  const today = dateRangeForPreset("today");
  const [state, setState] = useUrlState({
    from: today.from!, to: today.to!, range: "", q: "", status: "all", driver: "", sort: "time", dir: "asc", page: "1", size: "25", view: rememberedView()
  });
  const allDates = state.range === "all";
  const from = allDates ? undefined : state.from;
  const to = allDates ? undefined : state.to;
  const page = Math.max(1, Number(state.page) || 1);
  const pageSize = [25, 50, 100].includes(Number(state.size)) ? Number(state.size) : 25;
  const status = (Object.keys(STATUS_PARAM).includes(state.status) ? state.status : "all") as StatusFilter;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reassignIds, setReassignIds] = useState<string[] | null>(null);
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const [exportError, setExportError] = useState("");
  const drivers = useDriverOptions();

  const query = useQuery({
    queryKey: ["jobs", from, to, state.q, status, state.driver, page, pageSize, state.sort, state.dir],
    queryFn: () => fetchJobs({
      page, pageSize, from, to,
      // `q` is the search parameter the jobs route reads; the former Finished Jobs
      // page sent `search` instead. Both are sent so neither backend reading breaks.
      q: state.q.toLowerCase() || undefined, search: state.q.toLowerCase() || undefined,
      status: STATUS_PARAM[status], driver: state.driver || undefined, sort: SORT_FIELD[state.sort] ?? "bookedStart", dir: state.dir
    })
  });
  // Exact counts per status for the other filters: one page-size-1 request each.
  const countFilters = { from, to, q: state.q.toLowerCase() || undefined, search: state.q.toLowerCase() || undefined, driver: state.driver || undefined };
  const counts = useQueries({
    queries: (Object.keys(STATUS_PARAM) as StatusFilter[]).map(key => ({
      queryKey: ["jobs_count", key, countFilters],
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchJobs({ ...countFilters, status: STATUS_PARAM[key], page: 1, pageSize: 1 }, signal).then(response => response.pagination.total),
      staleTime: 30_000
    }))
  });
  const countOf = (key: StatusFilter) => { const value = counts[(Object.keys(STATUS_PARAM) as StatusFilter[]).indexOf(key)]?.data; return typeof value === "number" ? value : undefined; };
  const items = query.data?.items ?? [];
  const total = query.data?.pagination.total ?? 0;
  const view: "cards" | "table" = state.view === "table" ? "table" : "cards";
  const setView = (next: "cards" | "table") => { setState({ view: next }); try { window.localStorage.setItem(VIEW_KEY, next); } catch { /* optional */ } };
  const attentionOnPage = useMemo(() => items.filter(job => attentionOf(job).items.length > 0).length, [items]);
  const totalPages = Math.max(1, query.data?.pagination.totalPages ?? 1);
  useEffect(() => { if (query.data && page > totalPages) setState({ page: String(totalPages) }); }, [query.data, page, totalPages]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setSelected(new Set()); }, [from, to, state.q, status, state.driver, page, pageSize, state.sort, state.dir]);

  const setFilter = (patch: Partial<typeof state>) => setState({ ...patch, page: "1" });
  const driverName = (code: string) => drivers.options.find(option => option.initials === code)?.fullName || code;
  const activeFilters: ActiveFilter[] = [
    ...(state.q ? [{ id: "q", label: `Search: “${state.q}”`, onRemove: () => setFilter({ q: "" }) }] : []),
    ...(status !== "all" ? [{ id: "status", label: `Status: ${STATUS_LABEL[status]}`, onRemove: () => setFilter({ status: "all" }) }] : []),
    ...(state.driver ? [{ id: "driver", label: `Driver: ${driverName(state.driver)}`, onRemove: () => setFilter({ driver: "" }) }] : []),
    ...(allDates ? [{ id: "range", label: "All dates", onRemove: () => setFilter({ range: "", from: today.from!, to: today.to! }) }] : [])
  ];
  const clearFilters = () => setFilter({ q: "", status: "all", driver: "", range: "", from: today.from!, to: today.to! });
  const scope = allDates ? "All dates" : formatRange(from, to);

  const sortHeader = (key: "time" | "amount" | "status", label: string) => {
    const active = state.sort === key;
    const nextDir = active && state.dir === "asc" ? "desc" : "asc";
    return (
      <button type="button" onClick={() => setState({ sort: key, dir: active ? nextDir : key === "time" ? "asc" : "desc", page: "1" })}
        aria-label={`Sort by ${label}${active ? `, currently ${state.dir === "asc" ? "ascending" : "descending"}` : ""}`}
        className={cx("inline-flex items-center gap-1 rounded hover:text-admin-ink", focusRing, active && "text-admin-ink")}>
        {label}{active ? state.dir === "asc" ? <ChevronUp aria-hidden className="h-3.5 w-3.5" /> : <ChevronDown aria-hidden className="h-3.5 w-3.5" /> : null}
      </button>
    );
  };

  const toggle = (id: string) => setSelected(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const allSelected = items.length > 0 && items.every(job => selected.has(job.jobId));

  const columns: Column<NormalizedJob>[] = [
    {
      id: "select", width: "44px", header: <input type="checkbox" aria-label="Select all jobs on this page" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(items.map(job => job.jobId)))} className="h-4 w-4 accent-admin-brand" />,
      cell: job => <input type="checkbox" aria-label={`Select job ${job.jobId}`} checked={selected.has(job.jobId)} onChange={() => toggle(job.jobId)} className="h-4 w-4 accent-admin-brand" />
    },
    { id: "time", header: sortHeader("time", "Scheduled"), width: "104px", cell: job => <CellStack primary={<span className="text-[15px] font-bold tabular-nums">{formatTime(job.bookedStart, "—")}</span>} secondary={formatDate(job.bookedStart, "Not scheduled")} /> },
    {
      id: "customer", header: "Customer & route",
      cell: job => <CellStack className="max-w-[420px]" primary={<span className="font-semibold">{job.customerName || <Missing>Customer not recorded</Missing>}</span>}
        secondary={<span className="flex min-w-0 items-center gap-1" title={`${job.pickup || "Pickup not recorded"} → ${job.dropoff || "Drop-off not recorded"}`}>
          <span className="truncate">{job.pickup || "Pickup not recorded"}</span><ChevronRight aria-label="to" className="h-3.5 w-3.5 shrink-0 text-admin-brand" /><span className="truncate">{job.dropoff || "Drop-off not recorded"}</span>
        </span>} />
    },
    {
      id: "driver", header: "Driver", width: "176px",
      cell: job => isUnassigned(job)
        ? <span className="inline-flex items-center gap-1.5 rounded-lg border border-admin-status-amber/35 bg-admin-status-amber-bg px-2 py-1 text-[12.5px] font-semibold text-admin-status-amber"><UserX aria-hidden className="h-3.5 w-3.5" />No driver</span>
        : <span className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden className="tmv-avatar grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[11.5px] font-bold">{job.driverInitials || "?"}</span>
            <CellStack className="min-w-0" primary={resolveDriver(job.driverName, job.driverInitials).name} secondary={[job.driverInitials, crewLine(job)].filter(Boolean).join(" · ")} />
          </span>
    },
    { id: "status", header: sortHeader("status", "Job status"), width: "124px", cell: job => <JobStatusBadge status={job.status} activity={job.activity} /> },
    {
      id: "amount", header: sortHeader("amount", "Charge"), align: "right", width: "124px",
      cell: job => { const charge = rowCharge(job); return <CellStack className="text-right" primary={<span className="font-semibold tabular-nums">{formatMoney(charge.pence, charge.label === "Not charged" ? "—" : charge.label === "Calculated" ? "Not priced" : "Not recorded")}</span>} secondary={charge.label === "Final" ? "Final charge" : charge.label === "Not charged" ? "Cancelled" : "Calculated"} />; }
    },
    { id: "exception", header: "Needs attention", hideBelow: "lg", width: "196px", cell: job => <ExceptionCell job={job} /> },
    { id: "open", header: <span className="sr-only">Open</span>, width: "84px", align: "right", cell: job => <Action size="sm" onClick={() => openJob(job.jobId)} aria-label={`Open job ${job.jobId}`}>Open</Action> }
  ];

  const exportFiltered = () => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (state.q) { params.set("q", state.q.toLowerCase()); params.set("search", state.q.toLowerCase()); }
    if (STATUS_PARAM[status]) params.set("status", STATUS_PARAM[status]!);
    if (state.driver) params.set("driver", state.driver);
    setExportError("");
    downloadServerCsv(`/api/admin/jobs/export.csv?${params.toString()}`, `tmv-jobs-${stampForFilename()}.csv`).catch(error => setExportError((error as Error)?.message || "The export could not be downloaded."));
  };
  const exportSelection = () => {
    const rows = items.filter(job => selected.has(job.jobId));
    downloadCsv(`tmv-jobs-selected-${stampForFilename()}.csv`, toCsv(rows, [
      { header: "Job ID", value: job => job.jobId },
      { header: "Scheduled start (London)", value: job => formatDateTime(job.bookedStart, "Not scheduled") },
      { header: "Customer", value: job => job.customerName },
      { header: "Pickup", value: job => job.pickup },
      { header: "Drop-off", value: job => job.dropoff },
      { header: "Driver", value: job => resolveDriver(job.driverName, job.driverInitials).name },
      { header: "Job status", value: job => job.status },
      { header: "Calculated charge (GBP)", value: job => { const value = job.totalCharges ?? job.calculatedTotalCharges; return typeof value === "number" ? (value / 100).toFixed(2) : "Not recorded"; } },
      { header: "Final charge (GBP)", value: job => job.status === "COMPLETED" && typeof job.amountCharged === "number" ? (job.amountCharged / 100).toFixed(2) : "Not recorded" }
    ]));
  };
  const filterSummary = [scope, status !== "all" ? STATUS_LABEL[status] : "", state.driver ? driverName(state.driver) : "", state.q ? `search “${state.q}”` : ""].filter(Boolean).join(", ");

  const statusOptions = (Object.keys(STATUS_LABEL) as StatusFilter[]).map(value => ({ value, label: value === "all" ? "All" : STATUS_LABEL[value], count: countOf(value) }));
  const cardActions = { onToggle: toggle, onReassign: (id: string) => setReassignIds([id]), onDelete: (id: string) => setDeleteIds([id]) };

  return (
    <>
      <PageHeader title="Jobs" scope={<>{scope} · London time</>}
        actions={<><Action variant="primary" icon={<Plus />} onClick={() => setCreating(true)}>Add job</Action><ExportMenu options={[
          { id: "filtered", label: "CSV — all filtered jobs", scope: `${total} job${total === 1 ? "" : "s"}: ${filterSummary}. Generated by the server; columns as defined by the export.`, onSelect: exportFiltered, disabled: total === 0 },
          { id: "selected", label: `CSV — selected jobs (${selected.size})`, scope: "Only the jobs ticked on this page, with the labels used in this list.", onSelect: exportSelection, disabled: selected.size === 0 }
        ]} /></>} />

      {exportError && <Notice tone="danger" role="alert" action={<Action size="sm" onClick={() => setExportError("")}>Dismiss</Action>}>{exportError}</Notice>}
      {created && <Notice tone="success" action={<Action size="sm" onClick={() => setCreated(false)}>Dismiss</Action>}>Booking created. It will appear after Calendar synchronization. Check your date and status filters if it is not visible.</Notice>}
      <Toolbar label="Job filters" activeFilters={activeFilters} onClearFilters={clearFilters}>
        <SearchField label="Search jobs by reference, customer, address or driver" placeholder="Search jobs" value={state.q} debounceMs={300} onChange={q => setFilter({ q })} className="sm:w-auto sm:min-w-[240px] sm:flex-1" />
        <FilterSelect label="Driver" value={state.driver} onChange={driver => setFilter({ driver })} allLabel={drivers.isLoading ? "Loading drivers…" : "All drivers"}
          disabled={drivers.isLoading} options={drivers.options.map(option => ({ value: option.initials, label: `${option.fullName || option.initials} (${option.initials})${option.active ? "" : " · inactive"}` }))} className="w-full sm:w-[190px]" />
        <DateRangePicker compact from={from} to={to} allowAll onChange={(nextFrom, nextTo) => setFilter(nextFrom || nextTo ? { range: "", from: nextFrom ?? "", to: nextTo ?? "" } : { range: "all" })} />
        <div className="flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-2.5 xl:flex-nowrap">
        <div className="min-w-0 basis-full xl:basis-auto xl:flex-1 [&>div]:flex-nowrap [&>div]:overflow-x-auto [&>div]:[scrollbar-width:none]"><ChoiceChips label="Job status" value={status} onChange={value => setFilter({ status: value })} options={statusOptions} /></div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {/* The status chips carry the counts; this line only adds what they don't. */}
          <span aria-live="polite" className="whitespace-nowrap px-1 text-[13px] font-medium text-admin-ink-2">
            {!query.isLoading && !query.isError && <span className="tabular-nums text-admin-ink">{total} job{total === 1 ? "" : "s"}{(query.isFetching || attentionOnPage > 0) && <span aria-hidden className="mx-1.5 text-admin-muted">·</span>}</span>}
            {query.isFetching && !query.isLoading ? "Updating…" : !query.isLoading && attentionOnPage > 0 ? <span className="inline-flex items-center gap-1 text-admin-status-amber"><AlertTriangle aria-hidden className="h-3.5 w-3.5" />{attentionOnPage} need attention</span> : null}
          </span>
          <button type="button" onClick={() => { void query.refetch(); counts.forEach(count => void count.refetch()); }} aria-label="Refresh jobs" title="Refresh"
            className={cx("grid h-10 w-10 place-items-center rounded-xl border border-admin-line bg-surface text-admin-ink-2 hover:text-admin-ink", focusRing)}>
            <RefreshCw aria-hidden className={cx("h-4 w-4", query.isFetching && "animate-spin motion-reduce:animate-none")} />
          </button>
          <div role="group" aria-label="View" className="inline-flex rounded-xl border border-admin-line bg-admin-surface p-1">
            {([["cards", "Card view", LayoutGrid], ["table", "Table view", List]] as const).map(([value, label, Icon]) => (
              <button key={value} type="button" aria-label={label} aria-pressed={view === value} title={label} onClick={() => setView(value)}
                className={cx("inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold", focusRing, view === value ? "bg-surface text-admin-brand shadow-[var(--admin-shadow-sm)] ring-1 ring-admin-brand/25" : "text-admin-ink-2 hover:text-admin-ink")}>
                <Icon aria-hidden className="h-4 w-4" /><span className="hidden xl:inline">{value === "cards" ? "Cards" : "Table"}</span>
              </button>
            ))}
          </div>
        </div>
        </div>
      </Toolbar>

      <section aria-label="Job list" aria-busy={query.isFetching} className={cx(view === "table" && panel, view === "table" && "overflow-hidden")}>
        {query.isLoading ? (view === "cards"
            ? <><span role="status" aria-label="Loading jobs" className="sr-only">Loading jobs</span><JobCardGrid label="Loading jobs">{Array.from({ length: 6 }, (_, index) => <li key={index}><JobCardSkeleton /></li>)}</JobCardGrid></>
            : <LoadingState label="Loading jobs" rows={8} />)
          : query.isError ? <div className={view === "cards" ? panel : undefined}><ErrorState title="Couldn't load jobs" message={(query.error as Error)?.message} onRetry={() => void query.refetch()} /></div>
          : items.length === 0 ? (
            <div className={view === "cards" ? panel : undefined}>
              {activeFilters.length || !allDates
                ? <EmptyState kind="no-matches" title={activeFilters.length ? "No jobs match your filters" : "No jobs scheduled for this period"}
                  message={activeFilters.length ? "Clear filters or widen the date range." : `Nothing is booked for ${scope}. Try another day or search all dates.`}
                  actions={<>{activeFilters.length > 0 && <Action onClick={clearFilters}>Clear filters</Action>}{!allDates && <Action onClick={() => setFilter({ range: "all" })}>Show all dates</Action>}</>} />
                : <EmptyState title="No jobs yet" message="Jobs appear here when bookings sync from the Calendar." />}
            </div>
          ) : view === "cards" ? (
            <JobCardGrid>{items.map(job => <li key={job.jobId} className="flex [&>article]:flex-1"><JobCard job={job} selected={selected.has(job.jobId)} actions={cardActions} /></li>)}</JobCardGrid>
          ) : <DataTable rows={items} columns={columns} keyOf={job => job.jobId} onOpen={job => openJob(job.jobId)} openLabel={job => `Open job ${job.jobId}, ${job.customerName}`}
            caption="Jobs" layout="fixed" minWidth={1000} rowTone={job => selected.has(job.jobId) ? "attention" : "default"} mobileRow={job => <JobMobileRow job={job} />} />}
        {/* One page of results: the count already sits in the toolbar, so no separate footer bar. */}
        {!query.isLoading && !query.isError && items.length > 0 && (totalPages > 1 || total > 25) && (
          <div className={cx("flex flex-wrap items-center justify-between gap-2", view === "cards" && cx(panel, "mt-4"))}>
            <div className="flex-1"><Pagination page={page} pageSize={pageSize} total={total} noun="job" onPage={next => setState({ page: String(next) })} /></div>
            {total > 25 && (
              <label className="flex items-center gap-2 px-4 py-3 text-[13px] text-admin-ink-2">Per page
                <select value={pageSize} onChange={event => setState({ size: event.target.value, page: "1" })} className={cx(controlBase, "h-8 w-[76px] px-2")}>
                  {[25, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
                </select>
              </label>
            )}
          </div>
        )}
      </section>

      {selected.size > 0 && (
        <div role="region" aria-label="Selected jobs" className="tmv-bulkbar sticky bottom-3 z-20 mx-auto flex w-full max-w-3xl flex-wrap items-center gap-2 rounded-2xl border border-admin-brand/30 bg-surface px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
          <span className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-admin-ink"><CheckCircle2 aria-hidden className="h-4 w-4 text-admin-brand" />{selected.size} selected</span>
          <Action size="sm" icon={<UserPlus />} onClick={() => setReassignIds(Array.from(selected))}>Reassign…</Action>
          <Action size="sm" icon={<Download />} onClick={exportSelection}>Export</Action>
          <span className="flex-1" />
          <Action size="sm" variant="ghost" icon={<Trash2 />} className="text-admin-status-red" onClick={() => setDeleteIds(Array.from(selected))}>Delete…</Action>
          <Action size="sm" variant="ghost" icon={<X />} onClick={() => setSelected(new Set())}>Clear</Action>
        </div>
      )}

      {creating && <AddJobModal isOpen onClose={() => setCreating(false)} onCreated={() => setCreated(true)} />}
      {reassignIds && <BulkReassignDialog jobs={reassignIds.map(id => ({ jobId: id, status: items.find(job => job.jobId === id)?.status ?? "" }))} onClose={() => setReassignIds(null)} onDone={() => { setReassignIds(null); setSelected(new Set()); void query.refetch(); }} />}
      {deleteIds && <BulkDeleteModal jobIds={deleteIds} onClose={() => setDeleteIds(null)} onDone={() => { setDeleteIds(null); setSelected(new Set()); void query.refetch(); counts.forEach(count => void count.refetch()); }} />}
    </>
  );
}

function ExceptionCell({ job }: { job: NormalizedJob }) {
  const { items, severity } = attentionOf(job);
  if (!items.length) return <span className="text-[13px] text-admin-muted">No issues</span>;
  const tone = severity === "high" ? "border-admin-status-red/30 bg-admin-status-red-bg text-admin-status-red" : severity === "medium" ? "border-admin-status-amber/30 bg-admin-status-amber-bg text-admin-status-amber" : "border-admin-line bg-admin-surface text-admin-ink-2";
  return (
    <span className={cx("inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-1 text-[12.5px] font-semibold", tone)} title={items.map(item => item.title).join("; ")}>
      <AlertTriangle aria-hidden className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{items[0].title}</span>
      {items.length > 1 && <span className="shrink-0 font-medium opacity-80">+{items.length - 1}</span>}
    </span>
  );
}

function JobMobileRow({ job }: { job: NormalizedJob }) {
  const charge = rowCharge(job);
  const issues = jobAttention(job);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold tabular-nums text-admin-ink-2">{formatDate(job.bookedStart, "Not scheduled")} · {formatTime(job.bookedStart, "—")}</span>
        <JobStatusBadge status={job.status} activity={job.activity} />
      </div>
      <p className="truncate text-[15px] font-semibold text-admin-ink">{job.customerName || "Customer not recorded"}</p>
      <p className="truncate text-[13px] text-admin-ink-2">{job.pickup || "Pickup not recorded"} → {job.dropoff || "Drop-off not recorded"}</p>
      <div className="flex items-center justify-between gap-2 text-[13px]">
        <span className="truncate text-admin-ink-2">{isUnassigned(job) ? "No driver assigned" : job.driverName}</span>
        <span className="shrink-0 tabular-nums text-admin-ink">{charge.label === "Not charged" ? <span className="text-admin-ink-2">Not charged</span> : <>{formatMoney(charge.pence, charge.label === "Calculated" ? "Not priced" : "Not recorded")} <span className="text-admin-ink-2">{charge.label.toLowerCase()}</span></>}</span>
      </div>
      {issues.length > 0 && <p className="flex items-center gap-1 text-[13px] text-admin-status-amber"><AlertTriangle aria-hidden className="h-3.5 w-3.5" />{issues[0].title}{issues.length > 1 ? ` +${issues.length - 1}` : ""}</p>}
    </div>
  );
}

/** Only scheduled and in-progress jobs can change driver; completed and cancelled
 *  jobs keep the driver they were done (or cancelled) with. */
export const REASSIGNABLE = new Set(["READY", "IN_PROGRESS"]);

/** Reassigns each eligible selected job in turn. Sequential so the progress count is
 *  truthful and a partial failure says exactly which jobs moved. */
function BulkReassignDialog({ jobs, onClose, onDone }: { jobs: Array<{ jobId: string; status: string }>; onClose: () => void; onDone: () => void }) {
  const { options, isLoading } = useDriverOptions();
  const [initials, setInitials] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [error, setError] = useState("");
  const active = useMemo(() => options.filter(option => option.active), [options]);
  const jobIds = useMemo(() => jobs.filter(job => REASSIGNABLE.has(job.status)).map(job => job.jobId), [jobs]);
  const skipped = jobs.length - jobIds.length;
  const confirm = async () => {
    if (!jobIds.length) { onClose(); return; }
    if (!initials) { setError("Choose a driver."); return; }
    setBusy(true); setError("");
    let moved = done;
    try {
      for (const jobId of jobIds.slice(done)) { await reassignJob(jobId, initials); moved++; setDone(moved); }
      onDone();
    } catch (err) {
      setError(`${moved} of ${jobIds.length} reassigned. ${(err as Error)?.message || "The rest were not changed."}`);
    } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={jobIds.length ? `Reassign ${jobIds.length} job${jobIds.length === 1 ? "" : "s"}` : "Nothing to reassign"} placement="center" dismissible={!busy}
      footer={<div className="flex justify-end gap-2"><Action variant="ghost" onClick={onClose} disabled={busy}>Cancel</Action><Action variant="primary" loading={busy} onClick={() => void confirm()}>{!jobIds.length ? "Close" : done ? "Retry remaining" : "Reassign and notify"}</Action></div>}>
      {skipped > 0 && <p role="note" className="mb-3 rounded-lg border border-admin-status-amber/30 bg-admin-status-amber-bg px-3 py-2 text-[13px] text-admin-ink">{skipped} completed or cancelled job{skipped === 1 ? " is" : "s are"} left with {skipped === 1 ? "its" : "their"} recorded driver.</p>}
      {jobIds.length > 0 && <p className="text-[14px] text-admin-ink-2">The chosen driver is notified for each job and the linked Calendar events are updated.</p>}
      {jobIds.length > 0 && (
      <label className="mt-4 block text-[13px] font-medium text-admin-ink-2">Assign to
        <select value={initials} onChange={event => { setInitials(event.target.value); setError(""); }} disabled={busy || isLoading} className={cx(controlBase, "mt-1 w-full")}>
          <option value="">{isLoading ? "Loading drivers…" : "Choose a driver"}</option>
          {active.map(driver => <option key={driver.initials} value={driver.initials}>{driver.fullName || driver.initials} ({driver.initials})</option>)}
        </select>
      </label>
      )}
      {busy && <p role="status" className="mt-3 text-[13px] text-admin-ink-2">Reassigning… {done} of {jobIds.length}</p>}
      {error && <p role="alert" className="mt-3 text-[13px] text-admin-status-red">{error}</p>}
    </Modal>
  );
}
