import { Request, Response, Router } from "express";
import multer from "multer";
import { env } from "../config/env";
import { requireDriverAuth } from "../auth/require-driver-auth";
import { getJobForDriver, getJobsGroupedForDriver, getNextJobForDriver, getTomorrowJobsForDriver, startJob } from "./jobs.service";
import { uploadEvidenceImage } from "../storage/cloudinary";
import { looksLikeImage } from "./evidence.service";
import {
  deleteEvidenceForDriver,
  EvidenceFailedError, EvidencePendingError, getConfirmationText, handleAction, handlePhotoStep,
  submitDrawnSignature, suggestedTotal
} from "../workflow/workflow.engine";
import { submitScenario } from "./scenario.service";
import { parsePhotoMeta } from "./photo-meta";
import { DAMAGE_CATEGORIES, SCENARIOS, ScenarioKey } from "../workflow/scenario.spec";
import { ValidationError } from "../workflow/validation.engine";
import { listActivityForJob } from "../db/activity.repo";
import { listEvidenceForJob, readEvidenceSummary } from "../db/evidence.repo";
import { EvidenceStatus } from "./job.types";
import { listScenarioSubmissionsForJob } from "../db/scenario.repo";
import { getSetting } from "../db/settings.repo";
import { reverseGeocode } from "../integrations/geocode";
import { log } from "../utils/logger";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxImageBytes, files: 2 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Only image uploads are accepted."));
      return;
    }
    cb(null, true);
  }
});

// Liability Report allows up to 8 photos, the widest of the 4 scenario forms, +1 for
// the signature.
const scenarioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxImageBytes, files: 9 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Only image uploads are accepted."));
      return;
    }
    cb(null, true);
  }
});

function parseLiabilityCategories(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const categories = parsed.map(item => String(item).trim()).filter(Boolean);
      if (categories.length > 0) return Array.from(new Set(categories));
    }
  } catch {
    // Fall through to newline parsing for hand-edited settings values.
  }
  const fromLines = raw.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
  return fromLines.length > 0 ? Array.from(new Set(fromLines)) : DAMAGE_CATEGORIES;
}

function errorResponse(res: Response, error: unknown): void {
  if (error instanceof ValidationError) {
    res.status(400).json({ error: { code: "VALIDATION_FAILED", message: error.message } });
    return;
  }
  if (error instanceof EvidencePendingError) {
    res.status(409).json({ error: { code: "EVIDENCE_PENDING", message: error.message, pending: error.pending } });
    return;
  }
  if (error instanceof EvidenceFailedError) {
    res.status(409).json({ error: { code: "EVIDENCE_FAILED", message: error.message, failedTypes: error.failedTypes } });
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  // Domain errors thrown as plain Error (e.g. "This job is assigned to another driver.",
  // "Driver is not registered...") -- not a validation shape, but still the driver's
  // problem, not a server bug, so 400 rather than 500.
  if (message && !message.toLowerCase().includes("mongo") && !message.toLowerCase().includes("cloudinary")) {
    res.status(400).json({ error: { code: "REQUEST_FAILED", message } });
    return;
  }
  log.error("jobs route failed", { error: message });
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } });
}

/** The driver-visible list of photos already uploaded for a job — id, which step it
 *  belongs to, its URL, and where/when it was taken — so the app can show them when a
 *  driver steps back to a photo step, and offer to delete any. COMPLETED only (a
 *  half-processed upload isn't something the driver can act on). */
async function evidenceItemsFor(jobId: string): Promise<
  Array<{
    evidenceId: string;
    evidenceType: string;
    url: string;
    capturedAt?: string;
    location?: { lat: number; lng: number; accuracy: number };
    locationName?: string;
  }>
> {
  const records = await listEvidenceForJob(jobId);
  return records
    .filter(r => r.status === EvidenceStatus.COMPLETED && r.cloudinaryUrl)
    .map(r => ({
      evidenceId: r.evidenceId,
      evidenceType: r.evidenceType,
      url: r.cloudinaryUrl,
      capturedAt: r.capturedAt,
      location: r.location,
      locationName: r.locationName
    }));
}

