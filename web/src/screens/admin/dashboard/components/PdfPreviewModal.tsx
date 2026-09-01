import React, { useState } from "react";
import { X, Download, Printer } from "lucide-react";
import { NormalizedJob } from "../types";
import { PaperDossierReport } from "./PaperDossierReport";

interface Props {
  job: NormalizedJob;
  isOpen: boolean;
  onClose: () => void;
  onDownload: () => void; // Trigger print/download action
}

export function PdfPreviewModal({ job, isOpen, onClose, onDownload }: Props) {
  if (!isOpen) return null;

  return (
    // print:static -- this wrapper being position:fixed on screen previously defeated
    // .print-content's own position:absolute fix below: .print-content is absolutely
    // positioned relative to its nearest positioned ancestor, and this outer div being
    // position:fixed at print time meant that ancestor was itself pinned to one
    // viewport-sized box, silently capping the printed report to a single page.
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

      {/* Print-only renderer, kept off-screen rather than display:none -- see
          index.css's .print-content rule. window.print() while this modal is open
          would otherwise capture the modal's own fixed/scrollable chrome, which
          browsers can't paginate across multiple print pages -- only whatever fits
          the current viewport gets printed, silently truncating everything else.
          index.css's @media print rule hides body * by default and only re-shows
          .print-content, so this is the only thing that ends up on the
          printed/saved-as-PDF page, laid out via PaperDossierReport's own
          isPreview=false print-page/@page CSS.
          Positioning (fixed off-screen normally, absolute at print time) is owned
          entirely by that CSS class; don't add position utilities here, a fixed
          position at print time previously caused only page 1 of a multi-page
          report to print. */}
      <div className="print-content">
        <PaperDossierReport job={job} isPreview={false} />
      </div>
    </div>
  );
}
