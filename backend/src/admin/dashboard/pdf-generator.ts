import PDFDocument from "pdfkit";
import { existsSync } from "node:fs";
import path from "node:path";
import { formatGBP } from "../../utils/money";
import { formatLondonDate } from "./timezone";
import type { NormalizedJob } from "./types";

/** The API download is a textual summary; the browser dossier includes photo/signature evidence. */
export function generateJobPdf(job: NormalizedJob): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margins: { top: 40, bottom: 62, left: 40, right: 40 }, bufferPages: true,
      info: { Title: `Job Completed - ${job.jobId}`, Author: "TMV Operations", Subject: "Job completion summary" } });
    const chunks: Buffer[] = [];
    doc.on("data", chunk => chunks.push(chunk)); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject);
    const width = doc.page.width - 80, ink = "#20272c", muted = "#65716f", line = "#dbe1e6";
    const rule = (y: number) => doc.strokeColor(line).lineWidth(0.7).moveTo(40, y).lineTo(doc.page.width - 40, y).stroke();
    const room = (height: number) => { if (doc.y + height > doc.page.height - 78) doc.addPage(); };
    const section = (title: string) => {
      room(64); doc.moveDown(0.7).font("Helvetica-Bold").fontSize(12).fillColor(ink).text(title, 40, doc.y, { width });
      doc.moveDown(0.45); rule(doc.y); doc.y += 9;
    };
    const row = (label: string, value: unknown) => {
      const text = value === null || value === undefined || value === "" ? "Not recorded" : String(value);
      doc.font("Helvetica").fontSize(10);
      const height = Math.max(doc.heightOfString(label, { width: 148 }), doc.heightOfString(text, { width: width - 166 })) + 12;
      if (height > doc.page.height - 160) {
        room(44); doc.fillColor(muted).text(label, 40, doc.y, { width });
        doc.moveDown(0.4).fillColor(ink).text(text, 40, doc.y, { width, lineGap: 2 });
        rule(doc.y + 6); doc.y += 15;
        return;
      }
      room(Math.min(height, doc.page.height - 160));
      const y = doc.y;
      doc.fillColor(muted).text(label, 40, y, { width: 148 });
      doc.fillColor(ink).text(text, 206, y, { width: width - 166, lineGap: 2 });
      doc.y = Math.max(doc.y, y + height); rule(doc.y); doc.y += 3;
    };
    const logo = path.resolve(__dirname, "../../../../web/public/tmv-logo.png");
    if (existsSync(logo)) doc.image(logo, 40, 40, { fit: [38, 38] });
    doc.font("Helvetica-Bold").fontSize(19).fillColor(ink).text("Job Completed", 92, 42, { width: 310 });
    doc.font("Helvetica").fontSize(9).fillColor(muted);
    doc.text("020 3773 9113", 410, 45, { width: 145, align: "right" });
    doc.y = 96; rule(doc.y); doc.y += 15;
    row("Reference", job.jobId); row("Driver", `${job.driverName} (${job.driverInitials || "UN"})`);
    row("Status", job.status); row("Timing variance", `${job.delayBand} (${job.delayMinutes} mins)`);
    section("Customer & booking details");
    row("Customer name", job.customerName); row("Phone", job.customerPhone); row("Email", job.customerEmail);
    row("Crew size", `${job.crewSize} Crew Members`); row("Pickup", job.pickup); row("Dropoff", job.dropoff);
    section("Scheduled & actual timings - Europe/London");
    row("Scheduled pickup", formatLondonDate(job.bookedStart)); row("Actual arrival", formatLondonDate(job.actualStart));
    row("Scheduled finish", formatLondonDate(job.bookedFinish)); row("Actual finish", formatLondonDate(job.actualFinish));
    row("Scheduled / delay", `${job.bookedMinutes}m scheduled / ${job.delayMinutes}m delay`);
    row("Actual / overtime", job.actualMinutes ? `${job.actualMinutes}m total (${job.overtimeMinutes}m overtime)` : "Not recorded");
    section("Charges & financial reconciliation");
    row("Base price", formatGBP(job.basePrice)); row("Extra charges", formatGBP(job.extraCharges));
    row(`Overtime (${job.overtimeMinutes} mins)`, formatGBP(job.overtimeCharge));
    row("Total charges", formatGBP(job.totalCharges)); row("Amount charged", formatGBP(job.amountCharged));
    section("Customer sign-off & field evidence audit");
    row("Client confirmed by", job.clientConfirmedName || job.customerName);
    row("Customer signature time", job.clientSignatureAt ? formatLondonDate(job.clientSignatureAt) : "Not recorded");
    row("Payment", `${job.paymentMethod} (${job.paymentStatus})`);
    row("Tracker arrival", job.trackerArrivalAt ? formatLondonDate(job.trackerArrivalAt) : "Unverified");
    row("Reconciliation", job.reconciled ? "RECONCILED" : "UNRECONCILED");
    row("Proof of arrival time", job.pickupArrivalAt ? formatLondonDate(job.pickupArrivalAt) : "Not recorded");
    row("Review report", `RW=${job.reviewEmailStatus}`);
    row("Empty van photo time", job.actualFinish ? formatLondonDate(job.actualFinish) : "Not recorded");
    if (job.arrivalProofLate || job.arrivalProofOverdue) row("Arrival to proof gap", `${job.arrivalProofDelayMinutes || 0} mins`);
    const comp = job.evidenceCompleteness;
    row("Evidence status", `Arrival Photo: ${comp.arrival} | Loaded: ${comp.vanLoaded} | Empty: ${comp.emptyVan} | Org: ${comp.organized}`);
    section("Job time breakdown");
    if (job.timeBilling) {
      const b = job.timeBilling, minutes = (n: number) => Number(n.toFixed(2));
      row("Calendar / allocation / actual", `${minutes(b.scheduledMinutes)} min / ${b.allocatedMinutes} min / ${minutes(b.actualMinutes)} min`);
      row("Extra time / billed blocks", `${minutes(b.extraMinutes)} min / ${b.billedExtraBlocks} x 30 min`);
      row("Extra charge", b.extraChargePence === null ? "Unknown" : formatGBP(b.extraChargePence));
      row("Rate / 30 min", b.ratePer30Pence === null ? "Unknown" : formatGBP(b.ratePer30Pence));
      row("Rate source", b.rateSource); row("Billing status", job.timeBillingStatus || "verified");
    } else row("Billing status", `${job.timeBillingStatus || "legacy"}; recorded prices retained`);
    row("Arrival delay source", job.arrivalDelaySource || "proof-acceptance");
    const pages = doc.bufferedPageRange();
    for (let index = 0; index < pages.count; index++) {
      doc.switchToPage(index); rule(doc.page.height - 49);
      const bottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.font("Helvetica").fontSize(8).fillColor(muted);
      doc.text(job.jobId, 40, doc.page.height - 39, { width: 245, lineBreak: false });
      doc.text(`Page ${index + 1} of ${pages.count}`, 300, doc.page.height - 39, { width: width - 260, align: "right", lineBreak: false });
      doc.page.margins.bottom = bottomMargin;
    }
    doc.end();
  });
}
