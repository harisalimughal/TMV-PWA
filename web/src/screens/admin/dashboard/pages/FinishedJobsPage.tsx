import React, { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  Download, Printer,
  FolderOpen,
  Camera,
  AlertTriangle,
  ArrowRight,
  Trash2,
  List,
  LayoutGrid
} from "lucide-react";
import { SubmissionDetailDrawer } from "../components/SubmissionDetailDrawer";
import { FolderActionDropdown } from "../components/FolderActionDropdown";
import { PaperDossierReport } from "../components/PaperDossierReport";
import { BulkDeleteModal } from "../components/BulkDeleteModal";
import { DriverViewedDot } from "../components/DriverViewedDot";
import { FileText } from "lucide-react";
import { fetchJobs, fetchDrivers, fetchJobDetail } from "../api";
import { NormalizedJob, formatGBP, toPounds } from "../types";
import { DateRangePicker } from "../components/DateRangePicker";
import { ApiErrorState } from "../components/ApiErrorState";
import { formatLondonDateTime } from "../utils/date";
import { DelayBandBadge, JobStatusBadge } from "../components/StatusBadge";
const isTestOrIncomplete = (job: any) => { return job.customerName === "hh" || String(job.pickup).includes("test") || String(job.dropoff).includes("test"); };
import { resolveDriver, formatVanReg } from "../utils/drivers";

