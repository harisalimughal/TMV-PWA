import React, { useState, useEffect } from "react";
import { X, FileText, Download, CheckCircle2, AlertTriangle, Loader2, FileDown } from "lucide-react";
import { DateRangePicker } from "./DateRangePicker";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialFrom?: string;
  initialTo?: string;
}

const REPORT_TYPES = [
  "Analytics Overview",
  "Daily Operations",
  "Weekly Operations",
  "Monthly Operations",
  "Driver Performance",
  "Revenue",
  "Payments",
  "Exceptions"
];

export function GenerateReportModal({ isOpen, onClose, initialFrom, initialTo }: Props) {
  const [reportType, setReportType] = useState("Analytics Overview");
  const [format, setFormat] = useState<"PDF" | "CSV">("PDF");
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [driver, setDriver] = useState("all");

  const [status, setStatus] = useState<"idle" | "generating" | "success" | "error">("idle");
  const [generatedFilename, setGeneratedFilename] = useState("");

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setStatus("idle");
      setReportType("Analytics Overview");
      setFormat("PDF");
      setFrom(initialFrom);
      setTo(initialTo);
      setDriver("all");
    }
  }, [isOpen, initialFrom, initialTo]);

  if (!isOpen) return null;

  const requiresDateRange = ["Daily Operations", "Weekly Operations", "Monthly Operations"].includes(reportType);
  const noDatesSelected = requiresDateRange && (!from || !to);
  
  const showDriverFilter = ["Driver Performance", "Revenue"].includes(reportType);

  const handleGenerate = () => {
    setStatus("generating");
    
    // Simulate generation delay
    setTimeout(() => {
      // Simulate 5% error rate or specific empty state
      if (Math.random() < 0.05) {
         setStatus("error");
         return;
      }

      // Generate mock filename
      const safeType = reportType.replace(/ /g, "_");
      let dateSuffix = "All_Time";
      if (from && to) {
         const d1 = new Date(from).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).replace(/ /g, "");
         const d2 = new Date(to).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, "");
         dateSuffix = `${d1}-${d2}`;
      }
      const fname = `${safeType}_${dateSuffix}.${format.toLowerCase()}`;
      setGeneratedFilename(fname);
      setStatus("success");

      // Auto download (mock)
      const link = document.createElement("a");
      link.href = "data:text/plain;charset=utf-8,Mock%20Report%20Content";
      link.download = fname;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Auto close after 2.5s success toast
      setTimeout(() => {
         onClose();
      }, 2500);

    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-[600px] max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="px-6 py-5 border-b border-admin-line flex items-center justify-between bg-[#FAFAFA] shrink-0">
          <h2 className="text-[18px] font-bold text-admin-ink flex items-center gap-2">
            <FileText className="w-5 h-5 text-admin-brand" /> Generate Report
          </h2>
          <button 
            onClick={onClose} 
            disabled={status === "generating"}
            className="p-2 -mr-2 text-admin-muted hover:text-admin-ink hover:bg-admin-surface rounded-full transition disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 min-h-0">
           {status === "success" ? (
             <div className="py-12 flex flex-col items-center justify-center text-center">
               <div className="w-16 h-16 bg-admin-status-green-bg text-admin-status-green rounded-full flex items-center justify-center mb-4">
                 <CheckCircle2 className="w-8 h-8" />
               </div>
               <h3 className="text-[20px] font-bold text-admin-ink mb-2">Report Generated!</h3>
               <p className="text-[14px] text-admin-muted">
                 <span className="font-mono text-admin-ink font-semibold">{generatedFilename}</span> downloaded.
               </p>
             </div>
           ) : status === "generating" ? (
             <div className="py-16 flex flex-col items-center justify-center text-center">
               <Loader2 className="w-10 h-10 text-admin-brand animate-spin mb-4" />
               <h3 className="text-[16px] font-semibold text-admin-ink">Generating {format} Report...</h3>
               <p className="text-[13px] text-admin-muted mt-1">Compiling metrics and layout. Please wait.</p>
             </div>
           ) : (
             <div className="space-y-6">
                
                {status === "error" && (
                  <div className="p-4 bg-admin-status-red/10 border border-admin-status-red/20 rounded-xl flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-admin-status-red shrink-0" />
                    <div>
                      <h4 className="text-[14px] font-bold text-admin-status-red">Generation Failed</h4>
                      <p className="text-[13px] text-admin-status-red/80 mt-0.5">Couldn't generate the report due to a timeout. Please try again.</p>
                    </div>
                  </div>
                )}

                {/* Report Type */}
                <div>
                  <label className="block text-[12px] font-semibold text-admin-muted uppercase tracking-wider mb-3">Report Scope</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {REPORT_TYPES.map(type => (
                      <label 
                        key={type}
                        className={`flex items-center gap-3 p-3 rounded-xl border transition cursor-pointer ${reportType === type ? 'border-admin-brand bg-admin-brand-soft/20 text-admin-brand' : 'border-admin-line bg-white hover:bg-admin-surface text-admin-ink'}`}
                      >
                        <input 
                          type="radio" 
                          name="reportType" 
                          value={type} 
                          checked={reportType === type}
                          onChange={() => setReportType(type)}
                          className="w-4 h-4 text-admin-brand focus:ring-admin-brand border-admin-line" 
                        />
                        <span className="text-[13px] font-semibold">{type}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Date Range */}
                <div>
                  <label className="block text-[12px] font-semibold text-admin-muted uppercase tracking-wider mb-3">Date Filter</label>
                  <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
                  {noDatesSelected && (
                    <p className="text-[11px] text-admin-status-red mt-2 font-medium flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> A specific date range is required for this report.
                    </p>
                  )}
                </div>

                {/* Optional Driver Filter */}
                {showDriverFilter && (
                   <div>
                     <label className="block text-[12px] font-semibold text-admin-muted uppercase tracking-wider mb-2">Driver Filter</label>
                     <select 
                       value={driver}
                       onChange={e => setDriver(e.target.value)}
                       className="w-full h-10 px-3 rounded-xl border border-admin-line bg-admin-surface text-[13px] text-admin-ink outline-none focus:border-admin-brand transition"
                     >
                       <option value="all">All Drivers</option>
                       <option value="MK">Maico (MK)</option>
                       <option value="KA">Caio (KA)</option>
                       <option value="TI">Tiago (TI)</option>
                     </select>
                   </div>
                )}

                {/* Format Options */}
                <div>
                  <label className="block text-[12px] font-semibold text-admin-muted uppercase tracking-wider mb-3">Export Format</label>
                  <div className="flex items-center gap-3">
                    <label className={`flex-1 flex flex-col items-center justify-center p-4 rounded-xl border transition cursor-pointer ${format === 'PDF' ? 'border-admin-brand bg-admin-brand-soft/20 text-admin-brand' : 'border-admin-line bg-white hover:bg-admin-surface text-admin-muted'}`}>
                       <input type="radio" className="sr-only" checked={format === 'PDF'} onChange={() => setFormat('PDF')} />
                       <FileDown className={`w-6 h-6 mb-2 ${format === 'PDF' ? 'text-admin-brand' : 'text-admin-muted'}`} />
                       <span className="text-[14px] font-bold">PDF Document</span>
                       <span className="text-[11px] mt-1 text-center">Certified graphical report with logo and metrics</span>
                    </label>

                    <label className={`flex-1 flex flex-col items-center justify-center p-4 rounded-xl border transition cursor-pointer ${format === 'CSV' ? 'border-admin-brand bg-admin-brand-soft/20 text-admin-brand' : 'border-admin-line bg-white hover:bg-admin-surface text-admin-muted'}`}>
                       <input type="radio" className="sr-only" checked={format === 'CSV'} onChange={() => setFormat('CSV')} />
                       <FileText className={`w-6 h-6 mb-2 ${format === 'CSV' ? 'text-admin-brand' : 'text-admin-muted'}`} />
                       <span className="text-[14px] font-bold">CSV Spreadsheet</span>
                       <span className="text-[11px] mt-1 text-center">Flat tabular data suitable for Excel</span>
                    </label>
                  </div>
                </div>

             </div>
           )}
        </div>

        {/* Footer */}
        {status !== "success" && status !== "generating" && (
          <div className="px-6 py-4 border-t border-admin-line bg-[#FAFAFA] flex items-center justify-end gap-3 shrink-0">
            <button 
              onClick={onClose}
              className="px-4 py-2 rounded-[12px] text-[13px] font-semibold text-admin-muted hover:text-admin-ink hover:bg-admin-surface transition"
            >
              Cancel
            </button>
            <button 
              onClick={handleGenerate}
              disabled={noDatesSelected}
              className="px-6 py-2 rounded-[12px] bg-admin-ink disabled:opacity-50 disabled:cursor-not-allowed hover:bg-black text-white text-[13px] font-semibold shadow-sm transition flex items-center gap-2"
            >
              <Download className="w-4 h-4" /> Generate {format}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
