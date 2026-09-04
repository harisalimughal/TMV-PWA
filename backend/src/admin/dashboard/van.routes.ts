import { Router } from "express";
import { listVanRecords, VanRecordType } from "../../db/van.repo";
import { toThumbnailUrl } from "../../storage/cloudinary";

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

export function dashboardVanRoutes(): Router {
  const router = Router();

  router.get("/records/export.csv", async (req, res) => {
    try {
      const type = parseType(req.query.type);
      let rows = await listVanRecords();
      if (type) rows = rows.filter(r => r.type === type);

      const columns = [
        "Type", "Reference", "Submitted", "Driver", "Initials", "Van Registration",
        "Mileage", "Fuel Cost", "Service Type", "Service Date", "Photo URL"
      ];
      const csvContent = "﻿" + [
        columns.map(escapeCsvField).join(","),
        ...rows.map(r => [
          r.type, r._id, r.submittedAt, r.driverName || r.driverEmail, r.driverInitials,
          r.vanRegistration, r.mileage ?? "", r.fuelCost ?? "", r.serviceType ?? "", r.serviceDate ?? "", r.photoUrl
        ].map(escapeCsvField).join(","))
      ].join("\r\n");

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="TMV-van-records-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.status(200).send(csvContent);
    } catch {
      res.status(500).json({ error: { code: "VAN_CSV_FAILED", message: "Failed to generate van records CSV." } });
    }
  });

  router.get("/records", async (req, res) => {
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
          [r._id, r.driverName, r.driverEmail, r.driverInitials, r.vanRegistration, r.mileage, r.fuelCost, r.serviceType]
            .some(v => String(v ?? "").toLowerCase().includes(q))
        );
      }

      const total = rows.length;
      const totalPages = Math.ceil(total / pageSize);
      const items = rows.slice((page - 1) * pageSize, page * pageSize).map(r => ({
        id: r._id,
        type: r.type,
        submittedAt: r.submittedAt,
        driverName: r.driverName,
        driverEmail: r.driverEmail,
        driverInitials: r.driverInitials,
        vanRegistration: r.vanRegistration,
        mileage: r.mileage,
        fuelCost: r.fuelCost,
        serviceType: r.serviceType,
        serviceDate: r.serviceDate,
        photoUrl: r.photoUrl,
        thumbUrl: toThumbnailUrl(r.photoUrl)
      }));

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
