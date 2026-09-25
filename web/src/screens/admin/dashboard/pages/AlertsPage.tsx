import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DateTime } from "luxon";
import { Search, ShieldAlert, Car, HelpCircle, LogIn, LogOut, Activity, Trash2 } from "lucide-react";
import { dismissAlerts, fetchAlerts, AlertCategory } from "../api";
import { ApiErrorState } from "../components/ApiErrorState";
import { DateRangePicker, defaultDashboardDateRange } from "../components/DateRangePicker";
import { BulkDismissModal } from "../components/BulkDismissModal";
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

/**
 * What actually happened, from GPSLive's raw `type`. The zone geofence events are
 * `zone_in` / `zone_out` (same vocab gpslive-webhook.routes.ts keys the driver push
 * off), so for a congestion row this is the difference between "drove into the
 * charge zone" and "drove back out". Unknown types are prettified as-is rather than
 * hidden.
 */
function eventVerb(type: string): { label: string; tone: string; icon: React.ReactNode } {
  const t = (type || "").toLowerCase();
  if (t === "zone_in" || t === "geofence_in")
    return { label: "Entered zone", tone: "bg-admin-status-red-bg text-admin-status-red", icon: <LogIn className="w-3 h-3" /> };
  if (t === "zone_out" || t === "geofence_out")
    return { label: "Left zone", tone: "bg-admin-status-green-bg text-admin-status-green", icon: <LogOut className="w-3 h-3" /> };
  const KNOWN: Record<string, string> = {
    moving: "Started moving",
    stopped: "Stopped",
    idle: "Idling",
    ignition_on: "Ignition on",
    engine_on: "Ignition on",
    ignition_off: "Ignition off",
    engine_off: "Ignition off",
    overspeed: "Overspeed",
    speed: "Overspeed",
    sos: "SOS",
    panic: "SOS"
  };
  const label = KNOWN[t] || (type ? type.replace(/[_-]+/g, " ").replace(/^\w/, c => c.toUpperCase()) : "Event");
  return { label, tone: "bg-admin-surface text-admin-muted", icon: <Activity className="w-3 h-3" /> };
}

/** Strip GPSLive's boilerplate alert-rule wrapper ("CHARGES - ALERTS (Congestion
 *  Zone SW)" -> "Congestion Zone SW") so the column reads as a place, not a rule. */
function cleanDescription(desc: string): string {
  if (!desc) return "";
  let s = desc.replace(/^\s*charges\s*[-–]\s*alerts\s*/i, "").trim();
  const paren = s.match(/^\((.+)\)$/);
  if (paren) s = paren[1].trim();
  return s.replace(/^\w/, c => c.toUpperCase());
}

/** GPSLive's own alert feed (their Alerts > Notifications page), proxied here so ops
 *  never need to leave this dashboard for it -- see admin/dashboard/alerts.routes.ts.
 *  Congestion-zone events get their own filter tab since that's what drives the
 *  driver-facing push + extra-charges suggestion (see the Live Fleet page's
 *  Congestion Zone Detections panel for the job-level view of the same thing). */
