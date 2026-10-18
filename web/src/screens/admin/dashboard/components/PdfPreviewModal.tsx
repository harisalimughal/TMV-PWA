import React from "react";
import { createPortal } from "react-dom";
import { X, Download, Printer } from "lucide-react";
import { NormalizedJob } from "../types";
import { PaperDossierReport } from "./PaperDossierReport";
import { PrintPortal } from "./PrintPortal";
import { ReportPreviewCanvas } from "./ReportPreviewCanvas";
import { useDialogFocus } from "../../../../ui/useDialogFocus";

interface Props {
  /** The job whose Job Completed report is previewed (the default report). */
  job?: NormalizedJob;
  /** Another report instead, e.g. a liability / storage scenario record. */
  renderReport?: (isPreview: boolean) => React.ReactNode;
  fileName?: string;
  isOpen: boolean;
  onClose: () => void;
  onDownload: () => void; // Trigger print/download action
}

export function PdfPreviewModal({ job, renderReport, fileName, isOpen, onClose, onDownload }: Props) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  // Joins the shared dialog stack used by Modal and Drawer. The preview opens on top of
  // the job dialog, so it must be the top dialog: Escape then closes only the preview,
  // Tab stays inside it, and focus returns to "Download PDF" afterwards.
  useDialogFocus(isOpen, panelRef, onClose);
  if (!isOpen) return null;
  const report = renderReport ?? ((isPreview: boolean) => job ? <PaperDossierReport job={job} isPreview={isPreview} /> : null);

  // Portaled to <body> like Drawer and Modal. Rendered in place it sat inside the admin
  // layout's `relative z-10` column, so the job dialog (a body-level portal) covered it
  // and "Download PDF" appeared to do nothing. Hidden when printing: the printable copy
  // is the separate PrintPortal below.
  return createPortal(
    <div ref={panelRef} tabIndex={-1} style={{ outline: "none" }} role="dialog" aria-modal="true" aria-label="Report preview" className="fixed inset-0 print:hidden z-[200] flex flex-col bg-admin-surface animate-in fade-in duration-200">
      
      {/* Top Toolbar (Acrobat-style) */}
      <div className="min-h-16 bg-white border-b border-admin-line flex flex-wrap items-center justify-between gap-3 px-4 py-3 shrink-0">
        <div className="min-w-0 flex-1 text-admin-ink">
          <span className="block text-[13px] font-semibold [overflow-wrap:anywhere]">{fileName ?? `${job?.jobId}_Completed_Report.pdf`}</span>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={onDownload}
            className="min-h-10 p-2 rounded-control hover:bg-admin-surface text-admin-ink transition flex items-center gap-2 text-[13px] font-medium"
            title="Download PDF"
            aria-label="Download PDF"
          >
            <Download className="w-4 h-4" /> <span className="hidden sm:inline">Download</span>
          </button>
          <button 
            onClick={onDownload}
            className="min-h-10 p-2 rounded-control hover:bg-admin-surface text-admin-muted transition"
            title="Print"
            aria-label="Print"
          >
            <Printer className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-admin-line mx-1" />
          <button 
            onClick={onClose}
            className="min-h-10 p-2 rounded-control hover:bg-admin-surface text-admin-muted transition"
            title="Close preview"
            aria-label="Close preview"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Scrollable Preview Area */}
      <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-6 custom-scrollbar">
         <ReportPreviewCanvas>
           {report(true)}
         </ReportPreviewCanvas>
      </div>

      {/* Print-only renderer mounted via PrintPortal directly into document.body */}
      <PrintPortal>
        {report(false)}
      </PrintPortal>
    </div>,
    document.body
  );
}
