import { DateTime } from "luxon";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DriverReport } from "../driverReport.types";

export function performanceChartData(trends: DriverReport["trends"]) {
  return trends.map(row => ({
    period: row.period,
    jobs: row.completedJobs,
    collected: row.paymentCards?.driverCollectionPence == null ? null : row.paymentCards.driverCollectionPence / 100,
    hours: row.completedJobs > 0 && row.workingMinutesUnknownJobs === row.completedJobs ? null : row.workingMinutesKnown / 60,
    missingHours: row.workingMinutesUnknownJobs,
  })).sort((a, b) => a.period.localeCompare(b.period));
}

const currency = (value: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);
const metrics = [
  { key: "jobs", title: "Completed Jobs", unit: "Jobs", color: "#1678b5", format: (value: number) => `${value} jobs` },
  { key: "collected", title: "Driver Collected", unit: "GBP", color: "#23956b", format: currency },
  { key: "hours", title: "Working Hours", unit: "Hours", color: "#a55b37", format: (value: number) => `${value.toFixed(2)} hours` },
] as const;

export function DriverPerformanceCharts({ trends }: { trends: DriverReport["trends"] }) {
  const data = performanceChartData(trends);
  return <section className="rpt-section" aria-label="Selected range performance charts">
    <h2>Daily performance</h2>
    <div className="rpt-performance-charts">{metrics.map(metric => <div className="rpt-performance-chart" key={metric.key}>
      <h3>{metric.title} <span>{metric.unit}</span></h3>
      {data.some(row => row[metric.key] !== null) ? <div className="rpt-chart" role="img" aria-label={`${metric.title} by date`}>
        <ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 12, right: 12, bottom: 8, left: 0 }}>
          <CartesianGrid vertical={false} stroke="#e6eaed" strokeDasharray="3 3" />
          <XAxis dataKey="period" tickFormatter={value => DateTime.fromISO(value).toFormat("dd LLL")} tick={{ fontSize: 13 }} minTickGap={28} axisLine={false} tickLine={false} />
          <YAxis width={70} allowDecimals={metric.key !== "jobs"} tick={{ fontSize: 13 }} axisLine={false} tickLine={false} tickFormatter={value => metric.key === "collected" ? `\u00a3${new Intl.NumberFormat("en-GB", { notation: "compact" }).format(value)}` : String(value)} />
          <Tooltip cursor={{ fill: "#f1f5f7" }} labelFormatter={value => DateTime.fromISO(String(value)).toFormat("ccc, dd LLL yyyy")} formatter={(value: number) => [metric.format(value), metric.title]} />
          <Bar dataKey={metric.key} name={metric.title} fill={metric.color} radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false} />
        </BarChart></ResponsiveContainer>
      </div> : <div className="rpt-empty">{data.length ? `${metric.title} unavailable for this range.` : "No jobs for this range."}</div>}
      {metric.key === "collected" && data.some(row => row.collected === null) && <p className="rpt-note">Dates with unknown collected amounts have no bar.</p>}
      {metric.key === "hours" && data.some(row => row.missingHours > 0) && <p className="rpt-note">Recorded hours only; some job timings are missing.</p>}
    </div>)}</div>
  </section>;
}
