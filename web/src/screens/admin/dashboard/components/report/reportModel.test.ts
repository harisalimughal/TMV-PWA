import { describe, expect, it } from "vitest";
import { sampleDriverReport, sampleJobs } from "../../fixtures/driverReport.sample";
import type { DriverReportJob } from "../../driverReport.types";
import { arrival, arrivalProofGap, reconcile, reportExceptions, summaryCoverage } from "./reportModel";

/** A submitted job whose system and driver values agree in every compared field. */
function agreeingJob(): DriverReportJob {
  const job = sampleJobs[2];
  return {
    ...job, roadAlerts: [], alertHistoryTruncated: false,
    duration: { ...job.duration, differenceMinutes: 0 },
    finance: { ...job.finance, paymentMethodDifferences: [] },
    manualDetails: { ...job.manualDetails!, startTime: job.actualStart!, endTime: job.actualFinish! }
  } as DriverReportJob;
}
const withDriverAmount = (job: DriverReportJob, collectedPence: number | null, invoicePence = 0): DriverReportJob => ({
  ...job, finance: { ...job.finance, manualPayments: { ...job.finance.manualPayments!, collectedPence, invoicePence } }
}) as DriverReportJob;

describe("reconcile", () => {
  const withHours = (job: DriverReportJob, working: number | null, manual: number | null): DriverReportJob =>
    ({ ...job, duration: { ...job.duration, workingMinutes: working, manualMinutes: manual } }) as DriverReportJob;

  it("treats a missing driver submission as missing, never as £0", () => {
    const result = reconcile(sampleJobs[7], true);
    expect(sampleJobs[7].manualDetails).toBeNull();
    expect(result.status).toBe("missing");
    expect(result.driverPence).toBeNull();
    expect(result.differencePence).toBeNull();
  });

  it("keeps a reported £0 as a real zero without raising a discrepancy by itself", () => {
    const job = agreeingJob();
    const result = reconcile(withHours(withDriverAmount(job, 0), 120, 120), true);
    expect(result.driverPence).toBe(0);
    expect(result.differencePence).toBe(job.finance.acceptedPence);
    expect(result.status).not.toBe("difference");
  });

  it("flags a discrepancy only when reported hours exceed working hours by 30 minutes or more", () => {
    expect(reconcile(withHours(agreeingJob(), 120, 149), true).status).not.toBe("difference");
    expect(reconcile(withHours(agreeingJob(), 120, 150), true).status).toBe("difference");
  });

  it("needs verification when either hours value is unknown", () => {
    expect(reconcile(withHours(agreeingJob(), null, 120), true).status).toBe("verify");
    expect(reconcile(withHours(agreeingJob(), 120, null), true).status).toBe("verify");
  });

  it("reports a pending invoice when hours agree", () => {
    const job = withHours(agreeingJob(), 120, 120);
    const invoiced = { ...job, finance: { ...job.finance, systemPayments: { ...job.finance.systemPayments, invoicePence: 5000 } } } as DriverReportJob;
    expect(reconcile(invoiced, true).status).toBe("invoice");
  });

  it("matches when hours agree and nothing is pending", () => {
    const job = withHours(agreeingJob(), 120, 120);
    const clean = { ...job, finance: { ...job.finance, systemPayments: { ...job.finance.systemPayments, invoicePence: 0 } } } as DriverReportJob;
    expect(reconcile(clean, true).status).toBe("match");
  });
});

describe("arrival", () => {
  it("is unverified without a tracker arrival, never on time", () => {
    const job = { ...sampleJobs[0], timings: { ...sampleJobs[0].timings!, trackerArrivalAt: null } } as DriverReportJob;
    expect(arrival(job).status).toBe("unverified");
    expect(arrival(job).minutes).toBeNull();
  });
  it("is late only for a positive verified delay", () => {
    expect(arrival({ ...sampleJobs[0], duration: { ...sampleJobs[0].duration, arrivalDelayMinutes: 0 } } as DriverReportJob).status).toBe("on-time");
    expect(arrival({ ...sampleJobs[0], duration: { ...sampleJobs[0].duration, arrivalDelayMinutes: 4 } } as DriverReportJob).status).toBe("late");
  });
  it("flags the arrival-to-proof gap only from 15 minutes", () => {
    const at = (minutes: number) => ({ ...sampleJobs[0], timings: { ...sampleJobs[0].timings!, trackerArrivalAt: "2026-10-05T09:00:00Z", proofPhotoAt: new Date(Date.parse("2026-10-05T09:00:00Z") + minutes * 60_000).toISOString() } }) as DriverReportJob;
    expect(arrivalProofGap(at(14))).toBeNull();
    expect(arrivalProofGap(at(15))).toBe(15);
  });
});

describe("summary helpers", () => {
  it("lists road events with no job as an exception to resolve", async () => {
    const report = await sampleDriverReport("DEMO", { from: "2026-10-05", to: "2026-10-11" });
    const linked = report.roadAlerts!.items[0];
    report.roadAlerts!.items = [{ ...linked, jobId: null }, { ...linked, id: `${linked.id}-b`, jobId: null }, linked] as NonNullable<typeof report.roadAlerts>["items"];
    expect(reportExceptions(report, true).find(item => item.id === "unlinked-road")?.title).toBe("2 road events need a job match");
  });
  it("reports coverage gaps instead of presenting partial totals as complete", async () => {
    const report = await sampleDriverReport("DEMO", { from: "2026-10-05", to: "2026-10-11" });
    report.summary = { ...report.summary, pendingManualJobs: 3, workingMinutesUnknownJobs: 0, unknownSystemCollectionJobs: 0, movingUnknownJobs: 0 };
    const coverage = summaryCoverage(report, { loading: false });
    expect(coverage.complete).toBe(false);
    expect(coverage.lines).toContain("3 driver submissions missing");
    expect(summaryCoverage(report, { loading: false, error: "down" }).lines).toContain("movement and road-charge details could not be loaded");
  });
});
