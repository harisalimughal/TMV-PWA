import React from "react";
import { Download, Printer } from "lucide-react";
import { NormalizedJob } from "../types";
import { formatLondonDateTime } from "../utils/date";

interface Props {
  job: NormalizedJob;
  onClose?: () => void;
}

export function PaperJobReport({ job, onClose }: Props) {
  const photoCategories = [
    { key: "Arrival", label: "Arrival and Start the Job !" },
    { key: "Loaded", label: "Proof Of Van Loaded" },
    { key: "Empty", label: "Empty Van / Unloaded ?" },
    { key: "Organized", label: "Is the van organized ?" },
  ];

  const photos = photoCategories.map(cat => {
    const ev = job.evidenceItems.find(e => 
      e.category.toLowerCase().includes(cat.key.toLowerCase()) && (e.thumbProxyUrl || e.driveUrl)
    );
    // Use full resolution URL for printing, fallback to proxy
    return {
      ...cat,
      url: ev ? (ev.thumbProxyUrl || ev.driveUrl) : null
    };
  }).filter(p => p.url); // Only include captured photos

  // Calculate pages. 
  // Page 1: Meta + Photo 1
  // Page N: Photo N
  // Last Page: Client Details & Signature
  // If no photos, just 1 page.
  
  const totalPages = Math.max(1, photos.length + 1);

  const PrintHeader = () => (
    <div className="flex items-center justify-between pb-4 border-b border-admin-line mb-6">
      <h1 className="text-[20px] font-bold text-[#1A1A1A]">Job Completed</h1>
      <div className="flex flex-col items-end">
        <img src={`/tmv-logo.png`} alt="The Man Van" className="w-24 object-contain" />
        <span className="text-[10px] font-bold text-[#1A1A1A] tracking-wider mt-1">020 3773 9113</span>
      </div>
    </div>
  );

  const PrintFooter = ({ page }: { page: number }) => (
    <div className="mt-auto pt-4 border-t border-admin-line flex justify-end">
      <span className="text-[11px] text-[#8A8A8A]">{page}/{totalPages}</span>
    </div>
  );

  const MetaRow = () => {
    const driverInit = job.driverInitials || "UN";
    const driverColor = driverInit === "UN" ? "bg-amber-500" : "bg-[#F59E0B]"; // Orange as requested
    
    return (
      <div className="flex items-start justify-between p-4 border border-admin-line rounded-xl mb-6 bg-white shadow-sm">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-full ${driverColor} text-white flex items-center justify-center text-[13px] font-bold`}>
            {driverInit}
          </div>
          <div>
            <div className="text-[14px] font-bold text-[#1A1A1A]">{job.driverName || "Unassigned"}</div>
            <div className="text-[12px] text-[#8A8A8A] mt-0.5">{formatLondonDateTime(job.updated)} | Europe/London</div>
          </div>
        </div>
        <div className="px-3 py-1 bg-admin-surface text-[#1A1A1A] text-[13px] font-semibold rounded-lg border border-admin-line">
          #{job.jobId}
        </div>
      </div>
    );
  };

  return (
    <div className="paper-document bg-white font-sans text-[#1A1A1A]">
      
      {/* NO-PRINT CONTROLS */}
      <div className="no-print flex items-center justify-between p-4 mb-4 bg-admin-surface rounded-xl border border-admin-line">
        <div className="text-[14px] font-semibold text-admin-ink">Preview Large-Format Report</div>
        <div className="flex items-center gap-3">
          <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-admin-line bg-white hover:bg-admin-surface text-[13px] font-medium text-admin-ink transition shadow-sm">
            <Download className="w-4 h-4 text-admin-brand" /> PDF
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-admin-line bg-white hover:bg-admin-surface text-[13px] font-medium text-admin-ink transition shadow-sm">
            <Printer className="w-4 h-4 text-admin-muted" /> Print
          </button>
          {onClose && (
            <button onClick={onClose} className="px-3 py-1.5 text-[13px] font-medium text-admin-muted hover:text-admin-ink transition">
              Close
            </button>
          )}
        </div>
      </div>

      {/* RENDER PAGES */}
      <style>{`
        @media print {
          .print-page-container {
            page-break-after: always;
            height: 100vh;
            display: flex;
            flex-direction: column;
            padding: 20px;
            box-sizing: border-box;
          }
          .print-page-container:last-child {
            page-break-after: auto;
          }
          body { background: white; }
        }
        .print-page-container {
          min-height: 297mm; /* A4 rough size for screen */
          display: flex;
          flex-direction: column;
          padding: 40px;
          margin-bottom: 24px;
          background: white;
          border: 1px solid var(--admin-line);
          border-radius: 8px;
          box-shadow: var(--shadow-sm);
        }
      `}</style>

      {photos.map((photo, index) => (
        <div key={index} className="print-page-container">
          <PrintHeader />
          {index === 0 && <MetaRow />}
          
          <div className="flex-1 flex flex-col mb-4">
            <div className="text-[13px] font-semibold text-[#8A8A8A] mb-3">
              {photo.label}
            </div>
            <div className="flex-1 flex items-center justify-center border border-admin-line rounded-xl p-2 shadow-sm bg-[#FAFAFA]">
              <img 
                src={photo.url!} 
                alt={photo.label} 
                className="max-w-[90%] max-h-[70vh] object-contain rounded-lg"
              />
            </div>
          </div>

          <PrintFooter page={index + 1} />
        </div>
      ))}

      {/* FINAL PAGE: SIGNATURE & CLIENT DETAILS */}
      <div className="print-page-container">
        <PrintHeader />
        {photos.length === 0 && <MetaRow />}

        <div className="flex-1 flex flex-col gap-6 mt-4">
          
          {/* Billing & Times (Key-Value) */}
          <div className="bg-[#F7F7F7] rounded-xl border border-admin-line p-6 shadow-sm">
            <h3 className="text-[13px] font-semibold text-[#2563EB] mb-4">JOB DETAILS & CHARGES</h3>
            <div className="grid grid-cols-2 gap-x-12 gap-y-3">
              <div className="flex justify-between py-1 border-b border-admin-line/50">
                <span className="text-[12px] text-[#8A8A8A]">Base Price</span>
                <span className="text-[12px] font-medium text-[#1A1A1A]">£{(job.basePrice || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-admin-line/50">
                <span className="text-[12px] text-[#8A8A8A]">Extra Charges</span>
                <span className="text-[12px] font-medium text-[#1A1A1A]">£{(job.extraCharges || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-admin-line/50">
                <span className="text-[12px] text-[#8A8A8A]">Overtime ({job.overtimeMinutes}m)</span>
                <span className="text-[12px] font-medium text-[#1A1A1A]">£{(job.overtimeCharge || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#1A1A1A]/20">
                <span className="text-[12px] font-bold text-[#1A1A1A]">Total Charges</span>
                <span className="text-[14px] font-bold text-[#1A1A1A]">£{(job.totalCharges || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-admin-line/50">
                <span className="text-[12px] text-[#8A8A8A]">Payment Method</span>
                <span className="text-[12px] font-medium text-[#1A1A1A]">{job.paymentMethod || "Not recorded"}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-admin-line/50">
                <span className="text-[12px] text-[#8A8A8A]">Actual Duration</span>
                <span className="text-[12px] font-medium text-[#1A1A1A]">{job.actualMinutes ? `${job.actualMinutes}m` : "—"}</span>
              </div>
            </div>
          </div>

          {/* Client Details */}
          <div className="bg-[#F7F7F7] rounded-xl border border-admin-line p-6 shadow-sm">
            <h3 className="text-[13px] font-semibold text-[#2563EB] mb-4">CLIENT DETAILS</h3>
            <div className="grid grid-cols-2 gap-x-12 gap-y-3">
              <div className="flex justify-between py-1 border-b border-admin-line/50">
                <span className="text-[12px] text-[#8A8A8A]">Client Name</span>
                <span className="text-[12px] font-medium text-[#1A1A1A]">{job.customerName || "—"}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-admin-line/50">
                <span className="text-[12px] text-[#8A8A8A]">Phone</span>
                <span className="text-[12px] font-medium text-[#1A1A1A]">{job.customerPhone || "—"}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-admin-line/50">
                <span className="text-[12px] text-[#8A8A8A]">Email</span>
                <span className="text-[12px] font-medium text-[#1A1A1A] truncate max-w-[200px] text-right">{job.customerEmail || "—"}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-admin-line/50">
                <span className="text-[12px] text-[#8A8A8A]">Pickup</span>
                <span className="text-[12px] font-medium text-[#1A1A1A] truncate max-w-[200px] text-right" title={job.pickup}>{job.pickup || "—"}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-admin-line/50">
                <span className="text-[12px] text-[#8A8A8A]">Dropoff</span>
                <span className="text-[12px] font-medium text-[#1A1A1A] truncate max-w-[200px] text-right" title={job.dropoff}>{job.dropoff || "—"}</span>
              </div>
            </div>
          </div>

          {/* Signature */}
          <div className="mt-4">
            <p className="text-[11px] text-[#8A8A8A] italic mb-2">
              By signing this document, you confirm that the service was completed to your satisfaction and all charges are accepted.
            </p>
            <div className="text-[12px] font-semibold text-[#8A8A8A] mb-2">Client Signature:</div>
            <div className="w-full sm:w-1/2 h-[160px] border border-admin-line rounded-xl bg-white p-4 shadow-sm flex items-center justify-center">
              {job.signatureUrl ? (
                <img src={job.signatureUrl} alt="Signature" className="max-w-full max-h-full object-contain" />
              ) : (
                <span className="text-[#8A8A8A] text-[12px]">No signature provided</span>
              )}
            </div>
            <div className="text-[12px] text-[#8A8A8A] mt-2">
              Signed: {job.actualFinish ? formatLondonDateTime(job.actualFinish) : "—"}
            </div>
          </div>

        </div>

        <PrintFooter page={totalPages} />
      </div>

    </div>
  );
}
