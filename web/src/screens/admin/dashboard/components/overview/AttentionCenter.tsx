/**
 * Attention Center: priority items that need action, one card per issue type.
 * Severity comes straight from useAttention (High / Medium / Low -- nothing is
 * promoted here). Issue types overlap (one job can have several), so counts are
 * shown per type and never added into a single "total issues" figure.
 */
import React, { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Camera, FileWarning, MessageSquareWarning, PoundSterling, Receipt, ShieldAlert, ShieldCheck, SignalLow, Truck, UserX } from "lucide-react";
import { Action, ChoiceChips, EmptyState, LoadingState, Notice, focusRing } from "../ds";
import { cx } from "../../../../../ui/cx";
import { CATEGORY_LABEL, CATEGORY_UNIT, groupAttention, type AttentionCategory, type AttentionSeverity, type useAttention } from "../../hooks/useAttention";
import { SEVERITY_LABEL } from "../AttentionList";
import { openJob } from "../../navigation";
import { formatShortDateTime, plural } from "../../utils/format";

type Filter = "all" | AttentionSeverity;
type Row = {
  key: string; label: string; count: number; unit: string; severity: AttentionSeverity; description: string;
  latest: string | null; action: string; onAction: () => void;
  icon: React.ComponentType<{ className?: string }>;
};

const ICON: Record<AttentionCategory | "vehicles", Row["icon"]> = {
  unassigned: UserX, tracker: SignalLow, proof: Camera, evidence: FileWarning, invoice: Receipt, charge: PoundSterling, delivery: MessageSquareWarning, fleet: ShieldAlert, vehicles: Truck
};
const DESCRIPTION: Record<AttentionCategory | "vehicles", string> = {
  unassigned: "Active jobs with no driver on them.",
  tracker: "In-progress jobs whose tracker has not reported recently.",
  proof: "Driver has arrived by tracker but not submitted the arrival photo.",
  evidence: "Completed jobs missing required evidence.",
  invoice: "Completed jobs recorded as invoice; later payment is not tracked.",
  charge: "Completed jobs whose final charge is far above their priced parts.",
  delivery: "Customer email or SMS that failed to send.",
  fleet: "Safety events reported by vehicle trackers.",
  vehicles: "MOT, tax or insurance due or overdue."
};
const SEVERITY_STYLE: Record<AttentionSeverity, { chip: string; icon: string; bar: string }> = {
  high: { chip: "bg-admin-status-red-bg text-admin-status-red border-admin-status-red/30", icon: "bg-admin-status-red-bg text-admin-status-red", bar: "bg-[color:var(--chart-coral)]" },
  medium: { chip: "bg-admin-status-amber-bg text-admin-status-amber border-admin-status-amber/30", icon: "bg-admin-status-amber-bg text-admin-status-amber", bar: "bg-[color:var(--chart-amber)]" },
  low: { chip: "bg-admin-brand-soft text-admin-brand-dark border-admin-brand/25", icon: "bg-admin-brand-soft text-admin-brand", bar: "bg-[color:var(--chart-slate)]" }
};
const ORDER: Record<AttentionSeverity, number> = { high: 0, medium: 1, low: 2 };

