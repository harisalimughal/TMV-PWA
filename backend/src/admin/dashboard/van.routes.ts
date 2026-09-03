import { Router } from "express";
import { listVanMileageRecords } from "../../db/van.repo";
import { toThumbnailUrl } from "../../storage/cloudinary";

function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return "";
  let str = String(val);
  if (/^[=+\-@]/.test(str)) str = `'${str}`;
  if (/[",\n\r]/.test(str)) str = `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function dashboardVanRoutes(): Router {
  const router = Router();

  router.get("/mileage/export.csv", async (_req, res) => {
    try {
      const rows = await listVanMileageRecords();
      const columns = ["Reference", "Submitted", "Driver", "Initials", "Van Registration", "Mileage", "Photo URL"];
      const csvContent = "\uFEFF" + [
        columns.map(escapeCsvField).join(","),
        ...rows.map(r => [
          r._id, r.submittedAt, r.driverName || r.driverEmail, r.driverInitials,
          r.vanRegistration, r.mileage ?? "", r.photoUrl
        ].map(escapeCsvField).join(","))
      ].join("\r\n");

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="TMV-van-mileage-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.status(200).send(csvContent);
    } catch {
      res.status(500).json({ error: { code: "VAN_CSV_FAILED", message: "Failed to generate van mileage CSV." } });
    }
  });

  router.get("/mileage", async (req, res) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
      const from = String(req.query.from || "");
      const to = String(req.query.to || "");
      const q = String(req.query.q || "").trim().toLowerCase();

      let rows = await listVanMileageRecords();
      if (from) rows = rows.filter(r => r.submittedAt >= from);
      if (to) rows = rows.filter(r => r.submittedAt <= to);
      if (q) {
        rows = rows.filter(r =>
          [r._id, r.driverName, r.driverEmail, r.driverInitials, r.vanRegistration, r.mileage]
            .some(v => String(v ?? "").toLowerCase().includes(q))
        );
      }

      const total = rows.length;
      const totalPages = Math.ceil(total / pageSize);
      const items = rows.slice((page - 1) * pageSize, page * pageSize).map(r => ({
        id: r._id,
        submittedAt: r.submittedAt,
        driverName: r.driverName,
        driverEmail: r.driverEmail,
        driverInitials: r.driverInitials,
        vanRegistration: r.vanRegistration,
        mileage: r.mileage,
        photoUrl: r.photoUrl,
        thumbUrl: toThumbnailUrl(r.photoUrl)
      }));

      res.status(200).json({
        items,
        pagination: { page, pageSize, total, totalPages, hasMore: page < totalPages },
        meta: { fetchedAt: new Date().toISOString() }
      });
    } catch {
      res.status(500).json({ error: { code: "VAN_FETCH_FAILED", message: "Failed to load van mileage records." } });
    }
  });

  return router;
}
