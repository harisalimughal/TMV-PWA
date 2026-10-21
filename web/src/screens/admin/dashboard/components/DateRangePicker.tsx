/** Ported from TMV-Chat-bot's dashboard/web/src/components/DateRangePicker.tsx. */
import React from "react";
import { Calendar } from "lucide-react";
import { DateTime } from "luxon";
import { londonDateInput } from "../utils/reportNavigation";

interface Props {
  from?: string;
  to?: string;
  onChange: (from?: string, to?: string) => void;
  presets?: readonly Preset[];
}

type Preset = "today" | "tomorrow" | "yesterday" | "7d";

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function dateRangeForPreset(preset: Preset): { from?: string; to?: string } {
  const today = DateTime.now().setZone("Europe/London").startOf("day");
  const start = preset === "tomorrow" ? today.plus({ days: 1 }) : preset === "yesterday" ? today.minus({ days: 1 }) : preset === "7d" ? today.minus({ days: 6 }) : today;
  const end = preset === "7d" ? today.endOf("day") : start.endOf("day");
  return { from: start.toUTC().toISO()!, to: end.toUTC().toISO()! };
}

export const defaultDashboardDateRange = () => dateRangeForPreset("today");

export function DateRangePicker({ from, to, onChange, presets = ["today", "yesterday", "tomorrow", "7d"] }: Props) {
  const setPreset = (preset: Preset) => {
    const range = dateRangeForPreset(preset);
    onChange(range.from, range.to);
  };

  const isPresetActive = (preset: Preset): boolean => {
    if (!from || !to) return false;
    const range = dateRangeForPreset(preset);
    return londonDateInput(from) === londonDateInput(range.from) && londonDateInput(to) === londonDateInput(range.to);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <div className="flex flex-wrap items-center gap-1 bg-admin-surface p-1 rounded-card border border-admin-line">
        {presets.map(preset => (
          <button
            key={preset}
            type="button"
            aria-pressed={isPresetActive(preset)}
            onClick={() => setPreset(preset)}
            className={`px-2.5 py-1 min-h-[44px] sm:min-h-[32px] rounded-control transition ${
              isPresetActive(preset) ? "bg-admin-brand text-white shadow-sm font-bold" : "text-admin-muted hover:text-admin-ink font-medium"
            }`}
          >
            {{ today: "Today", yesterday: "Yesterday", tomorrow: "Tomorrow", "7d": "7 Days" }[preset]}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-card border border-admin-line text-admin-ink">
        <Calendar className="w-3.5 h-3.5 text-admin-muted" />
        <input
          type="date"
          aria-label="From date"
          value={londonDateInput(from)}
          onChange={e => onChange(e.target.value ? DateTime.fromISO(e.target.value, { zone: "Europe/London" }).startOf("day").toUTC().toISO()! : undefined, to)}
          className="bg-transparent border-0 text-xs focus:outline-none font-mono"
        />
        <span className="text-admin-muted">to</span>
        <input
          type="date"
          aria-label="To date"
          value={londonDateInput(to)}
          onChange={e => onChange(from, e.target.value ? DateTime.fromISO(e.target.value, { zone: "Europe/London" }).endOf("day").toUTC().toISO()! : undefined)}
          className="bg-transparent border-0 text-xs focus:outline-none font-mono"
        />
      </div>
    </div>
  );
}
