import React from "react";
import { formatLondonDateTime } from "../utils/date";
import { resolveDriver } from "../utils/drivers";

interface Props {
  item: any;
  kind: string;
  isPreview?: boolean;
}

export function PaperScenarioReport({ item, kind, isPreview = false }: Props) {
  // The API route (backend/src/admin/dashboard/scenarios.routes.ts) is this project's
  // own MongoDB-backed shape -- clean top-level fields plus a `photos`/`signature`
  // pair. `rawRecord` (== the submission's raw form fields, snake_case) is kept only
  // as a last-resort fallback; the old capitalized "Client Name"/"Photo"-style keys
  // below are dead weight ported from TMV-Chat-bot's Sheets-backed dashboard and never
  // match anything here, but are harmless no-ops if a field is ever genuinely absent.
  const raw = item.rawRecord || item;

  const clientName = item.clientName || raw["Client Name"] || raw["Client Full Name"] || "Not recorded";
  // A scenario submission's `driver` field is free text -- sometimes initials,
  // sometimes an email, sometimes a full name. resolveDriver() is the shared place
  // this is already handled correctly: `code` is always capped to 2 characters, so
  // it can't overflow the fixed-size avatar circle below and collide with the
  // reference badge next to it (as the raw value did when it was long).
  const driverResolved = resolveDriver(item.driver || raw["Driver"]);
  const driverInitials = driverResolved.code;
  const driverName = raw["Driver Name"] || driverResolved.name;
  const timestampStr = item.timestamp || raw["Timestamp"] || raw["Date"] || "";
  const formattedTime = formatLondonDateTime(timestampStr);
  const containerNum = item.containerNumber || raw["Container Number"] || "—";
  const clientPhone = item.clientPhone || raw["Client Phone"] || "—";
  const clientEmail = item.clientEmail || raw["Client Email"] || "—";
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
    <div className={`paper-document bg-white font-sans text-[#1A1A1A] ${isPreview ? "w-full shadow-lg border border-admin-line rounded-control p-8 mb-8" : ""}`}>
      <style>{`
        @page {
          size: 210mm 297mm;
          size: A4 portrait;
          margin: 0;
        }
        @media print {
          .scenario-print-page {
            width: 210mm !important;
            height: 297mm !important;
            max-height: 297mm !important;
            padding: 16mm 20mm !important;
            margin: 0 !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            box-sizing: border-box !important;
            background-color: white !important;
            overflow: hidden !important;
          }
        }
        .scenario-print-page {
          min-height: 297mm;
          display: flex;
          flex-direction: column;
          padding: 32px;
          background: white;
          border: 1px solid var(--line);
          border-radius: 8px;
          box-sizing: border-box;
        }
      `}</style>

      <div className={isPreview ? "flex flex-col min-h-[260mm]" : "scenario-print-page"}>
        {/* HEADER */}
        <div className="flex items-center justify-between pb-3 border-b border-admin-line mb-3 shrink-0">
          <h1 className="text-[20px] font-bold text-[#1A1A1A]">{title}</h1>
          <div className="flex flex-col items-end">
            <img src="/tmv-logo.png" alt="The Man Van" className="w-24 object-contain" />
            <span className="text-[10px] font-bold text-[#1A1A1A] tracking-wider mt-1">020 3773 9113</span>
          </div>
        </div>

        {/* META ROW */}
        <div className="flex items-start justify-between gap-3 p-3 border border-admin-line rounded-card mb-3 bg-white shadow-sm shrink-0">
          <div className="flex min-w-0 items-center gap-3">
            <div className={`w-9 h-9 shrink-0 overflow-hidden rounded-full ${driverColor} text-white flex items-center justify-center text-[13px] font-bold`}>
              {driverInitials}
            </div>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-bold text-[#1A1A1A]">{driverName}</div>
              <div className="text-[11px] text-[#8A8A8A] mt-0.5">{formattedTime} | Europe/London</div>
            </div>
          </div>
          <div className="shrink-0 px-3 py-1 bg-admin-surface text-[#1A1A1A] text-[12px] font-semibold rounded-card border border-admin-line">
            {refId ? `#${refId}` : "Reference pending"}
          </div>
        </div>

        {/* PARKING LIABILITY TEXT */}
        {kind === "parking" && (
          <div className="bg-[#FFFBEB] border border-[#FDE68A] p-3 rounded-card mb-3 shadow-sm shrink-0">
            <h3 className="text-[12px] font-bold text-amber-600 mb-1">Penalty Charge Liability Notice</h3>
            <p className="text-[11px] text-amber-900 leading-relaxed">
              In the event a fine is received, You will cover the cost directly, ensuring the company and drivers are not held liable. (Penalty Charge Notice) fines typically start at £60 and can go up to £180, depending on the severity of the offence. If paid within 14 days, most fines are reduced by 50%, making the lowest payable amount £45 and the highest £90.
            </p>
          </div>
        )}

        {/* PHOTOS */}
        {photos.length > 0 && (
          <div className="shrink-0 flex flex-col mb-3 min-h-0">
            <div className="text-[12px] font-semibold text-[#8A8A8A] mb-1.5 shrink-0">
              Submitted Image{photos.length > 1 ? "s" : ""} / Evidence
            </div>
            {photos.length === 1 ? (
              <div className="h-[360px] max-h-[38vh] overflow-hidden flex items-center justify-center border border-admin-line rounded-card p-2 shadow-sm bg-[#FAFAFA]">
                <img
                  src={photos[0].thumbUrl}
                  alt="Evidence"
                  className="w-full h-full object-contain rounded-card"
                />
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {photos.map((p, i) => (
                  <div
                    key={p.fileId || i}
                    className="aspect-square max-h-[160px] overflow-hidden flex items-center justify-center border border-admin-line rounded-card p-1 shadow-sm bg-[#FAFAFA]"
                  >
                    <img src={p.thumbUrl} alt={`Evidence ${i + 1}`} className="w-full h-full object-contain rounded-card" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* DATA & SIGNATURE */}
        <div className="flex gap-4 shrink-0 mb-3">
          <div className="flex-1 bg-[#F7F7F7] rounded-card border border-admin-line p-3.5 shadow-sm">
            <h3 className="text-[12px] font-semibold text-[#2563EB] mb-2">CLIENT DETAILS</h3>
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between py-0.5 border-b border-admin-line/50">
                <span className="text-[11px] text-[#8A8A8A]">Client Name</span>
                <span className="text-[11px] font-medium text-[#1A1A1A]">{clientName}</span>
              </div>
              
              {kind !== "parking" && (
                <>
                  <div className="flex justify-between py-0.5 border-b border-admin-line/50">
                    <span className="text-[11px] text-[#8A8A8A]">Phone</span>
                    <span className="text-[11px] font-medium text-[#1A1A1A]">{clientPhone}</span>
                  </div>
                  <div className="flex justify-between py-0.5 border-b border-admin-line/50">
                    <span className="text-[11px] text-[#8A8A8A]">Email</span>
                    <span className="text-[11px] font-medium text-[#1A1A1A]">{clientEmail}</span>
                  </div>
                </>
              )}

              {kind === "checkin" && (
                <div className="flex justify-between py-0.5 border-b border-[#1A1A1A]/20">
                  <span className="text-[11px] font-bold text-[#1A1A1A]">Container Number</span>
                  <span className="text-[12px] font-bold text-[#2563EB]">{containerNum}</span>
                </div>
              )}

              {kind === "parking" && (
                <div className="flex justify-between py-0.5 border-b border-admin-line/50">
                  <span className="text-[11px] text-[#8A8A8A]">Address on Booking</span>
                  <span className="text-[11px] font-medium text-[#1A1A1A] truncate max-w-[180px]" title={address}>{address}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 flex flex-col justify-between">
            <div>
              <p className="text-[10px] text-[#8A8A8A] italic mb-1">
                {kind === "parking" 
                  ? "By signing this document, you confirm acceptance of the parking liability terms above." 
                  : "By signing this document, you confirm that all items listed have been checked in and stored."}
              </p>
              <div className="text-[11px] font-semibold text-[#8A8A8A] mb-1">Client Signature:</div>
              <div className="w-full h-[90px] border border-admin-line rounded-card bg-white p-2 shadow-sm flex items-center justify-center">
                {signatureUrl ? (
                  <img src={signatureUrl} alt="Signature" className="max-w-full max-h-full object-contain mix-blend-multiply" />
                ) : (
                  <span className="text-[#8A8A8A] text-[11px]">No signature provided</span>
                )}
              </div>
            </div>
            <div className="text-[11px] text-[#8A8A8A] text-right mt-1">
              Signed: {formattedTime}
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="mt-auto pt-2 border-t border-admin-line flex justify-end shrink-0">
          <span className="text-[11px] text-[#8A8A8A]">1/1</span>
        </div>
      </div>

    </div>
  );
}
