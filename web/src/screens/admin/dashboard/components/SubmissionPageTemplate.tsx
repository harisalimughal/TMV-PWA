import { AdminFilterBar } from "./AdminFilterBar";
import React from "react";
import {
  Search,
  Download, RefreshCw, ChevronLeft, ChevronRight
} from "lucide-react";
import { DateRangePicker } from "./DateRangePicker";

interface Props {
  title: string;
  viewSwitcher?: React.ReactNode;
  icon: React.ElementType;
  status?: string;
  statusColor?: "green" | "amber" | "gray";

  // Toolbar
  search: string;
  onSearchChange: (s: string) => void;
  searchPlaceholder?: string;
  /** Same roster + filter pattern as Finished Jobs' driver filter. Optional so pages
   *  that haven't wired it up yet don't need a stub. */
  driverFilter?: string;
  onDriverFilterChange?: (initials: string) => void;
  driverOptions?: Array<{ initials: string; fullName?: string }>;
  driverOptionsLoading?: boolean;
  from?: string;
  to?: string;
  onDateChange: (f?: string, t?: string) => void;

  // Data State
  itemCount: number;
  isFetching: boolean;
  onRefresh: () => void;
  
  // Pagination
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (p: number) => void;
  
  // Table Content
  tableHeader: React.ReactNode;
  tableBody: React.ReactNode;

  /** Supplied by pages that can export. Omit it and the CSV button isn't rendered at
   *  all -- better than a button that looks available and does nothing. */
  onExportCsv?: () => void;
}

export function SubmissionPageTemplate({
  title, viewSwitcher, icon: Icon, status = "Published", statusColor = "green",
  search, onSearchChange, searchPlaceholder = "Search...",
  driverFilter, onDriverFilterChange, driverOptions, driverOptionsLoading = false,
  from, to, onDateChange,
  itemCount, isFetching, onRefresh,
  page, pageSize, totalItems, onPageChange,
  tableHeader, tableBody, onExportCsv
}: Props) {
  
  const totalPages = Math.ceil(totalItems / pageSize);
  
  const statusColors = {
    green: "bg-admin-status-green-bg text-admin-status-green",
    amber: "bg-amber-100 text-amber-700",
    gray: "bg-admin-surface text-admin-muted"
  };

  return (
    <div className="max-w-[1440px] mx-auto space-y-6 pb-12">
      
      {/* The Preview / Edit Form / Settings / overflow buttons and a hardcoded "0/4"
          progress pill used to live in a standalone header row here. None of them had
          a handler and the pill never moved off 0/4, so the whole cluster was
          decoration that read as functionality -- removed rather than stubbed. Export
          CSV (the one real action) now sits with Row 2's refresh button below instead
          of alone up top, where it left an empty-looking strip above the filters. */}

      <AdminFilterBar dates={<DateRangePicker from={from} to={to} onChange={(f, t) => onDateChange(f, t)} />} count={<>{itemCount} record{itemCount !== 1 ? "s" : ""}</>}>
{onDriverFilterChange && (
              <select
                aria-label="Filter by driver"
                value={driverFilter || ""}
                onChange={e => onDriverFilterChange(e.target.value)}
                disabled={driverOptionsLoading}
                className="shrink-0 h-10 px-3 rounded-card border border-admin-line/50 bg-admin-surface text-[13px] font-medium text-admin-ink outline-none focus:border-admin-brand"
              >
                <option value="">{driverOptionsLoading ? "Loading drivers..." : "All drivers"}</option>
                {!driverOptionsLoading && (driverOptions || []).map(d => (
                  <option key={d.initials} value={d.initials}>{d.fullName || d.initials}</option>
                ))}
              </select>
            )}

            <div className="relative w-full sm:w-64 order-last sm:order-none">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-admin-muted" />
              <input
                aria-label="Search submissions"
                type="text"
                placeholder={searchPlaceholder}
                value={search}
                onChange={e => onSearchChange(e.target.value)}
                className="w-full pl-9 pr-4 h-10 rounded-card bg-admin-surface border border-admin-line/50 text-[13px] text-admin-ink focus:border-admin-brand focus:ring-1 focus:ring-admin-brand outline-none transition"
              />
            </div>


          {viewSwitcher}
          <div className="hidden sm:block w-px h-6 bg-admin-line mx-1 shrink-0" />
          <button onClick={onRefresh} className="shrink-0 w-10 h-10 rounded-card flex items-center justify-center bg-admin-surface border border-admin-line/50 hover:bg-admin-line/40 text-admin-muted hover:text-admin-ink transition" title="Refresh Data" aria-label="Refresh Data">
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin text-admin-brand" : ""}`} />
          </button>
          {onExportCsv && <button onClick={onExportCsv} className="shrink-0 w-10 h-10 rounded-card flex items-center justify-center bg-admin-surface border border-admin-line/50 hover:bg-admin-line/40 text-admin-muted hover:text-admin-ink transition" title="Export CSV" aria-label="Export CSV"><Download className="w-4 h-4" /></button>}
        </AdminFilterBar>

      <div className="bg-white rounded-module border border-admin-line overflow-hidden flex flex-col">
        {/* STANDARD TABLE */}
        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-left text-[14px] border-collapse">
            <thead className="bg-white border-b border-admin-line">
              <tr>
                <th className="py-4 px-4 w-12 text-center">
                  <input type="checkbox" className="rounded text-admin-brand" />
                </th>
                <th className="py-4 px-2 w-12 text-center font-semibold text-[12px] text-admin-muted uppercase tracking-[0.03em]">#</th>
                {tableHeader}
              </tr>
            </thead>
            <tbody className="divide-y divide-admin-line">
              {tableBody}
            </tbody>
          </table>
        </div>

        {/* STANDARD PAGINATION */}
        {totalItems > 0 && (
          <div className="px-6 py-4 border-t border-admin-line bg-[#FAFAFA] flex items-center justify-between">
            <span className="text-label font-medium text-fg-muted">
              Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, totalItems)} of {totalItems} records
            </span>
            <div className="flex items-center gap-2">
              <button 
                disabled={page === 1}
                onClick={() => onPageChange(Math.max(1, page - 1))}
                className="px-4 h-8 rounded-control border border-admin-line bg-white hover:bg-admin-surface disabled:opacity-50 text-[12px] font-medium text-admin-ink transition"
              >
                Prev
              </button>
              <button 
                disabled={page >= totalPages}
                onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                className="px-4 h-8 rounded-control border border-admin-line bg-white hover:bg-admin-surface disabled:opacity-50 text-[12px] font-medium text-admin-ink transition"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
