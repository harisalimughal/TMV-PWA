/**
 * Chart building blocks for the admin dashboard (TMV Aurora).
 *
 * Colours are CSS variables (see adminTheme.css) so every chart follows the active
 * theme: Aurora Light uses deeper hues that hold >= 3:1 on white, Midnight Aurora
 * uses luminous ones. Categorical order is fixed -- violet, blue, teal, amber,
 * coral -- and colour follows the entity, never its rank. Text never wears a series
 * colour: identity comes from the swatch beside it.
 *
 * Every visual here is SVG, takes real values only and exposes the same numbers as
 * text (aria-label, legend or the ChartPanel data table).
 */
import React, { useId } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, RefreshCw, Table2 } from "lucide-react";
import { cx } from "../../../../../ui/cx";
import { Action, focusRing } from "./primitives";
import { useCountUp, useMounted } from "../../hooks/useMotion";

/** A number that counts up on mount (final value immediately under reduced motion). */
export function CountUp({ value, format }: { value: number; format?: (value: number) => string }) {
  const shown = useCountUp(value);
  const rounded = Number.isInteger(value) ? Math.round(shown) : shown;
  return <>{format ? format(rounded) : String(rounded)}</>;
}

export const CHART = {
  violet: "var(--chart-violet)",
  blue: "var(--chart-blue)",
  cyan: "var(--chart-cyan)",
  teal: "var(--chart-teal)",
  amber: "var(--chart-amber)",
  coral: "var(--chart-coral)",
  /** @deprecated alias for coral, kept for existing imports. */
  rose: "var(--chart-coral)",
  orange: "var(--chart-orange)",
  /** De-emphasis / comparison series. */
  slate: "var(--chart-slate)",
  grid: "var(--chart-grid)",
  axis: "var(--chart-axis)",
  /** Surface colour, used for separators between stacked marks. */
  surface: "var(--chart-surface)"
} as const;

export const axisProps = { tickLine: false, axisLine: { stroke: CHART.grid }, tick: { fill: CHART.axis, fontSize: 12 } } as const;

/* ------------------------------------------------------------- sparkline ---- */

/** A small trend line from real values; nulls are gaps, never zeros. */
export function Sparkline({ values, label, color = CHART.blue, width = 96, height = 30 }: { values: Array<number | null>; label: string; color?: string; width?: number; height?: number }) {
  const gradient = useId();
  const known = values.filter((value): value is number => value !== null);
  if (values.length < 2 || known.length < 2) return null;
  const pad = 3;
  const max = Math.max(...known), min = Math.min(0, ...known);
  const x = (index: number) => pad + (index / (values.length - 1)) * (width - pad * 2);
  const y = (value: number) => height - pad - ((value - min) / (max - min || 1)) * (height - pad * 2);
  let path = "", started = false;
  values.forEach((value, index) => {
    if (value === null) { started = false; return; }
    path += `${started ? "L" : "M"}${x(index).toFixed(1)},${y(value).toFixed(1)} `;
    started = true;
  });
  const lastIndex = values.map((value, index) => value === null ? -1 : index).reduce((a, b) => Math.max(a, b), -1);
  const area = known.length === values.length ? `${path}L${x(values.length - 1)},${height - pad} L${x(0)},${height - pad} Z` : "";
  return (
    <svg role="img" aria-label={label} width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ maxWidth: "100%", height: "auto" }} className="shrink-0 overflow-visible">
      <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.3} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
      {area && <path d={area} fill={`url(#${gradient})`} />}
      <path className="tmv-spark-line" d={path} fill="none" stroke={color} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" pathLength={400} style={{ ["--len" as string]: 400 }} />
      {lastIndex >= 0 && <circle className="tmv-pop" cx={x(lastIndex)} cy={y(values[lastIndex] as number)} r={3.5} fill={color} stroke={CHART.surface} strokeWidth={2} />}
    </svg>
  );
}

/* ----------------------------------------------------------- radial ring ---- */

/**
 * One value on a ring with rounded ends. `value` is a 0..1 fraction or null (no
 * ring, just the track -- unknown is never drawn as zero).
 */
