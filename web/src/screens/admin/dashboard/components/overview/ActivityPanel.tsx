/**
 * Job Activity & Trends: three views of the same dataset (every job scheduled in
 * the selected range).
 *   Trends        jobs per day/week/month, stacked by current status
 *   Distribution  which weekdays carry the work (radial)
 *   Heatmap       weekday x scheduled start hour (London)
 * Every view has the same numbers available as a data table.
 */
import React, { useMemo, useState } from "react";
import { Activity } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { NormalizedJob } from "../../types";
import { CHART, ChartLegend, ChartPanel, ChartTooltipBox, DonutChart, Heatmap, ChoiceChips, axisProps, type PanelState } from "../ds";
import { STATUS_LABEL, WEEKDAY_LABELS, activitySeries, bucketsFor, grainFor, kpisFor, workloadGrid, type Grain } from "../../utils/overviewData";
import { STATUS_COLOR, STATUS_ORDER } from "./helpers";
import { chartMotion } from "../../hooks/useMotion";

type View = "trends" | "distribution" | "heatmap";
type GrainChoice = "auto" | Grain;

const WEEKDAY_COLORS = [CHART.violet, CHART.blue, CHART.cyan, CHART.teal, CHART.amber, CHART.orange, CHART.coral];
const GRAIN_NOUN: Record<Grain, string> = { day: "day", week: "week", month: "month" };