export function jobsRoutes(): Router {
  const router = Router();
  router.use(requireDriverAuth);

  // Today's active/next job for the signed-in driver. `sync` triggers a throttled,
  // single-flighted Calendar resync -- see jobs.service.ts's syncIfStale.
  router.get("/", async (req: Request, res: Response) => {
    try {
      const { job, driver } = await getNextJobForDriver(req.driverEmail!, { sync: true });
      res.status(200).json({ job, driver: { fullName: driver.fullName, initials: driver.initials } });
    } catch (error) {
      errorResponse(res, error);
    }
  });

  // Full job list for the "Your jobs" screen, bucketed into Today / Past / Next -- see
  // getJobsGroupedForDriver's own doc comment for the day-boundary rules. Distinct from
  // GET "/" above, which stays single-job (the active-workflow entry point).
  router.get("/list", async (req: Request, res: Response) => {
    try {
      const { driver, today, past, next } = await getJobsGroupedForDriver(req.driverEmail!);
      res.status(200).json({
        driver: { fullName: driver.fullName, initials: driver.initials },
        today, past, next
      });
    } catch (error) {
      errorResponse(res, error);
    }
  });

  // Live reverse-geocode preview -- called from the camera the moment a location fix
  // comes in (see components/camera/useLocationWatch.ts), well before the photo it'll
  // end up attached to is ever uploaded, so the driver sees a real place name in the
  // capture caption immediately instead of only after that photo's own upload
  // completes. Same reverseGeocode() the upload path already calls, and the result
  // this returns is what the client then sends back as photoMeta[].locationName on
  // that upload -- so the lookup only ever runs once per photo, not twice.
  router.get("/geocode/reverse", async (req: Request, res: Response) => {
    try {
      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new ValidationError("A valid lat and lng are required.");
      }
      const locationName = await reverseGeocode(lat, lng);
      res.status(200).json({ locationName });
    } catch (error) {
      errorResponse(res, error);
    }
  });

  router.get("/liability-categories", async (_req: Request, res: Response) => {
    try {
      const categories = parseLiabilityCategories(
        await getSetting("LIABILITY_DAMAGE_CATEGORIES", JSON.stringify(DAMAGE_CATEGORIES))
      );
      res.status(200).json({ categories });
    } catch (error) {
      errorResponse(res, error);
    }
  });

  router.get("/tomorrow", async (req: Request, res: Response) => {
    try {
      const { jobs, unassignedCount } = await getTomorrowJobsForDriver(req.driverEmail!);
      res.status(200).json({ jobs, unassignedCount });
    } catch (error) {
      errorResponse(res, error);
    }
  });

  router.get("/:jobId", async (req: Request, res: Response) => {
    try {
      const { job } = await getJobForDriver(String(req.params.jobId), req.driverEmail!);
      const [activity, evidence, evidenceItems, confirmationText] = await Promise.all([
        listActivityForJob(job.jobId),
        readEvidenceSummary(job.jobId),
        evidenceItemsFor(job.jobId),
        getConfirmationText()
      ]);
      res.status(200).json({
        job,
        activity,
        evidence,
        evidenceItems,
        suggestedTotal: await suggestedTotal(job),
        confirmationText
      });
    } catch (error) {
      errorResponse(res, error);
    }
  });

  router.post("/:jobId/start", async (req: Request, res: Response) => {
    try {
      const job = await startJob(String(req.params.jobId), req.driverEmail!);
      res.status(200).json({ job });
    } catch (error) {
      errorResponse(res, error);
    }
  });

  // Field name "photos" -- 1 photo for Arrival/EmptyVan, 1 or 2 for VanLoaded (see
  // handlePhotoStep's own check). Which evidence type this becomes is driven entirely
  // by the job's current workflow state, not a client-supplied field.
  router.post("/:jobId/evidence", upload.array("photos", 2), async (req: Request, res: Response) => {
    try {
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      const metas = parsePhotoMeta(req.body?.photoMeta);
      const photos = files.map((file, i) => ({
        buffer: file.buffer,
        contentType: file.mimetype,
        fileName: file.originalname || "photo.jpg",
        capturedAt: metas[i]?.capturedAt,
        location: metas[i]?.location,
        locationName: metas[i]?.locationName
      }));
      const job = await handlePhotoStep(String(req.params.jobId), req.driverEmail!, photos);
      res.status(200).json({ job, evidenceItems: await evidenceItemsFor(job.jobId) });
    } catch (error) {
      errorResponse(res, error);
    }
  });

  // Remove one already-uploaded evidence photo (driver tapped ✕ on it after stepping
  // back to that photo step). Deletes the record and its Cloudinary asset.
  router.delete("/:jobId/evidence/:evidenceId", async (req: Request, res: Response) => {
    try {
      const jobId = String(req.params.jobId);
      await deleteEvidenceForDriver(jobId, req.driverEmail!, String(req.params.evidenceId));
      res.status(200).json({ evidenceItems: await evidenceItemsFor(jobId) });
    } catch (error) {
      errorResponse(res, error);
    }
  });

  // The driver hands their phone to the customer to sign in-app; the drawn signature is
  // exported to a PNG client-side and posted here as a normal file upload.
  router.post("/:jobId/signature", upload.single("signature"), async (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file) throw new ValidationError("No signature image was received.");
      if (!looksLikeImage(file.buffer)) throw new ValidationError("The signature could not be read. Please try again.");

      const { job } = await getJobForDriver(String(req.params.jobId), req.driverEmail!);
      const uploaded = await uploadEvidenceImage(file.buffer, `tmv-pwa/${job.jobId}/Signature`, "signature");
      const customerName = String(req.body?.customerName ?? "");
      const updated = await submitDrawnSignature(String(req.params.jobId), req.driverEmail!, customerName, uploaded.url);
      res.status(200).json({ job: updated });
    } catch (error) {
      errorResponse(res, error);
    }
  });

  // Generic dispatcher for every non-photo workflow transition (FINISH_MOVE,
  // SUBMIT_EXTRA_CHARGES, SUBMIT_OVERTIME, SUBMIT_TOTAL_CHARGES, SUBMIT_PAYMENT,
  // ISSUES_NONE/YES, REVIEW_NONE/YES, SEND_REVIEW_EMAIL, GO_BACK, COMPLETE_JOB) -- see
  // workflow.engine.ts's handleAction for the full state machine.
  router.post("/:jobId/actions", async (req: Request, res: Response) => {
    try {
      const action = String(req.body?.action ?? "");
      const input = (req.body?.input ?? {}) as Record<string, string[]>;
      const job = await handleAction(action, String(req.params.jobId), req.driverEmail!, input);
      res.status(200).json({
        job,
        suggestedTotal: await suggestedTotal(job),
        evidenceItems: await evidenceItemsFor(job.jobId)
      });
    } catch (error) {
      errorResponse(res, error);
    }
  });

  // Past submissions for this job -- e.g. so the UI can show "already submitted"
  // instead of a driver assuming they still need to fill it in.
  router.get("/:jobId/scenarios", async (req: Request, res: Response) => {
    try {
      await getJobForDriver(String(req.params.jobId), req.driverEmail!); // 403s if not theirs
      const submissions = await listScenarioSubmissionsForJob(String(req.params.jobId));
      res.status(200).json({ submissions });
    } catch (error) {
      errorResponse(res, error);
    }
  });

  // One-shot form submission (Check In / Check Out / Parking Liability / Liability
  // Report) -- the whole form (fields + photos + signature) in a single request. See
  // scenario.service.ts's submitScenario for why this doesn't need the original
  // Chat-bot's multi-step progress tracking.
  router.post(
    "/:jobId/scenarios/:scenario",
    scenarioUpload.fields([{ name: "photos", maxCount: 8 }, { name: "signature", maxCount: 1 }]),
    async (req: Request, res: Response) => {
      try {
        const scenario = req.params.scenario as ScenarioKey;
        if (!SCENARIOS[scenario]) {
          res.status(404).json({ error: { code: "UNKNOWN_SCENARIO", message: "Unknown scenario." } });
          return;
        }
        const filesByField = (req.files as Record<string, Express.Multer.File[]> | undefined) ?? {};
        const photoMetas = parsePhotoMeta(req.body?.photoMeta);
        const photos = (filesByField.photos ?? []).map((file, i) => ({
          buffer: file.buffer,
          contentType: file.mimetype,
          capturedAt: photoMetas[i]?.capturedAt,
          location: photoMetas[i]?.location,
          locationName: photoMetas[i]?.locationName
        }));
        const signatureFile = filesByField.signature?.[0];
        if (!signatureFile) throw new ValidationError("A signature is required.");

        // Every non-file form field is a scenario field, keyed by its own name (see
        // workflow/scenario.spec.ts's field names) -- multer already parses these as
        // plain strings. "photoMeta" is capture metadata, not a scenario field --
        // parsed above, excluded here so it doesn't land in the submission's fields.
        const fields: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.body ?? {})) {
          if (key === "photoMeta") continue;
          fields[key] = String(value);
        }

        const { job, submission } = await submitScenario(
          scenario, String(req.params.jobId), req.driverEmail!, fields, photos,
          { buffer: signatureFile.buffer, contentType: signatureFile.mimetype }
        );
        res.status(200).json({ job, submission });
      } catch (error) {
        errorResponse(res, error);
      }
    }
  );

  return router;
}
