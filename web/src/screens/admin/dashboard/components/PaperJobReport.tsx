import { withArrivalDistance } from "../../../../lib/trackerArrival";
import React from "react";
import { Download, Printer } from "lucide-react";
import { NormalizedJob } from "../types";
import { formatLondonDateTime } from "../utils/date";
import { adjustmentReasonForMismatch } from "../utils/workBreakdown";
import { ReportDocumentHeader, ReportDocumentFooter, ReportRecordMeta } from "./ReportDocumentHeader";

interface Props {
  job: NormalizedJob;
  onClose?: () => void;
}

export function PaperJobReport({ job, onClose }: Props) {
  const totalCharges = job.totalCharges ?? job.calculatedTotalCharges ?? job.basePrice + job.extraCharges + job.overtimeCharge;
  const adjustmentReason = adjustmentReasonForMismatch(job);
  const formatPounds = (pence: number | undefined) => `£${((pence || 0) / 100).toFixed(2)}`;
  const photoCategories = [
    { key: "Arrival", label: "Arrival / Pickup" },
    { key: "Loaded", label: "Proof Of Van Loaded" },
    { key: "StopBy", label: "Stop-by Point" },
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

  const PrintFooter = ({ page }: { page: number }) => (
    <ReportDocumentFooter reference={job.jobId} page={page} total={totalPages} />
  );

  return (
    <div className="report-document report-document-preview paper-document bg-white font-sans text-[#1A1A1A]">
      
      {/* NO-PRINT CONTROLS */}
      <div className="no-print flex items-center justify-between p-4 mb-4 bg-admin-surface rounded-card border border-admin-line">
        <div className="text-card text-fg">Preview Large-Format Report</div>
        <div className="flex items-center gap-3">
          <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-control border border-line-strong bg-surface hover:bg-surface-sunken text-button text-fg transition shadow-sm">
            <Download className="w-4 h-4 text-admin-brand" /> PDF
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-control border border-line-strong bg-surface hover:bg-surface-sunken text-button text-fg transition shadow-sm">
            <Printer className="w-4 h-4 text-admin-muted" /> Print
          </button>
          {onClose && (
            <button onClick={onClose} className="px-3 py-1.5 text-label font-medium text-fg-muted hover:text-admin-ink transition">
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
            min-height: 297mm;
            display: flex;
            flex-direction: column;
            padding: 14mm;
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
          <ReportDocumentHeader title="Job Completed" reference={job.jobId} page={index + 1} />
          {index === 0 && <ReportRecordMeta name={job.driverName || "Unassigned"} initials={job.driverInitials || "UN"} timestamp={formatLondonDateTime(job.updated)} reference={job.jobId} />}
          
          <div className="flex-1 flex flex-col mb-4">
            <div className="text-[13px] font-semibold text-[#8A8A8A] mb-3">
              {photo.label}
            </div>
            <div className="report-media-frame flex-1 flex items-center justify-center border border-admin-line rounded-card p-2 shadow-sm bg-[#FAFAFA]">
              <img 
                src={photo.url!} 
                alt={photo.label} 
                className="max-w-[90%] max-h-[70vh] object-contain rounded-card"
              />
            </div>
          </div>

          <PrintFooter page={index + 1} />
        </div>
      ))}

      {/* FINAL PAGE: SIGNATURE & CLIENT DETAILS */}
      <div className="print-page-container">
        <ReportDocumentHeader title="Job Completed" reference={job.jobId} page={totalPages} />
        {photos.length === 0 && <ReportRecordMeta name={job.driverName || "Unassigned"} initials={job.driverInitials || "UN"} timestamp={formatLondonDateTime(job.updated)} reference={job.jobId} />}

        <div className="flex-1 flex flex-col gap-6 mt-4">
          
          {/* Billing & Times (Key-Value) */}
          <div className="report-legacy-details bg-[#F7F7F7] rounded-card border border-admin-line p-6 shadow-sm">
            <h3 className="text-[13px] font-semibold text-[#2563EB] mb-4">JOB DETAILS & CHARGES</h3>
            <div className="report-fact-grid grid grid-cols-2 gap-x-12 gap-y-3">
              <div className="flex justify-between py-1 border-b border-admin-line/50">
                <span className="text-[12px] text-[#8A8A8A]">Base Price</span>
                <span className="text-[12px] font-medium text-[#1A1A1A]">{formatPounds(job.basePrice)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-admin-line/50">
                <span className="text-[12px] text-[#8A8A8A]">Extra Charges</span>
                <span className="text-[12px] font-medium text-[#1A1A1A]">{formatPounds(job.extraCharges)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-admin-line/50">
                <span className="text-[12px] text-[#8A8A8A]">Overtime ({job.overtimeMinutes}m)</span>
                <span className="text-[12px] font-medium text-[#1A1A1A]">{formatPounds(job.overtimeCharge)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#1A1A1A]/20">
                <span className="text-[12px] font-bold text-[#1A1A1A]">Total Charges</span>
                <span className="text-[14px] font-bold text-[#1A1A1A]">{formatPounds(totalCharges)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#1A1A1A]/20">
                <span className="text-[12px] font-bold text-[#1A1A1A]">Amount Charged</span>
                <span className="text-[14px] font-bold text-[#1A1A1A]">{formatPounds(job.amountCharged)}</span>
              </div>
              {adjustmentReason && (
                <div className="col-span-2 flex justify-between gap-4 py-1 border-b border-admin-line/50 bg-[#FEF2F2] px-2">
                  <span className="text-[12px] font-bold text-admin-status-red">Adjustment Reason</span>
                  <span className="max-w-[70%] text-right text-[12px] font-medium text-[#1A1A1A]">{adjustmentReason}</span>
                </div>
              )}
              <div className="flex justify-between py-1 border-b border-admin-line/50">
                <span className="text-[12px] text-[#8A8A8A]">Payment Method</span>
                <span className="text-[12px] font-medium text-[#1A1A1A]">{job.paymentMethod || "Not recorded"}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-admin-line/50">
                <span className="text-[12px] text-[#8A8A8A]">On my way</span>
                <span className="text-[12px] font-medium text-[#1A1A1A]">
                  {job.onMyWayAt ? formatLondonDateTime(job.onMyWayAt) : "Not recorded"}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-admin-line/50">
                <span className="text-[12px] text-[#8A8A8A]">Tracker Pick-up arrival</span>
                <span className={`text-[12px] font-medium ${job.trackerArrivalAt ? "text-[#1A1A1A]" : "text-admin-status-red"}`}>{job.trackerArrivalAt ? withArrivalDistance(formatLondonDateTime(job.trackerArrivalAt), job.trackerArrivalDistanceMeters) : (job.trackerUnverifiedReason ? `Unverified (${job.trackerUnverifiedReason})` : "Unverified")}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-admin-line/50">
                <span className="text-[12px] text-[#8A8A8A]">Proof of arrival photo time</span>
                <span className="text-[12px] font-medium text-[#1A1A1A]">
                  {job.pickupArrivalAt ? formatLondonDateTime(job.pickupArrivalAt) : "Not recorded"}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-admin-line/50">
                <span className="text-[12px] text-[#8A8A8A]">Van loaded photo time</span>
                <span className="text-[12px] font-medium text-[#1A1A1A]">
                  {job.vanLoadedAt ? formatLondonDateTime(job.vanLoadedAt) : "Not recorded"}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-admin-line/50">
                <span className="text-[12px] text-[#8A8A8A]">Empty van photo time</span>
                <span className="text-[12px] font-medium text-[#1A1A1A]">
                  {job.actualFinish ? formatLondonDateTime(job.actualFinish) : "Not recorded"}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-admin-line/50">
                <span className="text-[12px] text-[#8A8A8A]">Customer signature time</span>
                <span className="text-[12px] font-medium text-[#1A1A1A]">
                  {job.clientSignatureAt ? formatLondonDateTime(job.clientSignatureAt) : "Not recorded"}
                </span>
              </div>
              {(job.arrivalProofLate || job.arrivalProofOverdue) && (
                <div className="flex justify-between py-1 border-b border-admin-line/50">
                  <span className="text-[12px] font-semibold text-admin-status-red">Gap between tracker arrival and proof photo</span>
                  <span className="text-[12px] font-bold text-admin-status-red">
                    {job.arrivalProofLate
                      ? `${job.arrivalProofDelayMinutes ?? 0} min`
                      : `Proof overdue ${job.arrivalProofDelayMinutes ?? 0} min`}
                  </span>
                </div>
              )}
              <div className="flex justify-between py-1 border-b border-admin-line/50">
                <span className="text-[12px] text-[#8A8A8A]">Actual Duration</span>
                <span className="text-[12px] font-medium text-[#1A1A1A]">{job.actualMinutes ? `${job.actualMinutes}m` : "—"}</span>
              </div>
            </div>
          </div>

          {/* Client Details */}
          <div className="bg-[#F7F7F7] rounded-card border border-admin-line p-6 shadow-sm">
            <h3 className="text-[13px] font-semibold text-[#2563EB] mb-4">CLIENT DETAILS</h3>
            <div className="report-fact-grid grid grid-cols-2 gap-x-12 gap-y-3">
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
            <div className="report-signature w-full sm:w-1/2 h-[160px] border border-admin-line rounded-card bg-white p-4 shadow-sm flex items-center justify-center">
              {job.signatureUrl ? (
                <img src={job.signatureUrl} alt="Signature" className="max-w-full max-h-full object-contain" />
              ) : (
                <span className="text-[#8A8A8A] text-[12px]">No signature provided</span>
              )}
            </div>
            <div className="text-[12px] text-[#8A8A8A] mt-2">
              Signed: {job.clientSignatureAt ? formatLondonDateTime(job.clientSignatureAt) : job.actualFinish ? formatLondonDateTime(job.actualFinish) : "—"}
            </div>
          </div>

        </div>

        <PrintFooter page={totalPages} />
      </div>

    </div>
  );
}
