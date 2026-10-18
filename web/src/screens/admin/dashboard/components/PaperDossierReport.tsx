import React, { useState } from "react";
import { htmlToPlainText } from "../../../../lib/htmlText";
import { formatLocationLabel, type CapturedLocation } from "../../../../lib/geo";
import type { NormalizedJob, ScenarioKind } from "../types";
import { formatLondonDateTime } from "../utils/date";
import { formatDateTime, formatMoney, formatTime } from "../utils/format";
import { scenarioPointFromRecord } from "../utils/scenarioPoint";
import { adjustmentReasonForMismatch, jobServiceType } from "../utils/workBreakdown";
import { MILESTONE_STATE_LABEL, chargeLines, comparisonRows, isInvoiceMethod, lifecycleOf, milestonesOf, recordedReceiptsPence } from "./jobdetail/model";
import { formatMinutes } from "../utils/format";
import { JobTimeBreakdown } from "./JobTimeBreakdown";
import { ReportDocumentFooter, ReportDocumentHeader } from "./ReportDocumentHeader";

/*
 * Job Report (preview and print share this component). It reads the same data functions
 * as the job preview (jobdetail/model.ts), so a milestone, charge or comparison cannot
 * differ between the screen and the document. It is an internal operations record: it
 * carries the customer's contact details and the original booking text, so it is not the
 * document to hand to a customer (the liability scenario PDFs are).
 *
 * Page 1 is the whole record: who, when, where, the job timeline, every charge with the
 * payment, and the customer sign-off. It used to share page 1 with the first photo and
 * overflowed A4, so the drop-off row and the page footer spilled onto a blank page; the
 * payment method only printed when page 2 happened to be a job photo, and the customer
 * signature only when the last job photo landed on a particular page number.
 *
 * Later pages hold the time breakdown and the photo evidence in the order the driver
 * submitted it, two photos per row. Pages are explicit (not left to the browser's
 * pagination) so "Page x of y" and the on-screen preview stay right; buildDossierPages
 * packs blocks into each A4 page using the fixed print heights below.
 */

const SCENARIO_LABELS: Record<ScenarioKind, string> = {
  checkin: "Storage check-in",
  checkout: "Storage checkout",
  parking: "Parking liability",
  liability: "Liability report"
};

const EVIDENCE_FALLBACK_ORDER: Record<string, number> = {
  Arrival: 100, VanLoaded: 300, StopBy: 400, EmptyVan: 700, Organized: 800, Signature: 900, Documents: 950, Photos: 999
};
const SCENARIO_FALLBACK_ORDER: Record<ScenarioKind, number> = { checkin: 50, liability: 500, parking: 520, checkout: 850 };

/** Usable height of an A4 page below the 14 mm margins, less the footer (mm). */
export const PAGE_CAPACITY_MM = 255;
/** Fixed print heights (mm) used to pack pages. Kept in step with reportDocument.css. */
export const BLOCK_HEIGHT_MM = { time: 100, heading: 14, photoRow: 104, note: 14, signature: 50, tableRow: 7, tableHead: 17, bookingLine: 4.6, bookingFrame: 22 } as const;
/** Characters per printed line of the original booking text (10 px type across the 182 mm text area, with margin). */
const BOOKING_LINE_CHARS = 100;
const BOOKING_CHUNK_LINES = 34;

type Scenario = NormalizedJob["scenarios"][number];

export interface PhotoCard {
  key: string;
  title: string;
  src: string | null;
  capturedAt?: string;
  fallbackAt?: string;
  location?: CapturedLocation;
  locationName?: string;
}

export type DossierBlock =
  | { kind: "time" }
  | { kind: "heading"; title: string; subtitle?: string }
  | { kind: "scenario"; scenario: Scenario }
  | { kind: "photos"; photos: PhotoCard[] }
  | { kind: "note"; text: string }
  | { kind: "charges"; rows: number }
  | { kind: "submission"; compared: boolean }
  | { kind: "signature" }
  | { kind: "booking"; title: string; text: string; lines: number };

