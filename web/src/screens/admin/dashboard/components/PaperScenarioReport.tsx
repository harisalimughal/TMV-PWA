import React, { useState } from "react";
import { formatLondonDateTime } from "../utils/date";
import { resolveDriver } from "../utils/drivers";

interface Props {
  item: any;
  kind: string;
  isPreview?: boolean;
}

function PhotoSection({ title, src }: { title: string; src: string | null }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="flex-1 flex flex-col mb-8 min-h-0">
      <h2 className="text-[14px] font-semibold text-[#1F2937] mb-3">{title}</h2>
      <div className="flex-1 w-full bg-[#F3F4F6] rounded-card border border-[#E5E7EB] shadow-sm overflow-hidden flex items-center justify-center p-2">
        {src && !failed ? (
          <img
            src={src}
            alt={title}
            className="max-w-full max-h-full rounded-control object-contain shadow-[0_2px_8px_rgba(0,0,0,0.08)] bg-white"
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
}

export function PaperScenarioReport({ item, kind, isPreview = false }: Props) {
  const raw = item.rawRecord || item;

  const clientName = item.clientName || raw["Client Name"] || raw["Client Full Name"] || "Not recorded";
  const driverResolved = resolveDriver(item.driver || raw["Driver"]);
  const driverInitials = driverResolved.code;
  const driverName = raw["Driver Name"] || driverResolved.name;
  const timestampStr = item.timestamp || raw["Timestamp"] || raw["Date"] || "";
  const formattedTime = formatLondonDateTime(timestampStr);
  const containerNum = item.containerNumber || raw["Container Number"] || "-";
  const clientPhone = item.clientPhone || raw["Client Phone"] || "-";
  const clientEmail = item.clientEmail || raw["Client Email"] || "-";
  const address = item.address || raw["Address"] || "Not recorded";
  const signatureUrl: string | undefined = item.signature?.url || item.signature?.thumbUrl || raw["Signature"];
  const photos: Array<{ fileId: string; thumbUrl: string }> = item.photos || [];
  const photoPages = photos.length > 0 ? photos : [{ fileId: "missing", thumbUrl: "" }];
  const totalPages = Math.max(photoPages.length, 1);

  const titleMap: Record<string, string> = {
    checkin: "Storage Check-in",
    checkout: "Storage Check-out",
    parking: "Parking Liability Notice",
    liability: "Liability Report"
  };
  const title = titleMap[kind] || "Report";
  const refId: string | null = item.id || item.jobId?.split("-")[1] || null;
  const driverColor = driverInitials === "UN" ? "bg-amber-500" : "bg-[#F59E0B]";

  const Header = () => (
    <div className="flex items-start justify-between mb-8 shrink-0">
      <h1 className="text-[24px] font-bold text-admin-ink">{title}</h1>
      <div className="flex flex-col items-end">
        <div className="text-[20px] font-black text-admin-brand tracking-tighter mb-1">THE MAN VAN</div>
        <span className="text-[12px] font-bold text-admin-ink tracking-wider">020 3773 9113</span>
      </div>
    </div>
  );

  const SubmitterCard = () => (
    <div className="flex items-center justify-between p-4 mb-8 bg-[#F8F9FA] rounded-card border border-[#E5E7EB] shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-10 h-10 rounded-full ${driverColor} text-white font-bold text-[14px] flex items-center justify-center border border-admin-brand/20 shrink-0`}>
          {driverInitials}
        </div>
        <div className="min-w-0">
          <div className="text-[14px] font-bold text-admin-ink leading-tight truncate">{driverName}</div>
          <div className="text-[12px] font-medium text-admin-muted mt-0.5">{formattedTime} | Europe/London</div>
        </div>
      </div>
      <div className="px-3 py-1.5 bg-white border border-[#E5E7EB] rounded-full text-[12px] font-bold text-admin-muted uppercase tracking-widest shadow-sm shrink-0">
        {refId ? `#${refId}` : "Reference pending"}
      </div>
    </div>
  );

  const ParkingNotice = () => (
    <div className="bg-[#FFFBEB] border border-[#FDE68A] p-3 rounded-card mb-3 shadow-sm shrink-0">
      <h3 className="text-[12px] font-bold text-amber-600 mb-1">Penalty Charge Liability Notice</h3>
      <p className="text-[11px] text-amber-900 leading-relaxed">
        In the event a fine is received, you will cover the cost directly, ensuring the company and drivers are not held liable. Penalty Charge Notice fines typically start at GBP 60 and can go up to GBP 180, depending on the severity of the offence. If paid within 14 days, most fines are reduced by 50%.
      </p>
    </div>
  );

  const DetailsAndSignature = () => (
    <div className="mb-3 grid grid-cols-1 gap-3 shrink-0">
      <div className="border border-[#E5E7EB] rounded-card overflow-hidden">
        <div className="flex items-center justify-between gap-4 p-3 border-b border-[#E5E7EB] bg-white">
          <span className="text-label font-medium text-fg-muted">Client Name</span>
          <span className="text-[13px] font-bold text-admin-ink text-right">{clientName}</span>
        </div>

        {kind !== "parking" && (
          <>
            <div className="flex items-center justify-between gap-4 p-3 border-b border-[#E5E7EB] bg-white">
              <span className="text-label font-medium text-fg-muted">Phone</span>
              <span className="text-[13px] font-bold text-admin-ink text-right">{clientPhone}</span>
            </div>
            <div className="flex items-center justify-between gap-4 p-3 border-b border-[#E5E7EB] bg-white">
              <span className="text-label font-medium text-fg-muted">Email</span>
              <span className="text-[13px] font-bold text-admin-ink text-right break-all">{clientEmail}</span>
            </div>
          </>
        )}

        {(kind === "checkin" || kind === "checkout") && (
          <div className="flex items-center justify-between gap-4 p-3 border-b border-[#E5E7EB] bg-white">
            <span className="text-label font-medium text-fg-muted">Container Number</span>
            <span className="text-[13px] font-bold text-admin-brand text-right">{containerNum}</span>
          </div>
        )}

        {kind === "parking" && (
          <div className="flex items-center justify-between gap-4 p-3 border-b border-[#E5E7EB] bg-white">
            <span className="text-label font-medium text-fg-muted">Address on Booking</span>
            <span className="text-[13px] font-bold text-admin-ink text-right max-w-[360px]">{address}</span>
          </div>
        )}

        {kind === "liability" && (
          <div className="flex items-center justify-between gap-4 p-3 bg-white">
            <span className="text-label font-medium text-fg-muted">Damage Categories</span>
            <span className="text-[13px] font-bold text-admin-ink text-right max-w-[360px]">
              {item.damageCategories || raw["Damage Categories"] || "-"}
            </span>
          </div>
        )}
      </div>

      <div className="mb-3 shrink-0">
        <h2 className="text-label font-medium text-fg-muted mb-1.5">Client Signature:</h2>
        <div className="border border-[#E5E7EB] rounded-card p-4 bg-[#F8F9FA] flex flex-col items-center justify-center min-h-[100px]">
          {signatureUrl ? (
            <img src={signatureUrl} alt="Client Signature" className="max-h-[70px] object-contain mix-blend-multiply" />
          ) : (
            <span className="text-[13px] font-semibold text-admin-muted italic">Not captured</span>
          )}
          <span className="text-[10px] font-medium text-admin-muted mt-2">Signed: {formattedTime}</span>
        </div>
      </div>
    </div>
  );

  const Page = ({ page, children }: { page: number; children: React.ReactNode }) => (
    <div
      className={`bg-white text-admin-ink mx-auto ${isPreview ? "w-full shadow-lg border border-admin-line mb-8 overflow-hidden rounded-control p-8 min-h-[297mm]" : "scenario-print-page"}`}
      style={{
        boxSizing: "border-box",
        pageBreakAfter: page < totalPages ? "always" : "auto",
        breakAfter: page < totalPages ? "page" : "auto"
      }}
    >
      <div className="flex h-full flex-col min-h-[260mm]">
        <Header />
        <SubmitterCard />
        {children}
        <div className="pt-3 mt-auto border-t border-[#E5E7EB] flex justify-end shrink-0">
          <span className="text-[11px] font-semibold text-admin-muted">{page}/{totalPages}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className={`paper-document font-sans ${isPreview ? "w-full" : "block"}`}>
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
            box-sizing: border-box !important;
            background-color: white !important;
            overflow: hidden !important;
          }
          .scenario-print-page:not(:last-child) {
            page-break-after: always !important;
            break-after: page !important;
          }
        }
      `}</style>

      {photoPages.map((photo, index) => {
        const page = index + 1;
        const src = photo.thumbUrl || null;

        return (
          <Page key={photo.fileId || index} page={page}>
            {kind === "parking" && page === 1 && <ParkingNotice />}
            <PhotoSection
              title={photos.length > 0 ? `${title} Evidence${photos.length > 1 ? ` ${page}` : ""}` : "Photo Evidence"}
              src={src}
            />
            {page === 1 && <DetailsAndSignature />}
          </Page>
        );
      })}
    </div>
  );
}
