import { getJob } from "../db/jobs.repo";
import { listLiabilitySourcesForJob } from "../db/scenario.repo";
import { buildLiabilityRecord, summarizeLiabilities } from "./liability.model";
import { persistLiability, readJobLiabilities } from "./liability.repo";

export async function jobLiabilityReport(jobId: string, reconcile = false) {
  const job = await getJob(jobId);
  if (!job) return null;
  const sources = await listLiabilitySourcesForJob(jobId);
  const rows = [...new Map(sources.items.map(source => buildLiabilityRecord(source, job)).filter((row): row is NonNullable<typeof row> => !!row).map(row => [row.id, row])).values()];
  const conflicts: string[] = [];
  if (reconcile) for (const row of rows) if (await persistLiability(row) === "source-conflict") conflicts.push(row.sourceRef);
  const saved = await readJobLiabilities(jobId);
  const byRef = new Map(saved.items.map(row => [row.sourceRef, row]));
  const items = rows.map(row => {
    const prior = byRef.get(row.sourceRef);
    if (!prior || prior.sourceHash === row.sourceHash) return row;
    conflicts.push(row.sourceRef);
    return { ...prior, issues: [...prior.issues, "Source changed after the audit snapshot. The saved amount/status/identity was not overwritten; review is required."] };
  });
  const currentRefs = new Set(rows.map(row => row.sourceRef));
  const missingSourceReferences = sources.truncated ? [] : saved.items.filter(row => !currentRefs.has(row.sourceRef)).map(row => row.sourceRef);
  const truncated = sources.truncated || saved.truncated;
  const totals = summarizeLiabilities(items);
  const totalsComplete = !truncated && !conflicts.length && !missingSourceReferences.length && !totals.duplicateFinancialSourceCount;
  if (!totalsComplete) totals.completeTotalPence = null;
  return { jobId, items, totals, coverage: truncated ? "partial" : "complete-for-linked-sources",
    truncated, totalsComplete, financialIntakeEnabled: false, adminEditingEnabled: false,
    reconciled: reconcile, sourceConflicts: [...new Set(conflicts)], missingSourceReferences, savedAuditRecords: saved.items.length };
}
