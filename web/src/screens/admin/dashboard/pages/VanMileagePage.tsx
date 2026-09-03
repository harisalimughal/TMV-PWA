import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Camera, Download, Gauge, RefreshCw, Search, Truck, X } from "lucide-react";
import { DateRangePicker } from "../components/DateRangePicker";
import { ApiErrorState } from "../components/ApiErrorState";
import { fetchVanMileage } from "../api";
import { VanMileageItem } from "../types";
import { formatLondonDateTime } from "../utils/date";

export function VanMileagePage() {
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState<string | undefined>();
  const [to, setTo] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<VanMileageItem | null>(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["van-mileage", page, from, to, search],
    queryFn: () => fetchVanMileage({ page, from, to, q: search }),
    retry: 1
  });

  const items = data?.items ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-3 px-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 shrink-0 rounded-card bg-admin-brand text-white flex items-center justify-center shadow-sm">
            <Truck className="w-5 h-5" />
          </div>
          <h1 className="text-title text-fg truncate">Van</h1>
        </div>
        <button
          onClick={() => {
            window.location.href = "/api/admin/van/mileage/export.csv";
          }}
          className="h-9 px-3 rounded-card border border-admin-line bg-white text-[13px] font-medium text-admin-ink hover:bg-admin-surface transition flex items-center gap-2"
        >
          <Download className="w-4 h-4 text-admin-muted" /> Export CSV
        </button>
      </div>

      <div className="p-2 bg-white rounded-module shadow-sm border border-admin-line flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-admin-muted absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search driver, initials, van or mileage..."
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full h-9 pl-9 pr-3 rounded-full border border-admin-line bg-admin-surface text-[13px] outline-none focus:border-admin-brand focus:ring-1 focus:ring-admin-brand focus:bg-white transition"
          />
        </div>
        <div className="w-[1px] h-6 bg-admin-line hidden sm:block" />
        <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); setPage(1); }} />
        <span className="text-[13px] text-admin-muted font-medium ml-auto">
          {isLoading ? "..." : `${pagination?.total ?? 0} record${(pagination?.total ?? 0) === 1 ? "" : "s"}`}
        </span>
        <button
          onClick={() => refetch()}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-admin-surface text-admin-muted hover:text-admin-ink transition"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin text-admin-brand" : ""}`} />
        </button>
      </div>

      {isError && <ApiErrorState message={(error as Error)?.message} onRetry={() => void refetch()} />}

      {!isError && (
        <div className="bg-white rounded-module shadow-sm border border-admin-line overflow-hidden">
          <div className="overflow-x-auto min-h-[420px]">
            <table className="w-full text-left text-[14px] border-collapse">
              <thead className="bg-white border-b border-admin-line">
                <tr>
                  <th className="py-4 px-4 w-12 text-center"><input type="checkbox" className="rounded text-admin-brand" /></th>
                  <th className="py-4 px-2 w-12 text-center font-semibold text-[12px] text-admin-muted uppercase tracking-[0.03em]">#</th>
                  <th className="py-4 px-4 font-semibold text-[12px] text-admin-muted uppercase tracking-[0.03em]">Submitted</th>
                  <th className="py-4 px-4 font-semibold text-[12px] text-admin-muted uppercase tracking-[0.03em]">Driver</th>
                  <th className="py-4 px-4 font-semibold text-[12px] text-admin-muted uppercase tracking-[0.03em]">Van</th>
                  <th className="py-4 px-4 font-semibold text-[12px] text-admin-muted uppercase tracking-[0.03em]">Mileage</th>
                  <th className="py-4 px-4 font-semibold text-[12px] text-admin-muted uppercase tracking-[0.03em]">Photo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-admin-line">
                {isLoading ? (
                  <tr><td colSpan={7} className="py-16 text-center text-admin-muted">Loading van records...</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={7} className="py-16 text-center text-admin-muted">No van mileage records found.</td></tr>
                ) : items.map((item, index) => (
                  <tr key={item.id} onClick={() => setSelected(item)} className="h-[64px] group cursor-pointer hover:bg-[#F9FAFB] transition">
                    <td className="px-4 text-center"><input type="checkbox" className="rounded text-admin-brand" onClick={e => e.stopPropagation()} /></td>
                    <td className="px-2 text-center text-[13px] text-admin-muted tabular-nums">{(page - 1) * 25 + index + 1}</td>
                    <td className="px-4 text-[13px] text-admin-ink font-medium">{formatLondonDateTime(item.submittedAt)}</td>
                    <td className="px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-admin-brand-soft text-admin-brand border border-admin-brand/20 flex items-center justify-center font-bold text-[11px]">
                          {item.driverInitials || "UN"}
                        </div>
                        <div>
                          <div className="text-[13px] font-semibold text-admin-ink">{item.driverName || item.driverEmail}</div>
                          <div className="text-[11px] text-admin-muted">{item.driverEmail}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 font-mono text-[13px] text-admin-ink">{item.vanRegistration || "-"}</td>
                    <td className="px-4">
                      <span className="inline-flex items-center gap-1.5 rounded-control bg-admin-surface border border-admin-line px-2.5 py-1 text-[12px] font-semibold text-admin-ink">
                        <Gauge className="w-3.5 h-3.5 text-admin-muted" />
                        {item.mileage === undefined ? "-" : item.mileage.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4">
                      {item.thumbUrl ? (
                        <img src={item.thumbUrl} alt="Mileage" className="w-12 h-12 rounded-card object-cover border border-admin-line bg-admin-surface" />
                      ) : (
                        <Camera className="w-4 h-4 text-admin-muted opacity-40" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination && pagination.total > 0 && (
            <div className="px-4 sm:px-6 py-4 border-t border-admin-line bg-white flex flex-wrap items-center justify-between gap-3">
              <span className="text-[13px] text-admin-muted">
                Showing {(page - 1) * pagination.pageSize + 1}-{Math.min(page * pagination.pageSize, pagination.total)} of {pagination.total} records
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 rounded-control border border-admin-line bg-white text-[13px] font-medium text-admin-ink hover:bg-admin-surface disabled:opacity-50 transition">Prev</button>
                <div className="text-label font-medium text-fg-muted mx-2">{page} / {pagination.totalPages || 1}</div>
                <button disabled={page >= (pagination.totalPages || 1)} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 rounded-control border border-admin-line bg-white text-[13px] font-medium text-admin-ink hover:bg-admin-surface disabled:opacity-50 transition">Next</button>
              </div>
            </div>
          )}
        </div>
      )}

      {selected && <VanMileageModal item={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function VanMileageModal({ item, onClose }: { item: VanMileageItem; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-admin-ink/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 cursor-pointer" onClick={onClose} />
      <div className="relative z-10 w-full max-w-4xl max-h-[94vh] overflow-hidden rounded-module border border-white/10 bg-[#F5F5F5] shadow-2xl animate-in zoom-in-95 fade-in duration-200 flex flex-col">
        <div className="px-6 py-5 bg-white border-b border-admin-line flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-admin-brand-soft text-admin-brand border border-admin-brand/20 flex items-center justify-center font-bold text-[13px]">
              {item.driverInitials || "UN"}
            </div>
            <div className="min-w-0">
              <h2 className="text-card text-fg truncate">{item.driverName || item.driverEmail}</h2>
              <p className="text-[12px] text-admin-muted">{formatLondonDateTime(item.submittedAt)}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-admin-surface text-admin-muted hover:text-admin-ink transition">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Detail label="Driver email" value={item.driverEmail} />
            <Detail label="Van registration" value={item.vanRegistration || "-"} />
            <Detail label="Mileage" value={item.mileage === undefined ? "-" : item.mileage.toLocaleString()} />
          </div>
          <div className="bg-white rounded-module border border-admin-line p-4">
            <div className="text-[12px] font-bold text-admin-muted uppercase tracking-wider mb-3">Mileage photo</div>
            <a href={item.photoUrl} target="_blank" rel="noreferrer" className="block">
              <img src={item.photoUrl} alt="Van mileage" className="w-full max-h-[65vh] object-contain rounded-card bg-admin-surface border border-admin-line" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-module border border-admin-line p-4">
      <div className="text-[10px] font-bold text-admin-muted uppercase tracking-wider">{label}</div>
      <div className="mt-1 text-[14px] font-semibold text-admin-ink break-words">{value}</div>
    </div>
  );
}
