import { Request, Response, Router } from "express";
import multer from "multer";
import { env } from "../config/env";
import { requireDriverAuth } from "../auth/require-driver-auth";
import { resolveDriver } from "./jobs.service";
import { looksLikeImage } from "./evidence.service";
import { uploadEvidenceImage } from "../storage/cloudinary";
import { insertVanMileageRecord } from "../db/van.repo";
import { ValidationError } from "../workflow/validation.engine";
import { log } from "../utils/logger";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxImageBytes, files: 1 },
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
  log.error("van route failed", { error: message });
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } });
}

export function vanRoutes(): Router {
  const router = Router();
  router.use(requireDriverAuth);

  router.post("/mileage", upload.single("photo"), async (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file) throw new ValidationError("A mileage photo is required.");
      if (!looksLikeImage(file.buffer)) throw new ValidationError("The uploaded file is not a valid image.");

      const rawMileage = String(req.body?.mileage ?? "").trim();
      const mileage = rawMileage ? Number(rawMileage) : undefined;
      if (rawMileage && (!Number.isFinite(mileage) || mileage! < 0 || mileage! > 2_000_000)) {
        throw new ValidationError("Enter a valid mileage number.");
      }

      const driver = await resolveDriver(req.driverEmail!);
      const submittedAt = new Date().toISOString();
      const ref = `VAN-${Date.now().toString(36).toUpperCase()}`;
      const uploaded = await uploadEvidenceImage(file.buffer, `tmv-pwa/${ref}/VanMileage`, `mileage-${Date.now()}`);
      const record = await insertVanMileageRecord({
        _id: ref,
        driverEmail: driver.email,
        driverName: driver.fullName,
        driverInitials: driver.initials,
        vanRegistration: driver.vanRegistration || "",
        mileage,
        photoUrl: uploaded.url,
        submittedAt
      });

      res.status(200).json({ record });
    } catch (error) {
      errorResponse(res, error);
    }
  });

  return router;
}
