import React, { useEffect, useRef, useState } from "react";
import { knownSubtotal } from "../utils/knownSubtotal";
import { DriverSettlement } from "../components/DriverSettlement";
import { retainRangeInUrl } from "../utils/reportNavigation";
import { useQuery } from "@tanstack/react-query";
import {
  Truck,
  CheckCircle2,
  Clock,
  Banknote,
  AlertTriangle,
  FileText,
  FileDown,
  Download,
  ChevronDown,
  ChevronRight,
  Loader2
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer
} from "recharts";
import { fetchSummary, fetchJobs, fetchDrivers } from "../api";
import { DateRangePicker, defaultDashboardDateRange } from "../components/DateRangePicker";
import { PrintPortal } from "../components/PrintPortal";
import { PaperAnalyticsReport } from "../components/PaperAnalyticsReport";
import { waitForPrintImages } from "../utils/printReady";
import { sounds } from "../utils/audio";
import { toCsv, downloadCsv, stampForFilename } from "../utils/csv";
import { formatLondonDate, formatLondonDateTime } from "../utils/date";
import { completionRate, formatDuration } from "../utils/kpi";
import {
  adjustmentReason,
  arrivalProofMismatchLabel,
  extraChargeBreakdownLines,
  jobServiceType,
  jobsForDriver,
  paymentBreakdownLines,
  totalChargesForJob
} from "../utils/workBreakdown";
import { NormalizedJob, SummaryResponse, DriverSummaryItem } from "../types";
import { Button, Spinner, SegmentedControl } from "../../../../ui";

interface Props {
  onSelectSection?: (id: string) => void;
}

type OverviewTab = "overview" | "breakdown";


export function OverviewPage({ onSelectSection }: Props) {
  const [from, setFrom] = useState<string | undefined>(() => new URLSearchParams(window.location.search).get("from") || defaultDashboardDateRange().from);
  const [to, setTo] = useState<string | undefined>(() => new URLSearchParams(window.location.search).get("to") || defaultDashboardDateRange().to);
  // Defaults to Work Breakdown -- OverviewSummary/WorkBreakdown below are rendered
  // as a ternary, not both at once, so whichever one isn't the active tab never
  // mounts and never fires its useQuery. Overview's KPI/chart fetch (summary +
  // implicitly the full jobs dataset behind it) is the heavier of the two, so
  // defaulting away from it means opening this page doesn't pay for it up front.
  const [tab, setTab] = useState<OverviewTab>("breakdown");

  return (
    <div className="max-w-[1440px] mx-auto space-y-6">

      {/* VIEW SWITCHER -- Overview's own KPIs/charts vs. the per-driver settlement
          breakdown that used to live behind the "Generate report" modal. Large and
          up top since this decides which whole page you're looking at; the date
          range (and, on Work Breakdown, the driver filter/export) are secondary
          filters and sit below it. */}
      <div className="flex justify-center pt-2">
        <SegmentedControl
          size="lg"
          aria-label="Overview view"
          value={tab}
          onChange={setTab}
          options={[
            { value: "overview" as const, label: "Overview" },
            { value: "breakdown" as const, label: "Driver Breakdown" }
          ]}
        />
      </div>

      {/* Date filter -- secondary to the view switcher above, centered under it */}
      <div className="flex justify-center px-2">
        <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); retainRangeInUrl(f, t); }} />
      </div>

      {tab === "overview" ? (
        <OverviewSummary from={from} to={to} onSelectSection={onSelectSection} />
      ) : (
        <DriverSettlement from={from} to={to} />
      )}
    </div>
  );
}

function OverviewSummary({
  from, to, onSelectSection
}: { from?: string; to?: string; onSelectSection?: (id: string) => void }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["summary", from, to],
    queryFn: () => fetchSummary(from, to)
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
  const delayTone =
    kpis.avgDelayMinutes <= 0
      ? { label: "On time", className: "text-admin-status-green", chip: "bg-admin-status-green/10" }
      : kpis.avgDelayMinutes <= 15
        ? { label: "Within tolerance", className: "text-admin-status-green", chip: "bg-admin-status-green/10" }
        : { label: "Needs attention", className: "text-admin-status-red", chip: "bg-admin-status-red/10" };

  return (
    <div className="space-y-6">

      {/* TOP ROW: Stats (wider) + Top Drivers (narrower) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* LEFT COLUMN: Wider (Stats) */}
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
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-medium text-admin-muted">
                <span>Cash £{kpis.cashCollectedPounds.toLocaleString("en-GB", { maximumFractionDigits: 0 })}</span>
                <span>Card/bank £{kpis.cardBankPounds.toLocaleString("en-GB", { maximumFractionDigits: 0 })}</span>
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
                <div className="flex items-center gap-2 text-[13px] font-medium text-admin-muted">
                  <span>{kpis.completed} completed</span>
                  <span className="font-normal">of {kpis.totalJobs} total</span>
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
              <div className={`flex items-center gap-2 text-[13px] font-medium ${delayTone.className}`}>
                <span className={`px-2 py-0.5 rounded-full ${delayTone.chip}`}>{delayTone.label}</span>
                <span className="text-admin-muted font-normal">{kpis.late} late starts</span>
              </div>
            </div>

          </div>
        </div>

        {/* RIGHT COLUMN: Narrower (Ranked List) */}
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
                      <div className="text-card text-fg">{d.driverName || `${d.initials} Driver`}</div>
                      <div className="text-[12px] text-admin-muted">{d.completed} delivered</div>
                    </div>
                  </div>
                  <div className="text-[14px] font-bold text-admin-ink">{d.completed + d.active}</div>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

      {/* MAIN CHART CARD -- full width now that the Recent Activity card is gone */}
      <div className="bg-white p-8 rounded-module shadow-[0_8px_30px_rgb(0,0,0,0.03)]">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h3 className="text-heading text-fg">Revenue Velocity</h3>
            <p className="text-[14px] text-admin-muted mt-1">Daily billed move turnover</p>
          </div>
        </div>
        <div className="h-[340px] w-full">
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
  );
}

/**
 * The per-driver Cash/Card/Bank/Invoice breakdown -- used to live behind a "Generate
 * report" modal with a now-pointless report-type picker (every option produced this
 * same table). Now it's just a tab here, with its own driver filter and export
 * buttons inline, matching how every other admin tab exports its own data.
 */
