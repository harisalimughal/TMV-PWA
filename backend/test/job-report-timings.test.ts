import { describe, expect, it } from "vitest";
import { jobReportTimings } from "../src/reports/job-report-timings";
import { EvidenceStatus, type EvidenceRecord, type Job } from "../src/jobs/job.types";
const job = { jobId: "ONE", actualStart: "2026-10-09T09:00:00Z", actualFinish: "2026-10-09T11:00:00Z", actualStartSource: "arrival-photo", actualFinishSource: "empty-van-photo",
  pickupArrivalAt: "2026-10-09T09:00:00Z", vanLoadedAt: "2026-10-09T09:20:00Z", trackerArrivalAt: "2026-10-09T08:58:00Z", clientSignatureAt: "2026-10-09T11:05:00Z" } as Job;
describe("Recorded job milestones", () => {
  it("prefers captured photo timestamps while preserving distinct GPS/signature records", () => {
    const photo = { evidenceId: "photo", jobId: "ONE", evidenceType: "Arrival", status: EvidenceStatus.COMPLETED, cloudinaryUrl: "synthetic", receivedAt: "2026-10-09T09:00:00Z", capturedAt: "2026-10-09T08:59:00Z" } as EvidenceRecord;
    const before = JSON.stringify(job);
    expect(jobReportTimings(job, [photo])).toMatchObject({ trackerArrivalAt: "2026-10-09T08:58:00.000Z", proofPhotoAt: "2026-10-09T08:59:00.000Z", proofPhotoSource: "captured", customerSignedAt: "2026-10-09T11:05:00.000Z" });
    expect(JSON.stringify(job)).toBe(before);
  });
  it("does not invent tracker, proof or empty-photo times from manual completion", () => {
    const result = jobReportTimings({ jobId: "ONE", actualStart: job.actualStart, actualFinish: job.actualFinish, actualStartSource: "completion-fallback", actualFinishSource: "admin-manual" } as Job);
    expect(result).toMatchObject({ trackerArrivalAt: null, proofPhotoAt: null, vanLoadedAt: null, emptyVanAt: null, customerSignedAt: null });
  });
  it("chooses the latest record deterministically and ignores failed photo metadata", () => {
    const rows = [{ evidenceId: "later", receivedAt: "2026-10-09T09:05:00Z", capturedAt: "2026-10-09T09:04:00Z", status: EvidenceStatus.FAILED },
      { evidenceId: "earlier", receivedAt: "2026-10-09T09:00:00Z", capturedAt: "2026-10-09T08:59:00Z", status: EvidenceStatus.COMPLETED }].map(row => ({ ...row, jobId: "ONE", evidenceType: "Arrival", cloudinaryUrl: "synthetic" })) as EvidenceRecord[];
    expect(jobReportTimings(job, rows)).toMatchObject({ proofPhotoAt: "2026-10-09T09:00:00.000Z", proofPhotoSource: "recorded" });
  });
});
