import { Router } from "express";
import { getDriverReport } from "../../reports/driver-report.service";
import { reportPage, reportRange } from "../../reports/driver-report.model";
import { ReportCapacityError } from "../../reports/driver-report.repo";
import { exportFilename } from "../../reports/driver-report-export.model";
import { generateDriverReportPdf } from "../../reports/driver-report.pdf";
import { generateDriverReportXlsx } from "../../reports/driver-report.xlsx";
import { reportExportConcurrency, reportFeatureEnabled } from "../../reports/release-controls";

let activeExports = 0;

export function dashboardDriverReportsRoutes(): Router {
  const router = Router();
  router.get("/:initials/export.:format", async (req, res) => {
    let acquired = false;
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    try {
      if (!reportFeatureEnabled("reports") || !reportFeatureEnabled("exports")) { res.status(503).json({ error: { code: "DRIVER_EXPORTS_PAUSED", message: "Driver report downloads are temporarily paused. Saved records are unchanged." } }); return; }
      const initials = String(req.params.initials).trim().toUpperCase();
      if (!/^[A-Z0-9_-]{1,24}$/.test(initials)) throw new RangeError("Invalid driver reference.");
      const format = String(req.params.format);
      if (format !== "pdf" && format !== "xlsx") throw new RangeError("Choose PDF or Excel export.");
      const range = reportRange(req.query.from, req.query.to);
      const groupBy = req.query.groupBy ?? "day";
      if (groupBy !== "day" && groupBy !== "week" && groupBy !== "month") throw new RangeError("Invalid trend grouping.");
      if (activeExports >= reportExportConcurrency()) { res.setHeader("Retry-After", "5"); res.status(429).json({ error: { code: "EXPORT_BUSY", message: "Reports are being generated. Please retry shortly." } }); return; }
      activeExports++; acquired = true;
      const report = await getDriverReport(initials, range, groupBy, true);
      // Never consume paginated UI responses or mutate/reconcile source records during export.
      const buffer = format === "pdf" ? await generateDriverReportPdf(report) : await generateDriverReportXlsx(report);
      res.setHeader("Content-Type", format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${exportFilename(report, format)}"`);
      res.send(buffer);
    } catch (error) {
      res.status(error instanceof ReportCapacityError ? 413 : error instanceof RangeError ? 400 : 500).json({ error: { code: "DRIVER_EXPORT_FAILED", message: error instanceof RangeError || error instanceof ReportCapacityError ? error.message : "Driver report could not be exported. No source data was modified." } });
    } finally { if (acquired) activeExports--; }
  });
  router.get("/:initials", async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    try {
      if (!reportFeatureEnabled("reports")) { res.status(503).json({ error: { code: "DRIVER_REPORTS_PAUSED", message: "Driver reports are temporarily paused. Saved records are unchanged." } }); return; }
      const initials = String(req.params.initials).trim().toUpperCase();
      if (!/^[A-Z0-9_-]{1,24}$/.test(initials)) throw new RangeError("Invalid driver reference.");
      const range = reportRange(req.query.from, req.query.to);
      const page = reportPage(req.query.page, req.query.pageSize);
      const groupBy = req.query.groupBy === "week" ? "week" : req.query.groupBy === "month" ? "month" : "day";
      const pages = Object.fromEntries(["jobs", "events", "visits", "charges", "liabilities", "roadAlerts"].map(key => [key, reportPage(req.query[`${key}Page`] ?? page.page, page.pageSize)]));
      const scheme = String(req.query.activityScheme ?? "all");
      if (!["all", "tunnel", "congestion"].includes(String(scheme))) throw new RangeError("Invalid activity scheme.");
      const detail = req.query.detail ?? "full";
      if (detail !== "core" && detail !== "full" && detail !== "activity" && detail !== "display") throw new RangeError("Invalid report detail level.");
      const sortDir = req.query.sortDir;
      if (sortDir !== undefined && sortDir !== "asc" && sortDir !== "desc") throw new RangeError("Invalid date order.");
      const ordered = <T>(items: T[], date: (row: T) => string | null | undefined): T[] => {
        if (!sortDir) return items;
        const sign = sortDir === "desc" ? -1 : 1;
        return [...items].sort((a, b) => {
          const left = Date.parse(date(a) || ""), right = Date.parse(date(b) || "");
          if (!Number.isFinite(left)) return Number.isFinite(right) ? 1 : 0;
          if (!Number.isFinite(right)) return -1;
          return (left - right) * sign;
        });
      };
      const report = await getDriverReport(initials, range, groupBy, false, { includeLiabilities: false, includeGps: detail !== "core", ...(detail === "activity" ? { includePositions: false } : {}), ...(detail === "display" ? { includeGeometry: false } : {}) });
      const visits = report.visits.filter(visit => scheme === "all" || (scheme === "congestion" ? visit.scheme === "congestion" : visit.scheme !== "congestion"));
      const events = report.events.filter(event => scheme === "all" || (scheme === "congestion" ? event.scheme === "congestion" : ["dartford", "blackwall-silvertown"].includes(event.scheme || "")));
      const charges = report.charges.filter(charge => scheme === "all" || charge.type === scheme);
      const roadAlerts = (report.roadAlerts ?? []).filter(row => !!row.jobId && (scheme === "all" || row.type === scheme));
      const paginate = <T>(items: T[], key: string) => {
        const ownPage = pages[key];
        return { items: items.slice((ownPage.page - 1) * ownPage.pageSize, ownPage.page * ownPage.pageSize), total: items.length, ...ownPage };
      };
      res.json({ ...report, activitySummary: { scheme, observedVisits: visits.length, observedEntries: visits.filter(visit => visit.entryObserved).length,
        confirmedCrossings: report.gpsSummary.confirmedTunnelCrossings === null || report.meta?.movementIncluded === false || report.gpsSummary.coverage === "unavailable" ? null : visits.filter(visit => visit.physicalCrossingConfirmed).length,
        chargeableObligations: charges.length, knownCustomerPence: charges.reduce((sum, charge) => sum + (charge.expectedPence ?? 0), 0), unknownChargeAmounts: charges.filter(charge => charge.expectedPence === null).length },
        roadAlertSummary: { entries: roadAlerts.length, chargeableEntries: roadAlerts.filter(row => row.chargeable).length,
          estimatedKnownPence: roadAlerts.reduce((sum, row) => sum + (row.estimatedPence ?? 0), 0), unpricedEntries: roadAlerts.filter(row => row.estimatedPence === null).length },
        roadAlerts: paginate(ordered(roadAlerts, row => row.enteredAt), "roadAlerts"), jobs: paginate(ordered(report.jobs, row => row.operationalDate || row.bookedStart), "jobs"),
        events: paginate(ordered(events, row => row.occurredAt), "events"), visits: paginate(ordered(visits, row => row.entryAt || row.firstInsideAt), "visits"),
        charges: paginate(ordered(charges, row => row.occurredAt), "charges"), liabilities: paginate(ordered(report.liabilities, row => row.date), "liabilities") });
    } catch (error) {
      res.status(error instanceof ReportCapacityError ? 413 : error instanceof RangeError ? 400 : 500).json({ error: { code: "DRIVER_REPORT_FAILED", message: error instanceof RangeError || error instanceof ReportCapacityError ? error.message : "Driver report could not be loaded. No financial or source data was modified." } });
    }
  });
  return router;
}
