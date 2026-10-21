import { Router } from "express";
import { reportPage, reportRange } from "../../reports/driver-report.model";
import { listServerErrors } from "../../observability/server-errors.repo";
import { LOG_KINDS, type LogKind } from "../../observability/server-errors";

/** Mounted behind requireAdminAuth; no raw-console, download or delete endpoint. */
export function dashboardLogsRoutes(): Router {
  const router = Router();
  router.get("/", async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    try {
      const range = reportRange(req.query.from, req.query.to);
      const { page, pageSize } = reportPage(req.query.page ?? 1, req.query.pageSize ?? 25);
      if (pageSize > 100) throw new RangeError("Choose at most 100 events per page.");
      const kind = req.query.kind ?? "all";
      if (kind !== "all" && !LOG_KINDS.includes(kind as LogKind)) throw new RangeError("Choose a valid issue type.");
      res.json(await listServerErrors(range.from, range.to, page, pageSize, kind as LogKind | "all"));
    } catch (error) {
      res.status(error instanceof RangeError ? 400 : 503).json({ error: { message: error instanceof RangeError ? error.message : "Log history is temporarily unavailable. Try again shortly." } });
    }
  });
  return router;
}
