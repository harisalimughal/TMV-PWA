import React from "react";
import {
  Search,
  Download, RefreshCw, ChevronLeft, ChevronRight
} from "lucide-react";
import { DateRangePicker } from "./DateRangePicker";
import { Button } from "../../../../ui";

interface Props {
  title: string;
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
  title, icon: Icon, status = "Published", statusColor = "green",
  search, onSearchChange, searchPlaceholder = "Search...",
  driverFilter, onDriverFilterChange, driverOptions,
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
      
      {/* STANDARD PAGE HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-y-3 gap-x-2 px-2">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-10 h-10 shrink-0 rounded-card bg-admin-brand text-white flex items-center justify-center shadow-sm">
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-title text-fg truncate">{title}</h1>
            <span className={`shrink-0 px-2 py-0.5 rounded-control text-[11px] font-bold uppercase tracking-wider ${statusColors[statusColor]}`}>
              {status}
            </span>
          </div>
        </div>

        {/* The Preview / Edit Form / Settings / overflow buttons and a hardcoded
            "0/4" progress pill used to live here. None of them had a handler and the
            pill never moved off 0/4, so the whole cluster was decoration that read as
            functionality. Removed rather than stubbed -- an honest toolbar with three
            working controls beats a rich one where half do nothing. */}
        {onExportCsv && (
          <Button
            variant="secondary"
            onClick={onExportCsv}
            iconLeft={<Download />}
            aria-label="Export CSV"
            className="shrink-0"
          >
            <span className="hidden sm:inline">Export CSV</span>
          </Button>
        )}
      </div>

      {/* MAIN CARD CONTAINER */}
      <div className="bg-white rounded-module shadow-[0_4px_24px_rgb(0,0,0,0.04)] border border-admin-line overflow-hidden flex flex-col">

        {/* STANDARD TOOLBAR */}
        <div className="p-4 flex flex-col gap-4 bg-[#FAFAFA] border-b border-admin-line">

          {/* Row 1: Core Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {onDriverFilterChange && (
              <select
                value={driverFilter || ""}
                onChange={e => onDriverFilterChange(e.target.value)}
                className="shrink-0 h-9 px-3 rounded-card bg-admin-surface border border-admin-line text-[13px] font-medium text-admin-ink outline-none focus:border-admin-brand"
              >
                <option value="">All drivers</option>
                {(driverOptions || []).map(d => (
                  <option key={d.initials} value={d.initials}>{d.fullName || d.initials}</option>
                ))}
              </select>
            )}

            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-admin-muted" />
              <input
                type="text"
                placeholder={searchPlaceholder}
                value={search}
                onChange={e => onSearchChange(e.target.value)}
                className="w-full pl-9 pr-4 h-9 rounded-full bg-admin-surface border border-admin-line text-[13px] text-admin-ink focus:border-admin-brand outline-none transition"
              />
            </div>

            <div className="hidden sm:block w-px h-6 bg-admin-line mx-1 shrink-0" />

            <DateRangePicker from={from} to={to} onChange={(f, t) => onDateChange(f, t)} />
          </div>

          {/* Row 2: Secondary Controls */}
          <div className="flex items-center gap-3">
            <span className="text-label font-medium text-fg-muted whitespace-nowrap">
              {itemCount} record{itemCount !== 1 ? 's' : ''}
            </span>
            <button
              onClick={onRefresh}
              className="w-8 h-8 shrink-0 rounded-full border border-admin-line bg-admin-surface hover:bg-white text-admin-muted hover:text-admin-ink transition flex items-center justify-center shadow-sm"
              title="Refresh Data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin text-admin-brand' : ''}`} />
            </button>
          </div>
        </div>

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
