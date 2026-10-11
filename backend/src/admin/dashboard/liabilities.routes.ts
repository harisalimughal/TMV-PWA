import { Router } from "express";
import { jobLiabilityReport } from "../../liabilities/liability.service";

export function dashboardLiabilitiesRoutes(): Router {
  const router = Router();
  router.get("/jobs/:jobId", async (req, res) => {
    try {
      const report = await jobLiabilityReport(String(req.params.jobId));
      res.status(report ? 200 : 404).json(report ?? { error: { code: "JOB_NOT_FOUND" } });
    } catch { res.status(500).json({ error: { code: "LIABILITY_REPORT_FAILED" } }); }
  });
  router.post("/jobs/:jobId/reconcile", async (req, res) => {
    if (req.body && Object.keys(req.body).length) { res.status(400).json({ error: { code: "LIABILITY_EDITING_DISABLED", message: "Reconciliation accepts no financial/status edits." } }); return; }
    try {
      const report = await jobLiabilityReport(String(req.params.jobId), true);
      res.status(report ? 200 : 404).json(report ?? { error: { code: "JOB_NOT_FOUND" } });
    } catch { res.status(503).json({ error: { code: "LIABILITY_RECONCILE_FAILED", message: "Existing source/audit records remain intact; reconciliation can be retried." } }); }
  });
  return router;
}