export function ActivityPanel({ jobs, from, to, state, error, onRetry, updating }: {
  jobs: NormalizedJob[]; from: string; to: string; state: PanelState; error?: string; onRetry: () => void; updating: boolean;
}) {
  const [view, setView] = useState<View>("trends");
  const [grainChoice, setGrainChoice] = useState<GrainChoice>("auto");
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const grain: Grain = grainChoice === "auto" ? grainFor(from, to) : grainChoice;
  const buckets = useMemo(() => bucketsFor(from, to, grain), [from, to, grain]);
  const rows = useMemo(() => activitySeries(jobs, buckets, grain), [jobs, buckets, grain]);
  const kpis = useMemo(() => kpisFor(jobs), [jobs]);
  const workload = useMemo(() => workloadGrid(jobs), [jobs]);
  const present = STATUS_ORDER.filter(key => kpis.byStatus[key] > 0);
  const empty = state === "ready" && kpis.total === 0;

  const question = view === "trends" ? `How is our workload changing? Jobs per ${GRAIN_NOUN[grain]}, by current status.`
    : view === "distribution" ? "Which days carry the work? Jobs by scheduled weekday."
      : "When is the work scheduled? Jobs by weekday and start hour.";

  const weekdaySegments = WEEKDAY_LABELS.map((label, index) => ({ key: label, label, value: workload.byWeekday[index], color: WEEKDAY_COLORS[index] }));
  const busiest = workload.total ? weekdaySegments.reduce((best, segment) => (segment.value > best.value ? segment : best)) : null;
  const focus = activeDay ? weekdaySegments.find(segment => segment.key === activeDay) : null;
  const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

  const table = view === "trends"
    ? { caption: "Jobs per period by status", columns: ["Period", ...STATUS_ORDER.map(key => STATUS_LABEL[key]), "Total"], rows: rows.map(row => [row.label, ...STATUS_ORDER.map(key => row[key]), row.total]) }
    : view === "distribution"
      ? { caption: "Jobs by scheduled weekday", columns: ["Weekday", "Jobs"], rows: weekdaySegments.map(segment => [segment.label, segment.value]) }
      : { caption: "Jobs by weekday and scheduled start hour", columns: ["Weekday", ...workload.hours.map(hourLabel)], rows: WEEKDAY_LABELS.map((label, index) => [label, ...workload.counts[index]]) };

  return (
    <ChartPanel title="Job activity & trends" icon={<Activity />} question={question}
      state={empty ? "empty" : state} error={error} onRetry={onRetry} updating={updating} emptyText="No jobs are scheduled in this period." minHeight={320}
      actions={
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          <ChoiceChips label="Chart view" value={view} onChange={setView} options={[
            { value: "trends", label: "Trends" }, { value: "distribution", label: "Distribution" }, { value: "heatmap", label: "Activity heatmap" }]} />
          {view === "trends" && (
            <ChoiceChips label="Group by" value={grainChoice === "auto" ? grain : grainChoice} onChange={value => setGrainChoice(value)}
              options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }]} />
          )}
        </div>
      }
      legend={view === "trends" ? <ChartLegend items={present.map(key => ({ label: STATUS_LABEL[key], color: STATUS_COLOR[key] }))} /> : undefined}
      basis={view === "heatmap" ? "Scheduled start time in London, cancelled jobs excluded. This shows when work was booked for, not when it happened."
        : "Each job is counted on its scheduled day and shown with its current status (not the status it had on that day)."}
      table={table}>
      {view === "trends" && (
        <div className="h-full min-h-[270px]" aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barCategoryGap="24%">
              <defs>
                {STATUS_ORDER.map(key => (
                  <linearGradient key={key} id={`act-${key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={STATUS_COLOR[key]} stopOpacity={1} /><stop offset="100%" stopColor={STATUS_COLOR[key]} stopOpacity={0.62} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 5" />
              <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={16} />
              <YAxis {...axisProps} axisLine={false} allowDecimals={false} width={44} />
              <Tooltip cursor={{ fill: "rgba(114,92,255,0.08)", radius: 8 }} content={({ active, payload, label }) => active && payload?.length ? (
                <ChartTooltipBox title={String(label)} rows={[...STATUS_ORDER.filter(key => (payload[0].payload as Record<string, number>)[key] > 0).map(key => ({ label: STATUS_LABEL[key], value: String((payload[0].payload as Record<string, number>)[key]), color: STATUS_COLOR[key] })),
                  { label: "Total", value: String((payload[0].payload as { total: number }).total) }]} />
              ) : null} />
              {present.map((key, index) => <Bar key={key} dataKey={key} stackId="jobs" fill={`url(#act-${key})`} stroke={CHART.surface} strokeWidth={2} maxBarSize={28}
                radius={index === present.length - 1 ? [8, 8, 0, 0] : 0} {...chartMotion()} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {view === "distribution" && (
        <div className="grid items-center gap-6 px-2 py-2 md:grid-cols-[auto_minmax(0,1fr)]">
          <div className="mx-auto">
            <DonutChart segments={weekdaySegments} size={220} stroke={26} active={activeDay} onActive={setActiveDay}
              centerValue={focus ? focus.value : workload.total} centerLabel={focus ? `${focus.label} jobs` : "Jobs (not cancelled)"}
              label={`Jobs by weekday: ${weekdaySegments.map(segment => `${segment.label} ${segment.value}`).join(", ")}`} />
          </div>
          <div>
            {busiest && busiest.value > 0 && <p className="mb-3 text-[14px] text-admin-ink-2">Busiest day: <span className="font-bold text-admin-ink">{busiest.label}</span> with {busiest.value} of {workload.total} jobs.</p>}
            <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-4 md:grid-cols-2 xl:grid-cols-4">
              {weekdaySegments.map(segment => (
                <li key={segment.key} onMouseEnter={() => setActiveDay(segment.key)} onMouseLeave={() => setActiveDay(null)}
                  className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-[13.5px] hover:bg-admin-surface">
                  <span className="inline-flex items-center gap-2 text-admin-ink-2"><span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: segment.color }} />{segment.label}</span>
                  <span className="font-bold tabular-nums text-admin-ink">{segment.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {view === "heatmap" && (
        <div className="px-2 py-2">
          {workload.total === 0
            ? <p className="py-10 text-center text-[13.5px] text-admin-ink-2">No scheduled work (cancelled jobs excluded) in this period.</p>
            : <Heatmap caption="Jobs by weekday and scheduled start hour (London time)" unit="job"
              grid={{ rowLabels: [...WEEKDAY_LABELS], colLabels: workload.hours.map(hourLabel), values: workload.counts }} />}
        </div>
      )}
    </ChartPanel>
  );
}
