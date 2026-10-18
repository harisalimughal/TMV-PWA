/**
 * Date range control. All days are London calendar days.
 *
 * Two preset sets (audit p.4): operational pages (Jobs, Evidence) look at
 * Yesterday / Today / Tomorrow; retrospective reports (Drivers performance, driver
 * reports, Payments) use Today / Last 7 days / This month / Last month. A custom
 * From–To pair is always available.
 */
import React from "react";
import { DateTime } from "luxon";
import { CalendarRange } from "lucide-react";
import { londonDateInput } from "../utils/reportNavigation";
import { cx } from "../../../../ui/cx";
import { controlBase, focusRing } from "./ds/primitives";
import { useKeepSelectedVisible } from "./ds/segmented";

/** Same selected look as the shared SegmentedControl (ds/Toolbar), on every page. */
const SELECTED = "bg-surface text-admin-brand shadow-[var(--admin-shadow-sm)] ring-1 ring-admin-brand/25";

type Preset = "today" | "tomorrow" | "yesterday" | "7d" | "30d" | "month" | "lastMonth" | "all";

interface Props {
  from?: string;
  to?: string;
  onChange: (from?: string, to?: string) => void;
  /** "overview": Today / Yesterday / Last 7 days. Any other range is picked with the two date fields. */
  /** "records": Today / Yesterday / Tomorrow / 7 days (Vehicles, Liability & checks). */
  presets?: "operational" | "retrospective" | "overview" | "records";
  /** Adds "All dates" (from/to undefined), e.g. for record search. */
  allowAll?: boolean;
  /** The two date fields move into a "Custom range" popover instead of always showing. Same values, same behaviour. */
  compact?: boolean;
}

export function dateRangeForPreset(preset: Preset): { from?: string; to?: string } {
  const today = DateTime.now().setZone("Europe/London").startOf("day");
  if (preset === "all") return { from: undefined, to: undefined };
  if (preset === "month") return { from: today.startOf("month").toUTC().toISO()!, to: today.endOf("day").toUTC().toISO()! };
  if (preset === "lastMonth") {
    const start = today.minus({ months: 1 }).startOf("month");
    return { from: start.toUTC().toISO()!, to: start.endOf("month").toUTC().toISO()! };
  }
  const start = preset === "tomorrow" ? today.plus({ days: 1 }) : preset === "yesterday" ? today.minus({ days: 1 }) : preset === "7d" ? today.minus({ days: 6 }) : preset === "30d" ? today.minus({ days: 29 }) : today;
  const end = preset === "7d" || preset === "30d" ? today.endOf("day") : start.endOf("day");
  return { from: start.toUTC().toISO()!, to: end.toUTC().toISO()! };
}

export const defaultDashboardDateRange = () => dateRangeForPreset("today");

const LABELS: Record<Preset, string> = { yesterday: "Yesterday", today: "Today", tomorrow: "Tomorrow", "7d": "Last 7 days", "30d": "Last 30 days", month: "This month", lastMonth: "Last month", all: "All dates" };

