import { env } from "../../config/env";
import { commitWrites, evidenceWrite, exceptionWrite, listStaleEvidence } from "../../google/sheets";
import { markFailed } from "../../jobs/evidence.service";
import { EvidenceStatus } from "../../jobs/job.types";
import { log } from "../../utils/logger";
import { enqueue } from "../queue.service";
import { ProcessJobImageTask } from "../queue.types";

export interface SweepResult {
  scanned: number;
  requeued: number;
  failed: number;
}

/**
 * SWEEP_STALE_EVIDENCE — the safety net that makes the whole design durable.
 *
 * Cloud Tasks gives *timely* retry. This gives the *eventual* guarantee: any evidence
 * still RECEIVED or PROCESSING beyond the staleness window is re-queued, whatever the
 * reason — a lost enqueue, a queue outage, a worker killed mid-upload by a Cloud Run
 * scale-down, an inline-driver task that died with the process.
 *
 * Because the Evidence row is written synchronously on the Chat request, no accepted
 * photo can be lost without this sweep noticing it. Run it from Cloud Scheduler every
 * few minutes.
 */
export async function handleSweepStaleEvidence(): Promise<SweepResult> {
  const stale = await listStaleEvidence(env.evidenceStaleMs);
  const result: SweepResult = { scanned: stale.length, requeued: 0, failed: 0 };
  if (!stale.length) return result;

  for (const record of stale) {
    // Attempts are counted on the record, so a stuck task cannot be re-driven forever.
    if (record.retryCount >= env.evidenceMaxAttempts) {
      const failed = markFailed(record, `Abandoned after ${record.retryCount} attempts (reaper).`);
      await commitWrites([
        evidenceWrite(failed),
        exceptionWrite({
          jobId: failed.jobId,
          type: "EVIDENCE_ABANDONED",
          detail: `${failed.evidenceType} ${failed.evidenceId}: ${failed.lastError}`
        })
      ]);
      result.failed++;
      continue;
    }

    // A PROCESSING record whose worker vanished is reset so the claim can be retaken.
    const reset =
      record.status === EvidenceStatus.PROCESSING
        ? { ...record, status: EvidenceStatus.RECEIVED, processingStartedAt: "" }
        : record;
    if (reset !== record) await commitWrites([evidenceWrite(reset)]);

    // Fresh dedupe id: the original task name is spent, so the default would collide
    // with the dead task and silently no-op.
    await enqueue(
      { type: "PROCESS_JOB_IMAGE", evidenceId: record.evidenceId, jobId: record.jobId } satisfies ProcessJobImageTask,
      { dedupeId: `image-${record.evidenceId}-r${record.retryCount + 1}` }
    );
    result.requeued++;
  }

  log.info("stale evidence sweep completed", { ...result });
  return result;
}
