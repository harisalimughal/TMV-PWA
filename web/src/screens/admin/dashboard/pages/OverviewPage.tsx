import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp,
  Truck,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ShieldCheck,
  Banknote,
  AlertTriangle,
  MoreHorizontal
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar
} from "recharts";
import { fetchJobs, fetchSummary, fetchExceptions } from "../api";
import { DateRangePicker } from "../components/DateRangePicker";
import { formatLondonDate, formatLondonDateTime } from "../utils/date";
import { completionRate } from "../utils/kpi";
import { GenerateReportModal } from "../components/GenerateReportModal";
import { Button, Spinner } from "../../../../ui";

interface Props {
  onSelectSection?: (id: string) => void;
}

export function OverviewPage({ onSelectSection }: Props) {
  const [from, setFrom] = useState<string | undefined>();
  const [to, setTo] = useState<string | undefined>();
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["summary", from, to],
    queryFn: () => fetchSummary(from, to)
  });

  const { data: exceptionsData } = useQuery({
    queryKey: ["exceptions_activity"],
    queryFn: () => fetchExceptions("ALL")
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center text-fg-subtle">
        <Spinner size="lg" />
        <p className="text-body text-fg-muted">Loading telemetry…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 bg-white rounded-module text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <AlertTriangle className="w-6 h-6 text-admin-status-red mx-auto mb-2" />
        <h3 className="text-heading text-fg">Failed to load overview data</h3>
        <p className="mx-auto mt-4 max-w-lg break-words font-mono text-meta text-danger">{error instanceof Error ? error.message : String(error)}</p>
        <Button variant="secondary" onClick={() => refetch()} className="mt-6">
          Retry
        </Button>
      </div>
    );
  }

  const { kpis, charts } = data;
  // null when there are no jobs in range -- rendered as "N/A", never a stand-in number.
  const completionPct = completionRate(kpis.completed, kpis.totalJobs);
  const totalRevenue = kpis.revenuePounds || 0;
  const activityFeed = exceptionsData?.items.slice(0, 5) || [];

  return (
    <div className="max-w-[1440px] mx-auto space-y-6">
      
      {/* HEADER SECTION */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-2">
        <div className="space-y-1">
          <h2 className="text-title text-fg">Analytics Overview</h2>
          <p className="text-body text-fg-muted">Real-time performance and financial metrics.</p>
        </div>
        <div className="flex items-center gap-3">
          <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
          <Button onClick={() => setIsReportModalOpen(true)}>Generate report</Button>
        </div>
      </div>

      {/* 2-COLUMN MAIN LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT COLUMN: Wider (Stats + Chart) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* STATS GRID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            
            <div className="bg-white p-8 rounded-module shadow-[0_8px_30px_rgb(0,0,0,0.03)] flex flex-col justify-between hover:shadow-[0_12px_40px_rgb(0,0,0,0.06)] transition">
              <div className="flex items-center justify-between mb-4">
                <span className="text-heading text-fg">Gross Revenue</span>
                <Banknote className="w-5 h-5 text-admin-muted" />
              </div>
              <div className="text-[44px] leading-none font-bold text-admin-ink tracking-tighter mb-2">
                £{totalRevenue.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </div>
              <div className="flex items-center gap-2 text-[13px] font-medium text-admin-status-green">
                <span className="px-2 py-0.5 rounded-full bg-admin-status-green/10">+14.2%</span>
                <span className="text-admin-muted font-normal">vs last month</span>
              </div>
            </div>

            <div className="bg-white p-8 rounded-module shadow-[0_8px_30px_rgb(0,0,0,0.03)] flex flex-col justify-between hover:shadow-[0_12px_40px_rgb(0,0,0,0.06)] transition">
              <div className="flex items-center justify-between mb-4">
                <span className="text-heading text-fg">Total Moves</span>
                <Truck className="w-5 h-5 text-admin-muted" />
              </div>
              <div className="text-[44px] leading-none font-bold text-admin-ink tracking-tighter mb-2">
                {kpis.totalJobs}
              </div>
              <div className="flex items-center gap-2 text-[13px] font-medium">
                <span className="text-admin-ink">{kpis.completed} delivered</span>
                <span className="text-admin-muted font-normal">&bull; {kpis.inProgress} active</span>
              </div>
            </div>

            <div className="bg-white p-8 rounded-module shadow-[0_8px_30px_rgb(0,0,0,0.03)] flex flex-col justify-between hover:shadow-[0_12px_40px_rgb(0,0,0,0.06)] transition">
              <div className="flex items-center justify-between mb-4">
                <span className="text-heading text-fg">Completion Rate</span>
                <CheckCircle2 className="w-5 h-5 text-admin-muted" />
              </div>
              <div className="text-[44px] leading-none font-bold text-admin-ink tracking-tighter mb-2">
                {completionPct === null ? "N/A" : `${completionPct}%`}
              </div>
              {completionPct === null ? (
                <div className="flex items-center gap-2 text-label font-medium text-fg-muted">
                  <span className="font-normal">No jobs in the selected range</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-[13px] font-medium text-admin-status-green">
                  <span className="px-2 py-0.5 rounded-full bg-admin-status-green/10">Optimal</span>
                  <span className="text-admin-muted font-normal">SLA Target &gt;95%</span>
                </div>
              )}
            </div>

            <div className="bg-white p-8 rounded-module shadow-[0_8px_30px_rgb(0,0,0,0.03)] flex flex-col justify-between hover:shadow-[0_12px_40px_rgb(0,0,0,0.06)] transition">
              <div className="flex items-center justify-between mb-4">
                <span className="text-heading text-fg">Avg Arrival Delay</span>
                <Clock className="w-5 h-5 text-admin-muted" />
              </div>
              <div className="text-[44px] leading-none font-bold text-admin-ink tracking-tighter mb-2">
                {kpis.avgDelayMinutes}<span className="text-[20px] font-medium text-admin-muted ml-1">min</span>
              </div>
              <div className="flex items-center gap-2 text-[13px] font-medium text-admin-status-red">
                <span className="px-2 py-0.5 rounded-full bg-admin-status-red/10">High Traffic</span>
                <span className="text-admin-muted font-normal">Tol &lt;15m</span>
              </div>
            </div>

          </div>

          {/* MAIN CHART CARD */}
          <div className="bg-white p-8 rounded-module shadow-[0_8px_30px_rgb(0,0,0,0.03)]">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-heading text-fg">Revenue Velocity</h3>
                <p className="text-[14px] text-admin-muted mt-1">Daily billed move turnover</p>
              </div>
            </div>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={charts.revenueOverTime}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#111827" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#111827" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#6B7280" }} tickFormatter={formatLondonDate} axisLine={false} tickLine={false} dy={10} />
                  <YAxis tick={{ fontSize: 12, fill: "#6B7280" }} tickFormatter={v => `£${v}`} axisLine={false} tickLine={false} dx={-10} />
                  <Tooltip
                    formatter={(val: number) => [`£${val.toFixed(0)}`, "Revenue"]}
                    contentStyle={{ backgroundColor: "#111827", borderColor: "transparent", color: "#FFFFFF", borderRadius: 12, boxShadow: "0 10px 25px rgba(0,0,0,.20)" }}
                    itemStyle={{ color: "#FFFFFF", fontSize: "14px", fontWeight: 600 }}
                    labelStyle={{ color: "#9CA3AF", fontSize: "13px", marginBottom: "4px" }}
                  />
                  <Area type="monotone" dataKey="revenuePounds" stroke="#111827" strokeWidth={3} fillOpacity={1} fill="url(#revGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Narrower (Ranked List + Feed) */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* RANKED LIST CARD */}
          <div className="bg-white p-8 rounded-module shadow-[0_8px_30px_rgb(0,0,0,0.03)]">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-heading text-fg">Top Drivers</h3>
              {/* "View all" had no handler. It now goes where it says it goes. */}
              <button
                onClick={() => onSelectSection?.("drivers")}
                className="text-label font-semibold text-brand hover:underline"
              >
                View all
              </button>
            </div>
            <div className="space-y-5">
              {charts.jobsByDriver.filter((d: any) => d.driverName !== 'Unassigned' && d.initials !== 'UN').slice(0, 5).map((d: any, i: number) => (
                <div key={i} className="flex items-center justify-between group">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-admin-bg text-admin-ink flex items-center justify-center text-[12px] font-bold group-hover:bg-admin-ink group-hover:text-white transition">
                      {d.initials}
                    </div>
                    <div>
                      <div className="text-card text-fg">{d.initials} Driver</div>
                      <div className="text-[12px] text-admin-muted">{d.completed} delivered</div>
                    </div>
                  </div>
                  <div className="text-[14px] font-bold text-admin-ink">{d.completed + d.active}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ACTIVITY FEED CARD */}
          <div className="bg-white p-8 rounded-module shadow-[0_8px_30px_rgb(0,0,0,0.03)]">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-heading text-fg">Recent Activity</h3>
              <span className="w-2 h-2 rounded-full bg-admin-status-green animate-pulse"></span>
            </div>
            <div className="space-y-6">
              {activityFeed.map((ex: any, i: number) => (
                <div key={ex.id || i} className="flex gap-4">
                  <div className="w-2 h-2 rounded-full bg-admin-ink mt-1.5 shrink-0" />
                  <div>
                    <div className="text-[14px] text-admin-ink leading-tight mb-1">
                      <span className="font-semibold">{ex.driverName}</span> logged <span className="font-medium text-admin-status-red">{ex.type}</span>
                    </div>
                    <div className="text-[13px] text-admin-muted line-clamp-1">{ex.detail}</div>
                    <div className="text-[12px] font-medium text-admin-muted mt-2 tracking-wide uppercase">
                      {formatLondonDateTime(ex.timestamp)}
                    </div>
                  </div>
                </div>
              ))}
              {activityFeed.length === 0 && (
                <div className="text-[14px] text-admin-muted text-center py-4">No recent activity.</div>
              )}
            </div>
          </div>

        </div>

      </div>
      <GenerateReportModal isOpen={isReportModalOpen} onClose={() => setIsReportModalOpen(false)} initialFrom={from} initialTo={to} />
    </div>
  );
}