/** "VanLoaded" -> "Van loaded". */
export function evidenceTitle(category?: string): string {
  if (!category) return "Photo";
  const words = category.replace(/([a-z])([A-Z])/g, "$1 $2").trim();
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}

/** London date and time ("22 Sep 2026, 16:45"); sheet-style values keep the legacy reading. */
export function documentDateTime(value?: string | null): string {
  if (!value) return "Not recorded";
  const formatted = formatDateTime(value, "Not recorded");
  return formatted === "Not recorded" ? formatLondonDateTime(value) : formatted;
}

function timeValue(value?: string): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function scenarioRows(scenario: Scenario): Array<[string, string]> {
  const point = scenarioPointFromRecord(scenario);
  const rows: Array<[string, string]> = [["Submitted", `${documentDateTime(scenario.timestamp)} by ${scenario.driver || "driver not recorded"}`]];
  if (point) rows.push(["Reported at", point.full]);
  rows.push(["Client name", scenario.clientName || "Not recorded"]);
  if (scenario.clientPhone) rows.push(["Client phone", scenario.clientPhone]);
  if (scenario.clientEmail) rows.push(["Client email", scenario.clientEmail]);
  if (scenario.kind === "checkin" || scenario.kind === "checkout") rows.push(["Container number", scenario.containerNumber || "Not recorded"]);
  if (scenario.kind === "parking") rows.push(["Address", scenario.address || "Not recorded"]);
  if (scenario.kind === "liability") rows.push(["Damage categories", scenario.damageCategories || "Not recorded"]);
  rows.push(["Client present", scenario.clientPresent || "Not recorded"]);
  return rows;
}

/** Facts on the left, signature on the right; each row is 7 mm plus 4.5 mm per extra wrapped line. */
export function scenarioBlockHeight(scenario: Scenario): number {
  const rows = scenarioRows(scenario).reduce((sum, [, value]) => sum + 7 + Math.floor(value.length / 46) * 4.5, 0);
  return Math.max(rows, 44) + 6;
}

export function blockHeight(block: DossierBlock): number {
  switch (block.kind) {
    case "time": return BLOCK_HEIGHT_MM.time;
    case "heading": return BLOCK_HEIGHT_MM.heading;
    case "photos": return BLOCK_HEIGHT_MM.photoRow;
    case "note": return BLOCK_HEIGHT_MM.note;
    case "signature": return BLOCK_HEIGHT_MM.signature;
    case "charges": return BLOCK_HEIGHT_MM.tableHead + block.rows * BLOCK_HEIGHT_MM.tableRow;
    case "submission": return block.compared ? 96 : 22;
    case "booking": return BLOCK_HEIGHT_MM.bookingFrame + block.lines * BLOCK_HEIGHT_MM.bookingLine;
    case "scenario": return scenarioBlockHeight(block.scenario);
  }
}

/** Original booking text as plain text split into page-sized chunks. Never HTML, never fetched. */
export function bookingChunks(raw: string): Array<{ text: string; lines: number }> {
  const text = htmlToPlainText(raw).replace(/\r\n?/g, "\n").trim();
  if (!text) return [];
  const chunks: Array<{ text: string; lines: number }> = [];
  let current: string[] = [], used = 0;
  const flush = () => { if (current.length) chunks.push({ text: current.join("\n"), lines: used }); current = []; used = 0; };
  for (const line of text.split("\n")) {
    // A single very long line (a URL) is sliced so it can still be split across pages.
    const slices = line.length > BOOKING_LINE_CHARS * BOOKING_CHUNK_LINES ? line.match(new RegExp(`.{1,${BOOKING_LINE_CHARS * BOOKING_CHUNK_LINES}}`, "g")) ?? [line] : [line];
    for (const slice of slices) {
      const need = Math.max(1, Math.ceil(slice.length / BOOKING_LINE_CHARS));
      if (used + need > BOOKING_CHUNK_LINES) flush();
      current.push(slice); used += need;
    }
  }
  flush();
  return chunks;
}

