import { EvidenceStatus, type EvidenceRecord, type EvidenceType, type Job } from "../jobs/job.types";

const instant = (value: string | null | undefined) => value && /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
/** Display milestones only; photo metadata never replaces accepted billing boundaries. */
export function jobReportTimings(job: Job, records: EvidenceRecord[] = []) {
  const photo = (type: EvidenceType, fallback?: string) => {
    const latest = records.filter(row => row.jobId === job.jobId && row.evidenceType === type)
      .sort((a, b) => (Date.parse(a.receivedAt) || 0) - (Date.parse(b.receivedAt) || 0) || String(a.evidenceId ?? "").localeCompare(String(b.evidenceId ?? ""))).at(-1);
    const completed = latest?.status === EvidenceStatus.COMPLETED && latest.cloudinaryUrl ? latest : null;
    const captured = instant(completed?.capturedAt);
    const recorded = instant(fallback) || instant(completed?.processingCompletedAt) || instant(completed?.receivedAt);
    return { at: captured || recorded, source: captured ? "captured" : recorded ? "recorded" : null };
  };
  const proof = photo("Arrival", job.pickupArrivalAt || (job.actualStartSource === "arrival-photo" ? job.actualStart : undefined));
  const loaded = photo("VanLoaded", job.vanLoadedAt);
  const empty = photo("EmptyVan", job.actualFinishSource === "empty-van-photo" ? job.actualFinish : undefined);
  return { trackerArrivalAt: instant(job.trackerArrivalAt), proofPhotoAt: proof.at, vanLoadedAt: loaded.at, emptyVanAt: empty.at,
    customerSignedAt: instant(job.clientSignatureAt), proofPhotoSource: proof.source, vanLoadedSource: loaded.source, emptyVanSource: empty.source };
}
