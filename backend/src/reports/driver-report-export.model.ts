import { DateTime } from "luxon";
import type { getDriverReport } from "./driver-report.service";
import { ReportCapacityError } from "./driver-report.repo";

export type ExportReport = Awaited<ReturnType<typeof getDriverReport>>;
export type ExportCell = string | number | boolean | null;
export interface ExportTable { title: string; headers: string[]; rows: ExportCell[][] }
export interface ExportSection { name: string; tables: ExportTable[] }
export function assertExportCellBudget(sections: ExportSection[]) {
  const cells = sections.reduce((sum, section) => sum + section.tables.reduce((count, table) => count + (table.rows.length + 1) * table.headers.length, 0), 0);
  if (!Number.isSafeInteger(cells) || cells > 1_000_000) throw new ReportCapacityError("Workbook exceeds one million data cells. Narrow the report range; no partial file was returned.");
}
export function exportLabel(value: string): string {
  return value.replace(/Pence/g, " GBP").replace(/\./g, " / ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\b\w/g, letter => letter.toUpperCase());
}

export const exportNotes = [
  "Payment cards: Total Charges is the original calculation; Driver Collected is the final driver-charged amount; Manual Entries shows the available valid manual-form collection subtotal with missing/invalid entry counts. Card Outstanding = Driver Collected - Manual Entries, signed and without adding prepayments; the complete balance stays unknown until required entries are available. This entry comparison is separate from verified debt/prepayment reconciliation.",
  "Currency: GBP. Money is calculated in integer pence; exported currency cells are pounds. Durations retain their stated units.",
  "Unknown values are not zero. Summary amounts labelled Known are subtotals; unknown-job counts indicate incomplete totals.",
  "Jobs use recorded operational start, otherwise booking. GPS uses occurrence time; liabilities use their labelled incident/submission basis. Range end is exclusive.",
  "Only completed jobs contribute to financial/performance totals. Context jobs are evidence links, excluded from financial totals.",
  "Manual details are locked. Invoice and generated payment links are not proof of collection. Separate confirmed prepayments are counted once.",
  "Outstanding and excess are summed per job, not netted across jobs. Liability amounts are separate from customer collections.",
  "GPS counts are observed evidence, not proof of complete history or off-app cash collection. Provider completeness is unknown; physical crossings require portal proof.",
  "Customer congestion: one qualifying in-job entry fee per job; tunnel: per confirmed crossing. London windows: tunnel 06:00-22:00 daily; congestion 07:00-18:00 weekdays, 12:00-18:00 weekends. Start included, end excluded.",
  "Customer fees use frozen Pricing Settings tariffs, not authority costs. Authority costs remain unknown unless separately verified. Historical prices are not recalculated.",
  "Allocation rounds Calendar duration up to a full hour. Positive extra time bills full 30-minute blocks, Calendar rate first then agreed Pricing Settings fallback.",
  "Source reads are nontransactional. Each file uses one report result; concurrent updates may mean a later screen refresh differs. No source data is modified.",
  "Full filtered dataset, without screen pagination. Capacity errors refuse the export rather than silently truncate job or liability records. Partial GPS coverage is explicitly labelled.",
  "Array-valued evidence references/snapshots are JSON text; embedded monetary keys ending in Pence retain pence units. Timestamp columns retain source instants with companion London display columns.",
  "Payment-method components are additive within a receipt. Receipt totals, job totals and comparison views are not additional collections and must not be summed together.",
];

export function londonStamp(value: string | null | undefined): string {
  if (!value) return "Unknown";
  const dt = DateTime.fromISO(value, { setZone: true }).setZone("Europe/London");
  return dt.isValid ? dt.toFormat("yyyy-MM-dd HH:mm:ss ZZ") : "Unknown";
}

// Flatten typed report projections, never raw provider payloads or database documents.
function flatten(value: unknown, prefix = "", result: Record<string, ExportCell> = {}): Record<string, ExportCell> {
  if (value === undefined || value === null) { result[prefix] = null; return result; }
  if (Array.isArray(value)) { result[prefix] = JSON.stringify(value); return result; }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value)) flatten(item, prefix ? `${prefix}.${key}` : key, result);
  } else {
    result[prefix] = typeof value === "number" || typeof value === "boolean" ? value : String(value);
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) result[`${prefix}.London`] = londonStamp(value);
  }
  return result;
}
function records(title: string, items: unknown[], fallback: string[] = ["jobId"]): ExportTable {
  const rows = items.map(item => flatten(item));
  const headers = [...new Set(rows.flatMap(row => Object.keys(row)))];
  return { title, headers: headers.length ? headers : fallback, rows: rows.map(row => headers.map(header => row[header] ?? null)) };
}
function measures(title: string, data: unknown): ExportTable {
  return { title, headers: ["Metric", "Value"], rows: Object.entries(flatten(data)).map(([key, value]) => [key, value]) };
}
export function exportSections(report: ExportReport): ExportSection[] {
  const payments = report.jobs.flatMap(job => ["system", "manual"].flatMap(source => {
    const receipt = source === "system" ? job.finance.systemPayments : job.finance.manualPayments;
    return receipt ? [{ jobId: job.jobId, source, byMethod: receipt.byMethod,
      collectedPence: receipt.collectedPence, invoicePence: receipt.invoicePence, invoiceBasis: receipt.invoiceBasis, issues: receipt.issues,
      submittedAt: source === "manual" ? job.manualDetails?.submittedAt ?? null : null,
      includedInFinancialTotals: job.status === "COMPLETED" }] : [];
  }));
  const comparison = report.jobs.map(job => ({ jobId: job.jobId, manualStatus: job.manualStatus,
    systemStart: job.actualStart, manualStart: job.manualDetails?.startTime ?? null, systemFinish: job.actualFinish, manualFinish: job.manualDetails?.endTime ?? null,
    ...job.duration, ...job.finance, helperName: job.manualDetails?.helperName ?? null, helperHours: job.manualDetails?.helperHours ?? null,
    submittedAt: job.manualDetails?.submittedAt ?? null, issues: job.issues }));
  const road = (type: "tunnel" | "congestion") => {
    const matches = (scheme: string | null) => type === "congestion" ? scheme === "congestion" : scheme === "dartford" || scheme === "blackwall-silvertown";
    return [records("GPS visits", report.visits.filter(row => matches(row.scheme))),
      records("GPS events", report.events.filter(row => matches(row.scheme)).map(({ raw, ...safe }) => safe), ["_id", "occurredAt", "association.jobId"]),
      records("Customer charge obligations", report.charges.filter(row => row.type === type)),
      records("Verification activity", report.jobs.flatMap(job => (job.roadCharges?.activity ?? []).filter(row => row.type === type).map(row => ({ jobId: job.jobId, ...row })))),
      records("Verification flags", report.jobs.flatMap(job => (job.roadCharges?.flags ?? []).filter(row => row.type === type).map(row => ({ jobId: job.jobId, ...row })))),
      records("Reported vs expected charges", report.jobs.flatMap(job => (job.roadCharges?.comparisons ?? []).filter(row => row.type === type).map(row => ({ jobId: job.jobId, ...row })))),
      records("Manual reported charges", report.jobs.flatMap(job => (job.manualDetails?.chargeItems ?? []).filter(row => row.type === type).map(row => ({ jobId: job.jobId, ...row }))))];
  };
  return [
    { name: "Summary", tables: [measures("Performance and financial totals", report.summary), measures("Report metadata", { version: report.version, generatedAt: report.generatedAt, driver: report.driver,
      range: report.range, groupBy: report.groupBy, dateBasis: report.dateBasis, meta: report.meta,
      rowCounts: { jobs: report.jobs.length, events: report.events.length, visits: report.visits.length, charges: report.charges.length, liabilities: report.liabilities.length } }),
      measures("GPS coverage and counts", report.gpsSummary), measures("Liability totals (separate)", report.liabilitySummary),
      { title: "Sources and calculation notes", headers: ["Note"], rows: exportNotes.map(note => [note]) }, records("Context jobs (excluded from financial totals)", report.contextJobs),
      records("Unclassified GPS events (needs verification)", report.events.filter(row => !["congestion", "dartford", "blackwall-silvertown"].includes(row.scheme || "")).map(({ raw, ...safe }) => safe), ["_id", "occurredAt", "association.jobId"])] },
    { name: "Performance", tables: [records("Trend data", report.trends, ["period", "completedJobs", "expectedKnownPence"]), records("Helper totals", report.summary.helpers, ["name", "hours", "jobs"])] },
    { name: "Payments", tables: [records("Payment method records", payments.map(({ byMethod, ...row }) => ({ ...row, byMethodPence: byMethod }))), records("Confirmed prepayment source records", report.jobs.flatMap(job => job.confirmedPrepayments.map(row => ({ jobId: job.jobId, ...row }))))] },
    { name: "Jobs", tables: [records("Complete job records", report.jobs.map(({ manualDetails, roadCharges, ...job }) => ({ ...job,
      manual: manualDetails ? { startTime: manualDetails.startTime, endTime: manualDetails.endTime, helperName: manualDetails.helperName, helperHours: manualDetails.helperHours,
        submittedAt: manualDetails.submittedAt, chargeItems: manualDetails.chargeItems, paymentBreakdown: manualDetails.paymentBreakdown, noPaymentReceived: manualDetails.noPaymentReceived } : null }))) ] },
    { name: "Comparison", tables: [records("System vs driver manual details", comparison)] },
    { name: "Tunnels", tables: road("tunnel") }, { name: "Congestion", tables: road("congestion") },
    { name: "Liabilities", tables: [records("Liability and evidence records", report.liabilities)] },
  ];
}

export function exportFilename(report: ExportReport, format: "pdf" | "xlsx") {
  const start = DateTime.fromISO(report.range.from).setZone("Europe/London").toISODate();
  const end = DateTime.fromISO(report.range.to).minus({ milliseconds: 1 }).setZone("Europe/London").toISODate();
  const driver = report.driver.initials.replace(/[^A-Z0-9_-]/gi, "_").slice(0, 24);
  return `tmv-driver-${driver}-${start}-${end}.${format}`;
}
