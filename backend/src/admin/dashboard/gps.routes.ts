import { Router } from "express";
import { listJobs } from "../../db/jobs.repo";
import { associateGpsEvent } from "../../gps/gps.association";
import { gpsJobMonitoring } from "../../gps/gps.monitoring";
import { gpsEventsPage } from "../../gps/gps.repo";
import { gpsRange, syncGpsHistory } from "../../gps/gps.sync";
import { jobRoadChargeReport } from "../../gps/road-charge.service";
import { reportFeatureEnabled } from "../../reports/release-controls";

export function dashboardGpsRoutes(): Router {
  const router = Router();
  router.get("/jobs/:jobId/charges", async (req, res) => {
    try {
      const report = await jobRoadChargeReport(String(req.params.jobId));
      res.status(report ? 200 : 404).json(report ?? { error: { code: "JOB_NOT_FOUND" } });
    } catch { res.status(500).json({ error: { code: "ROAD_CHARGE_REPORT_FAILED" } }); }
  });
  router.post("/jobs/:jobId/charges/reconcile", async (req, res) => {
    try {
      const report = await jobRoadChargeReport(String(req.params.jobId), true);
      res.status(report ? 200 : 404).json(report ?? { error: { code: "JOB_NOT_FOUND" } });
    } catch { res.status(503).json({ error: { code: "ROAD_CHARGE_RECONCILE_FAILED", message: "Saved allocation guards remain intact; retry reconciliation." } }); }
  });
  router.get("/events", async (req, res) => {
    try {
      const range = gpsRange(req.query.from, req.query.to, 31);
      const imei = req.query.imei === undefined ? undefined : String(req.query.imei);
      if (imei && !/^\d{1,30}$/.test(imei)) throw new RangeError("Invalid tracker IMEI.");
      const page = Number(req.query.page ?? 1), pageSize = Number(req.query.pageSize ?? 100);
      if (!Number.isSafeInteger(page) || page < 1 || page > 10_000 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 200) throw new RangeError("Invalid GPS page size/range.");
      const data = await gpsEventsPage(range.from, range.to, imei, page, pageSize);
      const jobs = await listJobs(imei ? { gpsliveImei: imei } : undefined);
      const now = new Date().toISOString();
      res.json({ ...data, page, pageSize, items: data.items.map(row => ({ ...row, association: associateGpsEvent(row, jobs, now) })) });
    } catch (error) { res.status(error instanceof RangeError ? 400 : 500).json({ error: { code: "GPS_EVENTS_FAILED", message: error instanceof RangeError ? error.message : "GPS event history could not be loaded." } }); }
  });
  router.get("/jobs/:jobId", async (req, res) => {
    try {
      const monitoring = await gpsJobMonitoring(String(req.params.jobId));
      res.status(monitoring ? 200 : 404).json(monitoring ?? { error: { code: "JOB_NOT_FOUND" } });
    } catch { res.status(500).json({ error: { code: "GPS_MONITORING_FAILED", message: "GPS monitoring could not be loaded." } }); }
  });
  router.post("/sync", async (req, res) => {
    try {
      if (!reportFeatureEnabled("gpsHistory")) { res.status(503).json({ error: { code: "GPS_HISTORY_PAUSED", message: "GPS history imports are paused; saved evidence/checkpoints are unchanged." } }); return; }
      const range = gpsRange(req.body?.from, req.body?.to);
      const budget = req.body?.requestBudget === undefined ? 128 : Number(req.body.requestBudget);
      if (!Number.isSafeInteger(budget) || budget < 1 || budget > 128) throw new RangeError("GPS request budget must be between 1 and 128.");
      const run = await syncGpsHistory(String(req.body?.imei ?? ""), range.from, range.to, budget);
      res.json({ run });
    } catch (error) { res.status(error instanceof RangeError ? 400 : 502).json({ error: { code: "GPS_SYNC_FAILED", message: error instanceof RangeError ? error.message : "GPS synchronization failed; saved checkpoints can be retried." } }); }
  });
  return router;
}
