import { getJob } from "../db/jobs.repo";
import { getDriverJobSummary } from "../db/driver-job-summary.repo";
import { gpsJobMonitoring } from "./gps.monitoring";
import { assessRoadCharges } from "./road-charge.rules";
import { readRoadAllocations, reserveRoadObligation, saveAuthorityReferences, roadAllocationConflict } from "./road-charge.repo";

export async function jobRoadChargeReport(jobId: string, persist = false) {
  const job = await getJob(jobId);
  if (!job) return null;
  const monitoring = await gpsJobMonitoring(jobId);
  const input = { job, visits: monitoring && "visits" in monitoring ? monitoring.visits ?? [] : [],
    coverage: monitoring?.coverage ?? "unavailable", manual: await getDriverJobSummary(jobId) };
  const initial = assessRoadCharges(input);
  const conflicts = [];
  for (const row of initial.obligations) {
    const conflict = persist ? await reserveRoadObligation(row) : await roadAllocationConflict(row);
    if (conflict) conflicts.push(conflict);
  }
  const assessment = assessRoadCharges({ ...input, allocationConflicts: conflicts });
  if (persist) await saveAuthorityReferences(assessment.authorityReferences);
  const allocations = await readRoadAllocations(jobId);
  const currentIds = new Set(assessment.obligations.map(row => row.id));
  for (const row of allocations) if (!currentIds.has(row.id)) assessment.flags.push({ code: "Needs verification", type: row.type, source: "allocation",
    reason: "Saved allocation is not reproduced by current GPS evidence. It is retained for audit and excluded from current expected totals.", evidenceIds: row.visitIds });
  return { ...assessment, allocations, persisted: persist, monitoringCoverage: monitoring?.coverage ?? "unavailable" };
}
