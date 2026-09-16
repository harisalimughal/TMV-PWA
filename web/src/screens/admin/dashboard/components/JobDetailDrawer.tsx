import React, { useState, useEffect } from "react";
import {
  X,
  Clock,
  DollarSign,
  User,
  Camera,
  Copy,
  Check,
  Download,
  Loader2,
  FileText
} from "lucide-react";
import { NormalizedJob } from "../types";
import { Button } from "../../../../ui";
import { formatLondonDateTime } from "../utils/date";
import { htmlToPlainText } from "../../../../lib/htmlText";
import { RawBookingText } from "../../../../components/driver/RawBookingText";
import { fetchDrivers as fetchDriverRoster, type AdminDriver } from "../../../../api/admin";
import { JobStatusBadge } from "./StatusBadge";
import { PdfPreviewModal } from "./PdfPreviewModal";
import { waitForPrintImages } from "../utils/printReady";
import { PhotoModal } from "./PhotoModal";
import { ThumbnailPreview } from "./ThumbnailPreview";
import { resolveDriver, formatVanReg, getAvatarColor } from "../utils/drivers";
import { reassignJob } from "../api";
import { formatCapturedTime, formatLocationLabel, mapsUrlForLocation } from "../../../../lib/geo";

interface Props {
  job: NormalizedJob;
  isOpen: boolean;
  onClose: () => void;
  /** Called after a successful reassign so the page behind the drawer (its own jobs
   * list query) can refetch -- this drawer only owns its own local `job` state. */
  onUpdated?: () => void;
}

