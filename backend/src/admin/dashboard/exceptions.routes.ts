/** Ported from TMV-Chat-bot's dashboard/server/routes/exceptions.route.ts. */
import { Router } from "express";
import { normalizeMongoDataset } from "./normalize";
import { readMongoDataset } from "./read";

export function dashboardExceptionsRoutes(): Router {
  const router = Router();

  router.get("/", async (req, res) => {
    try {
      const typeFilter = typeof req.query.type === "string" ? req.query.type : undefined;
      const from = typeof req.query.from === "string" ? req.query.from : undefined;
      const to = typeof req.query.to === "string" ? req.query.to : undefined;

      const dataset = await readMongoDataset();
      const jobs = await normalizeMongoDataset(dataset);

      const items: Array<{
        id: string; jobId: string; type: string; severity: "CRITICAL" | "WARNING" | "INFO";
        detail: string; timestamp: string; customerName: string; driverName: string; linkUrl: string;
      }> = [];

      // 1. Unhandled errors from the exceptions collection (see
      // jobs/booking.service.ts's reconcileDisappeared, the only writer).
      for (let i = 0; i < dataset.exceptions.length; i++) {
        const ex = dataset.exceptions[i];
        const jobId = ex.jobId || "UNKNOWN";
        const matchingJob = jobs.find(j => j.jobId === jobId);
        items.push({
          id: `ex-${i}`, jobId, type: ex.type || "SYSTEM_EXCEPTION", severity: "CRITICAL",
          detail: ex.detail || "Recorded system exception", timestamp: ex.timestamp || dataset.fetchedAt,
          customerName: matchingJob?.customerName || "—", driverName: matchingJob?.driverName || "—",
          linkUrl: jobId !== "UNKNOWN" ? `/admin?section=jobs&job=${encodeURIComponent(jobId)}` : "/admin"
        });
      }

      // 2. Derived exceptions from jobs.
      for (const j of jobs) {
        if (j.delayMinutes > 30) {
          items.push({
            id: `delay-over30-${j.jobId}`, jobId: j.jobId, type: "EXTREME_DELAY", severity: "CRITICAL",
            detail: `Job started ${j.delayMinutes} minutes late (scheduled ${j.bookedStart})`,
            timestamp: j.actualStart || j.bookedStart, customerName: j.customerName, driverName: j.driverName,
            linkUrl: `/admin?section=jobs&job=${encodeURIComponent(j.jobId)}`
          });
        } else if (j.delayMinutes > 15) {
          items.push({
            id: `delay-15-${j.jobId}`, jobId: j.jobId, type: "LATE_START", severity: "WARNING",
            detail: `Job started ${j.delayMinutes} minutes late`,
            timestamp: j.actualStart || j.bookedStart, customerName: j.customerName, driverName: j.driverName,
            linkUrl: `/admin?section=jobs&job=${encodeURIComponent(j.jobId)}`
          });
        }

        if (j.status === "COMPLETED") {
          const comp = j.evidenceCompleteness;
          const missingChecks: Array<[boolean, string, string]> = [
            [comp.arrival === "MISSING", "MISSING_ARRIVAL_PHOTO", "Completed job lacks mandatory Arrival photograph"],
            [comp.vanLoaded === "MISSING", "MISSING_LOADED_PHOTO", "Completed job lacks mandatory Van-Loaded photograph"],
            [comp.emptyVan === "MISSING", "MISSING_EMPTY_VAN_PHOTO", "Completed job lacks mandatory Empty-Van photograph"],
            [comp.signature === "MISSING", "MISSING_SIGNATURE", "Completed job lacks customer confirmation signature"]
          ];
          for (const [missing, type, detail] of missingChecks) {
            if (!missing) continue;
            items.push({
              id: `${type.toLowerCase()}-${j.jobId}`, jobId: j.jobId, type,
              severity: type === "MISSING_SIGNATURE" ? "CRITICAL" : "WARNING", detail,
              timestamp: j.updated || j.created, customerName: j.customerName, driverName: j.driverName,
              linkUrl: `/admin?section=jobs&job=${encodeURIComponent(j.jobId)}`
            });
          }
        }

        for (const ev of j.evidenceItems) {
          if (ev.state === "FAILED") {
            items.push({
              id: `failed-upload-${ev.id}`, jobId: j.jobId, type: "EVIDENCE_UPLOAD_FAILED", severity: "CRITICAL",
              detail: `Evidence upload failed for ${ev.category}: ${ev.error || "Upload error"}`,
              timestamp: ev.receivedAt || j.updated, customerName: j.customerName, driverName: j.driverName,
              linkUrl: `/admin?section=jobs&job=${encodeURIComponent(j.jobId)}`
            });
          }
        }

        if (!j.reconciled && j.status === "COMPLETED") {
          items.push({
            id: `unreconciled-${j.jobId}`, jobId: j.jobId, type: "FINANCE_UNRECONCILED", severity: "WARNING",
            detail: "Sum of Base Price, Extras and Overtime does not reconcile against Total Charges",
            timestamp: j.updated, customerName: j.customerName, driverName: j.driverName,
            linkUrl: `/admin?section=jobs&job=${encodeURIComponent(j.jobId)}`
          });
        }

        if (!j.timingTrustworthy) {
          items.push({
            id: `tz-corrupt-${j.jobId}`, jobId: j.jobId, type: "TIMING_UNTRUSTWORTHY", severity: "INFO",
            detail: "Recorded timestamp carries a non-London offset (+05:00)",
            timestamp: j.bookedStart, customerName: j.customerName, driverName: j.driverName,
            linkUrl: `/admin?section=jobs&job=${encodeURIComponent(j.jobId)}`
          });
        }
      }

      const isBadge = req.query.badge === "true";
      const isRecentOnly = req.query.recent === "true" || isBadge;

      let filtered = items;
      if (isRecentOnly && !from) {
        const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
        filtered = filtered.filter(it => it.timestamp >= fourteenDaysAgo);
      }
      if (typeFilter && typeFilter !== "ALL") filtered = filtered.filter(it => it.type === typeFilter);
      if (from) filtered = filtered.filter(it => it.timestamp >= from);
      if (to) filtered = filtered.filter(it => it.timestamp <= to);

      const countByType = new Map<string, number>();
      for (const it of items) countByType.set(it.type, (countByType.get(it.type) || 0) + 1);

      return res.status(200).json({
        total: filtered.length,
        unfilteredTotal: items.length,
        activeBadgeCount: isRecentOnly ? filtered.length : items.length,
        items: filtered.sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
        types: [...countByType.entries()].map(([type, count]) => ({ type, count })),
        meta: { fetchedAt: dataset.fetchedAt }
      });
    } catch (error) {
      return res.status(500).json({ error: { code: "EXCEPTIONS_FETCH_FAILED", message: "Failed to fetch exceptions." } });
    }
  });

  return router;
}
