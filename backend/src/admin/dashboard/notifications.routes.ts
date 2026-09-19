/** Ported from TMV-Chat-bot's dashboard/server/routes/notifications.route.ts. */
import { Router } from "express";
import { activityCollection, jobsCollection } from "../../db/mongo";
import { dismiss, listDismissedIds } from "../../db/dismissals.repo";
import { log } from "../../utils/logger";

const NOTIFY_ACTIONS = new Set([
  "CLIENT_REVIEW_EMAIL_SENT",
  "CLIENT_REVIEW_EMAIL_FAILED",
  "CLIENT_JOB_STARTED_SMS_SENT",
  "CLIENT_JOB_STARTED_SMS_FAILED",
  "CLIENT_JOB_STARTED_SMS_SKIPPED"
]);

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
 * Real ActivityLog-backed delivery status for customer notifications.
 */
export function dashboardNotificationsRoutes(): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    try {
      const [jobs, activity, dismissed] = await Promise.all([
        jobsCollection().then(c => c.find({ actualStart: { $ne: "" } }).toArray()),
        activityCollection().then(c => c.find({}).toArray()),
        listDismissedIds("notification")
      ]);

      const latestByJobAction = new Map<string, { detail?: string; timestamp: string }>();
      for (const row of activity) {
        if (!NOTIFY_ACTIONS.has(row.action)) continue;
        latestByJobAction.set(`${row.jobId}::${row.action}`, { detail: row.detail, timestamp: row.timestamp });
      }

      const rows = jobs
        .filter(job => !dismissed.has(job.jobId))
        .map(job => {
          const email = notifyStatus(
            Boolean(job.customerEmail),
            latestByJobAction.get(`${job.jobId}::CLIENT_REVIEW_EMAIL_SENT`),
            latestByJobAction.get(`${job.jobId}::CLIENT_REVIEW_EMAIL_FAILED`)
          );
          const smsSkipped = latestByJobAction.get(`${job.jobId}::CLIENT_JOB_STARTED_SMS_SKIPPED`);
          const sms = smsSkipped
            ? { state: "skipped" as const, detail: smsSkipped.detail || "", at: smsSkipped.timestamp || "" }
            : notifyStatus(
                Boolean(job.customerPhone),
                latestByJobAction.get(`${job.jobId}::CLIENT_JOB_STARTED_SMS_SENT`),
                latestByJobAction.get(`${job.jobId}::CLIENT_JOB_STARTED_SMS_FAILED`)
              );
          return {
            jobId: job.jobId, customerName: job.customerName || "", customerEmail: job.customerEmail || "",
            customerPhone: job.customerPhone || "", driverInitials: job.driverInitials || "",
            actualStart: job.actualStart || "", email, sms
          };
        })
        .sort((a, b) => (a.actualStart || "").localeCompare(b.actualStart || ""));

      res.status(200).json({ rows });
    } catch (error) {
      log.error("dashboard notifications load failed", error);
      res.status(500).json({ error: { code: "NOTIFICATIONS_FETCH_FAILED", message: "Failed to load notification status." } });
    }
  });

  router.post("/dismiss", async (req, res) => {
    const jobIds = Array.isArray(req.body?.jobIds) ? req.body.jobIds.filter((id: unknown) => typeof id === "string") : [];
    if (jobIds.length === 0) {
      return res.status(400).json({ error: { code: "NO_IDS", message: "No job ids given to dismiss." } });
    }
    try {
      await dismiss("notification", jobIds);
      res.status(200).json({ dismissed: jobIds.length });
    } catch (error) {
      log.error("dashboard notifications dismiss failed", error);
      res.status(500).json({ error: { code: "NOTIFICATIONS_DISMISS_FAILED", message: "Failed to remove the selected notifications." } });
    }
  });

  return router;
}
