import { EvidenceStatus, type EvidenceRecord, type EvidenceType, type Job } from "../jobs/job.types";
import { recordedArrivalDistance, trackerArrivalReason } from "../jobs/pickup-arrival.rules";

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
  const lastSeen = instant(job.trackerLastSeenAt);
  const age = lastSeen ? Date.now() - Date.parse(lastSeen) : NaN;
  const trackerStatus = proof.at || job.pickupArrivalAt || job.actualStart ? undefined : !lastSeen ? "unverified" :
    !Number.isFinite(age) || age < 0 || age > 120000 ? "stale" : "reporting";
  const arrivalReason = trackerArrivalReason(job, trackerStatus);
  return { onMyWayAt: instant(job.onMyWayAt), trackerArrivalAt: instant(job.trackerArrivalAt), trackerArrivalDistanceMeters: recordedArrivalDistance(job.trackerArrivalDistanceMeters) ?? null,
    trackerUnverifiedReason: job.status === "COMPLETED" && arrivalReason === "Awaiting a second distinct fresh stationary tracker report."
      ? "A second qualifying GPS reading was not recorded; pickup arrival could not be confirmed." : arrivalReason ?? null,
    trackerDropoffArrivalAt: instant(job.dropoffTracking?.arrivalAt), trackerDropoffDepartureAt: instant(job.dropoffTracking?.departureAt),
    trackerDropoffUnverifiedReason: job.dropoffTracking?.unverifiedReason ?? (!job.dropoffLocation ? "Drop-off address has no verified coordinates." : !job.vanLoadedAt ? "Van-loaded time was not recorded." : null),
    proofPhotoAt: proof.at, vanLoadedAt: loaded.at, emptyVanAt: empty.at,
    customerSignedAt: instant(job.clientSignatureAt), proofPhotoSource: proof.source, vanLoadedSource: loaded.source, emptyVanSource: empty.source };
}
