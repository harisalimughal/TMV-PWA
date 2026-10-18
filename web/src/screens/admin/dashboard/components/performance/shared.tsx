/** Shared bits of the Performance dashboard: driver colour and avatar, comparison text. */
import React from "react";
import { cx } from "../../../../../ui/cx";
import { CHART, type Comparison } from "../ds";
import { focusRing } from "../ds";
import { pctChange } from "../../utils/performanceData";

/** One colour per driver, by position in the stable roster order: colour follows the entity, not its rank. */
const PALETTE = [CHART.violet, CHART.blue, CHART.teal, CHART.amber, CHART.coral, CHART.cyan, CHART.orange];
export function driverColor(initials: string, roster: string[]): string {
  const index = roster.indexOf(initials);
  return PALETTE[(index < 0 ? 0 : index) % PALETTE.length];
}

export function DriverAvatar({ initials, color, size = 32 }: { initials: string; color: string; size?: number }) {
  return (
    <span aria-hidden className="grid shrink-0 place-items-center rounded-xl font-bold text-white" style={{ width: size, height: size, fontSize: size * 0.36, background: color }}>
      {initials.slice(0, 2)}
    </span>
  );
}

/** "+12% vs previous period", or null with nothing comparable. Direction only; no good/bad unless the caller knows. */
export function moneyComparison(current: number, previous: number | null | undefined, period: string, goodWhenUp: boolean | null = null): Comparison | null {
  const change = pctChange(current, previous);
  if (change === null) return null;
  const direction = Math.abs(change) < 0.005 ? "flat" : change > 0 ? "up" : "down";
  const meaning = goodWhenUp === null || direction === "flat" ? "neutral" : (direction === "up") === goodWhenUp ? "good" : "bad";
  return { direction, meaning, text: `${change > 0 ? "+" : ""}${Math.round(change * 100)}% vs ${period}` };
}

/** A ranked list of bars. Each row is a real button when it leads somewhere, so keyboard users get the same drill-down. */
export interface RankedItem { key: string; label: string; initials: string; color: string; value: number | null; display: string; detail?: React.ReactNode; warn?: boolean }

export function RankedBars({ items, onOpen, openLabel, label }: { items: RankedItem[]; onOpen?: (key: string) => void; openLabel?: (item: RankedItem) => string; label: string }) {
  const max = Math.max(0, ...items.map(item => item.value ?? 0));
  return (
    <ol aria-label={label} className="space-y-1.5">
      {items.map(item => {
        const body = (
          <>
            <DriverAvatar initials={item.initials} color={item.color} size={34} />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-3">
                <span className="truncate text-[14px] font-semibold text-admin-ink">{item.label}</span>
                <span className={cx("shrink-0 text-[14px] font-bold tabular-nums", item.value === null ? "text-admin-ink-2" : "text-admin-ink")}>{item.display}</span>
              </span>
              <span aria-hidden className="mt-1.5 block h-2.5 overflow-hidden rounded-full bg-admin-surface">
                <span className="block h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none" style={{ width: item.value === null || max === 0 ? 0 : `${Math.max(3, Math.round(item.value / max * 100))}%`, background: `linear-gradient(90deg, ${item.color}, color-mix(in srgb, ${item.color} 62%, transparent))` }} />
              </span>
              {item.detail && <span className={cx("mt-1 block text-[12px] leading-4", item.warn ? "text-admin-status-amber" : "text-admin-ink-2")}>{item.detail}</span>}
            </span>
          </>
        );
        return (
          <li key={item.key}>
            {onOpen
              ? <button type="button" onClick={() => onOpen(item.key)} aria-label={openLabel ? openLabel(item) : `${item.label}: ${item.display}. Open report`}
                  className={cx("flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition hover:bg-admin-surface", focusRing)}>{body}</button>
              : <div className="flex items-center gap-3 px-2 py-1.5">{body}</div>}
          </li>
        );
      })}
    </ol>
  );
}