export function AlertsPage() {
  const [categoryFilter, setCategoryFilter] = useState<"All" | AlertCategory>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [from, setFrom] = useState<string | undefined>(() => defaultDashboardDateRange().from);
  const [to, setTo] = useState<string | undefined>(() => defaultDashboardDateRange().to);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const hasExplicitRange = Boolean(from || to);
  // The category tabs (Congestion/Tunnel) filter client-side over whatever `allRows`
  // came back -- fine when a real date range is queried, but with no range at all the
  // fetch below is GPSLive's fleet-wide "last 50 events, every type" live feed, which
  // routine telemetry (moving/stopped/ignition) floods within an hour or two (see
  // fetchAlerts' own doc comment). A congestion event from yesterday can already be
  // pushed out of that window, so "Congestion + no date picked" was showing nothing
  // even though matching events exist further back. Picking a category (not "All")
  // with no explicit range now queries real history over a wide lookback instead of
  // that tiny live feed, same as if the admin had picked a long date range themselves.
  //
  // useMemo, not a plain expression: DateTime.now() is a fresh value on every render,
  // and effectiveFrom/effectiveTo feed the query key below -- computing it inline made
  // every render (including the one the fetch itself triggers) look like a brand new
  // query, refetching forever without ever settling. Memoizing on the actual filter
  // inputs freezes "now" to the moment the admin picked this category/range instead.
  const CATEGORY_LOOKBACK_DAYS = 365;
  const { effectiveFrom, effectiveTo } = useMemo(() => {
    if (hasExplicitRange) return { effectiveFrom: from, effectiveTo: to };
    if (categoryFilter !== "All") {
      const now = DateTime.now();
      return { effectiveFrom: now.minus({ days: CATEGORY_LOOKBACK_DAYS }).toISO(), effectiveTo: now.toISO() };
    }
    return { effectiveFrom: undefined, effectiveTo: undefined };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasExplicitRange, from, to, categoryFilter]);

  // With a date range (explicit or the category default above) set, this is a real
  // query against GPSLive's own history (alerts.routes.ts's /v1/alerts/custom,
  // fleet-wide) -- not just "last 50" filtered client-side. Auto-refresh only makes
  // sense for the live "last 50" default view; a dated query shouldn't quietly change
  // underneath the admin.
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["gpslive_alerts", effectiveFrom, effectiveTo],
    queryFn: () => fetchAlerts(effectiveFrom, effectiveTo),
    refetchInterval: effectiveFrom || effectiveTo ? false : 30000
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

  const toggleAll = () => {
    if (filtered.length > 0 && filtered.every(r => selectedRows.has(r.eventId))) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(filtered.map(r => r.eventId)));
    }
  };

  const toggleRow = (eventId: string) => {
    const next = new Set(selectedRows);
    if (next.has(eventId)) next.delete(eventId);
    else next.add(eventId);
    setSelectedRows(next);
  };

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto relative">
      {/* BULK ACTION BAR (Floating) */}
      {selectedRows.size > 0 && (
        <div className="fixed bottom-4 sm:bottom-6 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-50 animate-in slide-in-from-bottom-5 flex justify-center">
          <div className="bg-admin-ink text-white rounded-full shadow-2xl px-4 sm:px-5 py-3 flex items-center gap-3 sm:gap-6 max-w-full overflow-x-auto">
            <span className="text-[13px] font-bold whitespace-nowrap shrink-0">
              {selectedRows.size} selected
            </span>
            <div className="h-4 w-px bg-white/20 shrink-0" />
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setConfirmingDelete(true)}
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

      {/* PAGE HEADER */}
      {congestionCount > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-3 px-2">
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-admin-status-red-bg text-admin-status-red">
            {congestionCount} congestion zone event{congestionCount === 1 ? "" : "s"}
          </span>
        </div>
      )}

      <p className="px-2 text-[13px] text-admin-muted">
        {hasExplicitRange
          ? "GPSLive alerts for the selected range -- every alert type on the account, not just congestion."
          : categoryFilter !== "All"
            ? `${CATEGORY_LABEL[categoryFilter]} events from the last ${CATEGORY_LOOKBACK_DAYS} days.`
            : "The fleet's last 50 alerts from GPSLive -- every alert type on the account, not just congestion."}
      </p>

      {/* TOOLBAR */}
      <div className="p-2 bg-white rounded-module shadow-sm border border-admin-line flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1 bg-admin-surface p-1 rounded-card">
          {(["All", "congestion", "tunnel"] as const).map(c => (
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

        <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />

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
                  <th className="py-3 px-4 w-10 text-center">
                    <input
                      type="checkbox"
                      onChange={toggleAll}
                      checked={filtered.length > 0 && filtered.every(r => selectedRows.has(r.eventId))}
                      className="rounded text-admin-brand cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-4 font-bold">Category</th>
                  <th className="py-3 px-4 font-bold">Event</th>
                  <th className="py-3 px-4 font-bold">Location / rule</th>
                  <th className="py-3 px-4 font-bold">Van</th>
                  <th className="py-3 px-4 font-bold">Driver</th>
                  <th className="py-3 px-4 font-bold">Detected (UK)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-admin-line">
                {filtered.map(row => (
                  <tr key={row.eventId} className="hover:bg-admin-surface/40 transition">
                    <td className="px-4 text-center">
                      <input
                        type="checkbox"
                        checked={selectedRows.has(row.eventId)}
                        onChange={() => toggleRow(row.eventId)}
                        className="rounded text-admin-brand cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1 ${CATEGORY_PILL[row.category]}`}
                      >
                        {CATEGORY_ICON[row.category]}
                        {CATEGORY_LABEL[row.category]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const v = eventVerb(row.type);
                        return (
                          <span className={`px-2 py-1 rounded-full text-[11px] font-bold inline-flex items-center gap-1 ${v.tone}`}>
                            {v.icon}
                            {v.label}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 text-[13px] text-admin-ink">{cleanDescription(row.description) || "—"}</td>
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

      {confirmingDelete && (
        <BulkDismissModal
          count={selectedRows.size}
          itemLabel="alert"
          onClose={() => setConfirmingDelete(false)}
          onConfirm={async () => {
            await dismissAlerts(Array.from(selectedRows));
            setConfirmingDelete(false);
            setSelectedRows(new Set());
            void refetch();
          }}
        />
      )}
    </div>
  );
}
