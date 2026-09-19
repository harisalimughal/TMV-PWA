import React from "react";
import { NormalizedJob, DriverSummaryItem } from "../types";
import { formatLondonDate, formatLondonDateTime } from "../utils/date";
import { formatDuration } from "../utils/kpi";

interface Props {
  reportType: string;
  from?: string;
  to?: string;
  driver?: string;
  jobs?: NormalizedJob[];
  /** Per-driver cash/card/bank/invoice totals for the selected range (and driver
   *  filter, if any) -- the settlement "slip" the client asked for: what each driver
   *  collected, by payment method, so it can be checked against what they hand in.
   *  The KPI band above the table is summed straight from these same rows, never
   *  from a separate company-wide fetch -- so it can never disagree with the table
   *  it's summarizing, even when a single driver is selected. */
  driverSettlement?: DriverSummaryItem[] | null;
}

export function PaperAnalyticsReport({ reportType, from, to, driver, jobs = [], driverSettlement }: Props) {
  const generatedAt = formatLondonDateTime(new Date().toISOString());

  const settlementRows = driverSettlement ?? [];
  const totalCollectedPounds = settlementRows.reduce((sum, d) => sum + d.revenuePounds, 0);
  const totalCompletedJobs = settlementRows.reduce((sum, d) => sum + d.completed, 0);
  const totalMovingMinutes = settlementRows.reduce((sum, d) => sum + d.totalDurationMinutes, 0);

  const dateRangeLabel = from && to
    ? `${formatLondonDate(from)} – ${formatLondonDate(to)}`
    : from
      ? `From ${formatLondonDate(from)}`
      : to
        ? `Until ${formatLondonDate(to)}`
        : "All Time";

  // Filter jobs by driver if specified
  const displayJobs = driver && driver !== "all"
    ? jobs.filter(j => j.driverInitials.toLowerCase() === driver.toLowerCase())
    : jobs;

  return (
    <div className="font-sans text-[#1A1A1A] bg-white">
      <style>{`
        @page {
          size: 210mm 297mm;
          size: A4 portrait;
          margin: 0;
        }
        @media print {
          .analytics-print-page {
            width: 210mm !important;
            min-height: 297mm !important;
            padding: 16mm 20mm !important;
            margin: 0 !important;
            box-sizing: border-box !important;
            background-color: white !important;
            overflow: visible !important;
          }
        }
        .analytics-print-page {
          width: 210mm;
          min-height: 297mm;
          padding: 16mm 20mm;
          box-sizing: border-box;
          background-color: white;
          display: flex;
          flex-direction: column;
        }
      `}</style>

      <div className="analytics-print-page">
        {/* Header */}
        <div className="flex items-start justify-between pb-6 border-b border-[#E5E7EB] mb-6 shrink-0">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-admin-brand mb-1">Official Operational Audit</div>
            <h1 className="text-[24px] font-bold text-admin-ink">{reportType}</h1>
            <div className="text-[13px] font-medium text-[#6B7280] mt-1">
              Period: <span className="text-[#111827] font-semibold">{dateRangeLabel}</span>
              {driver && driver !== "all" && (
                <span className="ml-3">| Driver: <span className="text-[#111827] font-semibold">{driver.toUpperCase()}</span></span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end">
            <div className="text-[20px] font-black text-admin-brand tracking-tight mb-0.5">THE MAN VAN</div>
            <div className="text-[12px] font-bold text-admin-ink">020 3773 9113</div>
            <div className="text-[11px] text-[#9CA3AF] mt-1">Generated: {generatedAt}</div>
          </div>
        </div>

        {/* KPI Grid -- summed straight from the Driver Settlement rows below, so
            these numbers can never disagree with the table they're summarizing
            (previously pulled from a separate company-wide fetch that ignored the
            driver filter, which is exactly why they didn't match). */}
        <div className="grid grid-cols-4 gap-3 mb-6 shrink-0">
          <div className="p-3.5 bg-[#F9FAFB] rounded-card border border-[#E5E7EB]">
            <div className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">Total Collected</div>
            <div className="text-[20px] font-extrabold text-[#111827] mt-1">£{totalCollectedPounds.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>

          <div className="p-3.5 bg-[#F9FAFB] rounded-card border border-[#E5E7EB]">
            <div className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">Completed Jobs</div>
            <div className="text-[20px] font-extrabold text-[#111827] mt-1">{totalCompletedJobs}</div>
          </div>

          <div className="p-3.5 bg-[#F9FAFB] rounded-card border border-[#E5E7EB]">
            <div className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">Moving Hours</div>
            <div className="text-[20px] font-extrabold text-[#111827] mt-1">{formatDuration(totalMovingMinutes)}</div>
          </div>

          <div className="p-3.5 bg-[#F9FAFB] rounded-card border border-[#E5E7EB]">
            <div className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">Drivers</div>
            <div className="text-[20px] font-extrabold text-[#111827] mt-1">{settlementRows.length}</div>
          </div>
        </div>

        {/* Driver Settlement -- per-driver cash/card/bank/invoice breakdown for the
            selected range, the "who collected what, and how" slip. */}
        {driverSettlement && driverSettlement.length > 0 && (
          <div className="mb-6 shrink-0">
            <h2 className="text-[14px] font-bold text-admin-ink mb-2 uppercase tracking-wide">Driver Settlement</h2>
            <table className="w-full text-[12px] border-collapse border border-[#E5E7EB]">
              <thead>
                <tr className="bg-[#F3F4F6] text-left text-[#374151]">
                  <th className="p-2 border border-[#E5E7EB] font-bold">Driver</th>
                  <th className="p-2 border border-[#E5E7EB] font-bold">Code</th>
                  <th className="p-2 border border-[#E5E7EB] font-bold text-right">Completed Jobs</th>
                  <th className="p-2 border border-[#E5E7EB] font-bold text-right">Moving Hours</th>
                  <th className="p-2 border border-[#E5E7EB] font-bold text-right">Cash (£)</th>
                  <th className="p-2 border border-[#E5E7EB] font-bold text-right">Card (£)</th>
                  <th className="p-2 border border-[#E5E7EB] font-bold text-right">Bank (£)</th>
                  <th className="p-2 border border-[#E5E7EB] font-bold text-right">Invoice (£)</th>
                  <th className="p-2 border border-[#E5E7EB] font-bold text-right">Total (£)</th>
                </tr>
              </thead>
              <tbody>
                {driverSettlement.map((d, i) => (
                  <tr key={d.initials || i} className={i % 2 === 0 ? "bg-white" : "bg-[#F9FAFB]"}>
                    <td className="p-2 border border-[#E5E7EB] font-semibold text-[#111827]">{d.fullName}</td>
                    <td className="p-2 border border-[#E5E7EB] font-mono">{d.initials}</td>
                    <td className="p-2 border border-[#E5E7EB] text-right font-medium text-[#059669]">{d.completed}</td>
                    <td className="p-2 border border-[#E5E7EB] text-right font-mono">{formatDuration(d.totalDurationMinutes)}</td>
                    <td className="p-2 border border-[#E5E7EB] text-right font-mono">{d.cashCollectedPounds.toFixed(2)}</td>
                    <td className="p-2 border border-[#E5E7EB] text-right font-mono">{d.cardCollectedPounds.toFixed(2)}</td>
                    <td className="p-2 border border-[#E5E7EB] text-right font-mono">{d.bankCollectedPounds.toFixed(2)}</td>
                    <td className="p-2 border border-[#E5E7EB] text-right font-mono">{d.invoiceCollectedPounds.toFixed(2)}</td>
                    <td className="p-2 border border-[#E5E7EB] text-right font-mono font-bold">{d.revenuePounds.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Job Listings / Move Audit Table */}
        <div className="flex-1 min-h-0">
          <h2 className="text-[14px] font-bold text-admin-ink mb-2 uppercase tracking-wide">Operations Log ({displayJobs.length} Bookings)</h2>
          <table className="w-full text-[11px] border-collapse border border-[#E5E7EB]">
            <thead>
              <tr className="bg-[#F3F4F6] text-left text-[#374151]">
                <th className="p-1.5 border border-[#E5E7EB] font-bold">Job ID</th>
                <th className="p-1.5 border border-[#E5E7EB] font-bold">Customer</th>
                <th className="p-1.5 border border-[#E5E7EB] font-bold">Driver</th>
                <th className="p-1.5 border border-[#E5E7EB] font-bold">Booked Time</th>
                <th className="p-1.5 border border-[#E5E7EB] font-bold">Status</th>
                <th className="p-1.5 border border-[#E5E7EB] font-bold text-right">Total (£)</th>
              </tr>
            </thead>
            <tbody>
              {displayJobs.slice(0, 30).map((j, i) => (
                <tr key={j.jobId || i} className={i % 2 === 0 ? "bg-white" : "bg-[#F9FAFB]"}>
                  <td className="p-1.5 border border-[#E5E7EB] font-mono font-semibold">{j.jobId}</td>
                  <td className="p-1.5 border border-[#E5E7EB] font-medium text-[#111827] truncate max-w-[120px]">{j.customerName}</td>
                  <td className="p-1.5 border border-[#E5E7EB]">{j.driverName || j.driverInitials || "—"}</td>
                  <td className="p-1.5 border border-[#E5E7EB]">{formatLondonDate(j.bookedStart || j.actualStart)}</td>
                  <td className="p-1.5 border border-[#E5E7EB]">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                      j.status === "COMPLETED" ? "bg-emerald-100 text-emerald-800" :
                      j.status === "IN_PROGRESS" ? "bg-amber-100 text-amber-800" :
                      j.status === "CANCELLED" ? "bg-red-100 text-red-800" :
                      "bg-blue-100 text-blue-800"
                    }`}>
                      {j.status}
                    </span>
                  </td>
                  <td className="p-1.5 border border-[#E5E7EB] text-right font-mono font-semibold">
                    £{((j.amountCharged || 0) / 100).toFixed(2)}
                  </td>
                </tr>
              ))}
              {displayJobs.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-[#6B7280] italic">
                    No bookings found matching the selected criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {displayJobs.length > 30 && (
            <div className="text-[11px] text-[#6B7280] mt-2 italic text-right">
              Showing top 30 of {displayJobs.length} bookings. Use CSV export for full tabular records.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-auto pt-4 border-t border-[#E5E7EB] flex items-center justify-between text-[10px] text-[#9CA3AF] shrink-0">
          <div>The Man Van Operations System | London, UK</div>
          <div>Page 1 of 1</div>
        </div>
      </div>
    </div>
  );
}
