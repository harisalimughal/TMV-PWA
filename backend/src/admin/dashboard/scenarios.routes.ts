/** Ported from TMV-Chat-bot's dashboard/server/routes/scenarios.route.ts. */
import { Router } from "express";
import { listAllScenarioSubmissions, listScenarioSubmissionsByKind, ScenarioSubmissionDoc } from "../../db/scenario.repo";
import { toThumbnailUrl } from "../../storage/cloudinary";
import { listDriverProfiles } from "../../auth/driver-account.service";

const VALID_KINDS = new Set(["checkin", "checkout", "parking", "liability"]);

/** A submission's `driver` field is whatever scenario.service.ts stamped it with at
 *  submit time -- `driver.email || driver.chatUserName`, so almost always an email,
 *  occasionally a raw chat username, and never the driver's initials or full name.
 *  The dashboard table used to show that raw email straight in the Driver column
 *  (the frontend's own name-guessing only recognised a handful of hardcoded first
 *  names and fell back to the raw string otherwise). Every row is now resolved once
 *  per request against the actual driver_accounts roster -- the same source of truth
 *  jobs.routes.ts's own driver filter uses -- to get both real initials and the
 *  driver's actual name. */
async function buildDriverResolver(): Promise<(raw: string) => { initials: string; name: string }> {
  const profiles = await listDriverProfiles();
  const byEmail = new Map(profiles.map(p => [p.email.toLowerCase(), p]));
  const byInitials = new Map(profiles.map(p => [p.initials, p]));
  return (raw: string) => {
    const value = (raw || "").trim();
    if (!value) return { initials: "", name: "" };
    const emailMatch = byEmail.get(value.toLowerCase());
    if (emailMatch) return { initials: emailMatch.initials, name: emailMatch.fullName };
    const initialsMatch = byInitials.get(value.toUpperCase());
    if (initialsMatch) return { initials: initialsMatch.initials, name: initialsMatch.fullName };
    return { initials: "", name: "" };
  };
}

