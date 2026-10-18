/**
 * Printable scenario record (Check In, Check Out, Parking Liability, Liability Report).
 *
 * Paginated explicitly, like the job dossier: page 1 carries the record details, the
 * parking notice where it applies and the client signature; the photos follow as rows
 * of two, two rows per page. The old layout gave every photo its own page and let page 1
 * overflow, which printed a footer-only blank page.
 */
import React, { useState } from "react";
import { resolveDriver } from "../utils/drivers";
import { formatLocationLabel, type CapturedLocation } from "../../../../lib/geo";
import { scenarioAddressFromRecord, scenarioPointFromRecord } from "../utils/scenarioPoint";
import { documentDateTime } from "./PaperDossierReport";
import { ReportDocumentHeader, ReportDocumentFooter, ReportRecordMeta } from "./ReportDocumentHeader";
import { conditionalNoticeApplies, storedDeclaration, templateFor, wordingProvenance } from "../reports/documentTemplates";

interface Props {
  item: any;
  kind: string;
  isPreview?: boolean;
}

interface ScenarioPhoto { fileId?: string; thumbUrl?: string; fileUrl?: string; capturedAt?: string; location?: CapturedLocation; locationName?: string }

export const SCENARIO_TITLES: Record<string, string> = {
  checkin: "Storage Check-in",
  checkout: "Storage Check-out",
  parking: "Parking Liability Notice",
  liability: "Liability Report"
};
/** Two rows of two photos fit one A4 page under the header. */
export const PHOTOS_PER_PAGE = 4;

export function scenarioPhotoPages<T>(photos: T[]): T[][] {
  const pages: T[][] = [];
  for (let index = 0; index < photos.length; index += PHOTOS_PER_PAGE) pages.push(photos.slice(index, index + PHOTOS_PER_PAGE));
  return pages;
}

function Photo({ title, photo }: { title: string; photo: ScenarioPhoto }) {
  const [failed, setFailed] = useState(false);
  const src = photo.thumbUrl || photo.fileUrl || "";
  return (
    <figure className="report-photo">
      <figcaption className="report-photo-title">{title}</figcaption>
      <div className="report-photo-frame">
        {src && !failed ? <img src={src} alt={title} onError={() => setFailed(true)} />
          : <span className="report-photo-missing">{src ? "Photo failed to load" : "Not captured"}</span>}
      </div>
      <p className="report-photo-caption">
        {photo.capturedAt ? documentDateTime(photo.capturedAt) : "Time not recorded"}
        {" · "}
        {photo.location ? formatLocationLabel(photo.location, photo.locationName) : "Location not recorded"}
      </p>
    </figure>
  );
}

