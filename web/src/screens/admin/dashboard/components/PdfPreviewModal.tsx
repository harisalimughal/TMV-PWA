import React from "react";
import { X, Download, Printer } from "lucide-react";
import { NormalizedJob } from "../types";
import { PaperDossierReport } from "./PaperDossierReport";
import { PrintPortal } from "./PrintPortal";
import { ReportPreviewCanvas } from "./ReportPreviewCanvas";
import { ReportReturnButton } from "./ReportReturnButton";

interface Props {
  job: NormalizedJob;
  isOpen: boolean;
  onClose: () => void;
  onDownload: () => void; // Trigger print/download action
}

export function PdfPreviewModal({ job, isOpen, onClose, onDownload }: Props) {
  if (!isOpen) return null;

  return (
    <div role="dialog" aria-modal="true" aria-label="Report preview" className="fixed inset-0 print:static z-[200] flex flex-col bg-[#edf1f4] animate-in fade-in duration-200">
      
      {/* Top Toolbar (Acrobat-style) */}
      <div className="min-h-16 bg-white border-b border-admin-line flex flex-wrap items-center justify-between gap-3 px-4 py-3 shrink-0">
        <ReportReturnButton compact />
        <div className="min-w-0 flex-1 text-admin-ink">
          <span className="block text-[13px] font-semibold [overflow-wrap:anywhere]">{job.jobId}_Completed_Report.pdf</span>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={onDownload}
            className="min-h-10 p-2 rounded-control hover:bg-admin-surface text-admin-ink transition flex items-center gap-2 text-[13px] font-medium"
            title="Download PDF"
          >
            <Download className="w-4 h-4" /> <span className="hidden sm:inline">Download</span>
          </button>
          <button 
            onClick={onDownload}
            className="min-h-10 p-2 rounded-control hover:bg-admin-surface text-admin-muted transition"
            title="Print"
          >
            <Printer className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-admin-line mx-1" />
          <button 
            onClick={onClose}
            className="min-h-10 p-2 rounded-control hover:bg-admin-surface text-admin-muted transition"
            title="Close Preview"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Scrollable Preview Area */}
      <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-6 custom-scrollbar">
         <ReportPreviewCanvas>
           <PaperDossierReport job={job} isPreview={true} />
         </ReportPreviewCanvas>
      </div>

      {/* Print-only renderer mounted via PrintPortal directly into document.body */}
      <PrintPortal>
        <PaperDossierReport job={job} isPreview={false} />
      </PrintPortal>
    </div>
  );
}
