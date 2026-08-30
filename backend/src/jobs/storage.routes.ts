import { Request, Response, Router } from "express";
import multer from "multer";
import { env } from "../config/env";
import { requireDriverAuth } from "../auth/require-driver-auth";
import { submitStorageScenario } from "./scenario.service";
import { ValidationError } from "../workflow/validation.engine";
import { log } from "../utils/logger";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxImageBytes, files: 2 }, // 1 item photo + 1 signature
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
  const message = error instanceof Error ? error.message : String(error);
  if (message && !message.toLowerCase().includes("mongo") && !message.toLowerCase().includes("cloudinary")) {
    res.status(400).json({ error: { code: "REQUEST_FAILED", message } });
    return;
  }
  log.error("storage route failed", { error: message });
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } });
}

/**
 * Check In / Check Out -- standalone storage-job forms, unrelated to any specific move
 * job (see scenario.service.ts's submitStorageScenario doc comment). Separate from
 * jobsRoutes/"/api/jobs" on purpose: reaching these no longer goes through opening a
 * job at all, so they don't belong under a job-scoped route namespace either.
 */
export function storageRoutes(): Router {
  const router = Router();
  router.use(requireDriverAuth);

  router.post(
    "/:scenario",
    upload.fields([{ name: "photos", maxCount: 1 }, { name: "signature", maxCount: 1 }]),
    async (req: Request, res: Response) => {
      try {
        const scenario = String(req.params.scenario || "");
        if (scenario !== "checkin" && scenario !== "checkout") {
          res.status(404).json({ error: { code: "UNKNOWN_SCENARIO", message: "Unknown scenario." } });
          return;
        }

        const filesByField = (req.files as Record<string, Express.Multer.File[]> | undefined) ?? {};
        const photos = (filesByField.photos ?? []).map(file => ({ buffer: file.buffer, contentType: file.mimetype }));
        const signatureFile = filesByField.signature?.[0];
        if (!signatureFile) throw new ValidationError("A signature is required.");

        const fields: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.body ?? {})) {
          fields[key] = String(value);
        }

        const { submission } = await submitStorageScenario(
          scenario, req.driverEmail!, fields, photos,
          { buffer: signatureFile.buffer, contentType: signatureFile.mimetype }
        );
        res.status(200).json({ submission });
      } catch (error) {
        errorResponse(res, error);
      }
    }
  );

  return router;
}
