import React from "react";

interface Row {
  name?: React.ReactNode;
  value?: number | string | Array<number | string>;
  color?: string;
  dataKey?: string | number;
  payload?: unknown;
}

export interface ChartTooltipProps {
  active?: boolean;
  label?: React.ReactNode;
  payload?: Row[];
  /** Formats the heading (usually the x value). */
  labelFormatter?: (label: any) => React.ReactNode;
  /** Formats each value. */
  valueFormatter?: (value: number, row: Row) => React.ReactNode;
}

/**
 * Recharts `content` for <Tooltip>. Value leads (strong), series name follows,
 * keyed by a short line in the series colour.
 */
export function ChartTooltip({ active, label, payload, labelFormatter, valueFormatter }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[140px] rounded-xl border border-line bg-surface px-3 py-2.5 shadow-md">
      {label !== undefined && label !== "" && (
        <div className="mb-1.5 text-[12px] font-medium text-fg-subtle">{labelFormatter ? labelFormatter(label) : label}</div>
      )}
      <div className="space-y-1">
        {payload.map((row, i) => (
          <div key={String(row.dataKey ?? i)} className="flex items-center gap-2">
            <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: row.color }} aria-hidden />
            <span className="text-[14px] font-semibold tabular-nums text-fg">
              {typeof row.value === "number" && valueFormatter ? valueFormatter(row.value, row) : String(row.value ?? "—")}
            </span>
            <span className="text-[12px] text-fg-muted">{row.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
