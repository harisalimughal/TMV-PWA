import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Radio, ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle2 } from "lucide-react";
import { fetchCongestionDetections, fetchJobs, fetchLiveFleet, type CongestionDetectionRow } from "../api";
import { LiveFleetMap } from "../components/LiveFleetMap";
import { formatLondonDateTime } from "../utils/date";
import { getAvatarColor } from "../utils/drivers";

interface Props {
  onSelectSection?: (id: string) => void;
}

export function LiveFleetPage({ onSelectSection }: Props) {
  const { data: jobsData, isError: jobsErrored } = useQuery({
    queryKey: ["live_fleet_jobs"],
    queryFn: () => fetchJobs({ status: "IN_PROGRESS", limit: 50 }),
    refetchInterval: 10000
  });

  const { data: fleetData, isError: fleetErrored } = useQuery({
    queryKey: ["fleet_live"],
    queryFn: fetchLiveFleet,
    refetchInterval: 10000
  });

  const { data: congestionData, isLoading: congestionLoading } = useQuery({
    queryKey: ["fleet_congestion"],
    queryFn: fetchCongestionDetections,
    refetchInterval: 30000
  });

  // This page already polls every 10s, so a transient failure self-heals without the
  // admin doing anything -- a low-key badge (rather than replacing the whole map with
  // a full error state) is enough to say "this data may be stale" without disrupting
  // an otherwise-live view.
  const hasError = jobsErrored || fleetErrored;

  const activeJobs = jobsData?.items || [];
  const vehicles = fleetData?.vehicles || [];
  const movingCount = vehicles.filter(v => v.speedMph > 2).length;
  const unmatchedCount = vehicles.filter(v => !v.driverInitials).length;

  return (
    <div className="space-y-4 max-w-full">
      {/* 1. Header Banner */}
      <div className="bg-white p-4 rounded border border-admin-line shadow-card flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-admin-status-green opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-admin-status-green"></span>
            </span>
            <h2 className="text-heading text-fg">Live Fleet GPS &amp; Driver Telemetry</h2>
          </div>
          <p className="text-xs text-admin-muted mt-0.5">
            Real-time van positions from GPSLive, cross-referenced with today's in-progress moves
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-pill bg-admin-brand-soft border border-admin-brand/20 text-xs font-mono font-medium text-admin-brand">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span>{movingCount} moving &bull; {vehicles.length} tracked</span>
          </div>

          {hasError && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-pill bg-admin-status-red-bg border border-admin-status-red/20 text-xs font-mono font-medium text-admin-status-red">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Connection problem -- data may be stale, retrying…</span>
            </div>
          )}

          {unmatchedCount > 0 ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-pill bg-amber-100 border border-amber-200 text-xs font-mono font-medium text-amber-700">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>{unmatchedCount} unmatched device{unmatchedCount === 1 ? "" : "s"}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-pill bg-admin-status-green-bg border border-admin-status-green/20 text-xs font-mono font-medium text-admin-status-green">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>All devices matched</span>
            </div>
          )}
        </div>
      </div>

      {/* 2. Main Live Map Component */}
      <LiveFleetMap
        jobs={activeJobs}
        onSelectJob={_jobId => {
          if (onSelectSection) onSelectSection("jobs");
        }}
      />

      {/* 3. Congestion Zone Detections — only rendered once there's at least one
          detection to show, so it isn't an empty box under the map the rest of the
          time. It reappears automatically on the first hit (30s poll). */}
      {!congestionLoading && (congestionData?.rows?.length ?? 0) > 0 && (
        <CongestionZonePanel rows={congestionData!.rows} isLoading={false} />
      )}
    </div>
  );
}

/** Every job GPSLive (or the job-start check) has flagged as having entered the
 *  Congestion Charge zone -- congestionZoneEnteredAt alone doesn't say whether the
 *  driver actually added the charge on the extra-charges step, so this cross-checks
 *  extraCharges too. */
function CongestionZonePanel({
  rows,
  isLoading
}: {
  rows: CongestionDetectionRow[];
  isLoading: boolean;
}) {
  return (
    <div className="bg-white rounded-module shadow-sm border border-admin-line overflow-hidden">
      <div className="px-4 py-3 border-b border-admin-line bg-admin-surface/60">
        <h3 className="text-[14px] font-bold text-admin-ink">Congestion Zone Detections</h3>
        <p className="text-xs text-admin-muted mt-0.5">
          Jobs whose van was detected inside London's Congestion Charge zone (GPSLive geofence)
        </p>
      </div>

      {isLoading && (
        <div className="p-8 text-center text-admin-muted text-[13px]">Loading detections...</div>
      )}

      {!isLoading && rows.length === 0 && (
        <div className="p-8 text-center text-admin-muted text-[13px]">No congestion zone detections yet.</div>
      )}

      {!isLoading && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-admin-line bg-admin-surface/60 text-eyebrow text-fg-subtle">
                <th className="py-3 px-4 font-bold">Job ID</th>
                <th className="py-3 px-4 font-bold">Customer</th>
                <th className="py-3 px-4 font-bold">Driver</th>
                <th className="py-3 px-4 font-bold">Van</th>
                <th className="py-3 px-4 font-bold">Pinned Device</th>
                <th className="py-3 px-4 font-bold">Detected (UK)</th>
                <th className="py-3 px-4 font-bold">Job Status</th>
                <th className="py-3 px-4 font-bold">Congestion Charge</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-admin-line">
              {rows.map(row => {
                const driverInit = row.driverInitials || "UN";
                return (
                  <tr key={row.jobId} className="hover:bg-admin-surface/40 transition">
                    <td className="px-4 py-3 text-[13px] font-mono font-medium text-admin-ink">{row.jobId}</td>
                    <td className="px-4 text-[14px] text-admin-ink font-medium">
                      <span className="truncate max-w-[150px] inline-block">{row.customerName || "—"}</span>
                    </td>
                    <td className="px-4">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px] ${
                            driverInit === "UN" ? "bg-admin-surface border border-admin-line text-admin-muted" : getAvatarColor(driverInit)
                          }`}
                        >
                          {driverInit}
                        </div>
                        <span className="text-[13px] text-admin-ink">{row.driverName || "—"}</span>
                      </div>
                    </td>
                    <td className="px-4 text-[13px] text-admin-ink font-mono">{row.vanRegistration || "—"}</td>
                    <td className="px-4 text-[12px] text-admin-muted font-mono" title={row.gpsliveImei ? "Device pinned at job start" : "No device pinned -- matched via plate/initials fallback"}>
                      {row.gpsliveImei || "—"}
                    </td>
                    <td className="px-4 text-[13px] text-admin-muted tabular-nums">{formatLondonDateTime(row.detectedAt)}</td>
                    <td className="px-4 text-[13px] text-admin-ink">{row.jobStatus}</td>
                    <td className="px-4">
                      {row.chargeAdded ? (
                        <span className="px-2 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1 bg-admin-status-green-bg text-admin-status-green">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Added
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1 bg-amber-100 text-amber-700">
                          <AlertTriangle className="w-3.5 h-3.5" /> Not added
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
