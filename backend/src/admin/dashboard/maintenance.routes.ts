/**
 * "Factory Reset" -- a single admin action for wiping every app-generated record
 * (evidence photos, activity log, scenario submissions, van Mileage/Fuel/Service
 * records + compliance dates, exceptions, push subscriptions) so the app can be
 * handed to a new client starting from zero, without touching the three things that
 * aren't generated data: the `jobs` collection (synced from Google Calendar -- wiping
 * it here would just have it resync straight back, or worse, desync the booking
 * cursor), `driver_accounts` (the real roster), and `settings` (admin-configured
 * pricing/API keys, not usage data).
 *
 * Follows the exact same order jobs.routes.ts's deleteJobArtifacts() already
 * established for a single job: destroy every Cloudinary asset first (best-effort,
 * batched with Promise.all -- destroyEvidenceImage never throws, just logs), only then
 * delete the Mongo documents. Van records' Cloudinary photos follow van.routes.ts's
 * single-record delete route's same pattern, just looped over every record.
 */
import { Router, Request, Response } from "express";
import { listAllEvidence, deleteAllEvidence } from "../../db/evidence.repo";
import { deleteAllActivity } from "../../db/activity.repo";
import { listAllScenarioSubmissions, deleteAllScenarioSubmissions } from "../../db/scenario.repo";
import { listVanRecords, deleteAllVanRecords } from "../../db/van.repo";
import { deleteAllVanCompliance } from "../../db/van-compliance.repo";
import { deleteAllExceptions } from "../../db/exceptions.repo";
import { deleteAllPushSubscriptions } from "../../db/push.repo";
import { destroyEvidenceImage, publicIdFromCloudinaryUrl } from "../../storage/cloudinary";
import { invalidateDashboardDataset } from "./dataset-cache";
import { log } from "../../utils/logger";

const CONFIRM_PHRASE = "RESET";

export function dashboardMaintenanceRoutes(): Router {
  const router = Router();

  router.post("/factory-reset", async (req: Request, res: Response) => {
    try {
      const confirm = String(req.body?.confirm ?? "");
      if (confirm !== CONFIRM_PHRASE) {
        res.status(400).json({
          error: { code: "CONFIRMATION_REQUIRED", message: `Type "${CONFIRM_PHRASE}" to confirm this action.` }
        });
        return;
      }

      const [evidenceRecords, scenarioSubmissions, vanRecords] = await Promise.all([
        listAllEvidence(),
        listAllScenarioSubmissions(),
        listVanRecords()
      ]);

      const destroyTasks: Promise<void>[] = [];
      for (const record of evidenceRecords) {
        if (record.cloudinaryPublicId) destroyTasks.push(destroyEvidenceImage(record.cloudinaryPublicId));
      }
      for (const submission of scenarioSubmissions) {
        for (const url of submission.photoUrls) {
          const publicId = publicIdFromCloudinaryUrl(url);
          if (publicId) destroyTasks.push(destroyEvidenceImage(publicId));
        }
        const signaturePublicId = publicIdFromCloudinaryUrl(submission.signatureUrl);
        if (signaturePublicId) destroyTasks.push(destroyEvidenceImage(signaturePublicId));
      }
      for (const record of vanRecords) {
        const publicId = publicIdFromCloudinaryUrl(record.photoUrl);
        if (publicId) destroyTasks.push(destroyEvidenceImage(publicId));
      }
      await Promise.all(destroyTasks);

      const [
        evidenceDeleted, activityDeleted, scenariosDeleted,
        vanRecordsDeleted, vanComplianceDeleted, exceptionsDeleted, pushSubscriptionsDeleted
      ] = await Promise.all([
        deleteAllEvidence(),
        deleteAllActivity(),
        deleteAllScenarioSubmissions(),
        deleteAllVanRecords(),
        deleteAllVanCompliance(),
        deleteAllExceptions(),
        deleteAllPushSubscriptions()
      ]);

      invalidateDashboardDataset();

      const summary = {
        evidence: evidenceDeleted,
        activity: activityDeleted,
        scenarioSubmissions: scenariosDeleted,
        vanRecords: vanRecordsDeleted,
        vanCompliance: vanComplianceDeleted,
        exceptions: exceptionsDeleted,
        pushSubscriptions: pushSubscriptionsDeleted,
        cloudinaryAssetsDestroyed: destroyTasks.length
      };

      log.warn("admin factory reset performed", summary);
      res.status(200).json({ ok: true, deleted: summary });
    } catch (error) {
      log.error("factory reset failed", error);
      res.status(500).json({ error: { code: "FACTORY_RESET_FAILED", message: "Factory reset failed partway through -- check server logs before retrying." } });
    }
  });

  return router;
}