function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return "";
  let str = String(val);
  if (/^[=+\-@]/.test(str)) str = `'${str}`;
  if (/[",\n\r]/.test(str)) str = `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function dashboardScenariosRoutes(): Router {
  const router = Router();

  router.get("/:kind/export.csv", async (req, res) => {
    try {
      const kind = String(req.params.kind || "").toLowerCase();
      if (!VALID_KINDS.has(kind)) {
        return res.status(404).json({ error: { code: "SCENARIO_NOT_FOUND", message: `Unknown scenario kind: ${kind}` } });
      }

      const all = await listAllScenarioSubmissions();
      const rows = all.filter(r => r.scenario === kind);

      const fieldNames = [...new Set(rows.flatMap(r => Object.keys(r.fields)))];
      const columns = [
        "Job ID", "Driver", "Submitted", ...fieldNames,
        "Photo URLs", "Photo Locations", "Signature URL", "Signature Captured At", "Signature Location"
      ];

      const csvContent = "﻿" + [
        columns.map(escapeCsvField).join(","),
        ...rows.map(r => [
          r.jobId, r.driver, r.submittedAt,
          ...fieldNames.map(f => r.fields[f] ?? ""),
          r.photoUrls.join(" | "),
          (r.photoMeta ?? [])
            .map(m => (m.location ? m.locationName || `${m.location.lat},${m.location.lng}` : m.capturedAt ? "no location" : ""))
            .filter(Boolean)
            .join(" | "),
          r.signatureUrl,
          r.signatureMeta?.capturedAt ?? "",
          r.signatureMeta?.location
            ? r.signatureMeta.locationName || `${r.signatureMeta.location.lat},${r.signatureMeta.location.lng}`
            : ""
        ].map(escapeCsvField).join(","))
      ].join("\r\n");

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="TMV-${kind}-${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.status(200).send(csvContent);
    } catch (error) {
      return res.status(500).json({ error: { code: "CSV_EXPORT_FAILED", message: "Failed to generate CSV export." } });
    }
  });

  router.get("/:kind", async (req, res) => {
    try {
      const kind = String(req.params.kind || "").toLowerCase() as ScenarioSubmissionDoc["scenario"];
      if (!VALID_KINDS.has(kind)) {
        return res.status(404).json({ error: { code: "SCENARIO_NOT_FOUND", message: `Unknown scenario kind: ${kind}` } });
      }

      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
      const driverFilter = typeof req.query.driver === "string" && req.query.driver
        ? req.query.driver.trim().toUpperCase()
        : undefined;
      const from = typeof req.query.from === "string" ? req.query.from : undefined;
      const to = typeof req.query.to === "string" ? req.query.to : undefined;

      // listScenarioSubmissionsByKind returns newest-first already; the source built
      // the "event N of M" labelling off an oldest-first pass, so pull everything for
      // that computation and paginate after -- scenario volume per kind is small
      // enough that this isn't a real cost.
      const { items: allForKind } = await listScenarioSubmissionsByKind(kind, 1, 1_000_000);
      const resolveDriver = await buildDriverResolver();
      let rows = [...allForKind].reverse(); // oldest first, matching the source
      if (driverFilter) {
        rows = rows.filter(r => resolveDriver(r.driver).initials === driverFilter);
      }
      if (from) rows = rows.filter(r => r.submittedAt >= from);
      if (to) rows = rows.filter(r => r.submittedAt <= to);

      const jobCounts = new Map<string, number>();
      for (const r of rows) jobCounts.set(r.jobId, (jobCounts.get(r.jobId) || 0) + 1);
      const jobRunningIndex = new Map<string, number>();

      const formattedRows = rows.map((r, index) => {
        const totalEventsForJob = jobCounts.get(r.jobId) || 1;
        const currentEventIdx = (jobRunningIndex.get(r.jobId) || 0) + 1;
        jobRunningIndex.set(r.jobId, currentEventIdx);
        const resolvedDriver = resolveDriver(r.driver);

        return {
          id: `${kind}-${index}`,
          jobId: r.jobId || "UNASSIGNED",
          eventLabel: totalEventsForJob > 1 ? `Event ${currentEventIdx} of ${totalEventsForJob}` : undefined,
          totalEventsForJob, eventIndex: currentEventIdx,
          timestamp: r.submittedAt, driver: r.driver || "—",
          driverInitials: resolvedDriver.initials || undefined,
          driverName: resolvedDriver.name || undefined,
          clientName: r.fields.client_name || "—", clientPhone: r.fields.client_phone || "",
          clientEmail: r.fields.client_email || "", containerNumber: r.fields.container_number || "—",
          address: r.fields.address || "", damageCategories: r.fields.damage_categories || "",
          clientPresent: r.fields.client_present || "—", rawRecord: r.fields,
          photos: r.photoUrls.map((url, i) => ({
            fileId: url,
            thumbUrl: toThumbnailUrl(url),
            capturedAt: r.photoMeta?.[i]?.capturedAt,
            location: r.photoMeta?.[i]?.location,
            locationName: r.photoMeta?.[i]?.locationName
          })),
          signature: r.signatureUrl
            ? {
                fileId: r.signatureUrl,
                thumbUrl: toThumbnailUrl(r.signatureUrl),
                capturedAt: r.signatureMeta?.capturedAt,
                location: r.signatureMeta?.location,
                locationName: r.signatureMeta?.locationName
              }
            : null
        };
      }); // earliest events first, matching every other dashboard list

      const total = formattedRows.length;
      const totalPages = Math.ceil(total / pageSize);
      const items = formattedRows.slice((page - 1) * pageSize, page * pageSize);

      return res.status(200).json({
        kind, items,
        pagination: { page, pageSize, total, totalPages, hasMore: page < totalPages },
        meta: { fetchedAt: new Date().toISOString() }
      });
    } catch (error) {
      return res.status(500).json({ error: { code: "SCENARIOS_FETCH_FAILED", message: "Failed to fetch scenario data." } });
    }
  });

  return router;
}
