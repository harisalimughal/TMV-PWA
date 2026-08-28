import { evidenceCollection } from "./mongo";
import { EvidenceProgress, EvidenceRecord, EvidenceStatus } from "../jobs/job.types";
import { getJob } from "./jobs.repo";

export async function insertEvidence(record: EvidenceRecord): Promise<void> {
  const col = await evidenceCollection();
  await col.insertOne({ _id: record.evidenceId, ...record } as any);
}

export async function updateEvidence(record: EvidenceRecord): Promise<void> {
  const col = await evidenceCollection();
  await col.replaceOne({ _id: record.evidenceId } as any, { _id: record.evidenceId, ...record } as any, { upsert: true });
}

export async function getEvidence(evidenceId: string): Promise<EvidenceRecord | null> {
  const col = await evidenceCollection();
  const doc = await col.findOne({ _id: evidenceId } as any);
  if (!doc) return null;
  const { _id, ...record } = doc as any;
  return record as EvidenceRecord;
}

export async function listEvidenceForJob(jobId: string): Promise<EvidenceRecord[]> {
  const col = await evidenceCollection();
  const docs = await col.find({ jobId }).toArray();
  return docs.map(({ _id, ...record }: any) => record as EvidenceRecord);
}

/** Same contract as google/sheets.ts's readEvidenceSummary -- counts per evidence type,
 * bucketed by status, plus whether a signature exists. workflow.engine.ts's
 * assertCompletionGate() is unchanged and reads this shape directly.
 *
 * Signatures aren't an EvidenceRecord (there's no "Signature" EvidenceType -- the
 * original Sheets design kept them in a separate Signatures tab entirely) -- they're
 * stored directly on the job doc (job.signatureUrl, set by submitDrawnSignature in
 * workflow.engine.ts), so hasSignature is read from there instead. */
export async function readEvidenceSummary(jobId: string): Promise<EvidenceProgress> {
  const [records, job] = await Promise.all([listEvidenceForJob(jobId), getJob(jobId)]);
  const completed: Record<string, number> = {};
  const pending: Record<string, number> = {};
  const failed: Record<string, number> = {};

  for (const record of records) {
    const bucket =
      record.status === EvidenceStatus.COMPLETED ? completed
      : record.status === EvidenceStatus.FAILED ? failed
      : pending;
    bucket[record.evidenceType] = (bucket[record.evidenceType] ?? 0) + 1;
  }

  return { completed, pending, failed, hasSignature: Boolean(job?.signatureUrl) };
}
