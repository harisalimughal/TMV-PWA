/** Ported from TMV-Chat-bot's dashboard/server/routes/notifications.route.ts. */
import { Router } from "express";
import { activityCollection, jobsCollection } from "../../db/mongo";
import { log } from "../../utils/logger";

const NOTIFY_ACTIONS = new Set(["CLIENT_REVIEW_EMAIL_SENT", "CLIENT_REVIEW_EMAIL_FAILED"]);

function notifyStatus(
  hasTarget: boolean,
  sentRow: { detail?: string; timestamp: string } | undefined,
  failedRow: { detail?: string; timestamp: string } | undefined
): { state: "sent" | "failed" | "pending" | "skipped" | "disabled"; detail: string; at: string } {
  if (!hasTarget) return { state: "skipped", detail: "", at: "" };
  if (sentRow) return { state: "sent", detail: sentRow.detail || "", at: sentRow.timestamp || "" };
  if (failedRow) return { state: "failed", detail: failedRow.detail || "", at: failedRow.timestamp || "" };
  return { state: "pending", detail: "", at: "" };
}

/**
 * Real ActivityLog-backed delivery status for the customer review-request email -- the
 * only customer notification tmv-pwa's workflow (workflow.engine.ts's
 * SEND_REVIEW_EMAIL) currently records an activity entry for. SMS was never wired in.
 */
export function dashboardNotificationsRoutes(): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    try {
      const [jobs, activity] = await Promise.all([
        jobsCollection().then(c => c.find({ actualStart: { $ne: "" } }).toArray()),
        activityCollection().then(c => c.find({}).toArray())
      ]);

      const latestByJobAction = new Map<string, { detail?: string; timestamp: string }>();
      for (const row of activity) {
        if (!NOTIFY_ACTIONS.has(row.action)) continue;
        latestByJobAction.set(`${row.jobId}::${row.action}`, { detail: row.detail, timestamp: row.timestamp });
      }

      const rows = jobs
        .map(job => {
          const email = notifyStatus(
            Boolean(job.customerEmail),
            latestByJobAction.get(`${job.jobId}::CLIENT_REVIEW_EMAIL_SENT`),
            latestByJobAction.get(`${job.jobId}::CLIENT_REVIEW_EMAIL_FAILED`)
          );
          return {
            jobId: job.jobId, customerName: job.customerName || "", customerEmail: job.customerEmail || "",
            customerPhone: job.customerPhone || "", driverInitials: job.driverInitials || "",
            actualStart: job.actualStart || "", email, sms: { state: "skipped" as const, detail: "", at: "" }
          };
        })
        .sort((a, b) => (b.actualStart || "").localeCompare(a.actualStart || ""));

      res.status(200).json({ rows });
    } catch (error) {
      log.error("dashboard notifications load failed", error);
      res.status(500).json({ error: { code: "NOTIFICATIONS_FETCH_FAILED", message: "Failed to load notification status." } });
    }
  });

  return router;
}
