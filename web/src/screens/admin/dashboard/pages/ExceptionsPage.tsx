import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  ExternalLink,
  RefreshCw,
  FileText,
  ShieldAlert,
  CheckCircle2,
  Filter,
  X,
  Eye,
  ArrowRight
} from "lucide-react";
import { fetchExceptions } from "../api";
import { ExceptionItem } from "../types";
import { DateRangePicker } from "../components/DateRangePicker";
import { formatLondonDateTime } from "../utils/date";

interface Props {
  onOpenJob?: (jobId: string) => void;
}

export function ExceptionsPage({ onOpenJob }: Props) {
  const [selectedSeverity, setSelectedSeverity] = useState<string>("ALL");
  const [selectedType, setSelectedType] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState<string | undefined>();
  const [to, setTo] = useState<string | undefined>();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["exceptions_page", selectedType, from, to],
    queryFn: () => fetchExceptions(selectedType, from, to)
  });

  if (isLoading) {
    return (
      <div className="py-20 text-center">
        <div className="w-8 h-8 border-2 border-admin-brand border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <span className="text-[13px] font-medium text-admin-muted">Auditing operational exception logs...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center text-admin-status-red bg-white rounded-xl border border-admin-line shadow-sm hover:shadow-md transition">
        <AlertCircle className="w-6 h-6 mx-auto mb-2 text-admin-status-red" />
        <h3 className="text-[12px] font-semibold text-admin-ink">Failed to load exceptions</h3>
        <button
          onClick={() => refetch()}
          className="mt-3 px-3 py-1.5 rounded-lg bg-admin-brand text-white text-[13px] font-medium hover:bg-admin-brand-dark transition"
        >
          Retry
        </button>
      </div>
    );
  }

  // Calculate severity counts
  const criticalCount = data.items.filter(i => i.severity === "CRITICAL").length;
  const warningCount = data.items.filter(i => i.severity === "WARNING").length;
  const infoCount = data.items.filter(i => i.severity === "INFO" || !i.severity).length;

  const filteredItems = data.items.filter(item => {
    if (selectedSeverity !== "ALL" && item.severity !== selectedSeverity) return false;
    if (search) {
      const q = search.toLowerCase();
      const matchJob = item.jobId?.toLowerCase().includes(q);
      const matchCust = item.customerName?.toLowerCase().includes(q);
      const matchDriver = item.driverName?.toLowerCase().includes(q);
      const matchDetail = item.detail?.toLowerCase().includes(q);
      if (!matchJob && !matchCust && !matchDriver && !matchDetail) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6 max-w-full">
      {/* 1. SEVERITY SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Critical Card */}
        <div
          onClick={() => setSelectedSeverity(selectedSeverity === "CRITICAL" ? "ALL" : "CRITICAL")}
          className={`p-4 rounded-xl border transition cursor-pointer shadow-sm hover:shadow-md flex items-center justify-between ${
            selectedSeverity === "CRITICAL"
              ? "bg-admin-status-red-bg border-admin-status-red/40 ring-2 ring-admin-status-red/20"
              : "bg-white border-admin-line hover:border-admin-status-red/30"
          }`}
        >
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-admin-status-red text-[13px] font-bold uppercase tracking-wider">
              <AlertCircle className="w-4 h-4" />
              <span>Critical Exceptions</span>
            </div>
            <div className="text-2xl font-bold font-mono text-admin-ink">{criticalCount}</div>
            <span className="text-[11px] text-admin-muted block">Immediate dispatcher intervention</span>
          </div>
          <span className="px-2 py-1 rounded-full bg-admin-status-red text-white text-[13px] font-bold font-mono">
            P1
          </span>
        </div>

        {/* Warning Card */}
        <div
          onClick={() => setSelectedSeverity(selectedSeverity === "WARNING" ? "ALL" : "WARNING")}
          className={`p-4 rounded-xl border transition cursor-pointer shadow-sm hover:shadow-md flex items-center justify-between ${
            selectedSeverity === "WARNING"
              ? "bg-admin-status-amber-bg border-admin-status-amber/40 ring-2 ring-admin-status-amber/20"
              : "bg-white border-admin-line hover:border-admin-status-amber/30"
          }`}
        >
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-admin-status-amber text-[13px] font-bold uppercase tracking-wider">
              <AlertTriangle className="w-4 h-4" />
              <span>Needs Attention</span>
            </div>
            <div className="text-2xl font-bold font-mono text-admin-ink">{warningCount}</div>
            <span className="text-[11px] text-admin-muted block">Delays, missing photos, overtime</span>
          </div>
          <span className="px-2 py-1 rounded-full bg-admin-status-amber text-white text-[13px] font-bold font-mono">
            P2
          </span>
        </div>

        {/* Informational Card */}
        <div
          onClick={() => setSelectedSeverity(selectedSeverity === "INFO" ? "ALL" : "INFO")}
          className={`p-4 rounded-xl border transition cursor-pointer shadow-sm hover:shadow-md flex items-center justify-between ${
            selectedSeverity === "INFO"
              ? "bg-admin-brand-soft border-admin-brand/40 ring-2 ring-admin-brand/20"
              : "bg-white border-admin-line hover:border-admin-brand/30"
          }`}
        >
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-admin-brand text-[13px] font-bold uppercase tracking-wider">
              <Info className="w-4 h-4" />
              <span>Informational Alerts</span>
            </div>
            <div className="text-2xl font-bold font-mono text-admin-ink">{infoCount}</div>
            <span className="text-[11px] text-admin-muted block">Schedule changes & sign-offs</span>
          </div>
          <span className="px-2 py-1 rounded-full bg-admin-brand text-white text-[13px] font-bold font-mono">
            P3
          </span>
        </div>
      </div>

      {/* 2. FILTER TOOLBAR */}
      <div className="bg-white p-4 rounded-lg border border-admin-line flex flex-wrap items-center justify-between gap-3 shadow-sm hover:shadow-md transition">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative w-64">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search exceptions..."
              className="w-full h-8 pl-3 pr-7 bg-admin-surface border border-admin-line rounded-lg text-[13px] text-admin-ink placeholder:text-admin-muted focus:bg-white focus:border-admin-brand transition"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-2 text-admin-muted hover:text-admin-ink">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Category Pills */}
          <div className="flex flex-wrap items-center gap-1 p-0.5 bg-admin-surface rounded-lg border border-admin-line text-[13px]">
            <button
              onClick={() => setSelectedType("ALL")}
              className={`px-2.5 py-1 rounded-md text-[13px] font-medium transition ${
                selectedType === "ALL" ? "bg-white text-admin-ink shadow-2xs font-semibold" : "text-admin-muted hover:text-admin-ink"
              }`}
            >
              All Categories ({data.unfilteredTotal})
            </button>
            {data.types.slice(0, 5).map(t => (
              <button
                key={t.type}
                onClick={() => setSelectedType(t.type)}
                className={`px-2.5 py-1 rounded-md text-[13px] font-medium font-mono transition ${
                  selectedType === t.type ? "bg-white text-admin-brand shadow-2xs font-semibold" : "text-admin-muted hover:text-admin-ink"
                }`}
              >
                {t.type} ({t.count})
              </button>
            ))}
          </div>

          <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        </div>

        <span className="text-[13px] text-admin-muted font-mono">
          {filteredItems.length} active exceptions shown
        </span>
      </div>

      {/* 3. EXCEPTIONS DATA TABLE */}
      <div className="bg-white rounded-xl border border-admin-line shadow-sm hover:shadow-md transition overflow-hidden">
        <div className="overflow-x-auto max-h-[calc(100vh-280px)]">
          <table className="w-full text-left text-[13px] border-collapse">
            <thead className="bg-admin-surface/80 backdrop-blur-xs border-b border-admin-line text-admin-muted text-[12px] font-semibold sticky top-0 z-20">
              <tr className="h-10">
                <th className="py-2 px-3 w-8 text-center ">
                  <input type="checkbox" className="rounded text-admin-brand" />
                </th>
                <th className="py-2 px-3 w-28 font-semibold ">Severity</th>
                <th className="py-2 px-3 w-56 font-semibold  font-mono">Category</th>
                <th className="py-2 px-3 w-36 font-semibold  font-mono">Job ID</th>
                <th className="py-2 px-3 w-48 font-semibold ">Customer / Driver</th>
                <th className="py-2 px-3 min-w-[240px] font-semibold ">Operational Detail</th>
                <th className="py-2 px-3 w-40 font-semibold  font-mono">Timestamp (London)</th>
                <th className="py-2 px-3 w-20 text-center font-semibold">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-admin-line bg-white">
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-admin-muted">
                    <div className="w-10 h-10 rounded-full bg-admin-surface flex items-center justify-center mx-auto mb-2 text-admin-status-green">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <p className="text-[12px] font-semibold text-admin-ink">Zero exceptions found</p>
                    <p className="text-[13px] text-admin-muted">All moves in this filter scope are running smoothly.</p>
                  </td>
                </tr>
              )}

              {filteredItems.map((ex: ExceptionItem) => (
                <tr key={ex.id} className="h-14 hover:bg-admin-surface/80 transition">
                  <td className="py-2.5 px-3 text-center ">
                    <input type="checkbox" className="rounded text-admin-brand" />
                  </td>

                  {/* Severity Badge */}
                  <td className="py-2.5 px-3 whitespace-nowrap ">
                    {ex.severity === "CRITICAL" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-admin-status-red-bg text-admin-status-red border border-admin-status-red/20">
                        <AlertCircle className="w-3 h-3" /> Critical
                      </span>
                    ) : ex.severity === "WARNING" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-admin-status-amber-bg text-admin-status-amber border border-admin-status-amber/20">
                        <AlertTriangle className="w-3 h-3" /> Warning
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-admin-surface text-admin-ink-2 border border-admin-line">
                        <Info className="w-3 h-3 text-admin-muted" /> Info
                      </span>
                    )}
                  </td>

                  {/* Type */}
                  <td className="py-2.5 px-3 font-mono font-medium text-admin-ink text-[13px] whitespace-nowrap ">
                    {ex.type}
                  </td>

                  {/* Job ID */}
                  <td className="py-2.5 px-3 font-mono font-bold text-admin-brand text-[13px] whitespace-nowrap ">
                    {ex.jobId}
                  </td>

                  {/* Customer / Driver */}
                  <td className="py-2.5 px-3 ">
                    <span className="text-[13px] text-admin-ink truncate block max-w-[200px]">{ex.customerName} &bull; <span className="text-admin-muted font-mono font-medium">{ex.driverName}</span></span>
                  </td>

                  {/* Detail */}
                  <td className="py-2.5 px-3 text-admin-ink-2 text-[13px]  max-w-sm truncate" title={ex.detail}>
                    {ex.detail}
                  </td>

                  {/* Timestamp */}
                  <td className="py-2.5 px-3 font-mono text-[11px] text-admin-muted whitespace-nowrap ">
                    {formatLondonDateTime(ex.timestamp)}
                  </td>

                  {/* Action */}
                  <td className="py-2.5 px-3 text-center whitespace-nowrap">
                    {ex.jobId !== "UNKNOWN" && onOpenJob ? (
                      <button
                        onClick={() => onOpenJob(ex.jobId)}
                        className="px-2.5 py-1 rounded-lg bg-admin-surface hover:bg-admin-brand hover:text-white text-admin-brand text-[12px] font-semibold transition"
                      >
                        Inspect
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
