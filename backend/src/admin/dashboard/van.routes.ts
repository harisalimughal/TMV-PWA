import { Request, Response, Router } from "express";
import { DateTime } from "luxon";
import { listVanRecords, getVanRecord, deleteVanRecord, VanRecordType } from "../../db/van.repo";
import { listVanCompliance, saveVanCompliance } from "../../db/van-compliance.repo";
import { toVanComplianceItem, VanComplianceItem } from "../../jobs/van-mileage.service";
import { listDriverProfiles } from "../../auth/driver-account.service";
import { driverVisible } from "../driver-scope";
import { toThumbnailUrl, destroyEvidenceImage, publicIdFromCloudinaryUrl } from "../../storage/cloudinary";

const searchText = (value: unknown) => String(value ?? "").toLowerCase().replace(/\s+/g, "");
const instant = (value: string) => DateTime.fromISO(value, { zone: "utc" }).toMillis();
function filterVanRange<T extends { submittedAt: string }>(rows: T[], from: string, to: string): T[] {
  if (!from && !to) return rows;
  const boundary = (value: string, end: boolean) => {
    let date = DateTime.fromISO(value, { zone: "Europe/London" });
    if (/^\d{4}-\d{2}-\d{2}$/.test(value) && end) date = date.endOf("day");
    if (!date.isValid) throw new RangeError("Invalid Van date filter.");
    return date.toMillis();
  };
  const start = from ? boundary(from, false) : -Infinity;
  const end = to ? boundary(to, true) : Infinity;
  if (end < start) throw new RangeError("The Van end date must be on or after the start date.");
  return rows.filter(row => { const at = instant(row.submittedAt); return Number.isFinite(at) && at >= start && at <= end; });
}

type VanRecordApiItem = {
  id: string;
  type: VanRecordType;
  submittedAt: string;
  driverName: string;
  driverEmail: string;
  driverInitials: string;
  vanRegistration: string;
  mileage?: number | null;
  odometerReading?: number | null;
  fuelCost?: number | null;
  serviceMileage?: number | null;
  serviceType?: string;
  serviceDate?: string;
  photoUrl: string;
  thumbUrl: string;
};

type VanDriverApiItem = {
  id: string;
  driverName: string;
  driverEmail: string;
  driverInitials: string;
  vanRegistration: string;
  latestSubmittedAt: string;
  latestMileage: VanRecordApiItem | null;
  latestFuel: VanRecordApiItem | null;
  latestService: VanRecordApiItem | null;
  compliance: VanComplianceItem | null;
  records: VanRecordApiItem[];
};

