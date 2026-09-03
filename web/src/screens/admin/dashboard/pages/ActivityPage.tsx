import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, FileText, Download } from "lucide-react";
import { fetchActivity } from "../api";
import { DateRangePicker } from "../components/DateRangePicker";
import { formatLondonDateTime } from "../utils/date";
import { ApiErrorState } from "../components/ApiErrorState";

export function ActivityPage() {
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState<string | undefined>();
  const [to, setTo] = useState<string | undefined>();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["activity_log", page, from, to],
    queryFn: () => fetchActivity(page, from, to)
  });

  return (
    <div className="space-y-4 max-w-full">
      {/* Toolbar */}
      <div className="bg-white p-3 rounded border border-admin-line flex flex-wrap items-center justify-between gap-3 shadow-card">
        <div className="flex items-center gap-3">
          <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); setPage(1); }} />
          <span className="text-[13px] text-admin-muted font-mono">
            {isLoading ? "Loading..." : `${data?.pagination?.total || 0} activity events`}
          </span>
        </div>
      </div>

      {/* Activity Table */}
      <div className="bg-white rounded border border-admin-line-strong shadow-card overflow-hidden">
        <div className="overflow-x-auto max-h-[calc(100vh-230px)]">
          <table className="w-full text-left text-[13px] border-collapse">
            <thead className="bg-admin-surface border-b border-admin-line-strong text-admin-muted text-[13px] font-medium sticky top-0 z-20">
              <tr className="h-10">
                <th className="py-2 px-3 w-8 text-center ">
                  <input type="checkbox" className="rounded text-admin-brand" />
                </th>
                <th className="py-2 px-3 w-44 font-medium  font-mono">Recorded (London)</th>
                <th className="py-2 px-3 w-36 font-medium  font-mono">Job ID</th>
                <th className="py-2 px-3 w-32 font-medium ">Driver</th>
                <th className="py-2 px-3 w-48 font-medium ">Action</th>
                <th className="py-2 px-3 w-48 font-medium ">State Transition</th>
                <th className="py-2 px-3 min-w-[200px] font-medium">Detail</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-admin-line bg-white">
              {isLoading && (
                <>
                  {[...Array(6)].map((_, i) => (
                    <tr key={i} className="h-14 animate-pulse">
                      <td className="py-3 px-3 text-center "><div className="w-3.5 h-3.5 bg-admin-surface rounded mx-auto" /></td>
                      <td className="py-3 px-3 "><div className="w-24 h-4 bg-admin-surface rounded" /></td>
                      <td className="py-3 px-3 "><div className="w-20 h-4 bg-admin-surface rounded" /></td>
                      <td className="py-3 px-3 "><div className="w-16 h-4 bg-admin-surface rounded" /></td>
                      <td className="py-3 px-3 "><div className="w-24 h-5 bg-admin-surface rounded-pill" /></td>
                      <td className="py-3 px-3 "><div className="w-28 h-4 bg-admin-surface rounded" /></td>
                      <td className="py-3 px-3"><div className="w-48 h-4 bg-admin-surface rounded" /></td>
                    </tr>
                  ))}
                </>
              )}

              {error && (
                <tr>
                  <td colSpan={7} className="p-0 border-none">
                    <ApiErrorState message={(error as Error)?.message} onRetry={() => refetch()} className="border-none shadow-none" />
                  </td>
                </tr>
              )}

              {!isLoading && data?.items.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-admin-muted">
                    <div className="w-10 h-10 rounded-pill bg-admin-surface flex items-center justify-center mx-auto mb-2 text-admin-muted">
                      <FileText className="w-5 h-5 opacity-60" />
                    </div>
                    <p className="text-[12px] font-semibold text-admin-ink">No activity records</p>
                    <p className="text-[13px] text-admin-muted">No bot or field events recorded for this timeframe.</p>
                  </td>
                </tr>
              )}

              {!isLoading &&
                data?.items.map(act => (
                  <tr key={act.id} className="h-14 hover:bg-admin-surface transition">
                    <td className="py-2.5 px-3 text-center ">
                      <input type="checkbox" className="rounded text-admin-brand" />
                    </td>

                    <td className="py-2.5 px-3 font-mono text-admin-ink-2 text-[11px] whitespace-nowrap " title={act.timestamp}>
                      {formatLondonDateTime(act.timestamp)}
                    </td>

                    <td className="py-2.5 px-3 font-mono font-semibold text-admin-brand text-[13px] whitespace-nowrap ">
                      {act.jobId}
                    </td>

                    <td className="py-2.5 px-3 font-medium text-admin-ink whitespace-nowrap ">
                      {act.driver}
                    </td>

                    <td className="py-2.5 px-3 whitespace-nowrap ">
                      <span className="px-2 py-0.5 rounded-pill bg-admin-surface border border-admin-line text-admin-ink text-[11px] font-mono font-medium">
                        {act.action}
                      </span>
                    </td>

                    <td className="py-2.5 px-3 font-mono text-[11px] text-admin-muted whitespace-nowrap ">
                      {act.fromState && act.toState ? (
                        <span className="flex items-center gap-1 text-admin-ink-2">
                          {act.fromState} <ChevronRight className="w-3 h-3 text-admin-muted" /> {act.toState}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>

                    <td className="py-2.5 px-3 text-admin-ink-2 text-[13px] truncate max-w-sm" title={act.detail}>
                      {act.detail || "—"}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Sticky Pagination Bar */}
        {data?.pagination && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-admin-line bg-white text-[13px] text-admin-muted sticky bottom-0">
            <div>
              Showing <span className="font-mono text-admin-ink font-semibold">1–{data.items.length}</span> of{" "}
              <span className="font-mono text-admin-ink font-semibold">{data.pagination.total}</span> events
            </div>
            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="px-2.5 py-1 rounded border border-admin-line bg-white text-admin-ink font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-admin-surface transition"
              >
                Prev
              </button>
              <span className="px-2 font-mono text-admin-ink">
                {page} / {data.pagination.totalPages || 1}
              </span>
              <button
                disabled={!data.pagination.hasMore}
                onClick={() => setPage(page + 1)}
                className="px-2.5 py-1 rounded border border-admin-line bg-white text-admin-ink font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-admin-surface transition"
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
