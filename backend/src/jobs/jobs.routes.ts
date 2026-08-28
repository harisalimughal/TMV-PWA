import { Request, Response, Router } from "express";
import multer from "multer";
import { env } from "../config/env";
import { requireDriverAuth } from "../auth/require-driver-auth";
import { getJobForDriver, getNextJobForDriver, getTomorrowJobsForDriver, startJob } from "./jobs.service";
import { uploadEvidenceImage } from "../storage/cloudinary";
import { looksLikeImage } from "./evidence.service";
import {
  EvidenceFailedError, EvidencePendingError, handleAction, handlePhotoStep, submitDrawnSignature, suggestedTotal
} from "../workflow/workflow.engine";
import { ValidationError } from "../workflow/validation.engine";
import { listActivityForJob } from "../db/activity.repo";
import { readEvidenceSummary } from "../db/evidence.repo";
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
      const [activity, evidence] = await Promise.all([
        listActivityForJob(job.jobId),
        readEvidenceSummary(job.jobId)
      ]);
      res.status(200).json({ job, activity, evidence, suggestedTotal: suggestedTotal(job) });
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
      const photos = files.map(file => ({
        buffer: file.buffer,
        contentType: file.mimetype,
        fileName: file.originalname || "photo.jpg"
      }));
      const job = await handlePhotoStep(String(req.params.jobId), req.driverEmail!, photos);
      res.status(200).json({ job });
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
      res.status(200).json({ job });
    } catch (error) {
      errorResponse(res, error);
    }
  });

  return router;
}