function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return "";
  let str = String(val);
  if (/^[=+\-@]/.test(str)) str = `'${str}`;
  if (/[",\n\r]/.test(str)) str = `"${str.replace(/"/g, '""')}"`;
  return str;
}

const VALID_TYPES: VanRecordType[] = ["MILEAGE", "FUEL", "SERVICE"];

function parseType(raw: unknown): VanRecordType | undefined {
  const upper = String(raw || "").toUpperCase();
  return (VALID_TYPES as string[]).includes(upper) ? (upper as VanRecordType) : undefined;
}

function vanRecordItem(r: Awaited<ReturnType<typeof listVanRecords>>[number]): VanRecordApiItem {
  return {
    id: r._id || `${r.driverEmail || r.driverInitials || "van"}-${r.type}-${r.submittedAt}`,
    type: r.type,
    submittedAt: r.submittedAt,
    driverName: r.driverName,
    driverEmail: r.driverEmail,
    driverInitials: r.driverInitials,
    vanRegistration: r.vanRegistration,
    mileage: r.mileage,
    odometerReading: r.odometerReading,
    fuelCost: r.fuelCost,
    serviceMileage: r.serviceMileage,
    serviceType: r.serviceType,
    serviceDate: r.serviceDate,
    photoUrl: r.photoUrl,
    thumbUrl: toThumbnailUrl(r.photoUrl)
  };
}

export function dashboardVanRoutes(): Router {
  const router = Router();

  // Deletes one Mileage/Fuel/Service submission -- purely our own storage (Mongo +
  // Cloudinary), no Calendar involvement, so it's a plain confirm-and-delete like the
  // evidence-photo delete on jobs.routes.ts.
  router.delete("/records/:id", async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id || "").trim();
      const record = await getVanRecord(id);
      if (!record) {
        res.status(404).json({ error: { code: "VAN_RECORD_NOT_FOUND", message: "Van record not found." } });
        return;
      }
      const publicId = publicIdFromCloudinaryUrl(record.photoUrl);
      if (publicId) await destroyEvidenceImage(publicId);
      await deleteVanRecord(id);
      res.status(200).json({ ok: true });
    } catch {
      res.status(500).json({ error: { code: "VAN_RECORD_DELETE_FAILED", message: "Failed to delete van record." } });
    }
  });

  router.post("/compliance/:vanRegistration", async (req: Request, res: Response) => {
    try {
      const vanRegistration = String(req.params.vanRegistration || "");
      const rawInterval = String(req.body?.serviceIntervalMiles ?? "").trim();
      const rawOverride = String(req.body?.lastServiceMileageOverride ?? "").trim();
      const serviceIntervalMiles = rawInterval ? Number(rawInterval) : null;
      const lastServiceMileageOverride = rawOverride ? Number(rawOverride) : null;
      if (serviceIntervalMiles !== null && (!Number.isFinite(serviceIntervalMiles) || serviceIntervalMiles <= 0)) {
        res.status(400).json({ error: { code: "VALIDATION_FAILED", message: "Enter a valid service interval." } });
        return;
      }
      if (lastServiceMileageOverride !== null && (!Number.isFinite(lastServiceMileageOverride) || lastServiceMileageOverride < 0)) {
        res.status(400).json({ error: { code: "VALIDATION_FAILED", message: "Enter a valid last service mileage." } });
        return;
      }
      const doc = await saveVanCompliance(vanRegistration, {
        roadTaxRenewalDate: String(req.body?.roadTaxRenewalDate || ""),
        motExpiryDate: String(req.body?.motExpiryDate || ""),
        insuranceExpiryDate: String(req.body?.insuranceExpiryDate || ""),
        notes: String(req.body?.notes || ""),
        serviceIntervalMiles,
        lastServiceMileageOverride
      });
      const records = await listVanRecords();
      res.status(200).json({ compliance: toVanComplianceItem(vanRegistration, doc, records) });
    } catch {
      res.status(500).json({ error: { code: "VAN_COMPLIANCE_SAVE_FAILED", message: "Failed to save van compliance." } });
    }
  });

  router.get("/drivers", async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
      const from = String(req.query.from || "");
      const to = String(req.query.to || "");
      const q = searchText(req.query.q);

      const [allRows, drivers, complianceRows] = await Promise.all([
        listVanRecords(),
        listDriverProfiles(),
        listVanCompliance()
      ]);
      const complianceDocByVan = new Map(complianceRows.map(row => [row.vanRegistration.toUpperCase(), row]));
      // Memoized per van registration -- computeVanMileageStatus scans every record,
      // and several drivers/rows can share the same van.
      const complianceItemCache = new Map<string, VanComplianceItem>();
      const complianceItemForVan = (vanRegistration: string): VanComplianceItem | null => {
        if (!vanRegistration) return null;
        const key = vanRegistration.toUpperCase();
        const cached = complianceItemCache.get(key);
        if (cached) return cached;
        const item = toVanComplianceItem(vanRegistration, complianceDocByVan.get(key) ?? null, allRows);
        complianceItemCache.set(key, item);
        return item;
      };

      let rows = filterVanRange(allRows, from, to);
      if (q) {
        rows = rows.filter(r =>
          [r._id, r.driverName, r.driverEmail, r.driverInitials, r.vanRegistration, r.mileage, r.odometerReading, r.fuelCost, r.serviceMileage, r.serviceType]
            .some(v => searchText(v).includes(q))
        );
      }

      const grouped = new Map<string, VanDriverApiItem>();

      for (const driver of drivers) {
        if (!driverVisible(driver.initials)) continue;
        const key = driver.email || driver.initials || driver.fullName;
        if (!key) continue;
        const vanRegistration = driver.vanRegistration || "";
        grouped.set(key, {
          id: key,
          driverName: driver.fullName,
          driverEmail: driver.email,
          driverInitials: driver.initials,
          vanRegistration,
          latestSubmittedAt: "",
          latestMileage: null,
          latestFuel: null,
          latestService: null,
          compliance: complianceItemForVan(vanRegistration),
          records: []
        });
      }

      for (const row of rows) {
        const item = vanRecordItem(row);
        const key = row.driverEmail || row.driverInitials || row.driverName || row._id || item.id;
        const existing = grouped.get(key);
        const target: VanDriverApiItem = existing ?? {
          id: key,
          driverName: row.driverName,
          driverEmail: row.driverEmail,
          driverInitials: row.driverInitials,
          vanRegistration: row.vanRegistration,
          latestSubmittedAt: row.submittedAt,
          latestMileage: null,
          latestFuel: null,
          latestService: null,
          compliance: complianceItemForVan(row.vanRegistration),
          records: []
        };
        target.latestSubmittedAt = instant(target.latestSubmittedAt) > instant(row.submittedAt) ? target.latestSubmittedAt : row.submittedAt;
        target.vanRegistration = target.vanRegistration || row.vanRegistration;
        target.records.push(item);
        if (row.type === "MILEAGE" && (!target.latestMileage || instant(row.submittedAt) > instant(target.latestMileage.submittedAt))) target.latestMileage = item;
        if (row.type === "FUEL" && (!target.latestFuel || instant(row.submittedAt) > instant(target.latestFuel.submittedAt))) target.latestFuel = item;
        if (row.type === "SERVICE" && (!target.latestService || instant(row.submittedAt) > instant(target.latestService.submittedAt))) target.latestService = item;
        grouped.set(key, target);
      }

      const allItems = Array.from(grouped.values())
        .filter(item => !q || item.records.length > 0 || [item.driverName, item.driverEmail, item.driverInitials, item.vanRegistration].some(value => searchText(value).includes(q)))
        .map(item => ({ ...item, records: item.records.sort((a, b) => instant(a.submittedAt) - instant(b.submittedAt)) }))
        .sort((a, b) => {
          if (a.latestSubmittedAt || b.latestSubmittedAt) return (instant(a.latestSubmittedAt) || 0) - (instant(b.latestSubmittedAt) || 0);
          return (a.driverName || a.driverEmail).localeCompare(b.driverName || b.driverEmail);
        });
      const total = allItems.length;
      const totalPages = Math.ceil(total / pageSize);
      const items = allItems.slice((page - 1) * pageSize, page * pageSize);

      res.status(200).json({
        items,
        pagination: { page, pageSize, total, totalPages, hasMore: page < totalPages },
        meta: { fetchedAt: new Date().toISOString() }
      });
    } catch (error) {
      res.status(error instanceof RangeError ? 400 : 500).json({ error: { code: "VAN_FETCH_FAILED", message: error instanceof RangeError ? error.message : "Failed to load van driver records." } });
    }
  });

  router.get(["/records/export.csv", "/mileage/export.csv"], async (req, res) => {
    try {
      const type = parseType(req.query.type);
      let rows = await listVanRecords();
      if (type) rows = rows.filter(r => r.type === type);

      const columns = [
        "Type", "Reference", "Submitted", "Driver", "Initials", "Van Registration",
        "Mileage", "Odometer Reading", "Fuel Cost", "Service Mileage", "Service Type", "Service Date", "Photo URL"
      ];
      const csvContent = "﻿" + [
        columns.map(escapeCsvField).join(","),
        ...rows.map(r => [
          r.type, r._id, r.submittedAt, r.driverName || r.driverEmail, r.driverInitials,
          r.vanRegistration, r.mileage ?? "", r.odometerReading ?? "", r.fuelCost ?? "", r.serviceMileage ?? "", r.serviceType ?? "", r.serviceDate ?? "", r.photoUrl
        ].map(escapeCsvField).join(","))
      ].join("\r\n");

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="TMV-van-records-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.status(200).send(csvContent);
    } catch {
      res.status(500).json({ error: { code: "VAN_CSV_FAILED", message: "Failed to generate van records CSV." } });
    }
  });

  router.get(["/records", "/mileage"], async (req, res) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
      const from = String(req.query.from || "");
      const to = String(req.query.to || "");
      const q = searchText(req.query.q);
      const type = parseType(req.query.type);

      let rows = await listVanRecords();
      if (type) rows = rows.filter(r => r.type === type);
      rows = filterVanRange(rows, from, to);
      if (q) {
        rows = rows.filter(r =>
          [r._id, r.driverName, r.driverEmail, r.driverInitials, r.vanRegistration, r.mileage, r.odometerReading, r.fuelCost, r.serviceMileage, r.serviceType]
            .some(v => searchText(v).includes(q))
        );
      }

      const total = rows.length;
      const totalPages = Math.ceil(total / pageSize);
      const items = rows.slice((page - 1) * pageSize, page * pageSize).map(vanRecordItem);

      res.status(200).json({
        items,
        pagination: { page, pageSize, total, totalPages, hasMore: page < totalPages },
        meta: { fetchedAt: new Date().toISOString() }
      });
    } catch (error) {
      res.status(error instanceof RangeError ? 400 : 500).json({ error: { code: "VAN_FETCH_FAILED", message: error instanceof RangeError ? error.message : "Failed to load van records." } });
    }
  });

  return router;
}