/** Rows of the charges table, shared by the height estimate and the render. */
export function chargeTableRows(job: NormalizedJob) {
  const rows: Array<{ item: string; type: string; amount: React.ReactNode; strong?: boolean; tone?: "danger" }> = [];
  for (const line of chargeLines(job)) rows.push({ item: line.label, type: "Calculated", amount: formatMoney(line.pence) });
  const calculated = job.totalCharges ?? job.calculatedTotalCharges ?? null;
  rows.push({ item: "Calculated charge", type: "Calculated", amount: formatMoney(calculated), strong: true });
  const completed = lifecycleOf(job) === "completed";
  rows.push({ item: "Final charge", type: "Billed", amount: completed ? formatMoney(job.amountCharged) : "Not yet charged", strong: true });
  for (const row of job.paymentBreakdown || []) {
    rows.push({ item: row.method || "Method not recorded", type: isInvoiceMethod(row.method) ? "Invoice to collect" : "Recorded receipt", amount: isInvoiceMethod(row.method) && row.amount === 0 ? "Amount not recorded" : formatMoney(row.amount) });
  }
  if (!job.paymentBreakdown?.length) rows.push({ item: "Payment", type: "Recorded receipt", amount: completed ? "Not recorded" : "Not yet" });
  const receipts = recordedReceiptsPence(job);
  if (receipts !== null) rows.push({ item: "Recorded receipts (excludes invoices)", type: "Received", amount: formatMoney(receipts), strong: true });
  return rows;
}

function pairs<T>(items: T[]): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return rows;
}

type Section = { at: number; kind: "evidence"; cards: PhotoCard[] } | { at: number; kind: "scenario"; scenario: Scenario };

