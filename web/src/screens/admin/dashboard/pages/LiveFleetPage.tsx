import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Radio, ShieldCheck, ShieldAlert } from "lucide-react";
import { fetchJobs, fetchLiveFleet } from "../api";
import { LiveFleetMap } from "../components/LiveFleetMap";

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
    </div>
  );
}
