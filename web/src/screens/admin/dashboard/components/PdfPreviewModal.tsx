import React from "react";
import { X, Download, Printer } from "lucide-react";
import { NormalizedJob } from "../types";
import { PaperDossierReport } from "./PaperDossierReport";
import { PrintPortal } from "./PrintPortal";

interface Props {
  job: NormalizedJob;
  isOpen: boolean;
  onClose: () => void;
  onDownload: () => void; // Trigger print/download action
}

export function PdfPreviewModal({ job, isOpen, onClose, onDownload }: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 print:static z-[200] flex flex-col bg-[#525659] backdrop-blur-sm animate-in fade-in duration-200">
      
      {/* Top Toolbar (Acrobat-style) */}
      <div className="h-14 bg-[#323639] border-b border-[#202124] shadow-md flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4 text-white">
          <span className="text-[14px] font-semibold">{job.jobId}_Completed_Report.pdf</span>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={onDownload}
            className="p-2 rounded hover:bg-white/10 text-white transition flex items-center gap-2 text-[13px] font-bold"
            title="Download PDF"
          >
            <Download className="w-4 h-4" /> Download
          </button>
          <button 
            onClick={onDownload}
            className="p-2 rounded hover:bg-white/10 text-white transition"
            title="Print"
          >
            <Printer className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-white/20 mx-1" />
          <button 
            onClick={onClose}
            className="p-2 rounded hover:bg-white/10 text-white transition"
            title="Close Preview"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Scrollable Preview Area */}
      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar flex flex-col items-center gap-8">
         <div className="w-full max-w-[210mm]">
           {/* We render PaperDossierReport here with isPreview=true so it sizes to 100% width of the max-w container and stacks naturally */}
           <PaperDossierReport job={job} isPreview={true} />
         </div>
      </div>

      {/* Print-only renderer mounted via PrintPortal directly into document.body */}
      <PrintPortal>
        <PaperDossierReport job={job} isPreview={false} />
      </PrintPortal>
    </div>
  );
}
