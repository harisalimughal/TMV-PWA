import React, { useEffect, useRef, useState } from "react";
import { X, Download, Eye, Maximize2, ZoomIn, ZoomOut, Check, ChevronLeft, ChevronRight, RefreshCw, Save } from "lucide-react";
import { IconButton } from "../../../../ui";
import { PaperDossierReport } from "./PaperDossierReport";
import { PaperScenarioReport } from "./PaperScenarioReport";
import { PrintPortal } from "./PrintPortal";
import { NormalizedJob, ScenarioItem, formatGBP } from "../types";
import { formatLondonDateTime } from "../utils/date";
import { waitForPrintImages } from "../utils/printReady";
import { resolveDriver } from "../utils/drivers";
import { saveJobReview } from "../api";

type ScenarioKind = "checkin" | "checkout" | "parking" | "liability";

const SCENARIO_TITLES: Record<ScenarioKind, string> = {
  checkin: "Storage Check-in",
  checkout: "Storage Check-out",
  parking: "Parking Liability Notice",
  liability: "Liability Report"
};

interface Props {
  job: NormalizedJob | ScenarioItem;
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (dir: 'next' | 'prev') => void;
  hasNext?: boolean;
  hasPrev?: boolean;
  /** Set only for a scenario submission (check-in/out, parking, liability) --
   *  a NormalizedJob (finished job) has no kind and uses PaperDossierReport instead. */
  kind?: ScenarioKind;
  /** Triggers the download flow immediately on open -- for the row-level "Download"
   *  quick action, which used to open this drawer and print in the same click with
   *  no visible preview step. See the comment on handleDownload for why that mattered. */
  autoDownload?: boolean;
  onUpdated?: () => void;
}

function ChargeRow({
  label,
  value,
  strong = false,
  brand = false
}: {
  label: string;
  value: number;
  strong?: boolean;
  brand?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 bg-white px-3 py-2.5">
      <span className={`text-[12px] ${strong ? "font-bold text-admin-ink" : "font-medium text-admin-muted"}`}>
        {label}
      </span>
      <span className={`font-mono text-[13px] tabular-nums ${strong ? "font-bold" : "font-semibold"} ${brand ? "text-admin-brand" : "text-admin-ink"}`}>
        {formatGBP(value)}
      </span>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <span className="text-[11px] uppercase text-admin-muted font-semibold tracking-wider">{label}</span>
      <div className="text-[14px] font-medium text-admin-ink mt-1">{value}</div>
    </div>
  );
}

