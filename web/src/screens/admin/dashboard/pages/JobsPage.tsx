import React, { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchDrivers, fetchJobs, reassignJob } from "../api";
import { NormalizedJob } from "../types";
import { JobDetailDrawer } from "../components/JobDetailDrawer";
import { JobStatusBadge, DelayBandBadge } from "../components/StatusBadge";
import { DateRangePicker } from "../components/DateRangePicker";
import { ApiErrorState } from "../components/ApiErrorState";
import { BulkDeleteModal } from "../components/BulkDeleteModal";
import { formatLondonDateTime } from "../utils/date";
import { downloadCsv, stampForFilename, toCsv } from "../utils/csv";
import { resolveDriver, formatVanReg } from "../utils/drivers";
import {
  Search,
  Download,
  LayoutGrid,
  List,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ChevronLeft,
  Camera,
  RefreshCw,
  AlertTriangle,
  UserPlus,
  Trash2
} from "lucide-react";

export function JobsPage() {
  // The table is 12 columns wide and lives behind a horizontal scrollbar on anything
  // narrower than a desktop -- close to unusable there. Cards are the default view on
  // every screen size now; table is still available via the toggle for anyone who
  // wants the denser, sortable layout.
  const [viewMode, setViewMode] = useState<"table" | "cards">("cards");
  const [reassignOpen, setReassignOpen] = useState(false);
  const [cardReassignJob, setCardReassignJob] = useState<NormalizedJob | null>(null);
  const [deleteJobIds, setDeleteJobIds] = useState<string[] | null>(null);
  const [drawerJob, setDrawerJob] = useState<NormalizedJob | null>(null);
  
  // Filtering & Pagination
  const [from, setFrom] = useState<string | undefined>();
  const [to, setTo] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All"); // All, In Progress
  
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Sorting
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: "asc" | "desc" } | null>({ key: "Timing", direction: "asc" });

  // Selection
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  // Maps the UI's sort column to a raw Mongo field jobs.repo.ts's listJobsPage can
  // actually sort on. "Punctuality" (delayMinutes) has no raw equivalent -- it's only
  // computed after normalizing -- so it's left unsent and the server falls back to its
  // own default (bookedStart); the client-side sort pass below still honours it
  // correctly for whichever page comes back.
  const SORT_FIELD_MAP: Record<string, string> = { Timing: "bookedStart", Total: "amountCharged", Status: "status" };
  const serverSort = sortConfig ? SORT_FIELD_MAP[sortConfig.key] : undefined;
  const serverStatus = statusFilter === "In Progress" ? "IN_PROGRESS" : undefined;

  /**
   * Real server-side pagination. This used to pull up to 500 rows -- the whole
   * company's job history, with evidence/activity/etc. joined in via the shared
   * dashboard dataset cache -- on every request, then filter/sort/paginate all of it
   * client-side, just to show 25 rows. Measured live in production: fetching everything
   * took 9-11s; a genuinely limited, filtered Mongo query (jobs.routes.ts's GET /, now
   * backed by listJobsPage) takes well under 1s, because the cost was proportional to
   * how many documents came back, not a fixed per-request tax.
   *
   * `page` is in the query key so changing it actually refetches (a jobs.routes.ts
   * fix from earlier this migration -- see that route's own comments); search/status/
   * sort are sent to the server rather than filtered from an oversized local batch, so
   * a job doesn't have to be in the first N rows to be found or correctly ordered.
   */
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["jobs", from, to, debouncedSearch, serverStatus, page, pageSize, serverSort, sortConfig?.direction],
    queryFn: () => fetchJobs({
      page, pageSize, from, to, q: debouncedSearch || undefined, status: serverStatus,
      sort: serverSort, dir: sortConfig?.direction
    })
  });

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery.toLowerCase());
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Final client-side sort pass over just the current page (cheap -- pageSize rows,
  // not the whole company) so every sort column behaves identically regardless of
  // whether the server could also sort on it (see SORT_FIELD_MAP's Punctuality note).
  const sortedItems = useMemo(() => {
    const items = data?.items ? [...data.items] : [];
    if (!sortConfig) return items;
    items.sort((a, b) => {
      let valA: any = 0;
      let valB: any = 0;

      if (sortConfig.key === "Timing") {
        valA = new Date(a.bookedStart || 0).getTime();
        valB = new Date(b.bookedStart || 0).getTime();
      } else if (sortConfig.key === "Total") {
        valA = a.amountCharged || 0;
        valB = b.amountCharged || 0;
      } else if (sortConfig.key === "Status") {
        valA = a.status;
        valB = b.status;
      } else if (sortConfig.key === "Punctuality") {
        valA = a.delayMinutes || 0;
        valB = b.delayMinutes || 0;
      }

      if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1;
      if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
    return items;
  }, [data?.items, sortConfig]);

  const total = data?.pagination?.total ?? 0;
  const totalPages = Math.max(1, data?.pagination?.totalPages ?? 1);
  const safePage = Math.min(page, totalPages);

  // A new filter/search can shrink the result set beneath the current page; snap back
  // rather than stranding the user on an empty page with no way to tell why.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const handleSort = (key: string) => {
    setSortConfig(current => {
      if (current?.key === key) {
        return { key, direction: current.direction === "asc" ? "desc" : "asc" };
      }
      return { key, direction: "desc" };
    });
    setPage(1);
  };

  function exportFilteredCsv() {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (serverStatus) params.set("status", serverStatus);
    window.location.href = `/api/admin/jobs/export.csv?${params.toString()}`;
  }

  const toPounds = (cents: number | undefined) => (cents || 0) / 100;

  /** Columns shared by both export buttons, so the two files always match. */
  const exportColumns = [
    { header: "Job ID", value: (j: NormalizedJob) => j.jobId },
    { header: "Booked start", value: (j: NormalizedJob) => formatLondonDateTime(j.bookedStart) },
    { header: "Driver", value: (j: NormalizedJob) => resolveDriver(j.driverName, j.driverInitials).name },
    { header: "Customer", value: (j: NormalizedJob) => j.customerName },
    { header: "Pickup", value: (j: NormalizedJob) => j.pickup },
    { header: "Drop-off", value: (j: NormalizedJob) => j.dropoff },
    { header: "Status", value: (j: NormalizedJob) => j.status },
    { header: "Delay (min)", value: (j: NormalizedJob) => j.delayMinutes ?? "" },
    { header: "Payment method", value: (j: NormalizedJob) => j.paymentMethod },
    { header: "Total Charges (GBP)", value: (j: NormalizedJob) => toPounds(j.totalCharges).toFixed(2) },
    { header: "Amount Charged (GBP)", value: (j: NormalizedJob) => toPounds(j.amountCharged).toFixed(2) }
  ];

  function exportRows(rows: NormalizedJob[], suffix: string) {
    if (rows.length === 0) return;
    downloadCsv(`tmv-jobs-${suffix}-${stampForFilename()}.csv`, toCsv(rows, exportColumns));
  }

  const toggleAll = () => {
    if (selectedRows.size === sortedItems.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(sortedItems.map(j => j.jobId)));
    }
  };

  const toggleRow = (id: string) => {
    const next = new Set(selectedRows);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedRows(next);
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortConfig?.key !== column) return <ChevronDown className="inline w-3 h-3 opacity-0 group-hover:opacity-100 transition ml-1" />;
    return sortConfig.direction === "asc" 
      ? <ChevronUp className="inline w-3 h-3 text-admin-brand ml-1" />
      : <ChevronDown className="inline w-3 h-3 text-admin-brand ml-1" />;
  };

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto pb-12 relative">
      
      {/* BULK ACTION BAR (Floating) */}
      {selectedRows.size > 0 && (
        <div className="fixed bottom-4 sm:bottom-6 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-50 animate-in slide-in-from-bottom-5 flex justify-center">
          <div className="bg-admin-ink text-white rounded-full shadow-2xl px-4 sm:px-5 py-3 flex items-center gap-3 sm:gap-6 max-w-full overflow-x-auto">
            <span className="text-[13px] font-bold whitespace-nowrap shrink-0">
              {selectedRows.size} job{selectedRows.size > 1 ? 's' : ''} selected
            </span>
            <div className="h-4 w-px bg-white/20 shrink-0" />
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setReassignOpen(true)}
                className="shrink-0 whitespace-nowrap px-2.5 sm:px-3 py-1.5 rounded-full text-[12px] font-semibold hover:bg-white/10 transition flex items-center gap-1.5"
              >
                <UserPlus className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Bulk Reassign</span>
              </button>
              <button
                onClick={() => exportRows(sortedItems.filter(j => selectedRows.has(j.jobId)), "selection")}
                className="shrink-0 whitespace-nowrap px-2.5 sm:px-3 py-1.5 rounded-full text-[12px] font-semibold hover:bg-white/10 transition flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Export Selection</span>
              </button>
              <button
                onClick={() => setDeleteJobIds(Array.from(selectedRows))}
                title="Deleting a job also cancels its linked Calendar event -- this currently fails with a permission error until Calendar write access is enabled."
                className="shrink-0 whitespace-nowrap px-2.5 sm:px-3 py-1.5 rounded-full text-[12px] font-semibold text-red-300 hover:bg-white/10 hover:text-red-200 transition flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Delete</span>
              </button>
              <button
                onClick={() => setSelectedRows(new Set())}
                className="shrink-0 px-2.5 py-1.5 rounded-full text-[12px] font-semibold hover:bg-white/10 transition"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HEADER SECTION */}
      <div className="flex items-center justify-between px-2">
        <h2 className="text-title text-fg">Jobs Archive</h2>
      </div>

      {/* CONSOLIDATED TOOLBAR CARD */}
      <div className="p-2 bg-white rounded-module shadow-sm border border-transparent flex flex-wrap items-center gap-3">

        <div className="flex items-center p-1 bg-admin-surface rounded-card border border-admin-line/50 shrink-0">
          <button
            onClick={() => setViewMode("table")}
            className={`p-1.5 rounded-control transition ${viewMode === 'table' ? 'bg-white shadow-sm text-admin-ink' : 'text-admin-muted hover:text-admin-ink'}`}
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("cards")}
            className={`p-1.5 rounded-control transition ${viewMode === 'cards' ? 'bg-white shadow-sm text-admin-ink' : 'text-admin-muted hover:text-admin-ink'}`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>

        <div className="relative w-full sm:w-64 order-last sm:order-none">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-admin-muted" />
          <input
            type="text"
            placeholder="Search ID, customer, route..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 h-10 rounded-card bg-admin-surface border border-admin-line/50 text-[13px] text-admin-ink focus:border-admin-brand focus:ring-1 focus:ring-admin-brand outline-none transition"
          />
        </div>

        <div className="flex items-center bg-admin-surface p-1 rounded-card border border-admin-line/50 shrink-0">
          {["All", "In Progress"].map(status => (
            <button
              key={status}
              onClick={() => { setStatusFilter(status); setPage(1); }}
              className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-control text-[13px] font-medium transition ${statusFilter === status ? 'bg-white text-admin-ink shadow-sm' : 'text-admin-muted hover:text-admin-ink'}`}
            >
              {status}
            </button>
          ))}
        </div>

        <div className="hidden sm:block w-px h-6 bg-admin-line mx-1 shrink-0" />

        <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); setPage(1); }} />

        <span className="shrink-0 text-label font-medium text-fg-muted px-2 whitespace-nowrap sm:min-w-[120px] sm:text-right">
          {isLoading || isFetching ? "Updating..." : `${total} moves`}
        </span>

        <button
          onClick={() => refetch()}
          className="shrink-0 w-10 h-10 rounded-card flex items-center justify-center bg-admin-surface border border-admin-line/50 hover:bg-admin-line/40 text-admin-muted hover:text-admin-ink transition"
          title="Refresh Data"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
        <button
          onClick={exportFilteredCsv}
          disabled={total === 0}
          className="shrink-0 w-10 h-10 rounded-card flex items-center justify-center bg-admin-surface border border-admin-line/50 hover:bg-admin-line/40 text-admin-muted hover:text-admin-ink transition disabled:opacity-40"
          title={`Export ${total} rows as CSV`}
          aria-label="Export filtered jobs as CSV"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>

      {isError && <ApiErrorState message={(error as Error)?.message} onRetry={() => refetch()} />}

      {/* TABLE CARD */}
      {!isError && viewMode === "table" && (
        <div className="bg-white rounded-module shadow-sm overflow-hidden border border-admin-line">
          <div className="overflow-x-auto relative min-h-[400px]">
            <table className="w-full text-left text-[14px] border-collapse relative">
              <thead className="bg-white sticky top-0 z-10 shadow-[0_1px_0_rgba(0,0,0,0.05)]">
                <tr className="border-b border-admin-line">
                  <th className="py-4 px-4 w-10 text-center">
                    <input 
                      type="checkbox" 
                      onChange={toggleAll}
                      checked={sortedItems.length > 0 && selectedRows.size === sortedItems.length}
                      className="rounded text-admin-brand cursor-pointer" 
                    />
                  </th>
                  <th className="py-4 px-2 w-10 text-center font-mono text-eyebrow text-fg-subtle tracking-[0.03em]">#</th>
                  <th className="py-4 px-4 font-semibold text-eyebrow text-fg-subtle tracking-[0.03em] uppercase tracking-[0.03em]">
                    Job ID & Driver
                  </th>
                  <th 
                    className="py-4 px-4 font-semibold text-eyebrow text-fg-subtle tracking-[0.03em] uppercase tracking-[0.03em] group cursor-pointer hover:text-admin-ink transition select-none"
                    onClick={() => handleSort("Timing")}
                  >
                    Timing <SortIcon column="Timing" />
                  </th>
                  <th className="py-4 px-4 font-semibold text-eyebrow text-fg-subtle tracking-[0.03em] uppercase tracking-[0.03em]">Customer</th>
                  <th className="py-4 px-4 font-semibold text-eyebrow text-fg-subtle tracking-[0.03em] uppercase tracking-[0.03em]">Pickup</th>
                  <th className="py-4 px-4 font-semibold text-eyebrow text-fg-subtle tracking-[0.03em] uppercase tracking-[0.03em]">Dropoff</th>
                  <th 
                    className="py-4 px-4 font-semibold text-eyebrow text-fg-subtle tracking-[0.03em] uppercase tracking-[0.03em] group cursor-pointer hover:text-admin-ink transition select-none"
                    onClick={() => handleSort("Status")}
                  >
                    Status <SortIcon column="Status" />
                  </th>
                  <th 
                    className="py-4 px-4 font-semibold text-eyebrow text-fg-subtle tracking-[0.03em] uppercase tracking-[0.03em] group cursor-pointer hover:text-admin-ink transition select-none"
                    onClick={() => handleSort("Punctuality")}
                  >
                    Punctuality <SortIcon column="Punctuality" />
                  </th>
                  <th className="py-4 px-4 font-semibold text-eyebrow text-fg-subtle tracking-[0.03em] uppercase tracking-[0.03em] text-center">Photos</th>
                  <th 
                    className="py-4 px-6 font-semibold text-eyebrow text-fg-subtle tracking-[0.03em] uppercase tracking-[0.03em] text-right group cursor-pointer hover:text-admin-ink transition select-none"
                    onClick={() => handleSort("Total")}
                  >
                    Amount Charged <SortIcon column="Total" />
                  </th>
                  <th className="py-4 px-6 font-semibold text-eyebrow text-fg-subtle tracking-[0.03em] uppercase tracking-[0.03em] text-right">
                    Total Charges
                  </th>
                  <th className="py-4 px-4 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-admin-line/60">
                {isLoading ? (
                  // Skeleton Rows
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="h-[64px]">
                       <td colSpan={13} className="px-4">
                         <div className="h-4 bg-admin-line/40 rounded w-full animate-pulse"></div>
                       </td>
                    </tr>
                  ))
                ) : sortedItems.length === 0 ? (
                  // Empty State
                  <tr>
                    <td colSpan={13} className="py-16 text-center">
                      <div className="w-12 h-12 bg-admin-surface text-admin-muted rounded-full flex items-center justify-center mx-auto mb-3">
                        <Search className="w-5 h-5" />
                      </div>
                      <h3 className="text-card text-fg mb-1">No jobs match your filters</h3>
                      <p className="text-[13px] text-admin-muted mb-4">Try adjusting your search or clearing filters.</p>
                      <button
                        onClick={() => { setSearchQuery(""); setStatusFilter("All"); setFrom(undefined); setTo(undefined); setPage(1); }}
                        className="px-4 py-2 bg-admin-surface hover:bg-admin-line text-admin-ink text-[13px] font-semibold rounded-card transition"
                      >
                        Clear all filters
                      </button>
                    </td>
                  </tr>
                ) : (
                  sortedItems.map((job: NormalizedJob, index: number) => {
                    const rowNumber = (safePage - 1) * pageSize + index + 1;
                    const formattedTime = formatLondonDateTime(job.bookedStart);
                    const amountPounds = toPounds(job.amountCharged);
                    const totalPounds = toPounds(job.totalCharges);
                    const isCancelled = job.status === "CANCELLED";
                    const photoCount = job.evidenceItems?.filter(e => (e.thumbProxyUrl || e.driveUrl)).length || 0;
                    
                    const resolvedDriver = resolveDriver(job.driverName, job.driverInitials);
                    const isUnassigned = resolvedDriver.code === "UN";
                    
                    return (
                      <tr 
                        key={job.jobId}
                        onClick={() => setDrawerJob(job)}
                        className={`h-[64px] group cursor-pointer hover:bg-admin-surface transition select-none ${resolvedDriver.needsReassignment ? 'bg-amber-50/40 hover:bg-amber-50/70' : ''}`}
                      >
                        <td className="px-4 text-center">
                          <input 
                            type="checkbox" 
                            checked={selectedRows.has(job.jobId)}
                            onChange={() => toggleRow(job.jobId)}
                            onClick={e => e.stopPropagation()}
                            className="rounded text-admin-brand cursor-pointer" 
                          />
                        </td>
                        <td className="px-2 text-center font-mono text-[14px] font-bold text-admin-muted tabular-nums">{rowNumber}</td>
                        
                        <td className="px-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[11px] shrink-0 ${resolvedDriver.color}`}>
                              {resolvedDriver.code}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-admin-brand text-[14px] leading-tight truncate">
                                  {job.jobId}
                                </span>
                                {!isUnassigned && resolvedDriver.vehicleReg && (
                                  <span className="bg-admin-surface px-1 py-[1px] border border-admin-line rounded-[3px] font-mono font-bold uppercase text-[9px] text-admin-muted truncate max-w-[80px]">
                                    {formatVanReg(resolvedDriver.vehicleReg)}
                                  </span>
                                )}
                              </div>
                              <div className="text-[13px] text-admin-muted font-normal mt-2 flex flex-col items-start gap-2">
                                 <span className="truncate">{resolvedDriver.name}</span>
                                 {resolvedDriver.needsReassignment && (
                                   <div 
                                     className="flex items-center gap-1.5 text-[11px] tracking-[0.02em] font-semibold text-amber-700 bg-amber-100 px-2.5 py-1 rounded-control shrink-0 hover:bg-amber-200 transition"
                                     onClick={(e) => { e.stopPropagation(); /* Mock Inline Assign */ }}
                                   >
                                     <AlertTriangle className="w-3 h-3" /> Reassign
                                   </div>
                                 )}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 text-[13px] font-normal text-admin-muted tabular-nums whitespace-nowrap">
                          {formattedTime || <span className="text-[14px] font-normal text-[#B0B0B0] italic">Not recorded</span>}
                        </td>
                        
                        <td className="px-4 text-[14px] font-normal text-admin-ink truncate max-w-[120px]">
                          {job.customerName || <span className="text-[14px] font-normal text-[#B0B0B0] italic">Not recorded</span>}
                        </td>
                        
                        <td className="px-4 text-[14px] font-normal text-admin-ink truncate max-w-[140px]" title={job.pickup}>
                          {job.pickup || <span className="text-[14px] font-normal text-[#B0B0B0] italic">Not recorded</span>}
                        </td>
                        
                        <td className="px-4 text-[14px] font-normal text-admin-ink truncate max-w-[140px]" title={job.dropoff}>
                          {job.dropoff || <span className="text-[14px] font-normal text-[#B0B0B0] italic">Not recorded</span>}
                        </td>

                        <td className="px-4 whitespace-nowrap">
                          <JobStatusBadge status={job.status} />
                        </td>

                        <td className="px-4 whitespace-nowrap">
                          {isCancelled ? (
                            <span className="text-[14px] font-normal text-[#B0B0B0] italic">-</span>
                          ) : (
                            <DelayBandBadge band={job.delayBand} minutes={job.delayMinutes} />
                          )}
                        </td>

                        <td className="px-4 text-center">
                          <div className="flex items-center justify-center">
                            {photoCount > 0 ? (
                              <div className="flex items-center gap-1 px-2 py-0.5 bg-admin-surface border border-admin-line text-admin-ink rounded-card text-[11px] font-bold">
                                <Camera className="w-3 h-3 text-admin-brand" /> {photoCount}
                              </div>
                            ) : (
                              <span className="text-[14px] font-normal text-[#B0B0B0] italic">-</span>
                            )}
                          </div>
                        </td>

                        <td className="px-6 text-right">
                          <div className={`font-mono text-[14px] font-bold tabular-nums ${amountPounds === 0 ? "text-[#B0B0B0] italic" : "text-admin-ink"}`}>
                            {amountPounds === 0 ? "-" : `£${amountPounds.toLocaleString("en-GB", { minimumFractionDigits: 2 })}`}
                          </div>
                        </td>

                        <td className="px-6 text-right">
                          <div className={`font-mono text-[13px] font-semibold tabular-nums ${totalPounds === 0 ? "text-[#B0B0B0] italic" : "text-admin-muted"}`}>
                            {totalPounds === 0 ? "-" : `£${totalPounds.toLocaleString("en-GB", { minimumFractionDigits: 2 })}`}
                          </div>
                        </td>

                        <td className="px-4 text-center">
                          <div className="opacity-0 group-hover:opacity-100 transition text-admin-muted">
                            <ChevronRight className="w-5 h-5" />
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* PAGINATION FOOTER */}
          {sortedItems.length > 0 && (
            <div className="px-4 sm:px-6 py-4 border-t border-admin-line bg-white flex flex-wrap items-center justify-between gap-3">
               <div className="flex items-center gap-2 text-[13px] text-admin-muted">
                 Show
                 <select 
                   value={pageSize}
                   onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                   className="h-8 px-2 rounded-card border border-admin-line bg-admin-surface outline-none focus:border-admin-brand"
                 >
                   <option value={25}>25</option>
                   <option value={50}>50</option>
                   <option value={100}>100</option>
                 </select>
                 rows
               </div>
               
               <div className="flex items-center gap-4">
                 <span className="text-label font-medium text-fg-muted">
                   Page {safePage} of {totalPages}
                 </span>
                 <div className="flex items-center gap-1">
                   <button 
                     disabled={safePage <= 1}
                     onClick={() => setPage(p => Math.max(1, p - 1))}
                     className="p-1.5 rounded-card border border-admin-line bg-white text-admin-ink hover:bg-admin-surface disabled:opacity-50 transition"
                   >
                     <ChevronLeft className="w-4 h-4" />
                   </button>
                   <button 
                     disabled={safePage >= totalPages}
                     onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                     className="p-1.5 rounded-card border border-admin-line bg-white text-admin-ink hover:bg-admin-surface disabled:opacity-50 transition"
                   >
                     <ChevronRight className="w-4 h-4" />
                   </button>
                 </div>
               </div>
            </div>
          )}
        </div>
      )}

      {!isError && viewMode === "cards" && (
        <JobCardList
          jobs={sortedItems}
          isLoading={isLoading}
          selected={selectedRows}
          onToggle={toggleRow}
          onOpen={setDrawerJob}
          onReassign={setCardReassignJob}
          toPounds={toPounds}
          page={safePage}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      )}

      {drawerJob && (
        <JobDetailDrawer
          job={drawerJob}
          isOpen={!!drawerJob}
          onClose={() => setDrawerJob(null)}
          onUpdated={() => refetch()}
        />
      )}

      {reassignOpen && (
        <BulkReassignModal
          jobIds={Array.from(selectedRows)}
          onClose={() => setReassignOpen(false)}
          onDone={() => {
            setReassignOpen(false);
            setSelectedRows(new Set());
            void refetch();
          }}
        />
      )}

      {cardReassignJob && (
        <BulkReassignModal
          jobIds={[cardReassignJob.jobId]}
          onClose={() => setCardReassignJob(null)}
          onDone={() => {
            setCardReassignJob(null);
            void refetch();
          }}
        />
      )}

      {deleteJobIds && (
        <BulkDeleteModal
          jobIds={deleteJobIds}
          onClose={() => setDeleteJobIds(null)}
          onDone={() => {
            setDeleteJobIds(null);
            setSelectedRows(new Set());
            void refetch();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ card view --- */

interface JobCardListProps {
  jobs: NormalizedJob[];
  isLoading: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onOpen: (job: NormalizedJob) => void;
  onReassign: (job: NormalizedJob) => void;
  toPounds: (pence: number | undefined) => number;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

/**
 * The card view used to be a placeholder that said "Switch to table for detailed
 * layout" -- which, on a phone, meant the only option was a 12-column table behind a
 * horizontal scrollbar. This is the real thing, and it's the default below md.
 */
function JobCardList({
  jobs,
  isLoading,
  selected,
  onToggle,
  onOpen,
  onReassign,
  toPounds,
  page,
  totalPages,
  onPageChange
}: JobCardListProps) {
  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-[150px] rounded-module bg-white border border-admin-line skeleton" />
        ))}
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="text-center p-12 bg-white rounded-module border border-admin-line">
        <h3 className="text-card text-fg mb-1">No jobs match your filters</h3>
        <p className="text-[13px] text-admin-muted">Try adjusting your search or clearing the date range.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {jobs.map(job => {
          const driver = resolveDriver(job.driverName, job.driverInitials);
          const amount = toPounds(job.amountCharged);
          const total = toPounds(job.totalCharges);
          const isSelected = selected.has(job.jobId);
          return (
            <article
              key={job.jobId}
              className={`rounded-module bg-white border p-4 transition ${
                isSelected ? "border-admin-brand ring-2 ring-admin-brand/20" : "border-admin-line"
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggle(job.jobId)}
                  className="mt-1 w-4 h-4 rounded accent-admin-brand cursor-pointer shrink-0"
                  aria-label={`Select job ${job.jobId}`}
                />
                {/* Sibling of the onOpen button below, not nested inside it -- a <button>
                    inside a <button> is invalid HTML and browsers handle it unpredictably. */}
                <button
                  onClick={() => onReassign(job)}
                  title="Reassign driver"
                  aria-label={`Reassign driver for job ${job.jobId}`}
                  className="order-3 shrink-0 mt-0.5 p-1.5 rounded-full text-admin-muted hover:bg-admin-brand hover:text-white transition"
                >
                  <UserPlus className="w-4 h-4" />
                </button>
                <button onClick={() => onOpen(job)} className="order-2 flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-admin-brand text-[14px]">{job.jobId}</span>
                    <JobStatusBadge status={job.status} />
                  </div>
                  <p className="text-card text-fg mt-1.5 truncate">
                    {job.customerName || "Not recorded"}
                  </p>
                  <p className="text-[13px] text-admin-muted mt-1 leading-snug">
                    {job.pickup || "—"} <span className="text-admin-line-strong">→</span> {job.dropoff || "—"}
                  </p>
                  <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-admin-line">
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 ${driver.color}`}
                      >
                        {driver.code}
                      </span>
                      <span className="text-[13px] text-admin-muted truncate">
                        {formatLondonDateTime(job.bookedStart) || "Not scheduled"}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-0.5 font-mono tabular-nums">
                      <span className="text-[14px] font-bold text-admin-ink">
                        {amount === 0 ? "—" : `£${amount.toLocaleString("en-GB", { minimumFractionDigits: 2 })}`}
                      </span>
                      <span className="text-[11px] font-semibold text-admin-muted">
                        Total {total === 0 ? "—" : `£${total.toLocaleString("en-GB", { minimumFractionDigits: 2 })}`}
                      </span>
                    </span>
                  </div>
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="w-11 h-11 rounded-card border border-admin-line bg-white disabled:opacity-40 flex items-center justify-center"
            aria-label="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-label font-medium text-fg-muted tabular-nums">
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="w-11 h-11 rounded-card border border-admin-line bg-white disabled:opacity-40 flex items-center justify-center"
            aria-label="Next page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- bulk reassign ---- */

/**
 * Reassigns every selected job to one driver. The endpoint already existed
 * (api.ts's reassignJob, used by the single-job drawer) -- the toolbar button simply
 * had no handler wired to it.
 */
function BulkReassignModal({
  jobIds,
  onClose,
  onDone
}: {
  jobIds: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { data, isLoading: driversLoading } = useQuery({ queryKey: ["drivers_summary"], queryFn: () => fetchDrivers() });
  const [initials, setInitials] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(0);

  const drivers = (data?.drivers || []).filter(d => d.initials && d.initials !== "UN" && d.active && d.hasAccount);

  async function handleConfirm() {
    if (!initials || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Sequential rather than Promise.all: the progress counter stays truthful, and a
      // partial failure leaves a clear record of how far it got.
      for (const jobId of jobIds) {
        await reassignJob(jobId, initials);
        setDone(n => n + 1);
      }
      onDone();
    } catch (err: any) {
      setError(err?.message || "Couldn't reassign every job. Some may have been changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-admin-ink/40 backdrop-blur-sm p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-reassign-title"
        className="bg-white rounded-module shadow-2xl w-full max-w-[440px] p-6 animate-in zoom-in-95"
      >
        <h2 id="bulk-reassign-title" className="text-title text-fg">
          Reassign {jobIds.length} job{jobIds.length === 1 ? "" : "s"}
        </h2>
        <p className="text-[13px] text-admin-muted mt-1">
          {jobIds.length === 1
            ? "This job moves to the selected driver, who will be notified, and the linked Calendar event is updated."
            : "Every selected job moves to the selected driver, who will be notified for each one, and their linked Calendar events are updated."}
        </p>

        <label className="block mt-5">
          <span className="text-label font-semibold text-fg">Assign to</span>
          <div className="relative mt-1.5">
            <select
              value={initials}
              onChange={e => setInitials(e.target.value)}
              disabled={busy || driversLoading}
              className="w-full h-11 px-3 pr-9 rounded-card border border-admin-line bg-admin-surface outline-none focus:border-admin-brand disabled:opacity-70"
            >
              <option value="">{driversLoading ? "Loading drivers…" : "Choose a driver…"}</option>
              {!driversLoading && drivers.map(driver => (
                <option key={driver.initials} value={driver.initials}>
                  {driver.fullName || driver.initials} ({driver.initials})
                </option>
              ))}
            </select>
            {driversLoading && (
              <RefreshCw className="w-4 h-4 text-admin-muted animate-spin absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            )}
          </div>
        </label>

        {busy && (
          <p className="text-[13px] text-admin-muted mt-3" role="status">
            Reassigning… {done} of {jobIds.length}
          </p>
        )}
        {error && (
          <p className="text-[13px] text-admin-status-red mt-3" role="alert">
            {error}
          </p>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-1 h-11 rounded-card bg-admin-surface text-card text-fg disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!initials || busy}
            className="flex-1 h-11 rounded-card bg-admin-brand text-white text-[14px] font-semibold disabled:opacity-50"
          >
            {busy ? "Reassigning…" : "Reassign"}
          </button>
        </div>
      </div>
    </div>
  );
}
