import React from "react";
import { formatLondonDateTime } from "../utils/date";

interface Props {
  item: any;
  kind: string;
}

export function PaperScenarioReport({ item, kind }: Props) {
  // The API route (backend/src/admin/dashboard/scenarios.routes.ts) is this project's
  // own MongoDB-backed shape -- clean top-level fields plus a `photos`/`signature`
  // pair. `rawRecord` (== the submission's raw form fields, snake_case) is kept only
  // as a last-resort fallback; the old capitalized "Client Name"/"Photo"-style keys
  // below are dead weight ported from TMV-Chat-bot's Sheets-backed dashboard and never
  // match anything here, but are harmless no-ops if a field is ever genuinely absent.
  const raw = item.rawRecord || item;

  const clientName = item.clientName || raw["Client Name"] || raw["Client Full Name"] || "Not recorded";
  const driverInitials = item.driver || raw["Driver"] || "UN";
  const driverName = raw["Driver Name"] || `${driverInitials} Driver`;
  const timestampStr = item.timestamp || raw["Timestamp"] || raw["Date"] || "";
  const formattedTime = formatLondonDateTime(timestampStr);
  const containerNum = item.containerNumber || raw["Container Number"] || "—";
  const clientPhone = item.clientPhone || raw["Client Phone"] || "—";
  const clientEmail = item.clientEmail || raw["Client Email"] || "—";
  const clientPresent = item.clientPresent || raw["Client Present"] || "—";
  const address = item.address || raw["Address"] || "Not recorded";
  const signatureUrl: string | undefined = item.signature?.thumbUrl || raw["Signature"];

  const photos: Array<{ fileId: string; thumbUrl: string }> = item.photos || [];

  const titleMap: Record<string, string> = {
    checkin: "Storage Check-in",
    checkout: "Storage Check-out",
    parking: "Parking Liability Notice",
    liability: "Liability Report"
  };
  const title = titleMap[kind] || "Report";
  // Audit document -- the reference must be stable and real. If the record carries no
  // id and no job number, show "Reference pending" rather than a random number that
  // changes on every render.
  const refId: string | null = item.id || item.jobId?.split("-")[1] || null;

  const driverColor = driverInitials === "UN" ? "bg-amber-500" : "bg-[#F59E0B]"; 

  return (
    <div className="paper-document bg-white font-sans text-[#1A1A1A]">
      
      {/* NO-PRINT CONTROLS */}
      <div className="no-print flex items-center justify-between p-4 mb-4 bg-admin-surface rounded-card border border-admin-line">
        <div className="text-card text-fg">Preview Large-Format Report</div>
        <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-control border border-line-strong bg-surface hover:bg-surface-sunken text-button text-fg transition shadow-sm">
          Print / Save PDF
        </button>
      </div>

      <style>{`
        @media print {
          /* Was height: 100vh here -- unlike a physical mm/in unit, vh resolves against
             the print engine's own notion of "viewport", which is unreliable across
             browsers and print-to-PDF paths. When the resolved height came out shorter
             than the actual content (any real submission with photos), the overflow
             got pushed onto a second page that was then almost entirely blank -- the
             report itself never overflowed logical content, just the box that was
             supposed to contain it on one page. min-height (below) already sizes this
             correctly for one physical A4 page; print only needs the @page rule and
             color-adjust so backgrounds/shadows aren't stripped for ink-saving. */
          @page { size: A4 portrait; margin: 0; }
          body { background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print-page-container { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .print-page-container {
          min-height: 297mm;
          display: flex;
          flex-direction: column;
          padding: 40px;
          margin-bottom: 24px;
          background: white;
          border: 1px solid var(--line);
          border-radius: 8px;
          box-shadow: var(--shadow-sm);
        }
      `}</style>

      <div className="print-page-container">
        
        {/* HEADER */}
        <div className="flex items-center justify-between pb-4 border-b border-admin-line mb-6">
          <h1 className="text-[20px] font-bold text-[#1A1A1A]">{title}</h1>
          <div className="flex flex-col items-end">
            <img src={`/tmv-logo.png`} alt="The Man Van" className="w-24 object-contain" />
            <span className="text-[10px] font-bold text-[#1A1A1A] tracking-wider mt-1">020 3773 9113</span>
          </div>
        </div>

        {/* META ROW */}
        <div className="flex items-start justify-between p-4 border border-admin-line rounded-card mb-6 bg-white shadow-sm">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-full ${driverColor} text-white flex items-center justify-center text-[13px] font-bold`}>
              {driverInitials}
            </div>
            <div>
              <div className="text-[14px] font-bold text-[#1A1A1A]">{driverName}</div>
              <div className="text-[12px] text-[#8A8A8A] mt-0.5">{formattedTime} | Europe/London</div>
            </div>
          </div>
          <div className="px-3 py-1 bg-admin-surface text-[#1A1A1A] text-[13px] font-semibold rounded-card border border-admin-line">
            {refId ? `#${refId}` : "Reference pending"}
          </div>
        </div>

        {/* PARKING LIABILITY TEXT */}
        {kind === "parking" && (
          <div className="bg-[#FFFBEB] border border-[#FDE68A] p-4 rounded-card mb-6 shadow-sm">
            <h3 className="text-[13px] font-bold text-amber-600 mb-2">Penalty Charge Liability Notice</h3>
            <p className="text-[12px] text-amber-900">
              In the event a fine is received, You will cover the cost directly, ensuring the company and drivers are not held liable. (Penalty Charge Notice) fines typically start at £60 and can go up to £180, depending on the severity of the offence. If paid within 14 days, most fines are reduced by 50%, making the lowest payable amount £45 and the highest £90.
            </p>
          </div>
        )}

        {/* PHOTOS -- one dominant when there's just one, a grid otherwise */}
        {photos.length > 0 && (
          <div className="flex flex-col mb-6">
            <div className="text-[13px] font-semibold text-[#8A8A8A] mb-3">
              Submitted Image{photos.length > 1 ? "s" : ""} / Evidence
            </div>
            {photos.length === 1 ? (
              <div className="flex items-center justify-center border border-admin-line rounded-card p-2 shadow-sm bg-[#FAFAFA] h-[45vh]">
                <img
                  src={photos[0].thumbUrl}
                  alt="Evidence"
                  className="max-w-[90%] max-h-full object-contain rounded-card"
                />
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {photos.map((p, i) => (
                  <div
                    key={p.fileId || i}
                    className="aspect-square flex items-center justify-center border border-admin-line rounded-card p-1 shadow-sm bg-[#FAFAFA]"
                  >
                    <img src={p.thumbUrl} alt={`Evidence ${i + 1}`} className="max-w-full max-h-full object-contain rounded-card" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* DATA & SIGNATURE */}
        <div className="flex gap-6">
          <div className="flex-1 bg-[#F7F7F7] rounded-card border border-admin-line p-6 shadow-sm">
            <h3 className="text-[13px] font-semibold text-[#2563EB] mb-4">CLIENT DETAILS</h3>
            <div className="flex flex-col gap-3">
              <div className="flex justify-between py-1 border-b border-admin-line/50">
                <span className="text-[12px] text-[#8A8A8A]">Client Name</span>
                <span className="text-[12px] font-medium text-[#1A1A1A]">{clientName}</span>
              </div>
              
              {kind !== "parking" && (
                <>
                  <div className="flex justify-between py-1 border-b border-admin-line/50">
                    <span className="text-[12px] text-[#8A8A8A]">Phone</span>
                    <span className="text-[12px] font-medium text-[#1A1A1A]">{clientPhone}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-admin-line/50">
                    <span className="text-[12px] text-[#8A8A8A]">Email</span>
                    <span className="text-[12px] font-medium text-[#1A1A1A]">{clientEmail}</span>
                  </div>
                </>
              )}

              {kind === "checkin" && (
                <div className="flex justify-between py-1 border-b border-[#1A1A1A]/20">
                  <span className="text-[12px] font-bold text-[#1A1A1A]">Container Number</span>
                  <span className="text-[14px] font-bold text-[#2563EB]">{containerNum}</span>
                </div>
              )}

              {kind === "parking" && (
                <div className="flex justify-between py-1 border-b border-admin-line/50">
                  <span className="text-[12px] text-[#8A8A8A]">Address on Booking</span>
                  <span className="text-[12px] font-medium text-[#1A1A1A] truncate max-w-[200px]" title={address}>{address}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1">
            <p className="text-[11px] text-[#8A8A8A] italic mb-2">
              {kind === "parking" 
                ? "By signing this document, you confirm acceptance of the parking liability terms above." 
                : "By signing this document, you confirm that all items listed have been checked in and stored."}
            </p>
            <div className="text-[12px] font-semibold text-[#8A8A8A] mb-2">Client Signature:</div>
            <div className="w-full h-[120px] border border-admin-line rounded-card bg-white p-4 shadow-sm flex items-center justify-center">
              {signatureUrl ? (
                <img src={signatureUrl} alt="Signature" className="max-w-full max-h-full object-contain mix-blend-multiply" />
              ) : (
                <span className="text-[#8A8A8A] text-[12px]">No signature provided</span>
              )}
            </div>
            <div className="text-[12px] text-[#8A8A8A] mt-2 text-right">
              Signed: {formattedTime}
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="mt-auto pt-4 border-t border-admin-line flex justify-end">
          <span className="text-[11px] text-[#8A8A8A]">1/1</span>
        </div>
      </div>

    </div>
  );
}