export function SubmissionDetailDrawer({ job: initialJob, isOpen, onClose, onNavigate, hasNext, hasPrev, kind, autoDownload, onUpdated }: Props) {
  const [job, setJob] = useState<NormalizedJob | ScenarioItem>(initialJob);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [activeTab, setActiveTab] = useState<"Activity" | "Comments">("Activity");
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [managerStatus, setManagerStatus] = useState<"Pending" | "Approved" | "Flagged">("Pending");
  const [managerNote, setManagerNote] = useState("");
  const [savingReview, setSavingReview] = useState(false);

  // handleDownload is defined further down (it needs job-derived values that only
  // make sense once job is known non-null), but the autoDownload effect has to sit
  // up here with the other hooks, before the early return below -- Rules of Hooks.
  // The ref always holds the latest handleDownload closure; the effect just calls it
  // once when the drawer opens with autoDownload set.
  const handleDownloadRef = useRef<() => void>();
  useEffect(() => {
    setJob(initialJob);
  }, [initialJob]);

  useEffect(() => {
    if (isOpen && autoDownload && job) handleDownloadRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, autoDownload]);

  useEffect(() => {
    if (kind) return;
    const normalized = job as NormalizedJob;
    setManagerStatus(normalized.managerReviewStatus || "Pending");
    setManagerNote(normalized.managerReviewNote || "");
  }, [job, kind]);

  if (!isOpen || !job) return null;

  // A scenario submission (check-in/out, parking, liability) has a completely
  // different shape from a finished job's NormalizedJob -- flat/capitalized raw
  // fields and a `photos`/`signature` pair instead of `evidenceItems`/`signatureUrl`.
  // Reading job.* directly (as this component originally did, job-only) left every
  // field undefined for a scenario item: blank customer details, "No photos
  // captured" even when photos exist, and a blank PaperDossierReport on Preview/
  // Download since that report also expects NormalizedJob fields.
  const isScenario = !!kind;
  const scenarioItem = job as ScenarioItem & Record<string, any>;
  const rawRecord: Record<string, any> = isScenario ? (scenarioItem.rawRecord || scenarioItem) : {};

  const displayId = isScenario ? (scenarioItem.id || "—") : (job as NormalizedJob).jobId;
  // A scenario submission's `driver` field is a free-text string -- sometimes
  // initials, sometimes an email, sometimes a full name -- not a guaranteed-short
  // code. Dumping it straight into a fixed-size avatar circle (as this used to)
  // overflowed the circle and visually collided with the text next to it for
  // anything longer than ~2 characters. resolveDriver() is the shared, correct
  // place this is already handled: `code` is always capped to 2 chars.
  const scenarioDriver = isScenario ? resolveDriver(scenarioItem.driver || rawRecord["Driver"]) : null;
  const driverInitials = isScenario
    ? scenarioDriver!.code
    : ((job as NormalizedJob).driverInitials || "UN");
  const driverName = isScenario
    ? (rawRecord["Driver Name"] || scenarioDriver!.name)
    : ((job as NormalizedJob).driverName || "Unknown");
  const customerName = isScenario
    ? (scenarioItem.clientName || rawRecord["Client Name"] || rawRecord["Client Full Name"] || "Not recorded")
    : (job as NormalizedJob).customerName;

  const scenarioPhotos = isScenario ? (scenarioItem.photos || []).map((p, i) => ({
    key: p.fileId || String(i),
    href: p.thumbUrl,
    thumbSrc: p.thumbUrl,
    category: SCENARIO_TITLES[kind!]
  })) : [];
  const jobPhotos = !isScenario ? ((job as NormalizedJob).evidenceItems?.filter(e => !!e.fileId) || []).map(p => ({
    key: p.id,
    href: p.driveUrl || p.thumbProxyUrl || `/admin/api/jobs/${(job as NormalizedJob).jobId}/photos/${p.fileId}`,
    thumbSrc: p.thumbProxyUrl || `/admin/api/jobs/${(job as NormalizedJob).jobId}/photos/${p.fileId}`,
    category: p.category
  })) : [];
  const photos = isScenario ? scenarioPhotos : jobPhotos;

  const signatureUrl = isScenario
    ? (scenarioItem.signature?.thumbUrl || rawRecord["Signature"])
    : (job as NormalizedJob).signatureUrl;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleDownload = () => {
    setIsGeneratingPdf(true);
    document.body.classList.add("printing-report");
    setTimeout(async () => {
      await waitForPrintImages("#tmv-print-portal, .print-content");

      // Temporarily set document title for nice PDF filename
      const originalTitle = document.title;
      const dateStr = new Date().toISOString().slice(0, 10);
      const label = isScenario ? SCENARIO_TITLES[kind!].replace(/\s+/g, '') : 'Job_Completed';
      document.title = `${label}_${displayId}_${(driverName || '').replace(/\s+/g, '')}_${dateStr}`;

      window.print();

      document.title = originalTitle;
      document.body.classList.remove("printing-report");
      setIsGeneratingPdf(false);
      showToast("PDF Downloaded");

      if (autoDownload) {
        onClose();
      }
    }, 400);
  };
  handleDownloadRef.current = handleDownload;

  const formattedTime = isScenario
    ? formatLondonDateTime(scenarioItem.timestamp || rawRecord["Timestamp"] || rawRecord["Date"])
    : ((job as NormalizedJob).actualFinish
        ? formatLondonDateTime((job as NormalizedJob).actualFinish)
        : ((job as NormalizedJob).bookedStart ? formatLondonDateTime((job as NormalizedJob).bookedStart) : 'Unknown Time'));
  const normalizedJob = !isScenario ? (job as NormalizedJob) : null;
  const calculatedTotal = normalizedJob
    ? normalizedJob.basePrice + normalizedJob.extraCharges + normalizedJob.overtimeCharge
    : 0;

  const handleSaveReview = async () => {
    if (!normalizedJob || savingReview) return;
    setSavingReview(true);
    try {
      const result = await saveJobReview(normalizedJob.jobId, { status: managerStatus, note: managerNote });
      setJob(result.job ?? {
        ...normalizedJob,
        managerReviewStatus: result.review.status,
        managerReviewNote: result.review.note,
        managerReviewedAt: result.review.reviewedAt
      });
      onUpdated?.();
      showToast("Manager review saved");
    } catch (error: any) {
      showToast(error?.message || "Couldn't save manager review");
    } finally {
      setSavingReview(false);
    }
  };

  const SidebarLeft = () => (
    <div className="w-full lg:w-[300px] lg:flex-shrink-0 border-b lg:border-b-0 lg:border-r border-admin-line bg-white flex flex-col p-6 overflow-y-auto custom-scrollbar relative z-10">
      <h3 className="text-[14px] font-bold text-admin-ink mb-6">Manager fields</h3>
      {normalizedJob ? (
      <div className="space-y-4">
        <div className="bg-[#F8F9FA] border border-admin-line rounded-module p-4 flex items-center justify-between shadow-sm">
          <label className="flex items-center gap-2 text-label font-semibold text-fg">Status</label>
          <select
            value={managerStatus}
            onChange={e => setManagerStatus(e.target.value as "Pending" | "Approved" | "Flagged")}
            className="bg-white border border-admin-line rounded-card px-3 py-1.5 text-[13px] font-medium text-admin-ink focus:outline-none focus:ring-2 focus:ring-admin-brand/20 outline-none"
          >
            <option>Pending</option>
            <option>Approved</option>
            <option>Flagged</option>
          </select>
        </div>
        <div className="bg-[#F8F9FA] border border-admin-line rounded-module p-4 relative shadow-sm">
          <label className="flex items-center gap-2 text-label font-semibold text-fg mb-3">Note</label>
          <textarea
            value={managerNote}
            onChange={e => setManagerNote(e.target.value)}
            maxLength={2000}
            className="w-full bg-white border border-admin-line rounded-card p-3 text-[13px] text-admin-ink placeholder-admin-muted focus:outline-none focus:ring-2 focus:ring-admin-brand/20 min-h-[120px] resize-none"
            placeholder="Add manager review note"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-[11px] text-admin-muted">
              {normalizedJob.managerReviewedAt ? `Last saved ${formatLondonDateTime(normalizedJob.managerReviewedAt)}` : "Not reviewed yet"}
            </span>
            <button
              onClick={handleSaveReview}
              disabled={savingReview}
              className="h-9 px-3 rounded-card bg-admin-brand text-white text-[12px] font-bold transition hover:bg-admin-brand-dark disabled:opacity-60 flex items-center gap-2"
            >
              {savingReview ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save
            </button>
          </div>
        </div>
      </div>
      ) : (
        <div className="rounded-card border border-admin-line bg-admin-surface p-4 text-[13px] text-admin-muted">
          Manager review is only available for completed job records.
        </div>
      )}
    </div>
  );

  const SidebarRight = () => (
    <div className="w-full lg:w-[300px] lg:flex-shrink-0 border-t lg:border-t-0 lg:border-l border-admin-line bg-white flex flex-col p-6 overflow-y-auto custom-scrollbar relative z-10">
      <div className="flex items-center gap-6 border-b border-admin-line pb-3 mb-6">
        <button onClick={() => setActiveTab("Activity")} className={`text-[13px] font-bold pb-3 -mb-3 transition ${activeTab === 'Activity' ? 'text-admin-brand border-b-2 border-admin-brand' : 'text-admin-muted hover:text-admin-ink'}`}>Activity</button>
        <button onClick={() => setActiveTab("Comments")} className={`text-[13px] font-bold pb-3 -mb-3 transition ${activeTab === 'Comments' ? 'text-admin-brand border-b-2 border-admin-brand' : 'text-admin-muted hover:text-admin-ink'}`}>Comments</button>
      </div>

      <div className="flex-1">
        {activeTab === "Activity" && (
          <div className="relative pl-4 space-y-6 before:absolute before:left-0 before:top-2 before:bottom-0 before:w-px before:bg-admin-line">
            {normalizedJob?.activity?.length ? (
              normalizedJob.activity.map((entry, index) => (
                <div key={`${entry.timestamp}-${entry.action}-${index}`} className="relative flex flex-col">
                  <div className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-admin-brand ring-4 ring-white" />
                  <div className="flex items-center gap-2 mb-1 min-w-0">
                    <div className="w-6 h-6 shrink-0 rounded-full bg-admin-brand-soft text-admin-brand font-bold text-[9px] flex items-center justify-center overflow-hidden">
                      {(entry.driver || driverInitials || "UN").slice(0, 2).toUpperCase()}
                    </div>
                    <span className="min-w-0 truncate text-[13px] font-bold text-admin-ink">{entry.action.replace(/_/g, " ")}</span>
                  </div>
                  {entry.detail && <span className="text-[12px] text-admin-muted mb-1 leading-snug">{entry.detail}</span>}
                  <span className="text-[11px] font-medium text-admin-muted/60">
                    {entry.driver || "System"} - {formatLondonDateTime(entry.timestamp)}
                  </span>
                </div>
              ))
            ) : (
              <div className="rounded-card border border-admin-line bg-admin-surface p-4 text-[13px] text-admin-muted">
                No activity log entries recorded.
              </div>
            )}
          </div>
        )}
        {activeTab === "Comments" && (
          <div className="space-y-4">
            {normalizedJob?.managerReviewNote ? (
              <div className="rounded-module border border-admin-line bg-[#F8F9FA] p-4">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className="text-[12px] font-bold text-admin-ink">Manager note</span>
                  <span className="text-[11px] font-semibold text-admin-muted">
                    {normalizedJob.managerReviewedAt ? formatLondonDateTime(normalizedJob.managerReviewedAt) : ""}
                  </span>
                </div>
                <p className="text-[13px] leading-relaxed text-admin-ink whitespace-pre-wrap">{normalizedJob.managerReviewNote}</p>
              </div>
            ) : (
              <div className="rounded-card border border-admin-line bg-admin-surface p-4 text-[13px] text-admin-muted">
                No saved manager comments yet.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const FormAnswersView = () => (
    <div className="max-w-2xl mx-auto space-y-6 w-full py-6 sm:py-8 px-4 sm:px-6">
      <div className="bg-white rounded-module p-4 sm:p-6 shadow-sm border border-admin-line">
         <label className="text-[13px] font-semibold text-admin-muted block mb-2">Customer & Details</label>
         {isScenario ? (
           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
             <div>
               <span className="text-[11px] uppercase text-admin-muted font-semibold tracking-wider">Client Name</span>
               <div className="text-[14px] font-medium text-admin-ink mt-1">{customerName}</div>
             </div>
             {(kind === "checkin" || kind === "checkout") && (
               <div>
                 <span className="text-[11px] uppercase text-admin-muted font-semibold tracking-wider">Container Number</span>
                 <div className="text-[14px] font-medium text-admin-ink mt-1">{scenarioItem.containerNumber || rawRecord["Container Number"] || "—"}</div>
               </div>
             )}
             {kind === "parking" && (
               <div className="sm:col-span-2">
                 <span className="text-[11px] uppercase text-admin-muted font-semibold tracking-wider">Address</span>
                 <div className="text-[14px] font-medium text-admin-ink mt-1">{scenarioItem.address || rawRecord["Address"] || "N/A"}</div>
               </div>
             )}
             {kind === "liability" && (
               <div className="sm:col-span-2">
                 <span className="text-[11px] uppercase text-admin-muted font-semibold tracking-wider">Damage Categories</span>
                 <div className="text-[14px] font-medium text-admin-ink mt-1">{scenarioItem.damageCategories || rawRecord["Damage Categories"] || "—"}</div>
               </div>
             )}
           </div>
         ) : (
           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
             <div>
               <span className="text-[11px] uppercase text-admin-muted font-semibold tracking-wider">Customer Name</span>
               <div className="text-[14px] font-medium text-admin-ink mt-1">{(job as NormalizedJob).customerName || "N/A"}</div>
             </div>
             <div>
               <span className="text-[11px] uppercase text-admin-muted font-semibold tracking-wider">Confirmed By</span>
               <div className="text-[14px] font-medium text-admin-ink mt-1">{(job as NormalizedJob).clientConfirmedName || "N/A"}</div>
             </div>
             <div className="sm:col-span-2">
               <span className="text-[11px] uppercase text-admin-muted font-semibold tracking-wider">Pickup</span>
               <div className="text-[14px] font-medium text-admin-ink mt-1">{(job as NormalizedJob).pickup || "N/A"}</div>
             </div>
             <div className="sm:col-span-2">
               <span className="text-[11px] uppercase text-admin-muted font-semibold tracking-wider">Dropoff</span>
               <div className="text-[14px] font-medium text-admin-ink mt-1">{(job as NormalizedJob).dropoff || "N/A"}</div>
             </div>
           </div>
         )}
      </div>

      {!isScenario && normalizedJob && (
        <div className="bg-white rounded-module p-4 sm:p-6 shadow-sm border border-admin-line">
          <label className="text-[13px] font-semibold text-admin-muted block mb-4">Driver submitted details</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DetailRow label="Booked crew" value={`${normalizedJob.crewSize} crew`} />
            <DetailRow label="Paid online" value={normalizedJob.paidOnline ? "Yes" : "No"} />
            <DetailRow
              label="Extra charges selected"
              value={
                normalizedJob.extraChargeSelections?.length
                  ? normalizedJob.extraChargeSelections.join(", ")
                  : "None recorded"
              }
            />
            <DetailRow label="Overtime minutes" value={`${normalizedJob.overtimeMinutes || 0} min`} />
            <DetailRow label="Overtime charge" value={formatGBP(normalizedJob.overtimeCharge)} />
            <DetailRow label="Payment method" value={normalizedJob.paymentMethod || "Not recorded"} />
            <DetailRow label="Payment status" value={normalizedJob.paymentStatus || "Not recorded"} />
            <DetailRow label="Customer confirmed by" value={normalizedJob.clientConfirmedName || "Not recorded"} />
            <DetailRow
              label="Started"
              value={normalizedJob.actualStart ? formatLondonDateTime(normalizedJob.actualStart) : "Not recorded"}
            />
            <DetailRow
              label="Finished"
              value={normalizedJob.actualFinish ? formatLondonDateTime(normalizedJob.actualFinish) : "Not recorded"}
            />
          </div>
        </div>
      )}

      {!isScenario && normalizedJob && (
        <div className="bg-white rounded-module p-4 sm:p-6 shadow-sm border border-admin-line">
          <div className="flex items-start justify-between gap-3 mb-4">
            <label className="text-[13px] font-semibold text-admin-muted block">Charges</label>
            <span className={normalizedJob.reconciled ? "rounded-control bg-admin-status-green-bg px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.03em] text-admin-status-green" : "rounded-control bg-admin-status-red-bg px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.03em] text-admin-status-red"}>
              {normalizedJob.reconciled ? "Reconciled" : "Mismatch"}
            </span>
          </div>
          <div className="divide-y divide-admin-line rounded-card border border-admin-line overflow-hidden">
            <ChargeRow label="Base price" value={normalizedJob.basePrice} />
            <ChargeRow label="Extra charges" value={normalizedJob.extraCharges} />
            <ChargeRow label="Overtime" value={normalizedJob.overtimeCharge} />
            <ChargeRow label="Calculated total" value={calculatedTotal} strong />
            <ChargeRow label="Final charged total" value={normalizedJob.totalCharges} strong brand />
          </div>
        </div>
      )}

      <div className="bg-white rounded-module p-4 sm:p-6 shadow-sm border border-admin-line">
         <label className="text-[13px] font-semibold text-admin-muted block mb-4">Evidence that the items have been loaded.</label>
         {photos.length > 0 ? (
           <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
             {photos.map((p) => (
               <a
                 key={p.key}
                 href={p.href}
                 target="_blank" rel="noreferrer"
                 className="aspect-square rounded-card bg-admin-surface overflow-hidden border border-admin-line shadow-sm hover:ring-2 hover:ring-admin-brand/50 transition cursor-pointer block relative group"
               >
                 <img src={p.thumbSrc} className="w-full h-full object-cover" alt={p.category} />
                 <div className="absolute inset-0 bg-admin-ink/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                    <Maximize2 className="w-5 h-5 text-white" />
                 </div>
                 <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-admin-ink/80 to-transparent p-2 text-[9px] text-white font-bold truncate">
                    {p.category}
                 </div>
               </a>
             ))}
           </div>
         ) : (
           <div className="p-8 text-center bg-admin-surface border border-dashed border-admin-line rounded-card">
              <span className="text-admin-muted text-[13px]">No photos captured.</span>
           </div>
         )}
      </div>

      <div className="bg-white rounded-module p-4 sm:p-6 shadow-sm border border-admin-line">
         <label className="text-[13px] font-semibold text-admin-muted block mb-4">Client Signature</label>
         {signatureUrl ? (
            <div className="border border-admin-line rounded-card p-4 bg-admin-surface max-w-sm flex justify-center">
              <img src={signatureUrl} alt="Signature" className="max-h-24 mix-blend-multiply" />
            </div>
         ) : (
            <div className="p-8 text-center bg-admin-surface border border-dashed border-admin-line rounded-card max-w-sm">
              <span className="text-admin-muted text-[13px]">No physical signature captured.</span>
            </div>
         )}
      </div>
    </div>
  );

  return (
    // print:static -- this wrapper being position:fixed on screen previously defeated
    // .print-content's own position:absolute fix (see below): .print-content is
    // absolutely positioned relative to its nearest positioned ancestor, and this
    // outer div being position:fixed at print time meant that ancestor was itself
    // pinned to one viewport-sized box, silently capping the printed report to a
    // single page regardless of .print-content's own positioning.
    <div className="fixed inset-0 print:static z-[100] flex bg-admin-ink/30 backdrop-blur-[2px] animate-in fade-in duration-200">
      <div className="flex w-full h-full print:hidden">
      
      {toast && (
        <div className="fixed top-6 right-6 z-[200] bg-admin-ink text-white px-5 py-3 rounded-card shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
          <Check className="w-4 h-4 text-admin-status-green" />
          <span className="text-[14px] font-semibold">{toast}</span>
        </div>
      )}

      {/* Main Drawer Container */}
      <div className={`bg-[#F5F5F5] shadow-2xl flex flex-col h-full overflow-hidden transition-all duration-300 ml-auto ${isFullscreen ? 'w-full' : 'w-full max-w-[1200px]'}`}>
        
        {/* TOP HEADER */}
        <div className="min-h-[72px] bg-white border-b border-admin-line shadow-sm px-3 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0 relative z-20">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
             <div className="w-10 h-10 shrink-0 overflow-hidden rounded-full bg-admin-brand-soft text-admin-brand border border-admin-brand/20 flex items-center justify-center font-bold text-[14px]">
               {driverInitials}
             </div>
             <div className="min-w-0">
               <h2 className="text-card text-fg leading-tight truncate">{driverName || "Unknown"}</h2>
               <div className="text-[12px] text-admin-muted mt-0.5 truncate">{formattedTime}, {isScenario ? "Ref" : "Job ID"}: {displayId}</div>
             </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
             {onNavigate && (
               <div className="flex items-center gap-1 sm:mr-4 bg-admin-surface rounded-card border border-admin-line p-1">
                 <button onClick={() => onNavigate('prev')} disabled={!hasPrev} className="p-1.5 rounded-card text-admin-muted hover:text-admin-ink hover:bg-white disabled:opacity-30 transition"><ChevronLeft className="w-4 h-4" /></button>
                 <button onClick={() => onNavigate('next')} disabled={!hasNext} className="p-1.5 rounded-card text-admin-muted hover:text-admin-ink hover:bg-white disabled:opacity-30 transition"><ChevronRight className="w-4 h-4" /></button>
               </div>
             )}
             <button
               onClick={() => setIsPreviewing(!isPreviewing)}
               className={`h-10 px-2.5 sm:px-4 rounded-card border font-bold text-[13px] transition flex items-center gap-2 shadow-sm ${isPreviewing ? 'bg-admin-surface border-admin-line text-admin-ink' : 'border-admin-line bg-white hover:bg-admin-surface text-admin-ink'}`}
             >
               <Eye className="w-4 h-4 text-admin-muted" /> <span className="hidden sm:inline">{isPreviewing ? "Back to Form" : "Preview PDF"}</span>
             </button>
             <button
               onClick={handleDownload}
               disabled={isGeneratingPdf}
               className="h-10 px-2.5 sm:px-4 rounded-card border border-transparent bg-admin-brand hover:bg-admin-brand-dark text-white font-bold text-[13px] transition flex items-center gap-2 shadow-sm disabled:opacity-70"
             >
               {isGeneratingPdf ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
               <span className="hidden sm:inline">Download PDF</span>
             </button>
             <div className="hidden sm:block w-px h-6 bg-admin-line mx-2" />
             <IconButton aria-label="Close" icon={<X />} onClick={onClose} className="-mr-2" />
          </div>
        </div>

        {/* BODY -- stacked columns below lg, side-by-side panels at lg+ */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
          
          {/* Manager Sidebar */}
          {(!isPreviewing || !isFullscreen) && <SidebarLeft />}

          {/* Center Content */}
          <div className="flex-1 overflow-y-auto relative bg-[#F5F5F5] custom-scrollbar">
             {isPreviewing ? (
               <div className="min-h-full py-8 flex flex-col items-center">
                  {/* transform-origin top so zooming grows downward rather than
                      pushing the top of the page off-screen. */}
                  <div
                    className="w-full max-w-[210mm] relative transition-transform duration-150"
                    style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top center" }}
                  >
                     {isScenario ? (
                       <PaperScenarioReport item={job} kind={kind!} isPreview={true} />
                     ) : (
                       <PaperDossierReport job={job as NormalizedJob} isPreview={true} />
                     )}
                  </div>
                  
                  {/* Floating Toolbar */}
                  <div className="fixed bottom-8 right-1/2 translate-x-1/2 flex items-center gap-2 p-2 bg-admin-ink/90 rounded-module shadow-xl backdrop-blur-md">
                     {/* These two had no handlers and the readout was hardcoded to
                         100%, so the zoom control was purely decorative. It now zooms. */}
                     <button
                       onClick={() => setZoom(z => Math.max(50, z - 10))}
                       disabled={zoom <= 50}
                       aria-label="Zoom out"
                       className="w-10 h-10 rounded-card text-white/80 hover:text-white hover:bg-white/10 transition flex items-center justify-center disabled:opacity-40"
                     >
                       <ZoomOut className="w-4 h-4" />
                     </button>
                     <span className="text-[12px] font-bold text-white/90 px-2 font-mono tabular-nums">{zoom}%</span>
                     <button
                       onClick={() => setZoom(z => Math.min(200, z + 10))}
                       disabled={zoom >= 200}
                       aria-label="Zoom in"
                       className="w-10 h-10 rounded-card text-white/80 hover:text-white hover:bg-white/10 transition flex items-center justify-center disabled:opacity-40"
                     >
                       <ZoomIn className="w-4 h-4" />
                     </button>
                     <div className="w-px h-6 bg-white/20 mx-1" />
                     <button onClick={() => setIsFullscreen(!isFullscreen)} className="w-10 h-10 rounded-card text-white/80 hover:text-white hover:bg-white/10 transition flex items-center justify-center" title="Toggle Fullscreen">
                       <Maximize2 className="w-4 h-4" />
                     </button>
                  </div>
               </div>
             ) : (
               <FormAnswersView />
             )}
          </div>

          {/* Activity Sidebar */}
          {(!isPreviewing || !isFullscreen) && <SidebarRight />}
        </div>
      </div>
      
         </div>
      {/* PDF renderer mounted via PrintPortal directly into document.body for clean print isolation */}
      <PrintPortal>
        {isScenario ? (
          <PaperScenarioReport item={job} kind={kind!} isPreview={false} />
        ) : (
          <PaperDossierReport job={job as NormalizedJob} isPreview={false} />
        )}
      </PrintPortal>
    </div>
  );
}
