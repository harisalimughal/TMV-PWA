import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DateTime } from "luxon";
import { Bell, Search, ShieldAlert, Car, HelpCircle } from "lucide-react";
import { fetchAlerts, AlertCategory } from "../api";
import { ApiErrorState } from "../components/ApiErrorState";
import { getAvatarColor } from "../utils/drivers";

/** GPSLive's dt_tracker is SQL-style ("2026-09-06 16:43:09", UTC), not ISO -- same
 *  format LiveFleetMap.tsx's relativeTime() parses for the same API's timestamps. */
function formatGpsLiveTimestamp(dtTracker: string): string {
  const dt = DateTime.fromSQL(dtTracker, { zone: "utc" }).setZone("Europe/London");
  return dt.isValid ? dt.toFormat("dd/MM/yy · HH:mm") : dtTracker;
}

const CATEGORY_LABEL: Record<AlertCategory, string> = {
  congestion: "Congestion",
  tunnel: "Tunnel",
  other: "Other"
};

const CATEGORY_PILL: Record<AlertCategory, string> = {
  congestion: "bg-admin-status-red-bg text-admin-status-red",
  tunnel: "bg-amber-100 text-amber-700",
  other: "bg-admin-surface text-admin-muted"
};

const CATEGORY_ICON: Record<AlertCategory, React.ReactNode> = {
  congestion: <ShieldAlert className="w-3.5 h-3.5" />,
  tunnel: <Car className="w-3.5 h-3.5" />,
  other: <HelpCircle className="w-3.5 h-3.5" />
};

/** GPSLive's own alert feed (their Alerts > Notifications page), proxied here so ops
 *  never need to leave this dashboard for it -- see admin/dashboard/alerts.routes.ts.
 *  Congestion-zone events get their own filter tab since that's what drives the
 *  driver-facing push + extra-charges suggestion (see the Live Fleet page's
 *  Congestion Zone Detections panel for the job-level view of the same thing). */
export function AlertsPage() {
  const [categoryFilter, setCategoryFilter] = useState<"All" | AlertCategory>("All");
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["gpslive_alerts"],
    queryFn: fetchAlerts,
    refetchInterval: 30000
  });

  const allRows = data?.rows || [];
  const congestionCount = allRows.filter(r => r.category === "congestion").length;

  const filtered = allRows.filter(row => {
    if (categoryFilter !== "All" && row.category !== categoryFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !row.description.toLowerCase().includes(q) &&
        !(row.deviceName || "").toLowerCase().includes(q) &&
        !(row.driverName || "").toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto">
      {/* PAGE HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-2">
        <div className="flex items-center gap-3">
          <Bell className="w-6 h-6 text-admin-brand" />
          <h1 className="text-title text-fg">Alerts</h1>
        </div>
        {congestionCount > 0 && (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-admin-status-red-bg text-admin-status-red">
            {congestionCount} congestion zone event{congestionCount === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <p className="px-2 -mt-4 text-[13px] text-admin-muted">
        The fleet's last 50 alerts from GPSLive -- every alert type on the account, not just congestion.
      </p>

      {/* TOOLBAR */}
      <div className="p-2 bg-white rounded-module shadow-sm border border-admin-line flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1 bg-admin-surface p-1 rounded-card">
          {(["All", "congestion", "tunnel", "other"] as const).map(c => (
            <button
              key={c}
              onClick={() => setCategoryFilter(c)}
              className={`px-3 py-1.5 rounded-control text-[12px] font-medium transition ${
                categoryFilter === c ? "bg-white text-admin-ink shadow-sm" : "text-admin-muted hover:text-admin-ink"
              }`}
            >
              {c === "All" ? "All" : CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>

        <div className="flex-1 min-w-[200px] relative">
          <Search className="w-4 h-4 text-admin-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by description, van or driver..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-card bg-admin-surface border border-admin-line text-[13px] text-admin-ink placeholder:text-admin-muted outline-none focus:border-admin-brand transition"
          />
        </div>
      </div>

      {/* TABLE CONTENT */}
      {isLoading && (
        <div className="p-12 text-center bg-white rounded-module border border-admin-line">
          <span className="text-admin-muted font-medium">Loading alerts...</span>
        </div>
      )}

      {error && <ApiErrorState message={(error as Error)?.message} onRetry={() => refetch()} />}

      {!isLoading && !error && filtered.length === 0 && (
        <div className="p-12 text-center bg-white rounded-module border border-admin-line text-admin-muted">
          No alerts match the selected filters.
        </div>
      )}

      {!isLoading && !error && filtered.length > 0 && (
        <div className="bg-white rounded-module shadow-sm border border-admin-line overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-admin-line bg-admin-surface/60 text-eyebrow text-fg-subtle">
                  <th className="py-3 px-4 font-bold">Category</th>
                  <th className="py-3 px-4 font-bold">Description</th>
                  <th className="py-3 px-4 font-bold">Van</th>
                  <th className="py-3 px-4 font-bold">Driver</th>
                  <th className="py-3 px-4 font-bold">Detected (UK)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-admin-line">
                {filtered.map(row => (
                  <tr key={row.eventId} className="hover:bg-admin-surface/40 transition">
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1 ${CATEGORY_PILL[row.category]}`}
                      >
                        {CATEGORY_ICON[row.category]}
                        {CATEGORY_LABEL[row.category]}
                      </span>
                    </td>
                    <td className="px-4 text-[13px] text-admin-ink">{row.description}</td>
                    <td className="px-4 text-[13px] text-admin-ink font-mono">{row.deviceName || "—"}</td>
                    <td className="px-4">
                      {row.driverInitials ? (
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px] ${getAvatarColor(row.driverInitials)}`}>
                            {row.driverInitials}
                          </div>
                          <span className="text-[13px] text-admin-ink">{row.driverName}</span>
                        </div>
                      ) : (
                        <span className="text-admin-muted text-[13px]">—</span>
                      )}
                    </td>
                    <td className="px-4 text-[13px] text-admin-muted tabular-nums">{formatGpsLiveTimestamp(row.detectedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
