/** Ported from TMV-Chat-bot's dashboard/web/src/components/DateRangePicker.tsx. */
import React from "react";
import { Calendar } from "lucide-react";

interface Props {
  from?: string;
  to?: string;
  onChange: (from?: string, to?: string) => void;
}

type Preset = "today" | "yesterday" | "7d" | "30d" | "all";

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function DateRangePicker({ from, to, onChange }: Props) {
  const rangeForPreset = (preset: Preset): { from?: string; to?: string } => {
    const now = new Date();
    const todayStr = isoDay(now);

    if (preset === "all") {
      return { from: undefined, to: undefined };
    }
    if (preset === "today") {
      return { from: `${todayStr}T00:00:00.000Z`, to: `${todayStr}T23:59:59.999Z` };
    }
    if (preset === "yesterday") {
      const y = new Date(now.getTime() - 86400000);
      const yStr = isoDay(y);
      return { from: `${yStr}T00:00:00.000Z`, to: `${yStr}T23:59:59.999Z` };
    }
    const days = preset === "7d" ? 7 : 30;
    const start = new Date(now.getTime() - days * 86400000);
    return { from: start.toISOString(), to: now.toISOString() };
  };

  const setPreset = (preset: Preset) => {
    const range = rangeForPreset(preset);
    onChange(range.from, range.to);
  };

  const isPresetActive = (preset: Preset): boolean => {
    if (preset === "all") return !from && !to;
    if (!from || !to) return false;
    const range = rangeForPreset(preset);
    return from.slice(0, 10) === range.from?.slice(0, 10) && to.slice(0, 10) === range.to?.slice(0, 10);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <div className="flex items-center gap-1 bg-admin-surface p-1 rounded-card border border-admin-line">
        <button
          onClick={() => setPreset("all")}
          className={`px-2.5 py-1 rounded-control font-medium transition ${
            isPresetActive("all") ? "bg-white text-admin-brand shadow-sm font-bold" : "text-admin-muted hover:text-admin-ink"
          }`}
        >
          All Time
        </button>
        {(["today", "7d", "30d"] as const).map(preset => (
          <button
            key={preset}
            onClick={() => setPreset(preset)}
            className={`px-2.5 py-1 rounded-control font-medium transition ${
              isPresetActive(preset) ? "bg-white text-admin-brand shadow-sm font-bold" : "text-admin-muted hover:text-admin-ink"
            }`}
          >
            {preset === "today" ? "Today" : preset === "7d" ? "7 Days" : "30 Days"}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-card border border-admin-line text-admin-ink">
        <Calendar className="w-3.5 h-3.5 text-admin-muted" />
        <input
          type="date"
          value={from ? from.slice(0, 10) : ""}
          onChange={e => onChange(e.target.value ? `${e.target.value}T00:00:00.000Z` : undefined, to)}
          className="bg-transparent border-0 text-xs focus:outline-none font-mono"
        />
        <span className="text-admin-muted">to</span>
        <input
          type="date"
          value={to ? to.slice(0, 10) : ""}
          onChange={e => onChange(from, e.target.value ? `${e.target.value}T23:59:59.999Z` : undefined)}
          className="bg-transparent border-0 text-xs focus:outline-none font-mono"
        />
      </div>
    </div>
  );
}