export function JobDetailDrawer({ job: initialJob, isOpen, onClose, onUpdated }: Props) {
  const [job, setJob] = useState<NormalizedJob>(initialJob);
  const [copiedId, setCopiedId] = useState(false);
  const [activePhoto, setActivePhoto] = useState<{title: string, url: string, driveUrl?: string} | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Reassign Mode State -- real roster (not utils/drivers.ts's old localStorage mock)
  // and a real backend call, see handleReassign below.
  const [isReassigning, setIsReassigning] = useState(false);
  const [roster, setRoster] = useState<AdminDriver[]>([]);
  const [reassigning, setReassigning] = useState(false);

  // The Reassign dropdown only ever needs the roster (initials/fullName/vanReg) --
  // it used to pull this from /api/admin/drivers/summary, which also computes every
  // driver's per-job performance stats via the same full-dataset rebuild that made
  // the Jobs list slow before pagination (see jobs.repo.ts's listJobsPage). That
  // dataset build was the entire reason opening Reassign felt slow; the lightweight
  // /api/admin/drivers (just the roster, no stats) is what DriversPage's Add/Edit
  // Driver modal already uses for the same reason.
  useEffect(() => {
    if (!isReassigning || roster.length) return;
    fetchDriverRoster().then(list => setRoster(list.filter(d => d.active))).catch(() => {});
  }, [isReassigning, roster.length]);

  // PDF Generation
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  useEffect(() => {
    setJob(initialJob);
    setIsReassigning(false);
  }, [initialJob]);

  if (!isOpen) return null;

  const handleCopyJobId = () => {
    navigator.clipboard.writeText(job.jobId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handlePdfDownload = () => {
    setIsPreviewOpen(true);
  };
  
  const handleActualDownload = () => {
    setIsGeneratingPdf(true);
    document.body.classList.add("printing-report");
    setTimeout(async () => {
      await waitForPrintImages("#tmv-print-portal, .print-content");
      window.print();
      document.body.classList.remove("printing-report");
      setIsPreviewOpen(false);
      setIsGeneratingPdf(false);
      showToast(`Report generated — ${job.jobId}_Dossier.pdf downloaded`);
    }, 400);
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleReassign = async (driverInitials: string) => {
    if (reassigning) return;
    setReassigning(true);
    try {
      const result = await reassignJob(job.jobId, driverInitials);
      setJob({ ...job, driverName: result.driverName, driverInitials: result.driverInitials });
      setIsReassigning(false);
      showToast(`Reassigned to ${result.driverName}`);
      onUpdated?.();
    } catch (error: any) {
      showToast(error?.message || "Couldn't reassign this job. Try again.");
    } finally {
      setReassigning(false);
    }
  };

  const totalPounds = (job.totalCharges || job.calculatedTotalCharges || 0) / 100;

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-admin-ink/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
      
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-6 right-6 z-[200] bg-admin-ink text-white px-5 py-3 rounded-card shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
          <Check className="w-4 h-4 text-admin-status-green" />
          <span className="text-[14px] font-semibold">{toast}</span>
        </div>
      )}

      {/* Backdrop click to close */}
      <div className="absolute inset-0 cursor-pointer" onClick={onClose} />

      {/* Detail Modal */}
      <div className="relative z-10 w-full max-w-5xl bg-[#F5F5F5] shadow-2xl flex flex-col max-h-[94vh] overflow-hidden rounded-module border border-white/10 animate-in zoom-in-95 fade-in duration-200">
        
        {/* 1. Header */}
        <div className="px-6 py-5 bg-white border-b border-admin-line shadow-[0_4px_20px_rgb(0,0,0,0.03)] z-10 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="text-title text-fg leading-tight">{job.jobId}</h3>
              <button
                onClick={handleCopyJobId}
                className="p-1 rounded text-admin-muted hover:text-admin-ink hover:bg-admin-surface transition"
                title="Copy Job ID"
              >
                {copiedId ? <Check className="w-4 h-4 text-admin-status-green" /> : <Copy className="w-4 h-4" />}
              </button>
              <JobStatusBadge status={job.status} />
            </div>
            <button
              onClick={onClose}
              className="p-2 -mr-2 rounded-full text-admin-muted hover:text-admin-ink hover:bg-admin-surface transition"
              title="Close Drawer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex items-center gap-3">
            <div 
              className="w-8 h-8 rounded-full bg-admin-surface text-admin-muted border border-admin-line font-bold text-[11px] flex items-center justify-center shadow-sm"
            >
              {job.driverInitials || "UN"}
            </div>
            <span className="text-[13px] text-admin-muted">
              Operations Dossier &bull; <span className="font-medium text-admin-ink">{job.customerName || "Customer not recorded"}</span>
            </span>
          </div>

          <div className="rounded-card bg-admin-surface border border-admin-line px-3 py-2">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-admin-muted">Calendar title</span>
            <span className="mt-1 block font-mono text-[12px] text-admin-ink break-words">
              {job.rawTitle || "-"}
            </span>
          </div>
        </div>

        {/* 2. Scrollable Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-[13px] text-admin-ink relative">

          {/* Top Metrics -- Total Charges, Time, Driver. Amount Charged and
              Punctuality used to sit here too; Amount Charged was dropped along with
              Route Corridors/Move Details/Inventory below, and Punctuality now only
              shows on the Finished Jobs tab (a delay band only means something once a
              job has actually run). */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-module border border-admin-line shadow-[0_2px_10px_rgb(0,0,0,0.02)] flex flex-col justify-between">
              <span className="text-[11px] uppercase text-admin-muted font-bold tracking-wider flex items-center gap-1.5 mb-2">
                <DollarSign className="w-3 h-3" /> Total Charges
              </span>
              <span className="text-[20px] font-bold font-mono text-admin-ink">£{totalPounds.toFixed(2)}</span>
            </div>

            <div className="bg-white p-4 rounded-module border border-admin-line shadow-[0_2px_10px_rgb(0,0,0,0.02)] flex flex-col justify-between">
              <span className="text-[11px] uppercase text-admin-muted font-bold tracking-wider flex items-center gap-1.5 mb-2">
                <Clock className="w-3 h-3" /> Time
              </span>
              <span className="text-[14px] font-bold text-admin-ink truncate block">
                {job.bookedStart ? formatLondonDateTime(job.bookedStart) : "Not scheduled"}
              </span>
            </div>

            <div className="bg-white p-4 rounded-module border border-admin-line shadow-[0_2px_10px_rgb(0,0,0,0.02)] flex flex-col justify-between">
              <span className="text-[11px] uppercase text-admin-muted font-bold tracking-wider flex items-center gap-1.5 mb-2">
                <User className="w-3 h-3" /> Driver
              </span>
              <span className="text-[14px] font-bold text-admin-ink truncate block">
                {job.driverName || "Unassigned"}
              </span>
              <div className="flex items-center justify-between mt-2">
                <span className="text-[12px] text-admin-muted">{job.crewSize} Crew</span>
                {job.driverName && job.driverName !== "Unassigned" && (
                  <span className="px-1.5 py-0.5 rounded-control bg-admin-status-green-bg text-admin-status-green font-bold text-[9px] uppercase tracking-wider">
                    Sent (SMS)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Verbatim Calendar description -- same source the driver app's
              JobDetailsPanel shows. A parsed field (pickup/dropoff address, van size,
              etc.) can fail to extract cleanly from an oddly-worded booking; this is
              the office's own wording to fall back on when that happens, instead of
              just a "not properly recorded" dead end. */}
          {job.rawDescription && (
            <div className="bg-white p-5 rounded-module border border-admin-line shadow-[0_2px_10px_rgb(0,0,0,0.02)]">
              <h4 className="text-[12px] font-bold text-admin-muted uppercase tracking-wider flex items-center gap-1.5 mb-4">
                <FileText className="w-4 h-4 text-admin-brand" /> Booking Description
              </h4>
              <RawBookingText text={htmlToPlainText(job.rawDescription)} />
            </div>
          )}

          {/* Reassign Modal / Dropdown (Inline) */}
          {isReassigning && (
             <div className="bg-white p-4 rounded-module border border-admin-brand shadow-sm animate-in fade-in slide-in-from-top-2">
               <h4 className="text-[13px] font-bold text-admin-ink mb-3">Reassign Driver</h4>
               <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                 {roster.length === 0 && <div className="text-[12px] text-admin-muted p-2">Loading drivers…</div>}
                 {roster.map(d => (
                   <button
                     key={d.initials}
                     disabled={reassigning}
                     onClick={() => handleReassign(d.initials)}
                     className="w-full flex items-center justify-between p-2 rounded-card hover:bg-admin-surface border border-transparent hover:border-admin-line transition text-left disabled:opacity-50"
                   >
                     <div className="flex items-center gap-3">
                       <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[11px] ${getAvatarColor(d.initials)}`}>{d.initials}</div>
                       <div>
                         <div className="text-[13px] font-bold text-admin-ink">{d.fullName}</div>
                         <div className="text-[11px] font-mono text-admin-muted uppercase">{formatVanReg(d.vanRegistration || "")}</div>
                       </div>
                     </div>
                     <span className="text-[11px] font-bold text-admin-brand hover:underline">Select</span>
                   </button>
                 ))}
               </div>
               <div className="mt-3 text-right">
                 <button onClick={() => setIsReassigning(false)} className="text-label font-semibold text-fg-muted hover:text-fg">Cancel</button>
               </div>
             </div>
          )}

          {/* Photographic Evidence Grid */}
          <div className="bg-white p-5 rounded-module border border-admin-line shadow-[0_2px_10px_rgb(0,0,0,0.02)] space-y-4">
            <h4 className="text-[12px] font-bold text-admin-muted uppercase tracking-wider flex items-center gap-1.5">
              <Camera className="w-4 h-4 text-admin-brand" /> Evidence Photographs
            </h4>

            {job.evidenceItems?.length ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {job.evidenceItems.map((ev, i) => {
                  const thumbUrl = ev.thumbProxyUrl || ev.driveUrl;
                  const fullUrl = ev.driveUrl || ev.thumbProxyUrl;
                  const capturedTime = ev.capturedAt ? formatCapturedTime(ev.capturedAt) : "";
                  return (
                    <div key={ev.id || i} className="p-1.5 bg-admin-surface rounded-card border border-admin-line text-center space-y-1.5">
                      <span className="text-[11px] font-semibold text-admin-muted block truncate">{ev.category}</span>
                      <ThumbnailPreview
                        src={thumbUrl}
                        alt={`${ev.category} photo`}
                        state={ev.state}
                        size="lg"
                        onClick={() => {
                          if (fullUrl) {
                            setActivePhoto({
                              title: `${job.jobId} - ${ev.category}`,
                              url: fullUrl,
                              driveUrl: ev.driveUrl
                            });
                          }
                        }}
                      />
                      {/* Proof of place -- where/when the driver's device says this
                          was actually taken. Absent on older evidence. */}
                      {(capturedTime || ev.location) && (
                        <div className="text-[10.5px] leading-tight text-admin-muted space-y-0.5">
                          {capturedTime && <div>{capturedTime}</div>}
                          {ev.location ? (
                            <a
                              href={mapsUrlForLocation(ev.location)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={event => event.stopPropagation()}
                              className="block truncate text-admin-brand underline underline-offset-2"
                            >
                              {formatLocationLabel(ev.location, ev.locationName)}
                            </a>
                          ) : (
                            <div>No location</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-card border border-dashed border-admin-line bg-admin-surface p-4 text-[13px] text-admin-muted">
                No photos captured yet.
              </div>
            )}
          </div>
          
        </div>

        {/* 3. Drawer Bottom Action Footer */}
        <div className="p-5 bg-white border-t border-admin-line shadow-[0_-4px_20px_rgba(0,0,0,0.04)] flex items-center justify-between z-10 relative">
          
          <div className="flex gap-2">
            <button
              onClick={handlePdfDownload}
              disabled={isGeneratingPdf}
              className="h-10 px-4 rounded-card bg-admin-ink hover:bg-black text-white text-[13px] font-semibold transition flex items-center gap-2 shadow-sm disabled:opacity-70"
            >
              {isGeneratingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <span>{isGeneratingPdf ? "Generating..." : "Download PDF"}</span>
            </button>

            <Button variant="secondary" onClick={() => setIsReassigning(!isReassigning)} iconLeft={<User />}>
              Reassign
            </Button>
          </div>

          <button
            onClick={onClose}
            className="h-10 px-5 rounded-card border border-transparent hover:bg-admin-surface hover:text-admin-ink text-admin-muted text-[13px] font-bold transition"
          >
            Close
          </button>
        </div>
      </div>

      {/* Lightbox Modal */}
      {activePhoto && (
        <PhotoModal
          isOpen={true}
          onClose={() => setActivePhoto(null)}
          title={activePhoto.title}
          photoUrl={activePhoto.url}
          driveUrl={activePhoto.driveUrl}
        />
      )}
    
      <PdfPreviewModal 
        job={job} 
        isOpen={isPreviewOpen} 
        onClose={() => setIsPreviewOpen(false)} 
        onDownload={handleActualDownload} 
      />
    </div>
  );
}
