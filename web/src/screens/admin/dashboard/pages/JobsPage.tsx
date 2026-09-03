import React, { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchDrivers, fetchJobs, reassignJob } from "../api";
import { NormalizedJob } from "../types";
import { JobDetailDrawer } from "../components/JobDetailDrawer";
import { JobStatusBadge, DelayBandBadge } from "../components/StatusBadge";
import { DateRangePicker } from "../components/DateRangePicker";
import { AddJobModal } from "../components/AddJobModal";
import { ApiErrorState } from "../components/ApiErrorState";
import { formatLondonDateTime } from "../utils/date";
import { downloadCsv, stampForFilename, toCsv } from "../utils/csv";
import { resolveDriver, formatVanReg } from "../utils/drivers";
import { Button } from "../../../../ui";
import {
  Search,
  Download,
  Plus,
  LayoutGrid,
  List,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ChevronLeft,
  Camera,
  RefreshCw,
  AlertTriangle,
  UserPlus
} from "lucide-react";

export function JobsPage() {
  // The table is 12 columns wide. On a phone it was previously the default and lived
  // behind a horizontal scrollbar, which is close to unusable -- so below the md
  // breakpoint the card view is the default instead.
  const [viewMode, setViewMode] = useState<"table" | "cards">(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches ? "cards" : "table"
  );
  const [reassignOpen, setReassignOpen] = useState(false);
  const [drawerJob, setDrawerJob] = useState<NormalizedJob | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  
  // Filtering & Pagination
  const [from, setFrom] = useState<string | undefined>();
  const [to, setTo] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All"); // All, In Progress
  
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  // How many rows to pull from the server for the chosen date range. Search, status
  // filtering and sorting all run client-side over this set, so the server has to
  // hand back the whole range rather than one page of it -- see the query below.
  const FETCH_LIMIT = 500;
  
  // Sorting
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: "asc" | "desc" } | null>({ key: "Timing", direction: "desc" });

  // Selection
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  /**
   * Pagination was broken in three compounding ways before this:
   *
   *  - `page` wasn't in the query key, so React Query served the cached first page
   *    forever and changing page never refetched;
   *  - the server's 25-row response was then sliced *again* client-side, so page 2 was
   *    always empty;
   *  - `totalPages` was computed from the current page's length rather than the
   *    server's `pagination.total`, which was fetched and discarded.
   *
   * The net effect was a Jobs Archive that could only ever show the first 25 jobs.
   *
   * Search is also sent to the server. Otherwise the dashboard only searched inside
   * the first FETCH_LIMIT rows, so an existing booking could show in the driver app
   * but stay hidden from admin search when it sat beyond that archive slice.
   */
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["jobs", from, to, debouncedSearch, FETCH_LIMIT],
    queryFn: () => fetchJobs({ page: 1, pageSize: FETCH_LIMIT, from, to, q: debouncedSearch || undefined })
  });

  const truncated = Boolean(data?.pagination?.hasMore);

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery.toLowerCase());
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Client-side filtering & sorting for the mockup experience
  const processedData = useMemo(() => {
    if (!data?.items) return [];
    
    let filtered = [...data.items];
    
    // Status Filter
    if (statusFilter === "In Progress") {
      filtered = filtered.filter(j => j.status === "IN_PROGRESS");
    }

    // Search Filter
    if (debouncedSearch) {
      filtered = filtered.filter(j => {
        const d = resolveDriver(j.driverName, j.driverInitials);
        return (
          j.jobId.toLowerCase().includes(debouncedSearch) ||
          (j.customerName || "").toLowerCase().includes(debouncedSearch) ||
          (j.customerPhone || "").toLowerCase().includes(debouncedSearch) ||
          (j.customerEmail || "").toLowerCase().includes(debouncedSearch) ||
          (j.pickup || "").toLowerCase().includes(debouncedSearch) ||
          (j.dropoff || "").toLowerCase().includes(debouncedSearch) ||
          (d.name || "").toLowerCase().includes(debouncedSearch) ||
          (j.driverInitials || "").toLowerCase().includes(debouncedSearch)
        );
      });
    }

    // Sort
    if (sortConfig) {
      filtered.sort((a, b) => {
        let valA: any = 0;
        let valB: any = 0;
        
        if (sortConfig.key === "Timing") {
          valA = new Date(a.bookedStart || 0).getTime();
          valB = new Date(b.bookedStart || 0).getTime();
        } else if (sortConfig.key === "Total") {
          valA = a.totalCharges || 0;
          valB = b.totalCharges || 0;
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
    }

    return filtered;
  }, [data?.items, debouncedSearch, statusFilter, sortConfig]);

  // Pagination slice -- over the fully filtered set, so page 2 now contains page 2.
  const totalPages = Math.max(1, Math.ceil(processedData.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedData = processedData.slice((safePage - 1) * pageSize, safePage * pageSize);

  // Filtering can shrink the result set beneath the current page; snap back rather
  // than stranding the user on an empty page with no way to tell why.
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
  };

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
    { header: "Total (GBP)", value: (j: NormalizedJob) => toPounds(j.totalCharges).toFixed(2) }
  ];

  function exportRows(rows: NormalizedJob[], suffix: string) {
    if (rows.length === 0) return;
    downloadCsv(`tmv-jobs-${suffix}-${stampForFilename()}.csv`, toCsv(rows, exportColumns));
  }

  const toggleAll = () => {
    if (selectedRows.size === paginatedData.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(paginatedData.map(j => j.jobId)));
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
                onClick={() => exportRows(processedData.filter(j => selectedRows.has(j.jobId)), "selection")}
                className="shrink-0 whitespace-nowrap px-2.5 sm:px-3 py-1.5 rounded-full text-[12px] font-semibold hover:bg-white/10 transition flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Export Selection</span>
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
        <Button onClick={() => setIsAddModalOpen(true)} iconLeft={<Plus />}>
          Add job
        </Button>
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
          {isLoading || isFetching ? "Updating..." : `${processedData.length} moves`}
        </span>

        <button
          onClick={() => refetch()}
          className="shrink-0 w-10 h-10 rounded-card flex items-center justify-center bg-admin-surface border border-admin-line/50 hover:bg-admin-line/40 text-admin-muted hover:text-admin-ink transition"
          title="Refresh Data"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
        <button
          onClick={() => exportRows(processedData, "filtered")}
          disabled={processedData.length === 0}
          className="shrink-0 w-10 h-10 rounded-card flex items-center justify-center bg-admin-surface border border-admin-line/50 hover:bg-admin-line/40 text-admin-muted hover:text-admin-ink transition disabled:opacity-40"
          title={`Export ${processedData.length} rows as CSV`}
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
                      checked={paginatedData.length > 0 && selectedRows.size === paginatedData.length}
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
                    Total <SortIcon column="Total" />
                  </th>
                  <th className="py-4 px-4 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-admin-line/60">
                {isLoading ? (
                  // Skeleton Rows
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="h-[64px]">
                       <td colSpan={12} className="px-4">
                         <div className="h-4 bg-admin-line/40 rounded w-full animate-pulse"></div>
                       </td>
                    </tr>
                  ))
                ) : paginatedData.length === 0 ? (
                  // Empty State
                  <tr>
                    <td colSpan={12} className="py-16 text-center">
                      <div className="w-12 h-12 bg-admin-surface text-admin-muted rounded-full flex items-center justify-center mx-auto mb-3">
                        <Search className="w-5 h-5" />
                      </div>
                      <h3 className="text-card text-fg mb-1">No jobs match your filters</h3>
                      <p className="text-[13px] text-admin-muted mb-4">Try adjusting your search or clearing filters.</p>
                      <button 
                        onClick={() => { setSearchQuery(""); setStatusFilter("All"); setFrom(undefined); setTo(undefined); }}
                        className="px-4 py-2 bg-admin-surface hover:bg-admin-line text-admin-ink text-[13px] font-semibold rounded-card transition"
                      >
                        Clear all filters
                      </button>
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((job: NormalizedJob, index: number) => {
                    const rowNumber = (safePage - 1) * pageSize + index + 1;
                    const formattedTime = formatLondonDateTime(job.bookedStart);
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
                          <div className={`font-mono text-[14px] font-bold tabular-nums ${totalPounds === 0 ? "text-[#B0B0B0] italic" : "text-admin-ink"}`}>
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
          {paginatedData.length > 0 && (
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
          jobs={paginatedData}
          isLoading={isLoading}
          selected={selectedRows}
          onToggle={toggleRow}
          onOpen={setDrawerJob}
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

      <AddJobModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />

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
                <button onClick={() => onOpen(job)} className="flex-1 min-w-0 text-left">
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
                    <span className="font-mono text-[14px] font-bold tabular-nums shrink-0">
                      {total === 0 ? "—" : `£${total.toLocaleString("en-GB", { minimumFractionDigits: 2 })}`}
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
  const { data } = useQuery({ queryKey: ["drivers_summary"], queryFn: () => fetchDrivers() });
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
          Every selected job moves to this driver. The drivers involved are not notified automatically.
        </p>

        <label className="block mt-5">
          <span className="text-label font-semibold text-fg">Assign to</span>
          <select
            value={initials}
            onChange={e => setInitials(e.target.value)}
            disabled={busy}
            className="mt-1.5 w-full h-11 px-3 rounded-card border border-admin-line bg-admin-surface outline-none focus:border-admin-brand"
          >
            <option value="">Choose a driver…</option>
            {drivers.map(driver => (
              <option key={driver.initials} value={driver.initials}>
                {driver.fullName || driver.initials} ({driver.initials})
              </option>
            ))}
          </select>
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