/** Pages after the summary page, as lists of blocks. Evidence and scenarios keep submission order. */
export function buildDossierPages(job: NormalizedJob): DossierBlock[][] {
  const base = timeValue(job.bookedStart) ?? timeValue(job.created) ?? 0;
  const evidence = (job.evidenceItems || []).filter(item => !!item.fileId).map(item => ({
    at: timeValue(item.capturedAt) ?? timeValue(item.receivedAt) ?? timeValue(item.completedAt) ?? base + (EVIDENCE_FALLBACK_ORDER[item.category] ?? 999) * 60_000,
    card: {
      key: `evidence-${item.id || item.fileId}`,
      title: evidenceTitle(item.category),
      // thumbProxyUrl first: our authenticated proxy returns raw image bytes; a Drive
      // "view" URL is a page, not something an <img> can show.
      src: item.thumbProxyUrl || `/admin/api/jobs/${encodeURIComponent(job.jobId)}/photos/${encodeURIComponent(String(item.fileId))}`,
      capturedAt: item.capturedAt, fallbackAt: item.receivedAt || item.completedAt, location: item.location, locationName: item.locationName
    } satisfies PhotoCard
  }));
  const scenarios = (job.scenarios || []).map(scenario => ({
    at: timeValue(scenario.photos[0]?.capturedAt) ?? timeValue(scenario.timestamp) ?? base + (SCENARIO_FALLBACK_ORDER[scenario.kind] ?? 999) * 60_000,
    scenario
  }));

  // Consecutive job photos share one "Job photos" section; a scenario in between splits them.
  const timeline = [...evidence.map(e => ({ at: e.at, evidence: e.card })), ...scenarios.map(s => ({ at: s.at, scenario: s.scenario }))].sort((a, b) => a.at - b.at);
  const sections: Section[] = [];
  for (const entry of timeline) {
    const last = sections[sections.length - 1];
    if ("evidence" in entry && entry.evidence) {
      if (last?.kind === "evidence") last.cards.push(entry.evidence);
      else sections.push({ at: entry.at, kind: "evidence", cards: [entry.evidence] });
    } else if ("scenario" in entry && entry.scenario) sections.push({ at: entry.at, kind: "scenario", scenario: entry.scenario });
  }

  const blocks: DossierBlock[] = [{ kind: "charges", rows: chargeTableRows(job).length }, { kind: "time" }, { kind: "submission", compared: !!job.driverJobSummary }];
  if (job.status === "COMPLETED" || job.signatureUrl || job.clientSignatureAt) blocks.push({ kind: "signature" });
  if (!evidence.length) blocks.push({ kind: "heading", title: "Job photos" }, { kind: "note", text: "No job photos were recorded." });
  for (const section of sections) {
    if (section.kind === "evidence") {
      blocks.push({ kind: "heading", title: "Job photos" });
      for (const row of pairs(section.cards)) blocks.push({ kind: "photos", photos: row });
      continue;
    }
    const { scenario } = section;
    const point = scenarioPointFromRecord(scenario);
    blocks.push({ kind: "heading", title: SCENARIO_LABELS[scenario.kind] || "Scenario", subtitle: point?.point });
    blocks.push({ kind: "scenario", scenario });
    const cards: PhotoCard[] = scenario.photos.map((photo, index) => ({
      key: `${scenario.id}-${photo.fileId || index}`, title: `${SCENARIO_LABELS[scenario.kind] || "Scenario"} photo ${index + 1}`,
      src: photo.thumbUrl || null, capturedAt: photo.capturedAt, fallbackAt: scenario.timestamp, location: photo.location, locationName: photo.locationName
    }));
    if (!cards.length) blocks.push({ kind: "note", text: "No photos were recorded for this submission." });
    for (const row of pairs(cards)) blocks.push({ kind: "photos", photos: row });
  }

  const original = bookingChunks(job.rawDescription || "");
  if (job.rawTitle || original.length) {
    blocks.push({ kind: "heading", title: "Original booking information", subtitle: "as imported, shown as plain text" });
    if (job.rawTitle) blocks.push({ kind: "booking", title: "Calendar title", text: job.rawTitle, lines: Math.max(1, Math.ceil(job.rawTitle.length / BOOKING_LINE_CHARS)) });
    original.forEach((chunk, index) => blocks.push({ kind: "booking", title: index === 0 ? "Calendar description" : "Calendar description (continued)", text: chunk.text, lines: chunk.lines }));
  }

  // Greedy packing. A heading never ends a page: it moves with the block after it, and a
  // section that carries over to a new page repeats its heading as "(continued)".
  const pages: DossierBlock[][] = [[]];
  let used = 0;
  let section: Extract<DossierBlock, { kind: "heading" }> | null = null;
  blocks.forEach((block, index) => {
    const next = blocks[index + 1];
    const needed = blockHeight(block) + (block.kind === "heading" && next ? blockHeight(next) : 0);
    if (used > 0 && used + needed > PAGE_CAPACITY_MM) {
      pages.push([]); used = 0;
      if (block.kind !== "heading" && block.kind !== "time" && section) {
        pages[pages.length - 1].push({ ...section, title: `${section.title} (continued)` });
        used += BLOCK_HEIGHT_MM.heading;
      }
    }
    if (block.kind === "heading") section = block;
    pages[pages.length - 1].push(block);
    used += blockHeight(block);
  });
  return pages;
}

/* ------------------------------------------------------------------ rendering --- */

function Row({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "danger" | "good" | "muted" }) {
  return (
    <div>
      <span>{label}</span>
      <span className={tone ? `report-value-${tone}` : undefined}>{value}</span>
    </div>
  );
}

function Photo({ card }: { card: PhotoCard }) {
  const [failed, setFailed] = useState(false);
  const at = card.capturedAt || card.fallbackAt;
  return (
    <figure className="report-photo">
      <figcaption className="report-photo-title">{card.title}</figcaption>
      <div className="report-photo-frame">
        {card.src && !failed
          ? <img src={card.src} alt={card.title} onError={() => setFailed(true)} />
          : <span className="report-photo-missing">{card.src ? "Photo failed to load" : "Not captured"}</span>}
      </div>
      {card.src && !failed && (
        <p className="report-photo-caption">
          {at ? documentDateTime(at) : "Time not recorded"} · {card.location ? formatLocationLabel(card.location, card.locationName) : "Location not recorded"}
        </p>
      )}
    </figure>
  );
}

