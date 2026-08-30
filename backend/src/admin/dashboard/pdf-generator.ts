/**
 * Ported verbatim from TMV-Chat-bot's dashboard/server/pdf/pdf-generator.ts -- a
 * hand-rolled binary PDF writer (A4 page: 595 x 842 points), zero external library.
 */
import { formatGBP, toPounds } from "../../utils/money";
import { formatLondonDate } from "./timezone";
import { NormalizedJob } from "./types";

export function generateJobPdf(job: NormalizedJob): Buffer {
  const contentLines: string[] = [];

  const addText = (text: string, x: number, y: number, size = 10, font = "/F1", color = "0 0 0") => {
    const escaped = text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
    contentLines.push(`BT`, `${font} ${size} Tf`, `${color} rg`, `1 0 0 1 ${x} ${y} Tm`, `(${escaped}) Tj`, `ET`);
  };

  const addLine = (x1: number, y1: number, x2: number, y2: number, color = "0.8 0.85 0.9", width = 1) => {
    contentLines.push(`${color} RG`, `${width} w`, `${x1} ${y1} m`, `${x2} ${y2} l`, `S`);
  };

  const addRect = (x: number, y: number, w: number, h: number, fillColor = "0.95 0.96 0.98", strokeColor = "0.85 0.88 0.92") => {
    contentLines.push(`${strokeColor} RG`, `${fillColor} rg`, `1 w`, `${x} ${y} ${w} ${h} re`, `B`);
  };

  const left = 45;
  const right = 550;

  addRect(left, 740, right - left, 65, "0.04 0.10 0.18", "0.04 0.10 0.18");
  addText("TMV OPERATIONS", left + 20, 775, 16, "/F2", "0.16 0.67 0.89");
  addText("OFFICIAL JOB COMPLETION & FIELD AUDIT REPORT", left + 20, 755, 9, "/F1", "0.75 0.82 0.90");
  addText(job.jobId, right - 160, 765, 14, "/F2", "1 1 1");

  addRect(left, 675, right - left, 50, "0.95 0.96 0.98", "0.85 0.88 0.92");
  addText("STATUS", left + 15, 705, 8, "/F2", "0.4 0.48 0.58");
  addText(job.status, left + 15, 690, 11, "/F2", job.status === "COMPLETED" ? "0.09 0.50 0.29" : "0.10 0.46 0.74");

  addText("DRIVER", left + 140, 705, 8, "/F2", "0.4 0.48 0.58");
  addText(`${job.driverName} (${job.driverInitials || "UN"})`, left + 140, 690, 10, "/F1", "0.06 0.11 0.18");

  addText("TIMING VARIANCE", left + 320, 705, 8, "/F2", "0.4 0.48 0.58");
  addText(`${job.delayBand} (${job.delayMinutes} mins)`, left + 320, 690, 10, "/F1", job.delayMinutes > 0 ? "0.75 0.19 0.15" : "0.09 0.50 0.29");

  addRect(left, 550, right - left, 110, "1 1 1", "0.85 0.88 0.92");
  addText("CUSTOMER & BOOKING DETAILS", left + 15, 638, 9, "/F2", "0.10 0.46 0.74");
  addLine(left + 15, 630, right - 15, 630);

  addText(`Customer Name: ${job.customerName}`, left + 15, 610, 10, "/F2", "0.06 0.11 0.18");
  addText(`Phone: ${job.customerPhone || "Not recorded"}`, left + 15, 595, 9, "/F1", "0.23 0.31 0.39");
  addText(`Email: ${job.customerEmail || "Not recorded"}`, left + 15, 580, 9, "/F1", "0.23 0.31 0.39");
  addText(`Crew Size: ${job.crewSize} Crew Members`, left + 15, 565, 9, "/F1", "0.23 0.31 0.39");

  addText(`Pickup: ${job.pickup}`, left + 260, 610, 9, "/F1", "0.06 0.11 0.18");
  addText(`Dropoff: ${job.dropoff}`, left + 260, 585, 9, "/F1", "0.06 0.11 0.18");

  addRect(left, 430, right - left, 105, "1 1 1", "0.85 0.88 0.92");
  addText("SCHEDULED VS ACTUAL TIMINGS (EUROPE/LONDON)", left + 15, 518, 9, "/F2", "0.10 0.46 0.74");
  addLine(left + 15, 510, right - 15, 510);

  addText("Stage", left + 15, 495, 8, "/F2", "0.4 0.48 0.58");
  addText("Scheduled", left + 100, 495, 8, "/F2", "0.4 0.48 0.58");
  addText("Actual", left + 250, 495, 8, "/F2", "0.4 0.48 0.58");
  addText("Duration / Variance", left + 380, 495, 8, "/F2", "0.4 0.48 0.58");

  addText("Start", left + 15, 475, 9, "/F1", "0.06 0.11 0.18");
  addText(formatLondonDate(job.bookedStart), left + 100, 475, 9, "/F1", "0.23 0.31 0.39");
  addText(formatLondonDate(job.actualStart), left + 250, 475, 9, "/F2", "0.06 0.11 0.18");
  addText(`${job.bookedMinutes}m scheduled / ${job.delayMinutes}m delay`, left + 380, 475, 9, "/F1", "0.23 0.31 0.39");

  addText("Finish", left + 15, 455, 9, "/F1", "0.06 0.11 0.18");
  addText(formatLondonDate(job.bookedFinish), left + 100, 455, 9, "/F1", "0.23 0.31 0.39");
  addText(formatLondonDate(job.actualFinish), left + 250, 455, 9, "/F2", "0.06 0.11 0.18");
  addText(job.actualMinutes ? `${job.actualMinutes}m total (${job.overtimeMinutes}m overtime)` : "—", left + 380, 455, 9, "/F1", "0.23 0.31 0.39");

  addRect(left, 290, right - left, 125, "1 1 1", "0.85 0.88 0.92");
  addText("CHARGES & FINANCIAL RECONCILIATION", left + 15, 398, 9, "/F2", "0.10 0.46 0.74");
  addLine(left + 15, 390, right - 15, 390);

  addText("Base Price:", left + 15, 370, 9, "/F1", "0.23 0.31 0.39");
  addText(formatGBP(job.basePrice), right - 100, 370, 9, "/F2", "0.06 0.11 0.18");

  addText("Extra Charges (Congestion / Tunnel):", left + 15, 352, 9, "/F1", "0.23 0.31 0.39");
  addText(formatGBP(job.extraCharges), right - 100, 352, 9, "/F2", "0.06 0.11 0.18");

  addText(`Overtime (${job.overtimeMinutes} mins):`, left + 15, 334, 9, "/F1", "0.23 0.31 0.39");
  addText(formatGBP(job.overtimeCharge), right - 100, 334, 9, "/F2", "0.06 0.11 0.18");

  addLine(left + 15, 324, right - 15, 324);
  addText("TOTAL CHARGES:", left + 15, 308, 10, "/F2", "0.06 0.11 0.18");
  addText(formatGBP(job.totalCharges), right - 100, 308, 11, "/F2", "0.10 0.46 0.74");

  addRect(left, 160, right - left, 115, "1 1 1", "0.85 0.88 0.92");
  addText("CUSTOMER SIGN-OFF & FIELD EVIDENCE AUDIT", left + 15, 258, 9, "/F2", "0.10 0.46 0.74");
  addLine(left + 15, 250, right - 15, 250);

  addText(`Client Confirmed By: ${job.clientConfirmedName || job.customerName}`, left + 15, 230, 9, "/F2", "0.06 0.11 0.18");
  addText(`Payment Method: ${job.paymentMethod} (${job.paymentStatus})`, left + 15, 215, 9, "/F1", "0.23 0.31 0.39");
  addText(`Reconciliation Status: ${job.reconciled ? "RECONCILED" : "UNRECONCILED"}`, left + 15, 200, 9, "/F2", job.reconciled ? "0.09 0.50 0.29" : "0.75 0.19 0.15");

  const comp = job.evidenceCompleteness;
  addText(`Arrival Photo: ${comp.arrival} | Loaded: ${comp.vanLoaded} | Empty: ${comp.emptyVan} | Org: ${comp.organized}`, left + 15, 180, 8, "/F1", "0.4 0.48 0.58");

  addText("Generated by TMV Operations Dashboard (/admin) - Official Immutable Record", left + 80, 70, 8, "/F1", "0.5 0.58 0.68");

  const streamContent = contentLines.join("\n");
  const streamLength = Buffer.byteLength(streamContent, "utf8");

  const obj1 = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  const obj2 = `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`;
  const obj3 = `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n`;
  const obj4 = `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`;
  const obj5 = `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`;
  const obj6 = `6 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamContent}\nendstream\nendobj\n`;

  const header = `%PDF-1.4\n`;
  const body = [obj1, obj2, obj3, obj4, obj5, obj6];

  let offset = header.length;
  const offsets: number[] = [0];

  for (const obj of body) {
    offsets.push(offset);
    offset += obj.length;
  }

  const xrefOffset = offset;
  let xref = `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }

  const trailer = `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(header + body.join("") + xref + trailer, "utf8");
}
