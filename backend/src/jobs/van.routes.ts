import { Request, Response, Router } from "express";
import multer from "multer";
import { env } from "../config/env";
import { requireDriverAuth } from "../auth/require-driver-auth";
import { resolveDriver } from "./jobs.service";
import { looksLikeImage } from "./evidence.service";
import { uploadEvidenceImage } from "../storage/cloudinary";
import { insertVanRecord, VanRecordDoc, VanRecordType } from "../db/van.repo";
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

/** Shared by all three submission types: a photo is always required, and the upload
 *  folder/insert shape is otherwise identical -- only the type-specific fields differ. */
async function submitVanRecord(
  req: Request,
  res: Response,
  type: VanRecordType,
  photoLabel: string,
  buildFields: () => Partial<VanRecordDoc>
): Promise<void> {
  try {
    const file = req.file;
    if (!file) throw new ValidationError(`A ${photoLabel} is required.`);
    if (!looksLikeImage(file.buffer)) throw new ValidationError("The uploaded file is not a valid image.");

    const fields = buildFields();

    const driver = await resolveDriver(req.driverEmail!);
    const submittedAt = new Date().toISOString();
    const ref = `VAN-${Date.now().toString(36).toUpperCase()}`;
    const uploaded = await uploadEvidenceImage(file.buffer, `tmv-pwa/${ref}/Van${type}`, `${type.toLowerCase()}-${Date.now()}`);
    const record = await insertVanRecord({
      _id: ref,
      type,
      driverEmail: driver.email,
      driverName: driver.fullName,
      driverInitials: driver.initials,
      vanRegistration: driver.vanRegistration || "",
      photoUrl: uploaded.url,
      submittedAt,
      ...fields
    });

    res.status(200).json({ record });
  } catch (error) {
    errorResponse(res, error);
  }
}

export function vanRoutes(): Router {
  const router = Router();
  router.use(requireDriverAuth);

  router.post("/mileage", upload.single("photo"), (req, res) =>
    submitVanRecord(req, res, "MILEAGE", "mileage photo", () => {
      const rawMileage = String(req.body?.mileage ?? "").trim();
      if (!rawMileage) throw new ValidationError("Enter the mileage reading.");
      const mileage = Number(rawMileage);
      if (!Number.isFinite(mileage) || mileage < 0 || mileage > 2_000_000) {
        throw new ValidationError("Enter a valid mileage number.");
      }
      return { mileage };
    })
  );

  router.post("/fuel", upload.single("photo"), (req, res) =>
    submitVanRecord(req, res, "FUEL", "fuel receipt photo", () => {
      const rawCost = String(req.body?.fuelCost ?? "").trim();
      if (!rawCost) throw new ValidationError("Enter the fuel cost.");
      const fuelCost = Number(rawCost);
      if (!Number.isFinite(fuelCost) || fuelCost <= 0 || fuelCost > 10_000) {
        throw new ValidationError("Enter a valid fuel cost.");
      }
      return { fuelCost };
    })
  );

  router.post("/service", upload.single("photo"), (req, res) =>
    submitVanRecord(req, res, "SERVICE", "service invoice/receipt photo", () => {
      const serviceType = String(req.body?.serviceType ?? "").trim();
      const serviceDate = String(req.body?.serviceDate ?? "").trim();
      if (!serviceType) throw new ValidationError("Select the service type.");
      if (!serviceDate || Number.isNaN(Date.parse(serviceDate))) throw new ValidationError("Enter a valid service date.");
      return { serviceType, serviceDate };
    })
  );

  return router;
}
