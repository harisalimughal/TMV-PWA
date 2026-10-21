/** The five Performance KPI cards. Every figure is from the table's own rows; nothing is scored. */
import React from "react";
import { CheckCircle2, Clock, Mail, PoundSterling, ReceiptText } from "lucide-react";
import { CHART, KpiCard, RadialProgress } from "../ds";
import { compareCounts } from "../overview/helpers";
import { formatMinutes, formatPounds, plural } from "../../utils/format";
import { reviewShare, type Totals, type TrendRow } from "../../utils/performanceData";
import { moneyComparison } from "./shared";

export function PerformanceKpis({ totals, previous, trend, trendPartial, period, loading }: {
  totals: Totals; previous: Totals | null; trend: TrendRow[] | null; trendPartial: boolean; period: string; loading: boolean;
}) {
  const share = reviewShare(totals);
  const sparkable = !!trend && !trendPartial;
  const calculatedSpark = sparkable ? trend!.map(row => row.calculated) : null;
  const finalSpark = sparkable ? trend!.map(row => row.final) : null;
  const jobsSpark = sparkable ? trend!.map(row => row.completed) : null;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-6 xl:grid-cols-5" aria-label={loading ? "Loading period summary" : "Period summary"} role="group">
      <div className="sm:col-span-2 xl:col-span-1">
      <KpiCard label="Completed jobs" accent="violet" icon={<CheckCircle2 />} loading={loading} value={totals.completed}
          comparison={previous ? compareCounts(totals.completed, previous.completed, period, true) : null}
          spark={jobsSpark ? { values: jobsSpark, label: `Completed jobs per day: ${jobsSpark.join(", ")}` } : null} detail="Completed jobs in the selected range" />
      </div>
      <div className="sm:col-span-2 xl:col-span-1">
      <KpiCard label="Total charges" accent="blue" icon={<ReceiptText />} loading={loading} value={formatPounds(totals.calculated)}
          comparison={previous ? moneyComparison(totals.calculated, previous.calculated, period) : null}
          spark={calculatedSpark ? { values: calculatedSpark, label: "Total charges per day" } : null} detail="System-priced total, not what was billed" />
      </div>
      <div className="sm:col-span-2 xl:col-span-1">
      <KpiCard label="Driver collected" accent="teal" icon={<PoundSterling />} loading={loading} value={formatPounds(totals.final)}
          comparison={previous ? moneyComparison(totals.final, previous.final, period) : null}
          spark={finalSpark ? { values: finalSpark, label: "Driver collected per day" } : null} detail="Billed at completion, includes invoices. Not cash received" />
      </div>
      <div className="sm:col-span-3 xl:col-span-1">
      <KpiCard label="Working time" accent="amber" icon={<Clock />} loading={loading}
          value={totals.workingMinutes === null ? "Not recorded" : formatMinutes(totals.workingMinutes)}
          detail={totals.workingUnknownJobs ? `${plural(totals.workingUnknownJobs, "job")} missing times` : "Recorded arrival to finish"} />
      </div>
      <div className="sm:col-span-3 xl:col-span-1">
      <KpiCard label="Review requests" accent="coral" icon={<Mail />} loading={loading} value={totals.reviewSent}
          visual={share.fraction === null ? undefined : (
            <RadialProgress value={share.fraction} size={64} stroke={8} color={CHART.teal} label={`${Math.round(share.fraction * 100)}% of ${share.tracked} tracked review requests were sent`}>
              <span className="text-[13px] font-bold tabular-nums text-admin-ink">{Math.round(share.fraction * 100)}%</span>
            </RadialProgress>
          )}
          detail={share.tracked ? `Sent · ${totals.reviewNotSent} not sent, of ${share.tracked} tracked` : "No review requests tracked"} />
      </div>
    </div>
  );
}
