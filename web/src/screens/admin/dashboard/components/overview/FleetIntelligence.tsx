/**
 * Fleet Intelligence: tracker connectivity and who is out on jobs, from the live
 * fleet positions and today's jobs. Signal state uses the one freshness policy
 * (utils/freshness.ts: a position older than 30 minutes is stale) and says "last
 * reported", never "live", for anything that is not current. No locations are
 * drawn here; the map lives on Live fleet.
 */
import React, { useMemo } from "react";
import { ArrowRight, Radar } from "lucide-react";
import { DateTime } from "luxon";
import type { LiveFleetVehicle } from "../../api";
import type { NormalizedJob } from "../../types";
import { Action, EmptyState, ErrorState, LoadingState, SemiGauge, CHART, focusRing } from "../ds";
import { cx } from "../../../../../ui/cx";
import { isUnassigned } from "../../hooks/useAttention";
import { TRACKER_STALE_AFTER_MINUTES, parseTrackerTime, signalFreshness, type Freshness } from "../../utils/freshness";
import { plural } from "../../utils/format";

const SIGNAL: Record<Freshness, { label: string; chip: string; dot: string }> = {
  current: { label: "Current", chip: "bg-admin-status-green-bg text-admin-status-green", dot: "bg-admin-status-green" },
  stale: { label: "Stale", chip: "bg-admin-status-amber-bg text-admin-status-amber", dot: "bg-admin-status-amber" },
  unknown: { label: "Unknown", chip: "bg-admin-surface text-admin-ink-2", dot: "bg-admin-muted" }
};

