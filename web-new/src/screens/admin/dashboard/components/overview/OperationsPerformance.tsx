/**
 * Operations Performance: how the selected period's jobs break down by current
 * status. A large ring with the total at its centre, and one breakdown card per
 * status (count, share, comparison with the previous period when it is complete).
 * Hovering or focusing a card highlights its ring segment and vice versa.
 */
import React, { useState } from "react";
import { Gauge } from "lucide-react";
import { DonutChart, ChartPanel, focusRing, type PanelState } from "../ds";
import { cx } from "../../../../../ui/cx";
import { STATUS_LABEL, type OverviewKpis, type StatusKey } from "../../utils/overviewData";
import { STATUS_COLOR, STATUS_ORDER, compareCounts, percent, percentText } from "./helpers";
import type { Comparison } from "../ds";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { formatMoney } from "../../utils/format";

const DETAIL: Record<StatusKey, string> = {
  completed: "Finished and closed out",
  inProgress: "Being worked on now",
  scheduled: "Booked, not started",
  cancelled: "Cancelled before completion"
};
const GOOD_WHEN_UP: Record<StatusKey, boolean | null> = { completed: true, inProgress: null, scheduled: null, cancelled: false };

export function OperationsPerformance({ kpis, previous, period, state, error, onRetry, updating, onOpenStatus, partialNote }: {
  kpis: OverviewKpis; previous: OverviewKpis | null; period: string; state: PanelState; error?: string; onRetry: () => void; updating: boolean;
  onOpenStatus: (status: StatusKey) => void; partialNote?: string | null;
}) {
  const [active, setActive] = useState<string | null>(null);
  const total = kpis.total;
  const segments = STATUS_ORDER.map(key => ({ key, label: STATUS_LABEL[key], value: kpis.byStatus[key], color: STATUS_COLOR[key] }));
  const focus = active ? segments.find(segment => segment.key === active) : null;
  const completion = percent(kpis.byStatus.completed, total);
  const empty = state === "ready" && total === 0;
  const summary = total === 0 ? "" : `${kpis.byStatus.completed} of ${total} jobs completed (${percentText(completion)}). ${kpis.byStatus.inProgress} in progress, ${kpis.byStatus.scheduled} still scheduled${kpis.byStatus.cancelled ? `, ${kpis.byStatus.cancelled} cancelled` : ""}.`;

  return (
    <ChartPanel title="Operations performance" icon={<Gauge />} question="Current status of every job scheduled in this period."
      state={empty ? "empty" : state} error={error} onRetry={onRetry} updating={updating} emptyText="No jobs are scheduled in this period." minHeight={300}
      coverage={partialNote ? <span className="text-admin-status-amber">{partialNote}</span> : undefined}
      basis="Each job is counted once, with its current status (not the status it had on a given day)."
      table={{ caption: "Jobs by status", columns: ["Status", "Jobs", "Share of jobs"], rows: segments.map(segment => [segment.label, segment.value, percentText(percent(segment.value, total))]) }}>
      <div className="grid content-start items-center gap-6 px-2 py-2 lg:grid-cols-[auto_minmax(0,1fr)]">
        <div className="mx-auto flex flex-col items-center gap-4">
          <DonutChart segments={segments} active={active} onActive={setActive} size={236} stroke={28}
            centerValue={focus ? focus.value : total} centerLabel={focus ? focus.label : "Total jobs"}
            label={`Job status: ${segments.map(segment => `${segment.label} ${segment.value}`).join(", ")}; ${total} in total`} />
          <p className="max-w-[260px] text-center text-[13px] leading-5 text-admin-ink-2">{summary}</p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2" aria-label="Jobs by status">
          {segments.map(segment => {
            const comparison: Comparison | null = previous ? compareCounts(segment.value, previous.byStatus[segment.key as StatusKey], period, GOOD_WHEN_UP[segment.key as StatusKey]) : null;
            const Delta = comparison?.direction === "up" ? ArrowUpRight : comparison?.direction === "down" ? ArrowDownRight : Minus;
            return (
              <li key={segment.key}>
                <button type="button" onClick={() => onOpenStatus(segment.key as StatusKey)} onMouseEnter={() => setActive(segment.key)} onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(segment.key)} onBlur={() => setActive(null)}
                  aria-label={`${segment.label}: ${segment.value} jobs, ${percentText(percent(segment.value, total))} of total. View these jobs`}
                  style={active === segment.key ? { borderColor: segment.color } : undefined}
                  className={cx("tmv-card tmv-card-interactive group w-full p-4 text-left", focusRing, active === segment.key && "shadow-[var(--admin-shadow-lg)]")}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-admin-ink">
                      <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: segment.color }} />{segment.label}
                    </span>
                    <span className="rounded-full bg-admin-surface px-2 py-0.5 text-[12px] font-bold tabular-nums text-admin-ink-2">{percentText(percent(segment.value, total))}</span>
                  </span>
                  <span className="mt-1.5 block text-[30px] font-extrabold leading-9 tracking-tight tabular-nums text-admin-ink">{segment.value}</span>
                  <span className="block text-[12.5px] text-admin-ink-2">{DETAIL[segment.key as StatusKey]}</span>
                  {comparison && (
                    <span className={cx("mt-2 inline-flex items-center gap-1 text-[12.5px] font-semibold",
                      comparison.meaning === "good" ? "text-admin-status-green" : comparison.meaning === "bad" ? "text-admin-status-red" : "text-admin-ink-2")}>
                      <Delta aria-hidden className="h-3.5 w-3.5" />{comparison.text}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </ChartPanel>
  );
}

/** Final charges phrase used beneath the status ring when charges are known. */
export function chargesSummary(known: number, missing: number): string {
  return missing ? `${formatMoney(known)} final charges known, ${missing} completed job${missing === 1 ? "" : "s"} without one` : `${formatMoney(known)} final charges`;
}