export function PaperScenarioReport({ item, kind, isPreview = false, generatedAt = new Date().toISOString() }: Props & { generatedAt?: string }) {
  const raw = item.rawRecord || item;
  const scenarioPoint = scenarioPointFromRecord(item);
  const text = (...values: unknown[]) => { const found = values.find(value => typeof value === "string" && value.trim()); return found ? String(found).trim() : "Not recorded"; };

  const clientName = text(item.clientName, raw["Client Name"], raw["Client Full Name"]);
  const driverResolved = resolveDriver(item.driver || raw["Driver"] || item.driverInitials, item.driverInitials);
  const driverName = text(item.driverName, raw["Driver Name"], driverResolved.name);
  const driverInitials = item.driverInitials || driverResolved.code;
  const formattedTime = documentDateTime(item.timestamp || raw["Timestamp"] || raw["Date"] || "");
  const signatureUrl: string | undefined = item.signature?.url || item.signature?.thumbUrl || raw["Signature"];
  const photos: ScenarioPhoto[] = item.photos || [];
  const photoPages = scenarioPhotoPages(photos);
  const totalPages = 1 + photoPages.length;
  const template = templateFor(kind);
  const snapshot = storedDeclaration(item);
  const title = template?.title || SCENARIO_TITLES[kind] || "Report";
  const damageCategories: string | undefined = item.damageCategories || raw["Damage Categories"];
  const showWaiver = !!template && conditionalNoticeApplies(template, damageCategories);
  const reference: string = item.id || item.jobId || title;

  const facts: Array<[string, string]> = [
    ["Client name", clientName],
    ...(kind !== "parking" ? [["Client phone", text(item.clientPhone, raw["Client Phone"])], ["Client email", text(item.clientEmail, raw["Client Email"])]] as Array<[string, string]> : []),
    ...(item.clientPresent || raw["Client Present"] ? [["Client present", text(item.clientPresent, raw["Client Present"])]] as Array<[string, string]> : []),
    ...(kind === "checkin" || kind === "checkout" ? [["Container number", text(item.containerNumber, raw["Container Number"])]] as Array<[string, string]> : []),
    ...(kind === "parking" ? [["Address on booking", text(scenarioAddressFromRecord(item))]] as Array<[string, string]> : []),
    ...(kind === "liability" ? [["Damage categories", text(item.damageCategories, raw["Damage Categories"])]] as Array<[string, string]> : []),
    // The meta block already shows a job ID that differs from the record reference.
    ...(item.jobId && item.jobId !== item.id ? [] : [["Job ID", text(item.jobId, raw["Job ID"])]] as Array<[string, string]>),
    ["Photos attached", String(photos.length)]
  ];

  const Page = ({ page, children }: { page: number; children: React.ReactNode }) => (
    <div className={`bg-white text-admin-ink mx-auto ${isPreview ? "report-preview-page w-full" : "scenario-print-page"}`}
      style={{ boxSizing: "border-box", pageBreakAfter: page < totalPages ? "always" : "auto", breakAfter: page < totalPages ? "page" : "auto" }}>
      <div className="report-page-content">
        <ReportDocumentHeader title={title} reference={reference} page={page} />
        <div className="report-page-body">{children}</div>
        <ReportDocumentFooter reference={reference} page={page} total={totalPages} />
      </div>
    </div>
  );

  return (
    <div className={`report-document report-dossier paper-document ${isPreview ? "report-document-preview w-full" : "block"}`}>
      <style>{`
        @page { size: A4 portrait; margin: 0; }
        @media print {
          .scenario-print-page { width: 210mm !important; min-height: 297mm !important; padding: 14mm !important; margin: 0 !important; box-sizing: border-box !important; background-color: white !important; overflow: visible !important; }
          .scenario-print-page:not(:last-child) { page-break-after: always !important; break-after: page !important; }
        }
      `}</style>

      <Page page={1}>
        <ReportRecordMeta name={driverName} initials={driverInitials} timestamp={formattedTime} reference={item.id || "Not recorded"} jobId={item.jobId} point={scenarioPoint?.full} />
        {template?.notice && (
          <section className="report-block report-legal" data-template-text="notice">
            <h2 className="report-section-title">{template.notice.title}</h2>
            <p className="report-legal-text">{template.notice.text}</p>
          </section>
        )}
        <section className="report-block">
          <h2 className="report-section-title">Record details</h2>
          <div className="report-fact-list">
            {facts.map(([label, value]) => <div key={label}><span>{label}</span><span>{value}</span></div>)}
          </div>
        </section>
        {showWaiver && template?.conditionalNotice && (
          <section className="report-block report-legal" data-template-text="conditional">
            <h2 className="report-section-title">{template.conditionalNotice.title}</h2>
            <p className="report-legal-text">{template.conditionalNotice.text}</p>
          </section>
        )}
        {(snapshot?.text || template?.declaration) && (
          <section className="report-block report-legal" data-template-text="declaration" data-wording-source={snapshot ? "record" : "template"}>
            <h2 className="report-section-title">Client declaration</h2>
            <p className="report-legal-text">{snapshot?.text ?? template?.declaration}</p>
          </section>
        )}
        <section className="report-block">
          <h2 className="report-section-title">Client signature</h2>
          <div className="report-signature">
            <div className="report-signature-image">
              {signatureUrl ? <img src={signatureUrl} alt="Client Signature" /> : <span className="report-photo-missing">Not signed</span>}
            </div>
            <div className="report-signature-lines">
              <p className="report-signature-heading">{clientName}</p>
              <p>Signed: {item.signature?.capturedAt ? documentDateTime(item.signature.capturedAt) : "Time not recorded"}</p>
              <p>{item.signature?.location ? formatLocationLabel(item.signature.location, item.signature.locationName) : "Location not recorded"}</p>
            </div>
          </div>
        </section>
        {photos.length === 0 && <p className="report-note">Photo evidence: no photos attached to this record.</p>}
        <p className="report-template-meta">
          Printed {documentDateTime(generatedAt)}, London time, from the stored record. {wordingProvenance(template, kind, snapshot)}
        </p>
      </Page>

      {photoPages.map((group, pageIndex) => (
        <Page key={pageIndex} page={pageIndex + 2}>
          <h2 className="report-section-title">Photo evidence{pageIndex > 0 && <span>(continued)</span>}</h2>
          {[group.slice(0, 2), group.slice(2, 4)].filter(row => row.length).map((row, rowIndex) => (
            <div key={rowIndex} className="report-photo-row">
              {row.map((photo, index) => {
                const number = pageIndex * PHOTOS_PER_PAGE + rowIndex * 2 + index + 1;
                return <Photo key={photo.fileId || number} title={`${title} Evidence ${number}`} photo={photo} />;
              })}
            </div>
          ))}
        </Page>
      ))}
    </div>
  );
}
