import React from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { fetchCongestionDetections, fetchJobs, type CongestionDetectionRow } from "../api";
import { LiveFleetMap } from "../components/LiveFleetMap";
import { formatLondonDateTime } from "../utils/date";
import { getAvatarColor } from "../utils/drivers";

interface Props {
  onSelectSection?: (id: string) => void;
}

export function LiveFleetPage({ onSelectSection }: Props) {
  const { data: jobsData } = useQuery({
    queryKey: ["live_fleet_jobs"],
    queryFn: () => fetchJobs({ status: "IN_PROGRESS", limit: 50 }),
    refetchInterval: 10000
  });

  const { data: congestionData, isLoading: congestionLoading } = useQuery({
    queryKey: ["fleet_congestion"],
    queryFn: fetchCongestionDetections,
    refetchInterval: 30000
  });

  const activeJobs = jobsData?.items || [];

  return (
    <div className="space-y-4 max-w-full">
      {/* The map component carries its own status line (live count, filters); the
          separate banner that used to sit here was pure vertical cost. */}
      <LiveFleetMap
        jobs={activeJobs}
        onSelectJob={_jobId => {
          if (onSelectSection) onSelectSection("jobs");
        }}
      />

      {/* 3. Zone Detections (Congestion + Tunnel) — only rendered once there's at
          least one detection to show, so it isn't an empty box under the map the
          rest of the time. It reappears automatically on the first hit (30s poll). */}
      {!congestionLoading && (congestionData?.rows?.length ?? 0) > 0 && (
        <CongestionZonePanel rows={congestionData!.rows} isLoading={false} />
      )}
    </div>
  );
}

/** Every job GPSLive (or the job-start check) has flagged as having entered the
 *  Congestion Charge zone or the tunnel-toll zone -- *ZoneEnteredAt alone doesn't say
 *  whether the driver actually added the matching charge on the extra-charges step,
 *  so this cross-checks extraCharges too. */
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
        <h3 className="text-[14px] font-bold text-admin-ink">Zone Detections</h3>
        <p className="text-xs text-admin-muted mt-0.5">
          Jobs whose van was detected inside London's Congestion Charge zone or a tunnel toll zone
          (Dartford Crossing / Tunnels-Black-Silver) via GPSLive geofences
        </p>
      </div>

      {isLoading && (
        <div className="p-8 text-center text-admin-muted text-[13px]">Loading detections...</div>
      )}

      {!isLoading && rows.length === 0 && (
        <div className="p-8 text-center text-admin-muted text-[13px]">No zone detections yet.</div>
      )}

      {!isLoading && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-admin-line bg-admin-surface/60 text-eyebrow text-fg-subtle">
                <th className="py-3 px-4 font-bold">Zone</th>
                <th className="py-3 px-4 font-bold">Job ID</th>
                <th className="py-3 px-4 font-bold">Customer</th>
                <th className="py-3 px-4 font-bold">Driver</th>
                <th className="py-3 px-4 font-bold">Van</th>
                <th className="py-3 px-4 font-bold">Pinned Device</th>
                <th className="py-3 px-4 font-bold">Detected (UK)</th>
                <th className="py-3 px-4 font-bold">Job Status</th>
                <th className="py-3 px-4 font-bold">Charge</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-admin-line">
              {rows.map(row => {
                const driverInit = row.driverInitials || "UN";
                return (
                  <tr key={`${row.zone}-${row.jobId}`} className="hover:bg-admin-surface/40 transition">
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                          row.zone === "congestion"
                            ? "bg-info-subtle text-info"
                            : "bg-violet-100 text-violet-700"
                        }`}
                      >
                        {row.zone === "congestion" ? "Congestion" : "Tunnel"}
                      </span>
                    </td>
                    <td className="px-4 text-[13px] font-mono font-medium text-admin-ink">{row.jobId}</td>
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
