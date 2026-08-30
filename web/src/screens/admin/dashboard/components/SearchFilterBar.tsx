import React from "react";
import { Search, Filter, Download, X } from "lucide-react";

interface Props {
  search: string;
  onSearchChange: (val: string) => void;
  status: string;
  onStatusChange: (val: string) => void;
  driver: string;
  onDriverChange: (val: string) => void;
  driversList?: string[];
  payMethod: string;
  onPayMethodChange: (val: string) => void;
  evidence: string;
  onEvidenceChange: (val: string) => void;
  onExportCsv?: () => void;
  onResetFilters?: () => void;
  hasActiveFilters?: boolean;
}

export function SearchFilterBar({
  search,
  onSearchChange,
  status,
  onStatusChange,
  driver,
  onDriverChange,
  driversList = [],
  payMethod,
  onPayMethodChange,
  evidence,
  onEvidenceChange,
  onExportCsv,
  onResetFilters,
  hasActiveFilters
}: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white rounded-lg border border-admin-line mb-6 shadow-white">
      <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
        {/* Search Input */}
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-admin-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search Job ID, customer, driver, address..."
            className="w-full pl-9 pr-8 py-2 bg-admin-surface rounded-lg text-xs border border-admin-line focus:bg-white focus:border-tmv-blue focus:outline-none transition"
          />
          {search && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-admin-muted hover:text-admin-ink"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Status Filter */}
        <select
          value={status}
          onChange={e => onStatusChange(e.target.value)}
          className="px-3 py-2 bg-admin-surface rounded-lg text-xs border border-admin-line text-admin-ink-2 font-medium focus:outline-none"
        >
          <option value="ALL">All Statuses</option>
          <option value="READY">Scheduled (Ready)</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>

        {/* Driver Filter */}
        <select
          value={driver}
          onChange={e => onDriverChange(e.target.value)}
          className="px-3 py-2 bg-admin-surface rounded-lg text-xs border border-admin-line text-admin-ink-2 font-medium focus:outline-none"
        >
          <option value="ALL">All Drivers</option>
          {driversList.map(d => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        {/* Payment Method Filter */}
        <select
          value={payMethod}
          onChange={e => onPayMethodChange(e.target.value)}
          className="px-3 py-2 bg-admin-surface rounded-lg text-xs border border-admin-line text-admin-ink-2 font-medium focus:outline-none"
        >
          <option value="ALL">All Payments</option>
          <option value="Cash">Cash</option>
          <option value="Card">Card</option>
          <option value="Bank">Bank Transfer</option>
          <option value="Invoice">Invoice</option>
        </select>

        {/* Evidence Filter */}
        <select
          value={evidence}
          onChange={e => onEvidenceChange(e.target.value)}
          className="px-3 py-2 bg-admin-surface rounded-lg text-xs border border-admin-line text-admin-ink-2 font-medium focus:outline-none"
        >
          <option value="ALL">All Evidence</option>
          <option value="complete">100% Complete</option>
          <option value="missing">Missing Evidence</option>
          <option value="processing">Still Processing</option>
          <option value="failed">Failed Uploads</option>
        </select>

        {hasActiveFilters && onResetFilters && (
          <button
            onClick={onResetFilters}
            className="inline-flex items-center gap-1 text-xs text-admin-status-red font-medium hover:underline ml-1"
          >
            <X className="w-3.5 h-3.5" /> Clear Filters
          </button>
        )}
      </div>

      {onExportCsv && (
        <button
          onClick={onExportCsv}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-navy-900 text-white text-btn hover:bg-navy-800 transition shadow-sm ml-auto"
        >
          <Download className="w-4 h-4 text-tmv-cyan" />
          Export CSV
        </button>
      )}
    </div>
  );
}
