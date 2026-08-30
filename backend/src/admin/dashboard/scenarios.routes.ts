/** Ported from TMV-Chat-bot's dashboard/server/routes/scenarios.route.ts. */
import { Router } from "express";
import { listAllScenarioSubmissions, listScenarioSubmissionsByKind, ScenarioSubmissionDoc } from "../../db/scenario.repo";

const VALID_KINDS = new Set(["checkin", "checkout", "parking", "liability"]);

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
      const columns = ["Job ID", "Driver", "Submitted", ...fieldNames, "Photo URLs", "Signature URL"];

      const csvContent = "﻿" + [
        columns.map(escapeCsvField).join(","),
        ...rows.map(r => [
          r.jobId, r.driver, r.submittedAt,
          ...fieldNames.map(f => r.fields[f] ?? ""),
          r.photoUrls.join(" | "), r.signatureUrl
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

      // listScenarioSubmissionsByKind returns newest-first already; the source built
      // the "event N of M" labelling off an oldest-first pass, so pull everything for
      // that computation and paginate after -- scenario volume per kind is small
      // enough that this isn't a real cost.
      const { items: allForKind } = await listScenarioSubmissionsByKind(kind, 1, 1_000_000);
      const rows = [...allForKind].reverse(); // oldest first, matching the source

      const jobCounts = new Map<string, number>();
      for (const r of rows) jobCounts.set(r.jobId, (jobCounts.get(r.jobId) || 0) + 1);
      const jobRunningIndex = new Map<string, number>();

      const formattedRows = rows.map((r, index) => {
        const totalEventsForJob = jobCounts.get(r.jobId) || 1;
        const currentEventIdx = (jobRunningIndex.get(r.jobId) || 0) + 1;
        jobRunningIndex.set(r.jobId, currentEventIdx);

        return {
          id: `${kind}-${index}`,
          jobId: r.jobId || "UNASSIGNED",
          eventLabel: totalEventsForJob > 1 ? `Event ${currentEventIdx} of ${totalEventsForJob}` : undefined,
          totalEventsForJob, eventIndex: currentEventIdx,
          timestamp: r.submittedAt, driver: r.driver || "—",
          clientName: r.fields.client_name || "—", clientPhone: r.fields.client_phone || "",
          clientEmail: r.fields.client_email || "", containerNumber: r.fields.container_number || "—",
          address: r.fields.address || "", damageCategories: r.fields.damage_categories || "",
          clientPresent: r.fields.client_present || "—", rawRecord: r.fields,
          photos: r.photoUrls.map(url => ({ fileId: url, thumbUrl: url })),
          signature: r.signatureUrl ? { fileId: r.signatureUrl, thumbUrl: r.signatureUrl } : null
        };
      }).reverse(); // latest events first

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