export function AttentionCenter({ attention, vehicleCount, vehiclesPartial, onSelectSection }: {
  attention: ReturnType<typeof useAttention>; vehicleCount: number | null; vehiclesPartial: boolean;
  onSelectSection?: (id: string, params?: Record<string, string | undefined>) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = groupAttention(attention.items).map(group => {
      const single = group.items.length === 1 && group.items[0].action.kind === "job" ? group.items[0] : null;
      const latest = group.items.map(item => item.at).filter((value): value is string => !!value).sort().pop() ?? null;
      return {
        key: group.category, label: CATEGORY_LABEL[group.category], count: group.count, unit: CATEGORY_UNIT[group.category], severity: group.severity,
        description: DESCRIPTION[group.category], latest, icon: ICON[group.category],
        action: single ? "Open job" : "Review in Alerts",
        onAction: () => single?.action.target ? openJob(single.action.target) : onSelectSection?.("alerts", { view: "attention" })
      };
    });
    if (vehicleCount) out.push({ key: "vehicles", label: "Vehicle renewals due or overdue", count: vehicleCount, unit: "vehicle", severity: "medium", description: DESCRIPTION.vehicles, latest: null, icon: ICON.vehicles,
      action: "Open vehicles", onAction: () => onSelectSection?.("vehicles", { show: "attention" }) });
    return out.sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || b.count - a.count);
  }, [attention.items, vehicleCount, onSelectSection]);

  const counts: Record<Filter, number> = { all: rows.length, high: 0, medium: 0, low: 0 };
  rows.forEach(row => { counts[row.severity] += 1; });
  const visible = filter === "all" ? rows : rows.filter(row => row.severity === filter);
  const high = rows.filter(row => row.severity === "high");
  const loading = attention.loading && !rows.length;

  return (
    <section aria-labelledby="attention-title" className="tmv-gloss tmv-accent-coral flex min-w-0 flex-col">
      <header className="flex items-start justify-between gap-3 px-6 pt-5">
        <div className="flex items-start gap-3">
          <span aria-hidden className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-admin-status-red-bg text-admin-status-red"><AlertTriangle className="h-[18px] w-[18px]" /></span>
          <div>
            <h2 id="attention-title" className="text-[17px] font-bold leading-6 tracking-tight text-admin-ink">Needs attention</h2>
            <p className="text-[13px] text-admin-ink-2">Today and live · not limited to the selected period</p>
          </div>
        </div>
      </header>

      <div className="px-6 pt-3">
        <ChoiceChips label="Filter by priority" value={filter} onChange={setFilter} options={[
          { value: "all", label: "All", count: counts.all }, { value: "high", label: "High", count: counts.high },
          { value: "medium", label: "Medium", count: counts.medium }, { value: "low", label: "Low", count: counts.low }]} />
      </div>

      {attention.failed.length > 0 && (
        <div className="px-5 pt-3"><Notice tone="warning" action={<Action size="sm" onClick={attention.refetch}>Retry</Action>}>{attention.failed.map(source => source.label).join(", ")} didn't load; this list may be incomplete.</Notice></div>
      )}

      {high.length > 0 && filter !== "medium" && filter !== "low" && (
        <div className="mx-5 mt-3 rounded-2xl border border-admin-status-red/30 bg-admin-status-red-bg px-4 py-3">
          <p className="flex items-center gap-2 text-[13.5px] font-bold text-admin-status-red"><ShieldAlert aria-hidden className="h-4 w-4" />High priority</p>
          <p className="mt-0.5 text-[13.5px] text-admin-ink">{high.map(row => `${row.label} (${row.count})`).join(" · ")}</p>
        </div>
      )}

      <div className="max-h-[380px] flex-1 overflow-y-auto px-3 pb-3 pt-3">
        {loading ? <LoadingState label="Checking for issues" rows={4} />
          : rows.length === 0 ? <EmptyState compact title={attention.failed.length ? "Nothing found in the sources that loaded" : "All clear"} message="Today's jobs, trackers, messages and vehicles show nothing that needs action." />
          : visible.length === 0 ? <EmptyState compact kind="no-matches" title={`No ${SEVERITY_LABEL[filter as AttentionSeverity].toLowerCase()}-priority items`} actions={<Action size="sm" onClick={() => setFilter("all")}>Show all</Action>} />
          : (
            <ul className="tmv-stagger space-y-2">
              {visible.map(row => {
                const Icon = row.icon;
                const style = SEVERITY_STYLE[row.severity];
                return (
                  <li key={row.key} className="tmv-card tmv-card-interactive">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-3">
                      <span aria-hidden className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-xl", style.icon)}><Icon className="h-5 w-5" /></span>
                      <div className="min-w-0 flex-1 basis-[200px]">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="text-[14.5px] font-bold text-admin-ink">{row.label}</span>
                          <span className={cx("rounded-full border px-2 text-[12px] font-bold leading-5", style.chip, row.severity === "high" && "tmv-breathe")}>{SEVERITY_LABEL[row.severity]}</span>
                        </p>
                        <p className="text-[12.5px] leading-[18px] text-admin-ink-2">{row.description}</p>
                        <p className="mt-0.5 text-[12.5px] text-admin-ink-2">
                          <span className="font-bold tabular-nums text-admin-ink">{plural(row.count, row.unit)}</span>
                          {row.latest ? <> · latest {formatShortDateTime(row.latest)}</> : null}
                        </p>
                      </div>
                      <Action size="sm" onClick={row.onAction} className={cx("shrink-0", focusRing)}>{row.action}<ArrowRight aria-hidden className="h-3.5 w-3.5" /></Action>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
      </div>
      <footer className="flex items-start gap-2 border-t border-admin-line/70 px-6 py-3 text-[12.5px] text-admin-ink-2">
        <ShieldCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Counts overlap (one job can have several issues), so they aren't added together.{vehiclesPartial ? " Vehicle count covers the first page of vehicles." : ""} Missing driver submissions are listed in each driver report.</span>
      </footer>
    </section>
  );
}