function Signature({ src, alt, lines }: { src?: string; alt: string; lines: React.ReactNode[] }) {
  return (
    <div className="report-signature">
      <div className="report-signature-image">{src ? <img src={src} alt={alt} /> : <span className="report-photo-missing">Not captured</span>}</div>
      <div className="report-signature-lines">{lines}</div>
    </div>
  );
}

function ScenarioBlock({ scenario }: { scenario: Scenario }) {
  return (
    <div className="report-scenario">
      <div className="report-fact-list">{scenarioRows(scenario).map(([label, value]) => <Row key={label} label={label} value={value} />)}</div>
      <Signature src={scenario.signature?.thumbUrl} alt="Scenario signature" lines={[
        <p key="h" className="report-signature-heading">Submission signature</p>,
        <p key="t">Signed: {scenario.signature?.capturedAt ? documentDateTime(scenario.signature.capturedAt) : "Not recorded"}</p>,
        ...(scenario.signature?.location ? [<p key="l">{formatLocationLabel(scenario.signature.location, scenario.signature.locationName)}</p>] : [])
      ]} />
    </div>
  );
}

function ChargesTable({ job }: { job: NormalizedJob }) {
  const adjustmentReason = adjustmentReasonForMismatch(job);
  return (
    <section className="report-block report-charges">
      <h2 className="report-section-title">Charges and payment</h2>
      <table className="report-table">
        <thead><tr><th scope="col">Item</th><th scope="col">Amount type</th><th scope="col" className="report-num">Amount (GBP)</th></tr></thead>
        <tbody>
          {chargeTableRows(job).map((row, index) => (
            <tr key={index} className={row.strong ? "report-row-strong" : undefined}><th scope="row">{row.item}</th><td>{row.type}</td><td className="report-num">{row.amount}</td></tr>
          ))}
        </tbody>
      </table>
      {adjustmentReason && <p className="report-table-note report-value-danger">Adjustment reason: {adjustmentReason}</p>}
      <p className="report-table-note">Reconciliation: {job.reconciled ? "Reconciled" : "Mismatch"}{job.paymentStatus ? ` · Payment status: ${job.paymentStatus}` : ""}. An invoice is billed, not received.</p>
    </section>
  );
}

function SubmissionBlock({ job }: { job: NormalizedJob }) {
  const summary = job.driverJobSummary;
  const completed = lifecycleOf(job) === "completed";
  if (!summary) {
    return (
      <section className="report-block">
        <h2 className="report-section-title">Driver submission</h2>
        <p className="report-note-inline">{completed ? "Not submitted. The driver has not sent a job summary." : lifecycleOf(job) === "cancelled" ? "Not required." : "Submitted by the driver after the job."}</p>
      </section>
    );
  }
  const rows = comparisonRows(job, { minutes: value => value === null ? "Not recorded" : formatMinutes(value), money: value => value === null ? "Not recorded" : formatMoney(value) });
  return (
    <section className="report-block">
      <h2 className="report-section-title">Driver submission</h2>
      <div className="report-fact-list">
        <Row label="Submitted" value={documentDateTime(summary.submittedAt)} />
        <Row label="Reported start – finish" value={`${formatTime(summary.startTime)} – ${formatTime(summary.endTime)}`} />
        <Row label="Driver-reported amount" value={<>{formatMoney(summary.amountCollectedPence)}{summary.paymentMethod && <small>{summary.paymentMethod}</small>}</>} />
        <Row label="Helper" value={summary.helperName ? `${summary.helperName} · ${summary.helperHours} h` : "None reported"} />
      </div>
      <table className="report-table report-compare">
        <caption>System record compared with the driver's submission</caption>
        <thead><tr><th scope="col">Measure</th><th scope="col" className="report-num">System</th><th scope="col" className="report-num">Driver</th><th scope="col" className="report-num">Difference</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.key}><th scope="row">{row.label}</th><td className="report-num">{row.system}</td><td className="report-num">{row.driver}</td><td className={`report-num${row.state === "differs" ? " report-value-danger" : ""}`}>{row.difference}</td></tr>)}</tbody>
      </table>
    </section>
  );
}

