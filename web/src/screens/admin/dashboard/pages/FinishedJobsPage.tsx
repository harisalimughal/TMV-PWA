import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  Download, Printer,
  FolderOpen,
  Camera,
  AlertTriangle,
  ArrowRight
} from "lucide-react";
import { SubmissionDetailDrawer } from "../components/SubmissionDetailDrawer";
import { FolderActionDropdown } from "../components/FolderActionDropdown";
import { PaperDossierReport } from "../components/PaperDossierReport";
import { FileText } from "lucide-react";
import { fetchJobs } from "../api";
import { NormalizedJob, formatGBP, toPounds } from "../types";
import { DateRangePicker } from "../components/DateRangePicker";
import { formatLondonDateTime } from "../utils/date";
const isTestOrIncomplete = (job: any) => { return job.customerName === "hh" || String(job.pickup).includes("test") || String(job.dropoff).includes("test"); };
import { resolveDriver, formatVanReg } from "../utils/drivers";

export function FinishedJobsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [from, setFrom] = useState<string | undefined>();
  const [to, setTo] = useState<string | undefined>();
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [previewJob, setPreviewJob] = useState<NormalizedJob | null>(null);
  /** Set right before opening the drawer from the row-level "Download" action, so the
   *  drawer knows to run its own download flow immediately on open (see
   *  SubmissionDetailDrawer's autoDownload prop) instead of just sitting on Preview. */
  const [autoDownloadJobId, setAutoDownloadJobId] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["jobs", "COMPLETED", page, pageSize, from, to],
    queryFn: () => fetchJobs({ status: "COMPLETED", page, pageSize, from, to })
  });

  const isTestOrIncomplete = (job: NormalizedJob) => {
    const cust = (job.customerName || "").toLowerCase();
    const p = (job.pickup || "").toLowerCase();
    const d = (job.dropoff || "").toLowerCase();
    
    if (cust.includes("test") || cust === "hh" || cust === "number test") return true;
    if (p.length < 5 || d.length < 5) return true;
    if (!p.includes(" ") || !d.includes(" ")) return true; // Single word route
    
    return false;
  };

  const calculatedTotal = (job: NormalizedJob) => job.basePrice + job.extraCharges + job.overtimeCharge;

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto">
      {/* PAGE HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-y-3 gap-x-3 px-2">
        <h1 className="text-title text-fg">Finished Jobs</h1>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); setPage(1); }} />
          <div className="hidden sm:block w-px h-6 bg-admin-line mx-2 shrink-0" />
          <button
            onClick={() => { window.location.href = "/api/admin/jobs/export.csv?status=COMPLETED"; }}
            className="shrink-0 whitespace-nowrap h-10 px-2.5 sm:px-4 rounded-control border border-line-strong bg-surface hover:bg-surface-sunken text-fg text-button shadow-sm transition flex items-center gap-2"
          >
            <Download className="w-4 h-4" /> <span className="hidden sm:inline">Export </span>CSV
          </button>
          {/* Was dead. The print stylesheet already formats this table for paper, so
              the browser's own Save-as-PDF is a genuine export. */}
          <button
            onClick={() => window.print()}
            className="shrink-0 whitespace-nowrap h-10 px-2.5 sm:px-4 rounded-control border border-line-strong bg-surface hover:bg-surface-sunken text-fg text-button shadow-sm transition flex items-center gap-2"
          >
            <Printer className="w-4 h-4" /> <span className="hidden sm:inline">Print / </span>PDF
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="h-64 bg-white rounded-module border border-admin-line animate-pulse flex items-center justify-center">
          <span className="text-admin-muted font-medium">Loading records...</span>
        </div>
      )}

      {error && (
        <div className="p-8 text-center text-admin-status-red bg-admin-status-red-bg rounded-module border border-admin-status-red/20 shadow-sm">
          Failed to load finished jobs.
        </div>
      )}

      {/* Main Table View */}
      {!isLoading && !error && (
        <div className="bg-white rounded-module shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-admin-line overflow-hidden">
          {/* Mobile: cards. An 11-column table behind a horizontal scrollbar is not a
              usable phone layout, so below md the same rows render as cards showing
              the four fields that actually matter on a small screen. */}
          <ul className="md:hidden list-none m-0 p-3 space-y-3">
            {(data?.items || []).map((job: NormalizedJob) => {
              const driver = resolveDriver(job.driverName, job.driverInitials);
              const total = toPounds(job.totalCharges);
              const calculated = calculatedTotal(job);
              const photoCount =
                job.evidenceItems?.filter((e: any) => e.type === "IMAGE" && (e.thumbProxyUrl || e.driveUrl)).length || 0;
              return (
                <li key={job.jobId}>
                  <button
                    onClick={() => setPreviewJob(job)}
                    className="w-full text-left rounded-module border border-admin-line bg-white p-4 active:bg-admin-surface transition"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-admin-brand text-[14px]">{job.jobId}</span>
                      <span className="font-mono text-[14px] font-bold tabular-nums">
                        {total === 0 ? "—" : `£${total.toLocaleString("en-GB", { minimumFractionDigits: 2 })}`}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 rounded-card bg-admin-surface px-3 py-2 text-[12px]">
                      <span className="text-admin-muted">
                        Calc {formatGBP(calculated)}
                      </span>
                      <span className={job.reconciled ? "font-semibold text-admin-status-green" : "font-semibold text-admin-status-red"}>
                        {job.reconciled ? "Reconciled" : "Check total"}
                      </span>
                    </div>
                    <div className="mt-2 text-[12px] font-semibold text-admin-muted">
                      Review: <span className="text-admin-ink">{job.managerReviewStatus || "Pending"}</span>
                    </div>
                    <p className="text-card text-fg mt-1.5 truncate">
                      {job.customerName || "Not recorded"}
                    </p>
                    <p className="text-[13px] text-admin-muted mt-1 leading-snug">
                      {job.pickup || "—"} <span className="text-admin-line-strong">→</span> {job.dropoff || "—"}
                    </p>
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-admin-line text-[12px] text-admin-muted">
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 ${driver.color}`}
                      >
                        {driver.code}
                      </span>
                      <span className="truncate">{driver.name}</span>
                      <span className="ml-auto shrink-0 flex items-center gap-2">
                        <span>{photoCount} photo{photoCount === 1 ? "" : "s"}</span>
                        {job.signatureUrl && <span className="text-admin-status-green font-semibold">Signed</span>}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
            {(data?.items || []).length === 0 && (
              <li className="text-center py-12">
                <p className="text-card text-fg">No finished jobs in this range</p>
                <p className="text-[13px] text-admin-muted mt-1">Try widening the dates.</p>
              </li>
            )}
          </ul>

          <div className="hidden md:block overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-[14px] border-collapse whitespace-nowrap">
              <thead>
                <tr className="border-b border-admin-line bg-[#F7F7F7]/50">
                  <th className="py-4 px-4 w-12 text-center font-semibold text-eyebrow text-fg-subtle tracking-[0.03em]">#</th>
                  <th className="py-4 px-4 font-semibold text-eyebrow text-fg-subtle tracking-[0.03em]">Driver</th>
                  <th className="py-4 px-4 font-semibold text-eyebrow text-fg-subtle tracking-[0.03em]">Customer</th>
                  <th className="py-4 px-4 font-semibold text-eyebrow text-fg-subtle tracking-[0.03em] min-w-[240px]">Pickup → Drop-off</th>
                  <th className="py-4 px-4 font-semibold text-eyebrow text-fg-subtle tracking-[0.03em]">Started</th>
                  <th className="py-4 px-4 font-semibold text-eyebrow text-fg-subtle tracking-[0.03em]">Finished</th>
                  <th className="py-4 px-6 font-semibold text-eyebrow text-fg-subtle tracking-[0.03em] text-right">Total (£)</th>
                  <th className="py-4 px-4 font-semibold text-eyebrow text-fg-subtle tracking-[0.03em] text-center">Photos</th>
                  <th className="py-4 px-4 font-semibold text-eyebrow text-fg-subtle tracking-[0.03em] text-center">Signature</th>
                  <th className="py-4 px-4 font-semibold text-eyebrow text-fg-subtle tracking-[0.03em] text-center">Docs</th>
                  <th className="py-4 px-4 w-10"></th>
                </tr>
              </thead>

              <tbody className="divide-y divide-admin-line">
                {data?.items.map((job: NormalizedJob, index: number) => {
                  const isExpanded = expandedJobId === job.jobId;
                  const totalPounds = toPounds(job.totalCharges);
                  const calculated = calculatedTotal(job);
                  const rowNumber = (page - 1) * pageSize + index + 1;
                  
                  const startedTime = job.actualStart ? formatLondonDateTime(job.actualStart) : "—";
                  const finishedTime = job.actualFinish ? formatLondonDateTime(job.actualFinish) : "—";
                  
                  const p = job.pickup || <span className="text-[14px] font-normal text-[#B0B0B0] italic">Not recorded</span>;
                  const d = job.dropoff || <span className="text-[14px] font-normal text-[#B0B0B0] italic">Not recorded</span>;
                  const routeSummary = `${p} → ${d}`;
                  
                  const photos = job.evidenceItems?.filter((e: any) => e.type === "IMAGE" && (e.thumbProxyUrl || e.driveUrl)) || [];
                  const isTest = isTestOrIncomplete(job);
                  const resolvedDriver = resolveDriver(job.driverName, job.driverInitials);
                  const isUnassigned = resolvedDriver.code === "UN";

                  return (
                    <React.Fragment key={job.jobId}>
                      <tr
                        onClick={() => setPreviewJob(job)}
                        className={`h-[64px] group cursor-pointer transition select-none ${
                          isExpanded ? "bg-admin-surface/50" : "hover:bg-[#F9FAFB]"
                        } ${isTest ? "opacity-70" : ""} ${resolvedDriver.needsReassignment ? 'bg-[#FFFBEB]/50' : ''}`}
                      >
                        <td className="px-4 text-center font-mono text-[14px] font-bold text-admin-muted tabular-nums">{rowNumber}</td>

                        <td className="px-4">
                          <div className="flex flex-col items-start justify-center leading-tight">
                            <button 
                              className={`font-semibold text-[14px] ${isUnassigned ? "text-admin-muted" : "text-admin-brand"}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {resolvedDriver.name}
                            </button>
                            {!isUnassigned && resolvedDriver.vehicleReg && (
                              <span className="bg-admin-line/50 px-1 py-[1px] mt-0.5 rounded-[3px] font-mono font-bold uppercase text-[9px] text-admin-ink">{formatVanReg(resolvedDriver.vehicleReg)}</span>
                            )}
                            {resolvedDriver.needsReassignment && (
                              <span className="text-[11px] uppercase tracking-[0.02em] font-semibold text-amber-700 bg-amber-100 px-2.5 py-1 mt-2 rounded-control">Needs Reassignment</span>
                            )}
                          </div>
                        </td>

                        <td className="px-4 text-[14px] text-admin-ink">
                          <div className="flex items-center gap-2">
                            <span className="truncate max-w-[150px]">{job.customerName || "—"}</span>
                            {isTest && (
                              <span className="px-1.5 py-0.5 rounded-control bg-admin-surface border border-admin-line text-admin-muted text-[10px] font-semibold uppercase tracking-wider" title="Test or Incomplete Record">
                                Test
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-[11px] font-semibold text-admin-muted">
                            Review: <span className="text-admin-ink">{job.managerReviewStatus || "Pending"}</span>
                          </div>
                        </td>

                        <td className="px-4">
                          <div className="flex items-center gap-2 text-[13px] text-admin-muted" title={routeSummary}>
                            <span className="truncate max-w-[160px] text-[14px] font-normal text-admin-ink">{p}</span>
                            <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate max-w-[160px] text-[14px] font-normal text-admin-ink">{d}</span>
                          </div>
                        </td>

                        <td className="px-4 text-[13px] font-normal text-admin-muted tabular-nums whitespace-nowrap">{startedTime}</td>
                        <td className="px-4 text-[13px] font-normal text-admin-muted tabular-nums whitespace-nowrap">{finishedTime}</td>

                        <td className="px-6 text-right">
                          <div className="font-mono text-[15px] font-bold tabular-nums text-admin-ink">
                            £{totalPounds.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <div className="mt-0.5 text-[11px] text-admin-muted tabular-nums">
                            Calc {formatGBP(calculated)}
                          </div>
                          <div className={job.reconciled ? "mt-0.5 text-[10px] font-bold uppercase tracking-[0.03em] text-admin-status-green" : "mt-0.5 text-[10px] font-bold uppercase tracking-[0.03em] text-admin-status-red"}>
                            {job.reconciled ? "Reconciled" : "Mismatch"}
                          </div>
                        </td>

                        <td className="px-4 text-center">
                          <div className="flex items-center justify-center">
                            {photos.length > 0 ? (
                              <div className="flex items-center">
                                {photos.slice(0, 3).map((p, i) => (
                                  <div key={i} className={`w-8 h-8 rounded-card overflow-hidden border-2 border-white bg-admin-surface ${i > 0 ? "-ml-3" : ""}`}>
                                    <img src={(p.thumbProxyUrl || p.driveUrl)} alt="" className="w-full h-full object-cover" />
                                  </div>
                                ))}
                                {photos.length > 3 && (
                                  <div className="w-8 h-8 rounded-card border-2 border-white bg-admin-surface flex items-center justify-center text-[11px] font-medium text-admin-muted -ml-3 z-10">
                                    +{photos.length - 3}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <Camera className="w-4 h-4 text-admin-muted mx-auto opacity-50" />
                            )}
                          </div>
                        </td>

                        <td className="px-4 text-center">
                          {job.signatureUrl ? (
                            <img
                              src={job.signatureUrl}
                              alt="Sig"
                              className="w-12 h-6 object-contain mx-auto border border-admin-line bg-white rounded-control p-0.5"
                            />
                          ) : (
                            <div className="w-12 h-6 rounded-control border border-dashed border-admin-line-strong mx-auto" />
                          )}
                        </td>
                        
                        <td className="px-4 text-center">
      <FolderActionDropdown
        hasFolderUrl={!!job.driveFolderUrl}
        onOpenFolder={() => window.open(job.driveFolderUrl, "_blank")}
        onPreview={() => { setAutoDownloadJobId(null); setPreviewJob(job); }}
        onDownload={() => {
          // Opens the same drawer as Preview, then has it run its own download flow
          // (SubmissionDetailDrawer's handleDownload/autoDownload) -- the drawer's own
          // Preview PDF pane and Download PDF button are what give this the same
          // genuinely-visible-render-before-print structure Jobs' PdfPreviewModal has.
          // This used to print straight from a permanently hidden copy with no visible
          // render step at all, one of the differences from Jobs' working flow.
          setAutoDownloadJobId(job.jobId);
          setPreviewJob(job);
        }}
      />
    </td>

                        <td className="px-4 text-center">
                          <div className="opacity-0 group-hover:opacity-100 transition text-admin-muted">
                            {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                          </div>
                        </td>
                      </tr>

                      
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
      {/* Pagination (simple) */}
      {!isLoading && !error && data?.pagination && (
         <div className="flex flex-wrap items-center justify-between gap-2 px-2 text-[13px] text-admin-muted">
           <span>Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, data.pagination.total)} of {data.pagination.total}</span>
           <div className="flex gap-2 shrink-0">
             <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 border border-line-strong rounded-control bg-surface hover:bg-surface-sunken disabled:opacity-50 transition text-button text-fg">Previous</button>
             <button disabled={page * pageSize >= data.pagination.total} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 border border-line-strong rounded-control bg-surface hover:bg-surface-sunken disabled:opacity-50 transition text-button text-fg">Next</button>
           </div>
         </div>
      )}
          {previewJob && (
        <SubmissionDetailDrawer
          job={previewJob}
          isOpen={!!previewJob}
          autoDownload={autoDownloadJobId === previewJob.jobId}
          onClose={() => { setPreviewJob(null); setAutoDownloadJobId(null); }}
          onUpdated={() => void refetch()}
          onNavigate={(dir) => {
            if (!data?.items) return;
            const idx = data.items.findIndex((j: any) => j.jobId === previewJob.jobId);
            if (dir === 'next' && idx < data.items.length - 1) setPreviewJob(data.items[idx + 1]);
            if (dir === 'prev' && idx > 0) setPreviewJob(data.items[idx - 1]);
          }}
          hasNext={data?.items ? data.items.findIndex((j: any) => j.jobId === previewJob.jobId) < data.items.length - 1 : false}
          hasPrev={data?.items ? data.items.findIndex((j: any) => j.jobId === previewJob.jobId) > 0 : false}
        />
      )}
    </div>
  );
}
