/**
 * Daily performance trends for one driver (Summary tab).
 */
import React from "react";
import { DateTime } from "luxon";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DriverReport } from "../driverReport.types";
import { formatMinutes } from "../utils/format";
import { chartMotion } from "../hooks/useMotion";
import { CHART, ChartPanel, ChartTooltipBox, axisProps } from "./ds";

export function performanceChartData(trends: DriverReport["trends"]) {
  return trends.map(row => ({
    period: row.period,
    jobs: row.completedJobs,
    hours: row.completedJobs > 0 && row.workingMinutesUnknownJobs === row.completedJobs ? null : row.workingMinutesKnown / 60,
    missingHours: row.workingMinutesUnknownJobs
  })).sort((a, b) => a.period.localeCompare(b.period));
}

const periodLabel = (value: string) => {
  const at = DateTime.fromISO(value);
  return at.isValid ? at.toFormat(value.length === 7 ? "LLL yyyy" : "d LLL") : value;
};

/**
 * Two trends for the driver report summary: completed jobs and recorded working time.
 * Periods with unknown working time draw no bar and are named in the coverage line;
 * missing data is never drawn as zero.
 */
export function DriverPerformanceCharts({ trends }: { trends: DriverReport["trends"] }) {
  const data = performanceChartData(trends).map(row => ({ ...row, label: periodLabel(row.period) }));
  const state = data.length ? "ready" as const : "empty" as const;
  const missingTime = data.reduce((sum, row) => sum + row.missingHours, 0);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartPanel title="Completed jobs" question="Completed jobs per period." state={state} minHeight={200} emptyText="No completed jobs in this range."
        table={{ caption: "Completed jobs per period", columns: ["Period", "Completed jobs"], rows: data.map(row => [row.label, row.jobs]) }}>
        <div className="h-[200px]" aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={16} />
              <YAxis {...axisProps} axisLine={false} allowDecimals={false} width={40} />
              <Tooltip cursor={{ fill: "rgba(49,94,237,0.06)" }} content={({ active, payload, label }) => active && payload?.length
                ? <ChartTooltipBox title={String(label)} rows={[{ label: "Completed jobs", value: String((payload[0].payload as { jobs: number }).jobs), color: CHART.blue }]} /> : null} />
              <Bar dataKey="jobs" fill={CHART.blue} radius={[4, 4, 0, 0]} maxBarSize={24} {...chartMotion()} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartPanel>
      <ChartPanel title="Working time" question="Recorded working time per period." state={state} minHeight={200} emptyText="No completed jobs in this range."
        coverage={missingTime ? <span className="text-admin-status-amber">{missingTime} job{missingTime === 1 ? "" : "s"} had no recorded times; periods show known time only.</span> : undefined}
        basis="Recorded arrival to finish."
        table={{ caption: "Working time per period", columns: ["Period", "Working time", "Jobs without times"], rows: data.map(row => [row.label, row.hours === null ? "Not recorded" : formatMinutes(Math.round(row.hours * 60)), row.missingHours]) }}>
        <div className="h-[200px]" aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={16} />
              <YAxis {...axisProps} axisLine={false} width={40} tickFormatter={value => `${value}h`} />
              <Tooltip cursor={{ fill: "rgba(13,148,136,0.06)" }} content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as { hours: number | null; missingHours: number };
                return <ChartTooltipBox title={String(label)} rows={[{ label: "Working time", value: row.hours === null ? "Not recorded" : formatMinutes(Math.round(row.hours * 60)), color: CHART.teal },
                  ...(row.missingHours ? [{ label: "Jobs without times", value: String(row.missingHours) }] : [])]} />;
              }} />
              <Bar dataKey="hours" fill={CHART.teal} radius={[4, 4, 0, 0]} maxBarSize={24} {...chartMotion()} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartPanel>
    </div>
  );
}