export function RadialProgress({ value, size = 84, stroke = 10, color = CHART.violet, label, children, className }: {
  value: number | null; size?: number; stroke?: number; color?: string; label: string; children?: React.ReactNode; className?: string;
}) {
  const id = useId();
  const mounted = useMounted();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const fraction = value === null ? 0 : Math.min(1, Math.max(0, value));
  const length = fraction === 0 || !mounted ? 0.001 : Math.max(0.001, fraction * c);
  return (
    <div role="img" aria-label={label} className={cx("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
        <defs>
          <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor={color} /><stop offset="100%" stopColor={color} stopOpacity={0.55} /></linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeOpacity={0.14} strokeWidth={stroke} />
        {fraction > 0 && (
          <circle className="tmv-ring-arc" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${id}-g)`} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={`${length} ${c}`} />
        )}
      </svg>
      {children && <div className="absolute inset-0 grid place-items-center text-center">{children}</div>}
    </div>
  );
}

/* ----------------------------------------------------------------- donut ---- */

export interface DonutSegment { key: string; label: string; value: number; color: string }

/**
 * Multi-segment ring for composition (job status, payment mix). Segments get rounded
 * ends and a small gap; hovering or focusing a segment (or its breakdown row, via
 * `active`/`onActive`) dims the rest. The centre shows the total or the active
 * segment. A zero total draws only the track.
 */
export function DonutChart({ segments, size = 232, stroke = 26, active, onActive, centerValue, centerLabel, label, className }: {
  segments: DonutSegment[]; size?: number; stroke?: number; active?: string | null; onActive?: (key: string | null) => void;
  centerValue: React.ReactNode; centerLabel: React.ReactNode; label: string; className?: string;
}) {
  const id = useId();
  const mounted = useMounted();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const present = segments.filter(segment => segment.value > 0);
  const total = present.reduce((sum, segment) => sum + segment.value, 0);
  const gap = present.length > 1 ? 7 : 0;
  let cursor = 0;
  const arcs = present.map(segment => {
    const share = (segment.value / total) * c;
    const start = cursor;
    cursor += share;
    // Round caps extend by stroke/2 at both ends: shorten the visible dash to match.
    const length = present.length === 1 ? c : Math.max(0.01, share - stroke - gap);
    const offset = present.length === 1 ? 0 : -(start + (stroke + gap) / 2);
    return { segment, length, offset };
  });
  return (
    <div role="img" aria-label={label} className={cx("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <defs>
          {present.map(segment => (
            <linearGradient key={segment.key} id={`${id}-${segment.key}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={segment.color} /><stop offset="100%" stopColor={segment.color} stopOpacity={0.7} />
            </linearGradient>
          ))}
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--fg) / 0.07)" strokeWidth={stroke} />
        {arcs.map(({ segment, length, offset }) => {
          const dim = active && active !== segment.key;
          return (
            <circle key={segment.key} className="tmv-ring-arc" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${id}-${segment.key})`}
              strokeWidth={active === segment.key ? stroke + 4 : stroke} strokeLinecap={present.length === 1 ? "butt" : "round"}
              strokeDasharray={`${mounted ? length : 0.001} ${c}`} strokeDashoffset={offset} opacity={dim ? 0.32 : 1}
              onMouseEnter={() => onActive?.(segment.key)} onMouseLeave={() => onActive?.(null)} style={{ cursor: onActive ? "pointer" : undefined }}>
              <title>{`${segment.label}: ${segment.value}`}</title>
            </circle>
          );
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-[34px] font-extrabold leading-9 tracking-tight text-admin-ink tabular-nums">{centerValue}</div>
          <div className="mt-0.5 text-[12.5px] font-medium text-admin-ink-2">{centerLabel}</div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- gauge ---- */

/** Half-ring gauge for one proportion, e.g. share of tracked vehicles with a fresh signal. */
export function SemiGauge({ value, color = CHART.teal, label, children, width = 200 }: { value: number | null; color?: string; label: string; children?: React.ReactNode; width?: number }) {
  const id = useId();
  const mounted = useMounted();
  const stroke = 16;
  const r = (width - stroke) / 2;
  const half = Math.PI * r;
  const fraction = value === null ? 0 : Math.min(1, Math.max(0, value));
  const height = r + stroke / 2 + 2;
  const d = `M ${stroke / 2} ${r + stroke / 2} A ${r} ${r} 0 0 1 ${width - stroke / 2} ${r + stroke / 2}`;
  return (
    <div role="img" aria-label={label} className="relative mx-auto" style={{ width, height }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
        <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor={color} stopOpacity={0.6} /><stop offset="100%" stopColor={color} /></linearGradient></defs>
        <path d={d} fill="none" stroke={color} strokeOpacity={0.14} strokeWidth={stroke} strokeLinecap="round" />
        {fraction > 0 && <path className="tmv-ring-arc" d={d} fill="none" stroke={`url(#${id})`} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${mounted ? fraction * half : 0.001} ${half}`} />}
      </svg>
      {children && <div className="absolute inset-x-0 bottom-0 text-center">{children}</div>}
    </div>
  );
}

/* --------------------------------------------------------------- heatmap ---- */

export interface HeatmapGrid {
  rowLabels: string[];
  colLabels: string[];
  /** values[row][col]; counts of real records. */
  values: number[][];
}

/** Workload intensity grid (violet to blue). A real table so values are readable
 *  by keyboard and screen readers; colour is reinforced by the number in the cell. */
export function Heatmap({ grid, caption, unit }: { grid: HeatmapGrid; caption: string; unit: string }) {
  const max = Math.max(1, ...grid.values.flat());
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-separate border-spacing-1 text-center text-[12px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr><td />{grid.colLabels.map(col => <th key={col} scope="col" className="pb-0.5 font-medium text-admin-ink-2 tabular-nums">{col}</th>)}</tr>
        </thead>
        <tbody>
          {grid.rowLabels.map((row, r) => (
            <tr key={row}>
              <th scope="row" className="pr-1 text-left font-medium text-admin-ink-2">{row}</th>
              {grid.values[r].map((value, c) => {
                const t = value / max;
                return (
                  <td key={c} title={`${row}, ${grid.colLabels[c]}: ${value} ${unit}${value === 1 ? "" : "s"}`}
                    className="tmv-heat-cell h-8 rounded-md font-semibold tabular-nums"
                    style={{ ["--i" as string]: r * 7 + c,
                      background: value === 0 ? "rgb(var(--surface-sunken))" : `color-mix(in srgb, var(--chart-violet) ${Math.round(18 + t * 72)}%, var(--chart-blue) ${Math.round(t * 30)}%)`,
                      color: t > 0.55 ? "var(--chart-on-mark)" : "rgb(var(--fg))"
                    }}>
                    {value > 0 ? value : <span className="sr-only">0</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------------------------------------------------------- KPI card ---- */

export interface Comparison {
  /** e.g. "+3 vs previous 7 days". */
  text: string;
  direction: "up" | "down" | "flat";
  /** Only "good"/"bad" when the direction has a clear business meaning. */
  meaning: "good" | "bad" | "neutral";
}

export type KpiAccent = "violet" | "blue" | "teal" | "coral" | "amber";
const ACCENT_ICON: Record<KpiAccent, string> = {
  violet: "bg-[image:var(--grad-violet)]", blue: "bg-[image:var(--grad-blue)]", teal: "bg-[image:var(--grad-teal)]", coral: "bg-[image:var(--grad-coral)]", amber: "bg-[image:var(--grad-coral)]"
};

export function KpiCard({ label, value, detail, icon, spark, comparison, onOpen, openLabel, loading, tone = "default", accent = "violet", visual, live }: {
  label: string; value: React.ReactNode; detail?: React.ReactNode; icon: React.ReactNode;
  spark?: { values: Array<number | null>; label: string } | null; comparison?: Comparison | null;
  onOpen?: () => void; openLabel?: string; loading?: boolean; tone?: "default" | "attention";
  accent?: KpiAccent;
  /** A ring / mini chart shown beside the value. */
  visual?: React.ReactNode;
  /** Shows an animated live dot (only for data that is actually live). */
  live?: boolean;
}) {
  const DeltaIcon = comparison?.direction === "up" ? ArrowUpRight : comparison?.direction === "down" ? ArrowDownRight : Minus;
  const sparkColor = accent === "teal" ? CHART.teal : accent === "coral" || accent === "amber" ? CHART.coral : accent === "blue" ? CHART.blue : CHART.violet;
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="flex items-center gap-2 text-[13px] font-semibold text-admin-ink-2">
          {label}
          {live && <span aria-hidden className="tmv-live-dot h-2 w-2 rounded-full bg-admin-status-green" />}
        </span>
        <span aria-hidden className={cx("tmv-tile grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white [&>svg]:relative [&>svg]:z-10 [&>svg]:h-5 [&>svg]:w-5", ACCENT_ICON[accent])}>{icon}</span>
      </div>
      {loading ? (
        <span className="mt-3 block h-10 w-28 rounded-xl tmv-shimmer motion-reduce:animate-none" aria-hidden />
      ) : (
        // Top-aligned: with items-end the value dropped to the ring's baseline on cards
        // without a comparison chip, so KPI values sat at different heights across a row.
        <div className="mt-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className={cx("block text-[32px] font-extrabold leading-[40px] tracking-tight tabular-nums", tone === "attention" ? "text-admin-status-amber" : "text-admin-ink")}>{value}</span>
            {comparison && (
              <span className={cx("mt-1 inline-flex items-start gap-1 rounded-xl px-2 py-0.5 text-[12.5px] font-semibold leading-[18px]",
                comparison.meaning === "good" ? "bg-admin-status-green-bg text-admin-status-green" : comparison.meaning === "bad" ? "bg-admin-status-red-bg text-admin-status-red" : "bg-admin-surface text-admin-ink-2")}>
                <DeltaIcon aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />{comparison.text}
              </span>
            )}
          </div>
          {visual && <div className="shrink-0">{visual}</div>}
        </div>
      )}
      {!loading && !visual && spark && <div className="mt-3"><Sparkline values={spark.values} label={spark.label} color={sparkColor} width={220} height={36} /></div>}
      {!loading && detail && <span className="mt-2 block text-[12.5px] leading-[18px] text-admin-ink-2">{detail}</span>}
    </>
  );
  const shell = cx("tmv-gloss flex h-full w-full flex-col items-stretch p-5 text-left", `tmv-accent-${accent}`);
  return onOpen ? (
    <button type="button" onClick={onOpen} aria-label={openLabel ? `${label}. ${openLabel}` : undefined} className={cx(shell, "tmv-lift", focusRing)}>{body}</button>
  ) : <div className={shell}>{body}</div>;
}

/* ------------------------------------------------------------------ legend ---- */

export interface LegendItem { label: string; color: string; value?: React.ReactNode; dashed?: boolean }

/** Always visible; values are text in ink colours, identity is the swatch. */
export function ChartLegend({ items, className }: { items: LegendItem[]; className?: string }) {
  return (
    <ul className={cx("flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-admin-ink-2", className)}>
      {items.map(item => (
        <li key={item.label} className="inline-flex items-center gap-1.5">
          {item.dashed
            ? <svg aria-hidden width="14" height="6"><line x1="0" y1="3" x2="14" y2="3" stroke={item.color} strokeWidth="2" strokeDasharray="4 3" /></svg>
            : <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />}
          <span>{item.label}</span>
          {item.value !== undefined && <span className="font-semibold tabular-nums text-admin-ink">{item.value}</span>}
        </li>
      ))}
    </ul>
  );
}

/* ----------------------------------------------------------------- tooltip ---- */

export interface TooltipRow { label: string; value: string; color?: string }

export function ChartTooltipBox({ title, rows, note }: { title: string; rows: TooltipRow[]; note?: string }) {
  return (
    <div className="min-w-[170px] rounded-2xl border border-admin-line bg-admin-surface px-3.5 py-2.5 text-[12.5px] shadow-[var(--admin-shadow-lg)]">
      <p className="mb-1 font-semibold text-admin-ink">{title}</p>
      <ul className="space-y-0.5">
        {rows.map(row => (
          <li key={row.label} className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 text-admin-ink-2">{row.color && <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: row.color }} />}{row.label}</span>
            <span className="font-semibold tabular-nums text-admin-ink">{row.value}</span>
          </li>
        ))}
      </ul>
      {note && <p className="mt-1.5 max-w-[240px] text-[12px] leading-4 text-admin-muted">{note}</p>}
    </div>
  );
}

/* ------------------------------------------------------------- chart panel ---- */

export interface TableAlternative { caption: string; columns: string[]; rows: Array<Array<React.ReactNode>>; numericFrom?: number }

export type PanelState = "loading" | "error" | "empty" | "ready";

/**
 * A chart panel that answers one question. Every state has its own body so a
 * failing chart never takes the page down, and the table view carries the same
 * numbers for keyboard, screen-reader and print users.
 */
export function ChartPanel({ title, question, basis, actions, legend, coverage, state, error, onRetry, emptyText, updating, table, children, className, minHeight = 260, icon }: {
  title: string; question: string; basis?: React.ReactNode; actions?: React.ReactNode; legend?: React.ReactNode; coverage?: React.ReactNode;
  state: PanelState; error?: string; onRetry?: () => void; emptyText?: string; updating?: boolean; table?: TableAlternative;
  children?: React.ReactNode; className?: string; minHeight?: number; icon?: React.ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={`${id}-title`} aria-busy={state === "loading" || updating || undefined} className={cx("tmv-panel flex min-w-0 flex-col", className)}>
      <header className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 sm:px-6 sm:pt-5">
        <div className="flex min-w-0 items-start gap-3">
          {icon && <span aria-hidden className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-admin-brand-soft text-admin-brand [&>svg]:h-[18px] [&>svg]:w-[18px]">{icon}</span>}
          <div className="min-w-0">
            <h2 id={`${id}-title`} className="text-[17px] font-bold leading-6 tracking-tight text-admin-ink">{title}</h2>
            <p className="text-[13px] text-admin-ink-2">{question}</p>
          </div>
        </div>
        {/* min-w-0 + max-w-full: a wide control group (view chips) scrolls inside the card on phones instead of pushing the page sideways. */}
        <div className="flex min-w-0 max-w-full items-center gap-2">
          {updating && <span role="status" className="inline-flex items-center gap-1 text-[12px] text-admin-muted"><RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />Updating</span>}
          {actions}
        </div>
      </header>
      {legend && state === "ready" && <div className="px-6 pt-3">{legend}</div>}
      <div className="flex flex-1 flex-col px-4 pb-2 pt-3 [&>*]:flex-1" style={{ minHeight }}>
        {state === "loading" ? <ChartSkeleton height={minHeight - 20} />
          : state === "error" ? (
            <div role="alert" className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
              <p className="text-[14px] font-semibold text-admin-ink">This chart couldn't load</p>
              {error && <p className="max-w-sm text-[13px] text-admin-ink-2">{error}</p>}
              {onRetry && <Action size="sm" icon={<RefreshCw />} onClick={onRetry}>Try again</Action>}
            </div>
          ) : state === "empty" ? (
            <div className="flex h-full items-center justify-center py-10 text-center text-[13.5px] text-admin-ink-2">{emptyText || "No data for this range."}</div>
          ) : children}
      </div>
      {(coverage || basis) && state === "ready" && (
        <div className="space-y-1 border-t border-admin-line px-6 py-3 text-[12.5px] leading-[18px] text-admin-ink-2">
          {coverage && <div>{coverage}</div>}
          {basis && <div className="text-admin-muted">{basis}</div>}
        </div>
      )}
      {table && state === "ready" && <TableView table={table} />}
    </section>
  );
}

export function ChartSkeleton({ height }: { height: number }) {
  return (
    <div role="status" aria-label="Loading chart" className="flex items-end gap-2 px-3" style={{ height }}>
      {[42, 64, 38, 72, 55, 80, 48, 66].map((h, i) => <span key={i} aria-hidden className="tmv-shimmer flex-1 rounded-t-lg motion-reduce:animate-none" style={{ height: `${h}%` }} />)}
    </div>
  );
}

function TableView({ table }: { table: TableAlternative }) {
  const numericFrom = table.numericFrom ?? 1;
  return (
    <details className="group border-t border-admin-line">
      <summary className={cx("flex cursor-pointer list-none items-center gap-1.5 px-6 py-3 text-[13px] font-semibold text-admin-brand hover:underline", focusRing)}>
        <Table2 aria-hidden className="h-4 w-4" /><span className="group-open:hidden">Show data table</span><span className="hidden group-open:inline">Hide data table</span>
      </summary>
      <div className="relative max-h-72 overflow-auto px-6 pb-4">
        <table className="w-full text-[13px]">
          <caption className="sr-only">{table.caption}</caption>
          <thead><tr className="border-b border-admin-line text-left text-admin-ink-2">{table.columns.map((column, index) => <th key={column} scope="col" className={cx("py-1.5 pr-3 font-semibold", index >= numericFrom && "text-right")}>{column}</th>)}</tr></thead>
          <tbody className="divide-y divide-admin-line">
            {table.rows.map((row, r) => <tr key={r}>{row.map((cell, index) => index === 0 ? <th key={index} scope="row" className="py-1.5 pr-3 text-left font-medium text-admin-ink">{cell}</th> : <td key={index} className={cx("py-1.5 pr-3 tabular-nums", index >= numericFrom && "text-right")}>{cell}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
    </details>
  );
}
