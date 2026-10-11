import type { Job } from "../../src/jobs/job.types";
import type { DriverJobSummaryDoc } from "../../src/db/driver-job-summary.repo";
import { buildReportJob, summarizeReportJobs, reportTrends } from "../../src/reports/driver-report.model";
import type { ExportReport } from "../../src/reports/driver-report-export.model";
import { buildLiabilityRecord, summarizeLiabilities } from "../../src/liabilities/liability.model";
import type { ScenarioSubmissionDoc } from "../../src/db/scenario.repo";

export function driverExportSample(count = 105): ExportReport {
  const jobs = Array.from({ length: count }, (_, i) => {
    const id = `SAMPLE-${String(i + 1).padStart(3, "0")}`;
    const job = { jobId: id, status: "COMPLETED", driverInitials: "DEMO", customerName: i === 0 ? "=HYPERLINK(\"https://invalid.example\")" : `Sample Customer ${i + 1}`,
      customerEmail: "synthetic@example.invalid", pickup: "London sample pickup", dropoff: "London sample dropoff",
      bookedStart: "2026-10-09T08:00:00Z", bookedFinish: "2026-10-09T09:30:00Z", actualStart: "2026-10-09T08:00:00Z", actualFinish: "2026-10-09T10:30:00Z",
      basePrice: 200, totalCharges: 255, calculatedTotalCharges: 255, amountCharged: 255, paymentMethod: "Cash", paymentStatus: "Paid", paymentBreakdown: [{ method: "Cash", amount: 255 }],
      timeBilling: { ruleVersion: "calendar-allocation-30min-v1", scheduledMinutes: 90, allocatedMinutes: 120, actualMinutes: 150, extraMinutes: 30, extraChargePence: 5500, ratePer30Pence: 5500, rateSource: "calendar", billedExtraBlocks: 1 },
      chargeSnapshot: { basePence: 20000, congestionPence: 0, tunnelPence: 0 }, reviewEmailSent: i % 2 === 0 } as Job;
    const manual = { jobId: id, driverInitials: "DEMO", driverEmail: "synthetic@example.invalid", startTime: job.actualStart, endTime: job.actualFinish,
      amountCollectedPence: i === 1 ? 25000 : 25500, paymentMethod: "Cash", paymentBreakdown: [{ method: "Cash", amountPence: i === 1 ? 25000 : 25500 }],
      helperName: i % 3 === 0 ? "Sample Helper" : "", helperHours: i % 3 === 0 ? 2 : 0, submittedAt: "2026-10-09T11:00:00Z", chargeItems: [] } as unknown as DriverJobSummaryDoc;
    return { ...buildReportJob(job, i === 2 ? null : manual), movement: { jobId: id, onJob: { coverage: "unavailable", movingSeconds: null }, approach: null }, roadCharges: undefined };
  });
  const liabilities = count ? [buildLiabilityRecord({ _id: "SOURCE-1", jobId: "SAMPLE-001", scenario: "liability", driver: "synthetic@example.invalid", fields: { damage_categories: "Long description retained: " + "Sample evidence details. ".repeat(150) },
    submittedAt: "2026-10-09T09:00:00Z", photoUrls: [], signatureUrl: "" } as unknown as ScenarioSubmissionDoc, { jobId: "SAMPLE-001", driverInitials: "DEMO" } as Job)!] : [];
  return { version: "driver-report-v1", generatedAt: "2026-10-10T08:00:00Z", driver: { initials: "DEMO", name: "Synthetic Driver", email: "synthetic@example.invalid", hasCurrentAccount: false },
    range: { from: "2026-10-08T23:00:00Z", to: "2026-10-09T23:00:00Z" }, groupBy: "day", dateBasis: { timezone: "Europe/London", endExclusive: true },
    summary: { ...summarizeReportJobs(jobs), movingKnownSeconds: 0, movingUnknownJobs: count, movingPartialJobs: 0 },
    trends: reportTrends(jobs, "day").map(row => ({ ...row, movingKnownSeconds: 0, movingUnknownJobs: count, movingPartialJobs: 0 })), jobs,
    events: count ? [{ _id: "EVENT-1", providerEventId: null, identity: "fingerprint", imei: "123", deviceName: "Synthetic Tracker", scheme: "congestion", zoneId: "synthetic-zone", zoneName: "Synthetic congestion zone", type: "entry", occurredAt: "2026-10-09T08:10:00Z", timeSource: "explicit-offset", sources: ["alerts-history"], raw: { secret: "must-not-export" }, association: { jobId: "SAMPLE-001", driverInitials: "DEMO" }, location: { lat: 51.5, lng: -0.1 } }] : [],
    visits: count ? [{ id: "VISIT-1", imei: "123", scheme: "congestion", entryAt: "2026-10-09T08:10:00Z", firstInsideAt: "2026-10-09T08:10:00Z", exitAt: "2026-10-09T08:25:00Z", durationSeconds: 900, eventIds: ["EVENT-1"], zoneNames: ["Synthetic congestion zone"], origin: "alerts", status: "observed-pair", physicalCrossingConfirmed: false, entryObserved: true, association: { jobId: "SAMPLE-001", driverInitials: "DEMO", confidence: "recorded-assignment", candidateJobIds: ["SAMPLE-001"], phase: "on-job", reason: null }, issues: [] }] : [],
    charges: count ? [{ id: "CHARGE-1", jobId: "SAMPLE-001", type: "congestion", scheme: "congestion", occurredAt: "2026-10-09T08:10:00Z", londonDate: "2026-10-09", expectedPence: null, authorityExpectedPence: null, authorityIssue: "Synthetic example: no verified authority tariff or historic customer-rate snapshot.", visitIds: ["VISIT-1"] }] : [],
    liabilities, liabilitySummary: summarizeLiabilities(liabilities), contextJobs: [],
    gpsSummary: { coverage: count ? "sampled" : "unavailable", providerCoverage: "unknown", truncated: false, congestionEntries: count ? 1 : 0, confirmedTunnelCrossings: count ? 0 : null, observedEventCount: count ? 1 : 0, observedChargeKnownPence: 0, unknownChargeAmounts: count ? 1 : 0, portalIssue: "Synthetic example; physical crossings are not verified." },
    meta: { financialTotalsCoverAllMatchingJobs: true, providerCompletenessKnown: false, readConsistency: "nontransactional" } } as unknown as ExportReport;
}
