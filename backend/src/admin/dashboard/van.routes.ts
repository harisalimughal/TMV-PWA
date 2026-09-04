import { Request, Response, Router } from "express";
import { listVanRecords, VanRecordType } from "../../db/van.repo";
import { toThumbnailUrl } from "../../storage/cloudinary";

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

  router.get("/drivers", async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
      const from = String(req.query.from || "");
      const to = String(req.query.to || "");
      const q = String(req.query.q || "").trim().toLowerCase();

      let rows = await listVanRecords();
      if (from) rows = rows.filter(r => r.submittedAt >= from);
      if (to) rows = rows.filter(r => r.submittedAt <= to);
      if (q) {
        rows = rows.filter(r =>
          [r._id, r.driverName, r.driverEmail, r.driverInitials, r.vanRegistration, r.mileage, r.odometerReading, r.fuelCost, r.serviceMileage, r.serviceType]
            .some(v => String(v ?? "").toLowerCase().includes(q))
        );
      }

      const grouped = new Map<string, VanDriverApiItem>();

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
          records: []
        };
        target.latestSubmittedAt = target.latestSubmittedAt > row.submittedAt ? target.latestSubmittedAt : row.submittedAt;
        target.vanRegistration = target.vanRegistration || row.vanRegistration;
        target.records.push(item);
        if (row.type === "MILEAGE" && (!target.latestMileage || row.submittedAt > target.latestMileage.submittedAt)) target.latestMileage = item;
        if (row.type === "FUEL" && (!target.latestFuel || row.submittedAt > target.latestFuel.submittedAt)) target.latestFuel = item;
        if (row.type === "SERVICE" && (!target.latestService || row.submittedAt > target.latestService.submittedAt)) target.latestService = item;
        grouped.set(key, target);
      }

      const allItems = Array.from(grouped.values())
        .map(item => ({ ...item, records: item.records.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)) }))
        .sort((a, b) => b.latestSubmittedAt.localeCompare(a.latestSubmittedAt));
      const total = allItems.length;
      const totalPages = Math.ceil(total / pageSize);
      const items = allItems.slice((page - 1) * pageSize, page * pageSize);

      res.status(200).json({
        items,
        pagination: { page, pageSize, total, totalPages, hasMore: page < totalPages },
        meta: { fetchedAt: new Date().toISOString() }
      });
    } catch {
      res.status(500).json({ error: { code: "VAN_FETCH_FAILED", message: "Failed to load van driver records." } });
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
      const q = String(req.query.q || "").trim().toLowerCase();
      const type = parseType(req.query.type);

      let rows = await listVanRecords();
      if (type) rows = rows.filter(r => r.type === type);
      if (from) rows = rows.filter(r => r.submittedAt >= from);
      if (to) rows = rows.filter(r => r.submittedAt <= to);
      if (q) {
        rows = rows.filter(r =>
          [r._id, r.driverName, r.driverEmail, r.driverInitials, r.vanRegistration, r.mileage, r.odometerReading, r.fuelCost, r.serviceMileage, r.serviceType]
            .some(v => String(v ?? "").toLowerCase().includes(q))
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
    } catch {
      res.status(500).json({ error: { code: "VAN_FETCH_FAILED", message: "Failed to load van records." } });
    }
  });

  return router;
}