function Block({ block, job }: { block: DossierBlock; job: NormalizedJob }) {
  switch (block.kind) {
    case "charges": return <ChargesTable job={job} />;
    case "submission": return <SubmissionBlock job={job} />;
    case "signature": return (
      <section className="report-block">
        <h2 className="report-section-title">Customer sign-off</h2>
        <Signature src={job.signatureUrl} alt="Client Signature" lines={[
          <p key="c">Confirmed by: <strong>{job.clientConfirmedName || "Not recorded"}</strong></p>,
          <p key="s">Signed: {documentDateTime(job.clientSignatureAt)}</p>,
          <p key="r">Review request email: {job.reviewEmailStatus === "Yes" ? "Sent" : job.reviewEmailStatus === "No" ? "Not sent" : "Not recorded"}</p>
        ]} />
      </section>
    );
    case "booking": return (
      <section className="report-block report-booking">
        <h3>{block.title}</h3>
        <pre>{block.text}</pre>
      </section>
    );
    case "time": return <section className="report-block report-time"><JobTimeBreakdown job={job} /></section>;
    case "heading": return <h2 className="report-section-title">{block.title}{block.subtitle && <span> · {block.subtitle}</span>}</h2>;
    case "scenario": return <ScenarioBlock scenario={block.scenario} />;
    case "note": return <p className="report-note">{block.text}</p>;
    case "photos": return <div className="report-photo-row">{block.photos.map(card => <Photo key={card.key} card={card} />)}</div>;
  }
}

const STATUS_LABEL: Record<string, string> = { READY: "Scheduled", IN_PROGRESS: "In progress", COMPLETED: "Completed", CANCELLED: "Cancelled" };
export const jobStatusLabel = (job: Pick<NormalizedJob, "status">) => STATUS_LABEL[job.status] || job.status.replace(/_/g, " ").toLowerCase().replace(/^\w/, c => c.toUpperCase());