export function FinishedJobsPage() {
  const [viewMode, setViewMode] = useState<"table" | "cards">("cards");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [from, setFrom] = useState<string | undefined>();
  const [to, setTo] = useState<string | undefined>();
  const [driverFilter, setDriverFilter] = useState<string>("");
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [previewJob, setPreviewJob] = useState<NormalizedJob | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [deleteJobIds, setDeleteJobIds] = useState<string[] | null>(null);
  /** Set right before opening the drawer from the row-level "Download" action, so the
   *  drawer knows to run its own download flow immediately on open (see
   *  SubmissionDetailDrawer's autoDownload prop) instead of just sitting on Preview. */
  const [autoDownloadJobId, setAutoDownloadJobId] = useState<string | null>(null);
  const openedDeepLinkJobRef = useRef<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["jobs", "COMPLETED", page, pageSize, from, to, driverFilter],
    queryFn: () => fetchJobs({ status: "COMPLETED", page, pageSize, from, to, driver: driverFilter || undefined })
  });

  // Same roster the Drivers tab shows (DriversPage.tsx's own `roster` filter) -- every
  // driver with a real account, active or deactivated, so a deactivated driver's
  // historical completed jobs are still filterable. hasAccount excludes both
  // "UNASSIGNED" and any driverInitials code that only exists because it's typed on a
  // job (or a deleted driver's old jobs) with no actual driver_accounts doc behind it
  // -- those aren't in the Drivers tab, so they shouldn't be selectable here either.
  const { data: driversData } = useQuery({ queryKey: ["drivers_summary"], queryFn: () => fetchDrivers() });
  const driverOptions = (driversData?.drivers || [])
    .filter(d => d.initials && d.initials !== "UNASSIGNED" && d.hasAccount)
    .sort((a, b) => (a.fullName || a.initials).localeCompare(b.fullName || b.initials));

  const isTestOrIncomplete = (job: NormalizedJob) => {
    const cust = (job.customerName || "").toLowerCase();
    const p = (job.pickup || "").toLowerCase();
    const d = (job.dropoff || "").toLowerCase();
    
    if (cust.includes("test") || cust === "hh" || cust === "number test") return true;
    if (p.length < 5 || d.length < 5) return true;
    if (!p.includes(" ") || !d.includes(" ")) return true; // Single word route
    
    return false;
  };

  const totalCharges = (job: NormalizedJob) =>
    job.totalCharges || job.calculatedTotalCharges || job.basePrice + job.extraCharges + job.overtimeCharge;

  const items = data?.items || [];

  useEffect(() => {
    const jobId = new URLSearchParams(window.location.search).get("job");
    if (!jobId || openedDeepLinkJobRef.current === jobId) return;
    openedDeepLinkJobRef.current = jobId;
    setAutoDownloadJobId(null);
    fetchJobDetail(jobId)
      .then(job => setPreviewJob(job))
      .catch(() => {
        openedDeepLinkJobRef.current = null;
      });
  }, []);

  const toggleRow = (id: string) => {
    const next = new Set(selectedRows);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedRows(next);
  };
  const toggleAll = () => {
    if (selectedRows.size === items.length && items.length > 0) setSelectedRows(new Set());
    else setSelectedRows(new Set(items.map(j => j.jobId)));
  };

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto relative">
      {/* BULK ACTION BAR (Floating) */}
      {selectedRows.size > 0 && (
        <div className="fixed bottom-4 sm:bottom-6 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-50 animate-in slide-in-from-bottom-5 flex justify-center">
          <div className="bg-admin-ink text-white rounded-full shadow-2xl px-4 sm:px-5 py-3 flex items-center gap-3 sm:gap-6 max-w-full overflow-x-auto">
            <span className="text-[13px] font-bold whitespace-nowrap shrink-0">
              {selectedRows.size} job{selectedRows.size > 1 ? "s" : ""} selected
            </span>
            <div className="h-4 w-px bg-white/20 shrink-0" />
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setDeleteJobIds(Array.from(selectedRows))}
                className="shrink-0 whitespace-nowrap px-2.5 sm:px-3 py-1.5 rounded-full text-[12px] font-semibold text-red-300 hover:bg-white/10 hover:text-red-200 transition flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Delete</span>
              </button>
              <button
                onClick={() => setSelectedRows(new Set())}
                className="shrink-0 px-2.5 py-1.5 rounded-full text-[12px] font-semibold hover:bg-white/10 transition"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PAGE HEADER -- the title itself now lives in Layout.tsx's top header bar, so
          this row is just the toolbar controls that used to sit to its right. */}
      <div className="flex flex-wrap items-center gap-y-3 gap-x-3 px-2">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <div className="hidden md:flex items-center p-1 bg-admin-surface rounded-card border border-admin-line/50 shrink-0">
            <button
              onClick={() => setViewMode("table")}
              title="Table view"
              className={`p-1.5 rounded-control transition ${viewMode === "table" ? "bg-white shadow-sm text-admin-ink" : "text-admin-muted hover:text-admin-ink"}`}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("cards")}
              title="Card view"
              className={`p-1.5 rounded-control transition ${viewMode === "cards" ? "bg-white shadow-sm text-admin-ink" : "text-admin-muted hover:text-admin-ink"}`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
          <select
            value={driverFilter}
            onChange={e => { setDriverFilter(e.target.value); setPage(1); }}
            className="shrink-0 h-10 px-3 rounded-control border border-line-strong bg-surface text-fg text-button shadow-sm outline-none focus:border-admin-brand"
          >
            <option value="">All drivers</option>
            {driverOptions.map(d => (
              <option key={d.initials} value={d.initials}>{d.fullName || d.initials}</option>
            ))}
          </select>
          <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); setPage(1); }} />
          <div className="hidden sm:block w-px h-6 bg-admin-line mx-2 shrink-0" />
          <ExportMenu
            onExportCsv={() => {
              const params = new URLSearchParams({ status: "COMPLETED" });
              if (driverFilter) params.set("driver", driverFilter);
              if (from) params.set("from", from);
              if (to) params.set("to", to);
              window.location.href = `/api/admin/jobs/export.csv?${params.toString()}`;
            }}
            onPrintPdf={() => window.print()}
          />
        </div>
      </div>

      {isLoading && (
        <div className="h-64 bg-white rounded-module border border-admin-line animate-pulse flex items-center justify-center">
          <span className="text-admin-muted font-medium">Loading records...</span>
        </div>
      )}

      {!isLoading && error && (
        <ApiErrorState message={(error as Error)?.message} onRetry={() => refetch()} />
      )}

      {/* Main View -- cards sit directly on the page background exactly like the
          Jobs Archive tab (no extra white/bordered wrapper around them); the table
          keeps its own bordered card container since it needs that framing. */}
      {!isLoading && !error && (
        <>
          {/* Same card shape as the Jobs Archive tab's card view (JobsPage.tsx's
              JobCardList) -- checkbox, top-right action, Job ID + status, customer
              name, a secondary line, then a divider footer split driver+time /
              amount+total. Content swapped for what's relevant to a *finished* job:
              route instead of the booking title, actual finish time instead of
              booked, and the folder actions (preview/download/open) instead of
              Reassign. Below md, cards show regardless of viewMode -- an 11-column
              table behind a horizontal scrollbar has nowhere to go on a phone. */}
          <div className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-3 ${viewMode === "cards" ? "" : "md:hidden"}`}>
            {items.map((job: NormalizedJob) => {
              const driver = resolveDriver(job.driverName, job.driverInitials);
              const amount = toPounds(job.amountCharged);
              const total = totalCharges(job);
              const isSelected = selectedRows.has(job.jobId);
              const finishedTime = job.actualFinish ? formatLondonDateTime(job.actualFinish) : (job.actualStart ? formatLondonDateTime(job.actualStart) : "Not recorded");
              return (
                <article
                  key={job.jobId}
                  className={`rounded-module bg-white border p-4 transition ${
                    isSelected ? "border-admin-brand ring-2 ring-admin-brand/20" : "border-admin-line"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleRow(job.jobId)}
                      className="mt-1 w-4 h-4 rounded accent-admin-brand cursor-pointer shrink-0"
                      aria-label={`Select job ${job.jobId}`}
                    />
                    {/* Sibling of the onOpen button below, not nested inside it -- a
                        <button> inside a <button> is invalid HTML. */}
                    <div className="order-3 shrink-0" onClick={e => e.stopPropagation()}>
                      <FolderActionDropdown
                        hasFolderUrl={!!job.driveFolderUrl}
                        onOpenFolder={() => window.open(job.driveFolderUrl, "_blank")}
                        onPreview={() => { setAutoDownloadJobId(null); setPreviewJob(job); }}
                        onDownload={() => { setAutoDownloadJobId(job.jobId); setPreviewJob(job); }}
                      />
                    </div>
                    <button onClick={() => setPreviewJob(job)} className="order-2 flex-1 min-w-0 text-left">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-admin-brand text-[14px]">{job.jobId}</span>
                        <DriverViewedDot viewedAt={job.driverViewedAt} />
                        <JobStatusBadge status={job.status} />
                      </div>
                      <p className="text-card text-fg mt-1.5 truncate">
                        {job.customerName || "Not recorded"}
                      </p>
                      <p className="text-[13px] text-admin-muted mt-1 truncate">
                        {job.pickup || "—"} <span className="text-admin-line-strong">→</span> {job.dropoff || "—"}
                      </p>
                      <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-admin-line">
                        <span className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 ${driver.color}`}
                          >
                            {driver.code}
                          </span>
                          <span className="min-w-0 leading-tight">
                            <span className="text-[13px] text-admin-ink font-medium truncate block">
                              {driver.name}
                            </span>
                            <span className="text-[11px] text-admin-muted truncate block">
                              {finishedTime}
                            </span>
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-0.5 font-mono tabular-nums">
                          <span className="text-[14px] font-bold text-admin-ink">
                            {amount === 0 ? "—" : `£${amount.toLocaleString("en-GB", { minimumFractionDigits: 2 })}`}
                          </span>
                          <span className="text-[11px] font-semibold text-admin-muted">
                            Total {formatGBP(total)}
                          </span>
                        </span>
                      </div>
                    </button>
                  </div>
                </article>
              );
            })}
            {items.length === 0 && (
              <div className="col-span-full text-center py-12">
                <p className="text-card text-fg">No finished jobs in this range</p>
                <p className="text-[13px] text-admin-muted mt-1">Try widening the dates.</p>
              </div>
            )}
          </div>

          <div className={`bg-white rounded-module shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-admin-line overflow-hidden ${viewMode === "table" ? "hidden md:block" : "hidden"}`}>
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-[14px] border-collapse whitespace-nowrap">
              <thead>
                <tr className="border-b border-admin-line bg-[#F7F7F7]/50">
                  <th className="py-4 pl-4 pr-2 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={items.length > 0 && selectedRows.size === items.length}
                      onChange={toggleAll}
                      className="w-4 h-4 rounded accent-admin-brand cursor-pointer"
                      aria-label="Select all"
                    />
                  </th>
                  <th className="py-4 px-4 w-12 text-center font-semibold text-eyebrow text-fg-subtle tracking-[0.03em]">#</th>
                  <th className="py-4 px-4 font-semibold text-eyebrow text-fg-subtle tracking-[0.03em]">Driver</th>
                  <th className="py-4 px-4 font-semibold text-eyebrow text-fg-subtle tracking-[0.03em]">Customer</th>
                  <th className="py-4 px-4 font-semibold text-eyebrow text-fg-subtle tracking-[0.03em] min-w-[240px]">Pickup → Drop-off</th>
                  <th className="py-4 px-4 font-semibold text-eyebrow text-fg-subtle tracking-[0.03em]">Started</th>
                  <th className="py-4 px-4 font-semibold text-eyebrow text-fg-subtle tracking-[0.03em]">Finished</th>
                  <th className="py-4 px-4 font-semibold text-eyebrow text-fg-subtle tracking-[0.03em]">Punctuality</th>
                  <th className="py-4 px-6 font-semibold text-eyebrow text-fg-subtle tracking-[0.03em] text-right">Amount Charged (£)</th>
                  <th className="py-4 px-4 font-semibold text-eyebrow text-fg-subtle tracking-[0.03em] text-center">Photos</th>
                  <th className="py-4 px-4 font-semibold text-eyebrow text-fg-subtle tracking-[0.03em] text-center">Signature</th>
                  <th className="py-4 px-4 font-semibold text-eyebrow text-fg-subtle tracking-[0.03em] text-center">Docs</th>
                  <th className="py-4 px-4 w-10"></th>
                </tr>
              </thead>

              <tbody className="divide-y divide-admin-line">
                {items.map((job: NormalizedJob, index: number) => {
                  const isExpanded = expandedJobId === job.jobId;
                  const amountPounds = toPounds(job.amountCharged);
                  const total = totalCharges(job);
                  const rowNumber = (page - 1) * pageSize + index + 1;

                  const startedTime = job.actualStart ? formatLondonDateTime(job.actualStart) : "—";
                  const finishedTime = job.actualFinish ? formatLondonDateTime(job.actualFinish) : "—";
                  const onMyWayTime = job.onMyWayAt ? formatLondonDateTime(job.onMyWayAt) : null;

                  const p = job.pickup || <span className="text-[14px] font-normal text-[#B0B0B0] italic">Not recorded</span>;
                  const d = job.dropoff || <span className="text-[14px] font-normal text-[#B0B0B0] italic">Not recorded</span>;
                  const routeSummary = `${p} → ${d}`;

                  const photos = job.evidenceItems?.filter((e: any) => e.type === "IMAGE" && (e.thumbProxyUrl || e.driveUrl)) || [];
                  const isTest = isTestOrIncomplete(job);
                  const resolvedDriver = resolveDriver(job.driverName, job.driverInitials);
                  const isUnassigned = resolvedDriver.code === "UN";
                  const isSelected = selectedRows.has(job.jobId);

                  return (
                    <React.Fragment key={job.jobId}>
                      <tr
                        onClick={() => setPreviewJob(job)}
                        className={`h-[64px] group cursor-pointer transition select-none ${
                          isSelected ? "bg-admin-brand-soft/10" : isExpanded ? "bg-admin-surface/50" : "hover:bg-[#F9FAFB]"
                        } ${isTest ? "opacity-70" : ""} ${resolvedDriver.needsReassignment ? 'bg-[#FFFBEB]/50' : ''}`}
                      >
                        <td className="pl-4 pr-2 text-center" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleRow(job.jobId)}
                            className="w-4 h-4 rounded accent-admin-brand cursor-pointer"
                            aria-label={`Select job ${job.jobId}`}
                          />
                        </td>
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
                            <DriverViewedDot viewedAt={job.driverViewedAt} />
                            <span className="truncate max-w-[150px]">{job.customerName || "—"}</span>
                            {isTest && (
                              <span className="px-1.5 py-0.5 rounded-control bg-admin-surface border border-admin-line text-admin-muted text-[10px] font-semibold uppercase tracking-wider" title="Test or Incomplete Record">
                                Test
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-4">
                          <div className="flex items-center gap-2 text-[13px] text-admin-muted" title={routeSummary}>
                            <span className="truncate max-w-[160px] text-[14px] font-normal text-admin-ink">{p}</span>
                            <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate max-w-[160px] text-[14px] font-normal text-admin-ink">{d}</span>
                          </div>
                        </td>

                        <td className="px-4 text-[13px] font-normal text-admin-muted tabular-nums whitespace-nowrap">
                          {startedTime}
                          {onMyWayTime && (
                            <span className="block text-[11px] text-admin-muted/70 mt-0.5">On my way: {onMyWayTime}</span>
                          )}
                        </td>
                        <td className="px-4 text-[13px] font-normal text-admin-muted tabular-nums whitespace-nowrap">{finishedTime}</td>
                        <td className="px-4 whitespace-nowrap">
                          <DelayBandBadge band={job.delayBand} minutes={job.delayMinutes} />
                        </td>

                        <td className="px-6 text-right">
                          <div className="font-mono text-[15px] font-bold tabular-nums text-admin-ink">
                            £{amountPounds.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <div className="mt-0.5 text-[11px] text-admin-muted tabular-nums">
                            Total Charges {formatGBP(total)}
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
        </>
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

      {deleteJobIds && (
        <BulkDeleteModal
          jobIds={deleteJobIds}
          onClose={() => setDeleteJobIds(null)}
          onDone={() => {
            setDeleteJobIds(null);
            setSelectedRows(new Set());
            void refetch();
          }}
        />
      )}
    </div>
  );
}

/** Single Export button offering CSV and Print/PDF, replacing what used to be two
 *  separate buttons taking up toolbar space for the same underlying action. */
function ExportMenu({ onExportCsv, onPrintPdf }: { onExportCsv: () => void; onPrintPdf: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative inline-block text-left shrink-0" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(o => !o)}
        className="whitespace-nowrap h-10 px-2.5 sm:px-4 rounded-control border border-line-strong bg-surface hover:bg-surface-sunken text-fg text-button shadow-sm transition flex items-center gap-2"
      >
        <Download className="w-4 h-4" /> Export
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-44 rounded-card bg-white border border-admin-line shadow-[0_8px_30px_rgb(0,0,0,0.12)] z-50 py-1 overflow-hidden animate-in fade-in slide-in-from-top-2">
          <button
            onClick={() => { setIsOpen(false); onExportCsv(); }}
            className="w-full text-left px-4 py-2.5 text-label font-semibold text-fg hover:bg-admin-surface transition flex items-center gap-2"
          >
            <Download className="w-4 h-4 text-admin-muted" /> Export CSV
          </button>
          {/* The print stylesheet already formats this table for paper, so the
              browser's own Save-as-PDF is a genuine export. */}
          <button
            onClick={() => { setIsOpen(false); onPrintPdf(); }}
            className="w-full text-left px-4 py-2.5 text-label font-semibold text-fg hover:bg-admin-surface transition flex items-center gap-2"
          >
            <Printer className="w-4 h-4 text-admin-muted" /> Print / PDF
          </button>
        </div>
      )}
    </div>
  );
}
