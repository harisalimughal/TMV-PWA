import React, { useState } from "react";
import { NormalizedJob } from "../types";
import { formatLondonDateTime } from "../utils/date";

interface Props {
  job: NormalizedJob;
  isPreview?: boolean;
}

export function PaperDossierReport({ job, isPreview = false }: Props) {
  const now = new Date().toISOString();
  
  // Helpers
  const formatPounds = (cents: number | undefined) => `£${((cents || 0) / 100).toFixed(2)}`;

  // Get ALL image evidence items
  const photos = job.evidenceItems?.filter(e => !!e.fileId) || [];
  
  // If there are NO photos, create a fake empty array with 1 item so we still render the structure
  // but with a "Not captured" state as requested by the user.
  const photoPages = photos.length > 0 ? photos : [{ category: "Photos", fileId: null }];

  const submitterName = job.driverName || "Unknown Driver";
  const submitterInitials = job.driverInitials || "UN";
  const formattedTime = formatLondonDateTime(job.actualFinish || job.bookedStart || now);

  const Header = () => (
    <div className="flex items-start justify-between mb-8 shrink-0">
      <h1 className="text-[24px] font-bold text-admin-ink">Job Completed</h1>
      <div className="flex flex-col items-end">
        <div className="text-[20px] font-black text-admin-brand tracking-tighter mb-1">THE MAN VAN</div>
        <span className="text-[12px] font-bold text-admin-ink tracking-wider">020 3773 9113</span>
      </div>
    </div>
  );

  const SubmitterCard = () => (
    <div className="flex items-center justify-between p-4 mb-8 bg-[#F8F9FA] rounded-[12px] border border-[#E5E7EB] shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-admin-brand-soft text-admin-brand font-bold text-[14px] flex items-center justify-center border border-admin-brand/20">
          {submitterInitials}
        </div>
        <div>
          <div className="text-[14px] font-bold text-admin-ink leading-tight">{submitterName}</div>
          <div className="text-[12px] font-medium text-admin-muted mt-0.5">{formattedTime}</div>
        </div>
      </div>
      <div className="px-3 py-1.5 bg-white border border-[#E5E7EB] rounded-full text-[12px] font-bold text-admin-muted uppercase tracking-widest shadow-sm">
        #{job.jobId.slice(0, 8)}
      </div>
    </div>
  );

  const PhotoSection = ({ title, src }: { title: string, src: string | null }) => {
    const [failed, setFailed] = useState(false);
    return (
      <div className="flex-1 flex flex-col mb-8 min-h-0">
        <h2 className="text-[14px] font-semibold text-[#1F2937] mb-3">{title}</h2>
        <div className="flex-1 w-full bg-[#F3F4F6] rounded-[12px] border border-[#E5E7EB] shadow-sm overflow-hidden flex items-center justify-center p-2">
           {src && !failed ? (
             <img
               src={src}
               alt={title}
               className="max-w-full max-h-[100%] rounded-[8px] object-contain shadow-[0_2px_8px_rgba(0,0,0,0.08)] bg-white"
               onError={() => setFailed(true)}
             />
           ) : (
             <div className="text-admin-muted text-[14px] font-semibold italic">
               {src && failed ? "Photo failed to load" : "Not captured"}
             </div>
           )}
        </div>
      </div>
    );
  };

  // Common wrapper for each page
  const Page = ({ page, totalPages, children }: { page: number, totalPages: number, children: React.ReactNode }) => (
    <div 
      className={`bg-white text-admin-ink flex flex-col mx-auto ${isPreview ? 'w-full shadow-lg border border-admin-line mb-8 overflow-hidden rounded-md' : 'print-page'}`}
      style={{
        width: isPreview ? '100%' : '210mm',
        height: isPreview ? 'auto' : '297mm',
        minHeight: isPreview ? '297mm' : 'auto',
        padding: '20mm',
        pageBreakAfter: 'always',
        boxSizing: 'border-box'
      }}
    >
      <Header />
      {page === 1 && <SubmitterCard />}
      {children}
      <div className="pt-4 mt-auto border-t border-[#E5E7EB] flex justify-end shrink-0">
        <span className="text-[12px] font-semibold text-admin-muted">{page}/{totalPages}</span>
      </div>
    </div>
  );

  // Calculate total pages based on number of photos, minimum 2 pages (one for data, one for sig)
  const totalPages = Math.max(photos.length, 1);

  return (
    <div className={`font-sans ${isPreview ? 'w-full' : 'hidden print:block'}`}>
      <style>{!isPreview ? `
        @media print {
          @page { size: A4 portrait; margin: 0; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white; }
          .print-page { 
            width: 210mm !important; 
            height: 297mm !important; 
            padding: 20mm !important; 
            margin: 0 !important; 
            page-break-after: always;
            page-break-inside: avoid;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            background-color: white;
          }
        }
      ` : ''}</style>

      {photoPages.map((p, index) => {
        const pageNum = index + 1;
        // thumbProxyUrl first: it's our own authenticated proxy that returns raw image
        // bytes. driveUrl is a Google Drive "view" page, not embeddable as an <img> src.
        const src = p.fileId ? (p.thumbProxyUrl || `/admin/api/jobs/${encodeURIComponent(job.jobId)}/photos/${encodeURIComponent(p.fileId)}`) : null;
        
        return (
          <Page key={index} page={pageNum} totalPages={totalPages}>
            <PhotoSection title={p.category || "Photo Evidence"} src={src} />
            
            {/* Inject data blocks on specific pages if possible, or at the end */}
            {pageNum === 1 && (
              <div className="mb-4 border border-[#E5E7EB] rounded-[12px] overflow-hidden shrink-0">
                <div className="flex items-center justify-between p-4 border-b border-[#E5E7EB] bg-white">
                  <span className="text-[13px] font-medium text-admin-muted">Customer Name</span>
                  <span className="text-[13px] font-bold text-admin-ink">{job.customerName || "N/A"}</span>
                </div>
                <div className="flex items-center justify-between p-4 border-b border-[#E5E7EB] bg-white">
                  <span className="text-[13px] font-medium text-admin-muted">Pickup</span>
                  <span className="text-[13px] font-bold text-admin-ink truncate max-w-[200px]">{job.pickup || "N/A"}</span>
                </div>
                <div className="flex items-center justify-between p-4 bg-white">
                  <span className="text-[13px] font-medium text-admin-muted">Dropoff</span>
                  <span className="text-[13px] font-bold text-admin-ink truncate max-w-[200px]">{job.dropoff || "N/A"}</span>
                </div>
              </div>
            )}

            {pageNum === 2 && (
              <div className="mb-4 border border-[#E5E7EB] rounded-[12px] overflow-hidden shrink-0">
                <div className="flex items-center justify-between p-4 border-b border-[#E5E7EB] bg-white">
                  <span className="text-[13px] font-medium text-admin-muted">Total Charges</span>
                  <span className="text-[13px] font-bold text-admin-ink">{formatPounds(job.totalCharges)}</span>
                </div>
                <div className="flex items-center justify-between p-4 border-b border-[#E5E7EB] bg-white">
                  <span className="text-[13px] font-medium text-admin-muted">Payment Method</span>
                  <span className="text-[13px] font-bold text-admin-ink">{job.paymentMethod || "Not recorded"}</span>
                </div>
              </div>
            )}

            {(pageNum === totalPages || (pageNum === 3 && totalPages >= 3)) && index === photoPages.length - 1 && (
              <div className="mb-4 shrink-0">
                <h2 className="text-[13px] font-medium text-admin-muted mb-2">Client Signature:</h2>
                <div className="border border-[#E5E7EB] rounded-[12px] p-6 bg-[#F8F9FA] flex flex-col items-center justify-center min-h-[120px]">
                  {job.signatureUrl ? (
                    <img src={job.signatureUrl} alt="Client Signature" className="max-h-[80px] object-contain mix-blend-multiply" />
                  ) : (
                    <span className="text-[14px] font-semibold text-admin-muted italic">Not captured</span>
                  )}
                  <span className="text-[11px] font-medium text-admin-muted mt-4">Confirmed By: {job.clientConfirmedName || "N/A"}</span>
                  <span className="text-[11px] font-medium text-admin-muted mt-1">Signed: {formattedTime}</span>
                </div>
              </div>
            )}
          </Page>
        );
      })}

    </div>
  );
}