export function DateRangePicker({ from, to, onChange, presets = "operational", allowAll = false, compact = false }: Props) {
  const base: Preset[] = presets === "operational" ? ["yesterday", "today", "tomorrow"] : presets === "overview" ? ["today", "yesterday", "7d"] : presets === "records" ? ["today", "yesterday", "tomorrow", "7d"] : ["today", "7d", "month", "lastMonth"];
  const options: Preset[] = [...base, ...(allowAll ? ["all" as Preset] : [])];
  const isActive = (preset: Preset): boolean => {
    if (preset === "all") return !from && !to;
    if (!from || !to) return false;
    const range = dateRangeForPreset(preset);
    return londonDateInput(from) === londonDateInput(range.from) && londonDateInput(to) === londonDateInput(range.to);
  };
  const presetsRef = React.useRef<HTMLDivElement>(null);
  const activeIndex = options.findIndex(isActive);
  useKeepSelectedVisible(presetsRef, activeIndex < 0 ? options.length : activeIndex);
  return (
    <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto" role="group" aria-label="Date range (London time)">
      <div ref={presetsRef} className="tmv-segmented inline-flex max-w-full flex-wrap items-center gap-0.5 rounded-2xl border border-admin-line bg-admin-surface p-1">
        {options.map(preset => (
          <button key={preset} type="button" aria-pressed={isActive(preset)}
            onClick={() => { const range = dateRangeForPreset(preset); onChange(range.from, range.to); }}
            className={cx("h-8 whitespace-nowrap rounded-xl px-3 text-[13px] font-semibold transition", focusRing,
              isActive(preset) ? SELECTED : "text-admin-ink-2 hover:text-admin-ink")}>
            {presets === "records" && preset === "7d" ? "7 days" : LABELS[preset]}
          </button>
        ))}
      </div>
      {compact ? <CustomRange from={from} to={to} custom={options.length > 0 && !options.some(isActive) && Boolean(from && to)} onChange={onChange} /> : (
        <>
        {/* Each date keeps room for a whole date and the picker icon at the forced 16px; on the
            narrowest phones the row wraps rather than pushing the picker past its card. */}
        <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:flex-nowrap">
          <input type="date" aria-label="From date" value={londonDateInput(from)} max={londonDateInput(to) || undefined}
            onChange={event => onChange(event.target.value ? DateTime.fromISO(event.target.value, { zone: "Europe/London" }).startOf("day").toUTC().toISO()! : undefined, to)}
            className={cx(controlBase, "min-w-[132px] flex-1 basis-0 px-2 text-[13.5px] sm:w-[150px] sm:flex-none sm:basis-auto")} />
          <span className="text-[13px] text-admin-ink-2" aria-hidden>to</span>
          <input type="date" aria-label="To date" value={londonDateInput(to)} min={londonDateInput(from) || undefined}
            onChange={event => onChange(from, event.target.value ? DateTime.fromISO(event.target.value, { zone: "Europe/London" }).endOf("day").toUTC().toISO()! : undefined)}
            className={cx(controlBase, "min-w-[132px] flex-1 basis-0 px-2 text-[13.5px] sm:w-[150px] sm:flex-none sm:basis-auto")} />
        </div>
        </>
      )}
    </div>
  );
}

/** "Custom range": shows the chosen range when it is not a preset, and opens the two date fields in a small panel. */
function CustomRange({ from, to, custom, onChange }: { from?: string; to?: string; custom: boolean; onChange: Props["onChange"] }) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const label = custom && from && to ? `${DateTime.fromISO(londonDateInput(from)).toFormat("d LLL")} – ${DateTime.fromISO(londonDateInput(to)).toFormat("d LLL")}` : "Custom range";
  React.useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); } };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", escape); };
  }, [open]);
  return (
    <div ref={rootRef} className="relative">
      <button type="button" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(value => !value)}
        className={cx("inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-[13px] font-semibold transition", focusRing,
          custom ? "border-admin-brand/40 bg-admin-brand-soft text-admin-brand" : "border-admin-line bg-surface text-admin-ink-2 hover:text-admin-ink")}>
        <CalendarRange aria-hidden className="h-4 w-4" />{label}
      </button>
      {open && (
        <div role="dialog" aria-label="Custom date range (London time)"
          className="absolute left-0 top-full z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-admin-line bg-surface p-3 shadow-lg sm:left-auto sm:right-0">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[12.5px] font-medium text-admin-ink-2">From
              <input type="date" aria-label="From date" value={londonDateInput(from)} max={londonDateInput(to) || undefined}
                onChange={event => onChange(event.target.value ? DateTime.fromISO(event.target.value, { zone: "Europe/London" }).startOf("day").toUTC().toISO()! : undefined, to)}
                className={cx(controlBase, "mt-1 w-full px-2 text-[13.5px]")} />
            </label>
            <label className="text-[12.5px] font-medium text-admin-ink-2">To
              <input type="date" aria-label="To date" value={londonDateInput(to)} min={londonDateInput(from) || undefined}
                onChange={event => onChange(from, event.target.value ? DateTime.fromISO(event.target.value, { zone: "Europe/London" }).endOf("day").toUTC().toISO()! : undefined)}
                className={cx(controlBase, "mt-1 w-full px-2 text-[13.5px]")} />
            </label>
          </div>
          <div className="mt-3 flex justify-end"><button type="button" onClick={() => setOpen(false)} className={cx("h-8 rounded-lg px-3 text-[13px] font-semibold text-admin-brand hover:bg-admin-brand-soft", focusRing)}>Done</button></div>
        </div>
      )}
    </div>
  );
}
