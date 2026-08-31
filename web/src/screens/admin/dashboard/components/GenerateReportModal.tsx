import React, { useState, useEffect } from "react";
import { X, FileText, Download, AlertTriangle, FileDown } from "lucide-react";
import { DateRangePicker } from "./DateRangePicker";
import { Button, IconButton } from "../../../../ui";

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

  // Report generation is not wired to a backend yet. Rather than fabricate a file, the
  // action reports the feature as unavailable -- see handleGenerate. The picker UI is
  // kept so the contract (report type / range / format) is visible for when it lands.
  const [status, setStatus] = useState<"idle" | "unavailable">("idle");

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
    // No backend endpoint for report generation exists yet. Previously this faked a
    // delay, a random 5% failure, and downloaded a "Mock Report Content" text file --
    // all of which looked to an operator like a real, if flaky, report. Until the
    // real endpoint is built it reports honestly that the feature is unavailable.
    setStatus("unavailable");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-module shadow-2xl w-full max-w-[600px] max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="px-6 py-5 border-b border-admin-line flex items-center justify-between bg-[#FAFAFA] shrink-0">
          <h2 className="text-title text-fg flex items-center gap-2">
            <FileText className="w-5 h-5 text-admin-brand" /> Generate Report
          </h2>
          <IconButton aria-label="Close" icon={<X />} onClick={onClose} className="-mr-2" />
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 min-h-0">
             <div className="space-y-6">

                {status === "unavailable" && (
                  <div className="p-4 bg-admin-status-amber-bg border border-admin-status-amber/30 rounded-card flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-admin-status-amber shrink-0" />
                    <div>
                      <h4 className="text-[14px] font-bold text-admin-status-amber">Report generation isn&apos;t available yet</h4>
                      <p className="text-[13px] text-admin-ink-2 mt-0.5">
                        This build has no report backend wired up. Use the CSV exports on the Reports, Jobs and
                        Completed Jobs pages in the meantime.
                      </p>
                    </div>
                  </div>
                )}

                {/* Report Type */}
                <div>
                  <label className="block text-eyebrow text-fg-subtle tracking-wider mb-3">Report Scope</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {REPORT_TYPES.map(type => (
                      <label 
                        key={type}
                        className={`flex items-center gap-3 p-3 rounded-card border transition cursor-pointer ${reportType === type ? 'border-admin-brand bg-admin-brand-soft/20 text-admin-brand' : 'border-admin-line bg-white hover:bg-admin-surface text-admin-ink'}`}
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
                  <label className="block text-eyebrow text-fg-subtle tracking-wider mb-3">Date Filter</label>
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
                     <label className="block text-eyebrow text-fg-subtle tracking-wider mb-2">Driver Filter</label>
                     <select 
                       value={driver}
                       onChange={e => setDriver(e.target.value)}
                       className="w-full h-10 px-3 rounded-card border border-admin-line bg-admin-surface text-[13px] text-admin-ink outline-none focus:border-admin-brand transition"
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
                  <label className="block text-eyebrow text-fg-subtle tracking-wider mb-3">Export Format</label>
                  <div className="flex items-center gap-3">
                    <label className={`flex-1 flex flex-col items-center justify-center p-4 rounded-card border transition cursor-pointer ${format === 'PDF' ? 'border-admin-brand bg-admin-brand-soft/20 text-admin-brand' : 'border-admin-line bg-white hover:bg-admin-surface text-admin-muted'}`}>
                       <input type="radio" className="sr-only" checked={format === 'PDF'} onChange={() => setFormat('PDF')} />
                       <FileDown className={`w-6 h-6 mb-2 ${format === 'PDF' ? 'text-admin-brand' : 'text-admin-muted'}`} />
                       <span className="text-[14px] font-bold">PDF Document</span>
                       <span className="text-[11px] mt-1 text-center">Certified graphical report with logo and metrics</span>
                    </label>

                    <label className={`flex-1 flex flex-col items-center justify-center p-4 rounded-card border transition cursor-pointer ${format === 'CSV' ? 'border-admin-brand bg-admin-brand-soft/20 text-admin-brand' : 'border-admin-line bg-white hover:bg-admin-surface text-admin-muted'}`}>
                       <input type="radio" className="sr-only" checked={format === 'CSV'} onChange={() => setFormat('CSV')} />
                       <FileText className={`w-6 h-6 mb-2 ${format === 'CSV' ? 'text-admin-brand' : 'text-admin-muted'}`} />
                       <span className="text-[14px] font-bold">CSV Spreadsheet</span>
                       <span className="text-[11px] mt-1 text-center">Flat tabular data suitable for Excel</span>
                    </label>
                  </div>
                </div>

             </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-line bg-surface-sunken px-6 py-4">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={noDatesSelected || status === "unavailable"}
            iconLeft={<Download />}
          >
            Generate {format}
          </Button>
        </div>

      </div>
    </div>
  );
}