export function FleetIntelligence({ vehicles, todayJobs, state, error, onRetry, vehicleCount, vehiclesPartial, onOpenFleet, onOpenVehicles }: {
  vehicles: LiveFleetVehicle[]; todayJobs: NormalizedJob[]; state: "loading" | "error" | "ready"; error?: string; onRetry: () => void;
  vehicleCount: number | null; vehiclesPartial: boolean; onOpenFleet: () => void; onOpenVehicles: () => void;
}) {
  const now = DateTime.utc();
  const model = useMemo(() => {
    const tally: Record<Freshness, number> = { current: 0, stale: 0, unknown: 0 };
    vehicles.forEach(vehicle => { tally[signalFreshness(vehicle.lastUpdate, now)] += 1; });
    const real = (job: NormalizedJob) => !isUnassigned(job);
    const onJobs = new Set(todayJobs.filter(job => job.status === "IN_PROGRESS" && real(job)).map(job => job.driverInitials));
    const later = new Set(todayJobs.filter(job => job.status === "READY" && real(job) && !onJobs.has(job.driverInitials)).map(job => job.driverInitials));
    const rows = [...vehicles].sort((a, b) => {
      const rank = (vehicle: LiveFleetVehicle) => (vehicle.driverInitials && onJobs.has(vehicle.driverInitials) ? 0 : 2) + (signalFreshness(vehicle.lastUpdate, now) === "stale" ? 0 : 1);
      return rank(a) - rank(b);
    });
    return { tally, onJobs, later, rows };
    // `now` is re-read on each render; the memo key is the data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicles, todayJobs]);

  const tracked = vehicles.length;
  const currentShare = tracked ? model.tally.current / tracked : null;
  const stats = [
    { label: "Drivers on jobs", value: model.onJobs.size, hint: "In-progress jobs today" },
    { label: "Assigned later today", value: model.later.size, hint: "Drivers with scheduled jobs" },
    { label: "Vehicles needing attention", value: vehicleCount === null ? "—" : vehicleCount, hint: vehiclesPartial ? "First page of vehicles" : "Renewals due or overdue" }
  ];

  return (
    <section aria-labelledby="fleet-intel-title" className="tmv-panel flex min-w-0 flex-col">
      <header className="flex items-start justify-between gap-3 px-6 pt-5">
        <div className="flex items-start gap-3">
          <span aria-hidden className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-admin-brand-soft text-admin-brand"><Radar className="h-[18px] w-[18px]" /></span>
          <div>
            <h2 id="fleet-intel-title" className="text-[17px] font-bold leading-6 tracking-tight text-admin-ink">Fleet now</h2>
            <p className="text-[13px] text-admin-ink-2">Not limited to the selected period</p>
          </div>
        </div>
        <Action size="sm" onClick={onOpenFleet}>Live fleet<ArrowRight aria-hidden className="h-3.5 w-3.5" /></Action>
      </header>

      <div className="flex-1 px-6 pb-5 pt-4">
        {state === "loading" ? <LoadingState label="Loading fleet" rows={3} />
          : state === "error" ? <ErrorState compact title="Couldn't load tracker positions" message={error} onRetry={onRetry} />
          : tracked === 0 ? <EmptyState compact title="No trackers reporting" message="Vehicles appear here once their trackers report to GPSLive." />
          : (
            <div className="space-y-5">
              <div className="grid items-end gap-4 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
                <SemiGauge value={currentShare} color={CHART.teal} width={200}
                  label={`${model.tally.current} of ${tracked} tracked vehicles reported within the last ${TRACKER_STALE_AFTER_MINUTES} minutes`}>
                  <span className="block text-[26px] font-extrabold leading-7 tracking-tight tabular-nums text-admin-ink">{model.tally.current}<span className="text-[15px] font-semibold text-admin-ink-2"> / {tracked}</span></span>
                  <span className="block text-[12px] text-admin-ink-2">current signal</span>
                </SemiGauge>
                <ul className="grid min-w-0 gap-1.5" aria-label="Tracker signal">
                  {(["current", "stale", "unknown"] as Freshness[]).map(key => (
                    <li key={key} className="flex items-center justify-between gap-3 rounded-xl bg-admin-surface px-3 py-1.5 text-[13px]">
                      <span className="flex min-w-0 flex-wrap items-center gap-x-2 text-admin-ink-2"><span aria-hidden className={cx("h-2 w-2 shrink-0 rounded-full", SIGNAL[key].dot)} />{SIGNAL[key].label}
                        <span className="text-[12px] text-admin-muted">{key === "current" ? `≤ ${TRACKER_STALE_AFTER_MINUTES} min` : key === "stale" ? `> ${TRACKER_STALE_AFTER_MINUTES} min` : "no timestamp"}</span></span>
                      <span className="font-bold tabular-nums text-admin-ink">{model.tally[key]}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <dl className="grid grid-cols-3 gap-2">
                {stats.map(stat => (
                  <div key={stat.label} className="rounded-2xl border border-admin-line bg-surface/70 px-3 py-2.5">
                    <dd className="text-[24px] font-extrabold leading-7 tabular-nums text-admin-ink">{stat.value}</dd>
                    <dt className="text-[12.5px] font-semibold leading-4 text-admin-ink">{stat.label}</dt>
                    <dd className="text-[12px] leading-4 text-admin-ink-2">{stat.hint}</dd>
                  </div>
                ))}
              </dl>

              <div>
                <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-admin-ink-2">Vehicles on jobs first</p>
                <ul className="space-y-1">
                  {model.rows.slice(0, 5).map(vehicle => {
                    const freshness = signalFreshness(vehicle.lastUpdate, now);
                    const at = parseTrackerTime(vehicle.lastUpdate)?.setZone("Europe/London");
                    return (
                      <li key={vehicle.imei}>
                        <button type="button" onClick={onOpenFleet} className={cx("flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-admin-surface", focusRing)}
                          aria-label={`${vehicle.plateNumber || vehicle.name}, ${vehicle.driverName || "no driver linked"}, signal ${SIGNAL[freshness].label.toLowerCase()}${at ? `, last reported ${at.toFormat("HH:mm")}` : ""}. Open live fleet`}>
                          <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-admin-brand-soft text-[12px] font-bold text-admin-brand">{(vehicle.driverInitials || "–").slice(0, 2)}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] font-semibold text-admin-ink">{vehicle.plateNumber || vehicle.name}</span>
                            <span className="block truncate text-[12px] text-admin-ink-2">{vehicle.driverName || "No driver linked"}{at ? ` · last reported ${at.toFormat("HH:mm")}` : ""}</span>
                          </span>
                          <span className={cx("shrink-0 rounded-full px-2 py-0.5 text-[12px] font-bold", SIGNAL[freshness].chip)}>{SIGNAL[freshness].label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {tracked > 5 && <p className="mt-1 px-2 text-[12px] text-admin-ink-2">{plural(tracked - 5, "more vehicle")} on Live fleet.</p>}
              </div>
              <Action size="sm" onClick={onOpenVehicles} className="w-full">Vehicle compliance</Action>
            </div>
          )}
      </div>
    </section>
  );
}
