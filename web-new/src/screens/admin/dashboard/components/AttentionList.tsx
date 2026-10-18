import React from "react";
import { ArrowRight } from "lucide-react";
import type { AttentionItem } from "../hooks/useAttention";
import { formatShortDateTime } from "../utils/format";
import { Action, Badge } from "./ds";

export const SEVERITY_TONE = { high: "danger", medium: "warning", low: "neutral" } as const;
export const SEVERITY_LABEL = { high: "High", medium: "Medium", low: "Low" } as const;

/** Itemised attention list (Alerts page and Overview drill-downs). */
export function AttentionList({ items, limit, onAction }: { items: AttentionItem[]; limit?: number; onAction: (item: AttentionItem) => void }) {
  const shown = limit ? items.slice(0, limit) : items;
  return (
    <ul className="divide-y divide-admin-line">
      {shown.map(item => (
        <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 md:flex-nowrap md:px-5">
          <Badge tone={SEVERITY_TONE[item.severity]}>{SEVERITY_LABEL[item.severity]}</Badge>
          <div className="min-w-0 flex-1 basis-[220px]">
            <p className="truncate text-[14.5px] font-semibold text-admin-ink">{item.title}{item.occurrences && item.occurrences > 1 ? <span className="font-normal text-admin-ink-2"> · {item.occurrences} times</span> : null}</p>
            <p className="truncate text-[13px] text-admin-ink-2">{item.detail}</p>
          </div>
          <span className="shrink-0 text-[13px] tabular-nums text-admin-ink-2">{item.at ? formatShortDateTime(item.at) : "Time not recorded"}</span>
          <Action size="sm" onClick={() => onAction(item)} className="shrink-0">{item.action.label}<ArrowRight aria-hidden className="h-3.5 w-3.5" /></Action>
        </li>
      ))}
    </ul>
  );
}