function SummaryPage({ job, vehicle }: { job: NormalizedJob; vehicle?: string }) {
  const booking = job.bookingDetails || {};
  const assigned = !!job.driverName && job.driverName !== "Unassigned";
  const driver = assigned ? `${job.driverName} (${job.driverInitials})` : "Not assigned";
  const milestones = milestonesOf(job);
  const lifecycle = lifecycleOf(job);
  return (
    <>
      <dl className="report-record-meta">
        <div><dt>Reference</dt><dd>{job.jobId}</dd></div>
        <div><dt>Status</dt><dd>{jobStatusLabel(job)}</dd></div>
        <div><dt>Customer</dt><dd>{job.customerName || "Not recorded"}</dd></div>
        <div><dt>Driver</dt><dd>{driver}</dd></div>
        <div><dt>Scheduled</dt><dd>{job.bookedStart ? `${documentDateTime(job.bookedStart)}${job.bookedFinish ? `–${formatTime(job.bookedFinish)}` : ""}` : "Not scheduled"}</dd></div>
        <div><dt>{lifecycle === "completed" ? "Completed" : "Finished"}</dt><dd>{job.actualFinish ? documentDateTime(job.actualFinish) : lifecycle === "scheduled" ? "Not yet" : "Not recorded"}</dd></div>
      </dl>

      <section className="report-block">
        <h2 className="report-section-title">Route</h2>
        <ol className="report-route">
          <li><span className="report-route-label">Pickup</span><span>{job.pickup || "Not recorded"}{job.floorFrom ? ` (floor: ${job.floorFrom})` : ""}</span></li>
          <li><span className="report-route-label">Drop-off</span><span>{job.dropoff || "Not recorded"}{job.floorTo ? ` (floor: ${job.floorTo})` : ""}</span></li>
        </ol>
      </section>

      <div className="report-two-col report-job-facts">
        <section>
          <h2 className="report-section-title">Customer and booking</h2>
          <div className="report-fact-list">
            <Row label="Phone" value={job.customerPhone || "Not recorded"} />
            <Row label="Email" value={job.customerEmail || "Not recorded"} />
            <Row label="Service" value={jobServiceType(job)} />
            <Row label="Booked hire" value={booking.hireDuration || "Not recorded"} />
            <Row label="Crew" value={job.crewSize ? `${job.crewSize} ${job.crewSize === 1 ? "person" : "people"}` : "Not recorded"} />
          </div>
        </section>
        <section>
          <h2 className="report-section-title">Driver and vehicle</h2>
          <div className="report-fact-list">
            <Row label="Driver" value={driver} tone={assigned ? undefined : "muted"} />
            <Row label="Van size" value={booking.vanSize || "Not recorded"} />
            <Row label="Van registration" value={assigned ? vehicle || "Not available" : "Not assigned"} />
            <Row label="Driver viewed job" value={job.driverViewedAt ? documentDateTime(job.driverViewedAt) : assigned ? "Not yet viewed" : "Not assigned"} />
          </div>
        </section>
      </div>

      <section className="report-block report-milestones">
        <h2 className="report-section-title">Schedule and timings</h2>
        <table className="report-table">
          <thead><tr><th scope="col">Milestone</th><th scope="col">Source</th><th scope="col" className="report-num">Time (London)</th></tr></thead>
          <tbody>
            {milestones.map(item => (
              <tr key={item.key}>
                <th scope="row">{item.pdfLabel}{item.note && <small className={item.state === "unverified" ? "report-value-danger" : undefined}>{item.state === "unverified" ? `Unverified: ${item.note}` : item.note}</small>}</th>
                <td>{item.source}</td>
                <td className={`report-num${item.state === "unverified" || item.state === "missing" ? " report-value-danger" : ""}`}>
                  {item.state === "recorded" ? documentDateTime(item.at) : item.state === "unverified" ? MILESTONE_STATE_LABEL.unverified : MILESTONE_STATE_LABEL[item.state]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(job.arrivalProofLate || job.arrivalProofOverdue) && (
          <p className="report-table-note report-value-danger">Gap between tracker arrival and proof photo: {job.arrivalProofLate ? `${job.arrivalProofDelayMinutes ?? "Unknown"} min` : `proof overdue ${job.arrivalProofDelayMinutes ?? "Unknown"} min`}</p>
        )}
      </section>
    </>
  );
}

export function PaperDossierReport({ job, isPreview = false, vehicle }: { job: NormalizedJob; isPreview?: boolean; vehicle?: string }) {
  const pages = buildDossierPages(job);
  const total = pages.length + 1;
  const Page = ({ page, children }: { page: number; children: React.ReactNode }) => (
    // The page break sits on a plain block element: Chromium's print engine drops pages
    // after the first when page-break-after shares an element with flex or grid.
    <div className={`bg-white text-admin-ink mx-auto ${isPreview ? "report-preview-page w-full" : "print-page"}`}
      style={{ boxSizing: "border-box", pageBreakAfter: page < total ? "always" : "auto", breakAfter: page < total ? "page" : "auto" }}>
      <div className="report-page-content">
        <ReportDocumentHeader title="Job Report" reference={job.jobId} page={page} meta={`${job.jobId} · ${jobStatusLabel(job)} · ${documentDateTime(job.bookedStart)}`} />
        <div className="report-page-body">{children}</div>
        <ReportDocumentFooter reference={job.jobId} page={page} total={total} />
      </div>
    </div>
  );
  return (
    <div className={`report-document report-dossier ${isPreview ? "report-document-preview w-full" : "block"}`}>
      <style>{`
        @page { size: A4 portrait; margin: 0; }
        @media print {
          .print-page { width: 210mm !important; min-height: 297mm !important; padding: 14mm !important; margin: 0 !important; box-sizing: border-box !important; background-color: white !important; overflow: visible !important; }
          .print-page:not(:last-child) { page-break-after: always !important; break-after: page !important; }
        }
      `}</style>
      <Page page={1}><SummaryPage job={job} vehicle={vehicle} /></Page>
      {pages.map((blocks, index) => (
        <Page key={index} page={index + 2}>{blocks.map((block, i) => <Block key={i} block={block} job={job} />)}</Page>
      ))}
    </div>
  );
}
