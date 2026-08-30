/** Ported from TMV-Chat-bot's dashboard/web/src/components/DateRangePicker.tsx. */
import React from "react";
import { Calendar } from "lucide-react";

interface Props {
  from?: string;
  to?: string;
  onChange: (from?: string, to?: string) => void;
}

export function DateRangePicker({ from, to, onChange }: Props) {
  const setPreset = (preset: "today" | "yesterday" | "7d" | "30d" | "all") => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    if (preset === "all") {
      onChange(undefined, undefined);
    } else if (preset === "today") {
      onChange(`${todayStr}T00:00:00.000Z`, `${todayStr}T23:59:59.999Z`);
    } else if (preset === "yesterday") {
      const y = new Date(now.getTime() - 86400000);
      const yStr = y.toISOString().slice(0, 10);
      onChange(`${yStr}T00:00:00.000Z`, `${yStr}T23:59:59.999Z`);
    } else if (preset === "7d") {
      const d7 = new Date(now.getTime() - 7 * 86400000);
      onChange(d7.toISOString(), now.toISOString());
    } else if (preset === "30d") {
      const d30 = new Date(now.getTime() - 30 * 86400000);
      onChange(d30.toISOString(), now.toISOString());
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <div className="flex items-center gap-1 bg-admin-surface p-1 rounded-lg border border-admin-line">
        <button
          onClick={() => setPreset("all")}
          className={`px-2.5 py-1 rounded-md font-medium transition ${
            !from && !to ? "bg-white text-admin-brand shadow-sm font-bold" : "text-admin-muted hover:text-admin-ink"
          }`}
        >
          All Time
        </button>
        <button onClick={() => setPreset("today")} className="px-2.5 py-1 rounded-md font-medium text-admin-muted hover:text-admin-ink transition">
          Today
        </button>
        <button onClick={() => setPreset("7d")} className="px-2.5 py-1 rounded-md font-medium text-admin-muted hover:text-admin-ink transition">
          7 Days
        </button>
        <button onClick={() => setPreset("30d")} className="px-2.5 py-1 rounded-md font-medium text-admin-muted hover:text-admin-ink transition">
          30 Days
        </button>
      </div>

      <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-lg border border-admin-line text-admin-ink">
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
