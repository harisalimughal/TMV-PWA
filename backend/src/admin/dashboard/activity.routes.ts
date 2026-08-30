/** Ported from TMV-Chat-bot's dashboard/server/routes/activity.route.ts. */
import { Router } from "express";
import { activityCollection } from "../../db/mongo";
import { toUtcIso } from "./timezone";

export function dashboardActivityRoutes(): Router {
  const router = Router();

  router.get("/", async (req, res) => {
    try {
      const from = typeof req.query.from === "string" ? req.query.from : undefined;
      const to = typeof req.query.to === "string" ? req.query.to : undefined;

      const rows = await (await activityCollection()).find({}).toArray();
      let list = rows.map((a, i) => ({
        id: `act-${i}`,
        timestamp: toUtcIso(a.timestamp),
        jobId: a.jobId || "—",
        driver: a.driver || "Not recorded",
        action: a.action || "",
        fromState: a.fromState || undefined,
        toState: a.toState || undefined,
        detail: a.detail || undefined
      })).sort((a, b) => a.timestamp.localeCompare(b.timestamp)).reverse();

      if (from) list = list.filter(a => a.timestamp >= from);
      if (to) list = list.filter(a => a.timestamp <= to);

      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
      const total = list.length;
      const totalPages = Math.ceil(total / pageSize);
      const items = list.slice((page - 1) * pageSize, page * pageSize);

      return res.status(200).json({
        items,
        pagination: { page, pageSize, total, totalPages, hasMore: page < totalPages },
        meta: { fetchedAt: new Date().toISOString() }
      });
    } catch (error) {
      return res.status(500).json({ error: { code: "ACTIVITY_FETCH_FAILED", message: "Failed to fetch activity log." } });
    }
  });

  return router;
}
