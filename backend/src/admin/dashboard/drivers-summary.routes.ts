/**
 * Rebuilt, not ported: the source (dashboard/server/routes/drivers.route.ts's
 * GET /summary) was fully Sheets-based (readDataset/normalizeDataset). Same response
 * shape DriversPage.tsx expects, computed from tmv-pwa's own Mongo data instead --
 * driver_accounts for the roster, jobs/evidence/activity (via normalizeMongoDataset)
 * for the per-driver stats.
 */
import { Router } from "express";
import { formatGBP, pence, toPounds } from "../../utils/money";
import { listDriverProfiles } from "../../auth/driver-account.service";
import { getDashboardDataset } from "./dataset-cache";
import { listJobsInRange } from "../../db/jobs.repo";
import { listEvidenceForJobs } from "../../db/evidence.repo";
import { listDriverJobSummariesForJobs } from "../../db/driver-job-summary.repo";
import { normalizeMongoDataset } from "./normalize";
import { DriverProfile, Job } from "../../jobs/job.types";
import { loadDriverMovement } from "./driver-summary-movement";
import { createReportReadCache } from "../../reports/report-read-cache";
import type { DriverMovingSummary } from "./driver-summary-movement";
import { NormalizedJob } from "./types";
import { normalizedPayments } from "../../reports/report-payments";

interface DriverStat {
  initials: string;
  fullName: string;
  email?: string;
  phone?: string;
  vanRegistration?: string;
  imei?: string;
  active: boolean;
  /** True only when a real driver_accounts document backs this entry. False for a
   *  code that only shows up on a job's driverInitials (e.g. typed straight into a
   *  Calendar title) with nobody ever added via Add Driver -- there's no account to
   *  edit/deactivate/delete, and it shouldn't be offered as a reassignment target. */
  hasAccount: boolean;
  assignedCount: number;
  completedCount: number;
  cancelledCount: number;
  totalDurationMinutes: number;
  durationJobsCount: number;
  totalDelayMinutes: number;
  delayJobsCount: number;
  totalChargesPence: number;
  calculatedChargesPence: number;
  revenuePence: number;
  cashCollectedPence: number;
  cardCollectedPence: number;
  linkCollectedPence: number;
  bankCollectedPence: number;
  invoiceCollectedPence: number;
  unknownCollectionJobs: number;
  congestionUnknownJobs: number;
  tunnelUnknownJobs: number;
  congestionChargePence: number;
  tunnelChargePence: number;
  overtimeMinutes: number;
  missingEvidenceCount: number;
  overtimeCount: number;
  reviewSentCount: number;
  reviewNotSentCount: number;
}

export function summarizeDrivers(drivers: DriverProfile[], jobs: NormalizedJob[]) {
  const driverStats = new Map<string, DriverStat>();

  // Seed from the roster so an inactive/unassigned driver still shows up with zeroes.
  for (const d of drivers) {
    if (!d.initials) continue;
    driverStats.set(d.initials, {
      initials: d.initials, fullName: d.fullName, email: d.email || undefined,
      phone: d.phone || undefined, vanRegistration: d.vanRegistration || undefined,
      imei: d.imei || undefined, active: d.active,
      hasAccount: true,
      assignedCount: 0, completedCount: 0, cancelledCount: 0,
      totalDurationMinutes: 0, durationJobsCount: 0, totalDelayMinutes: 0, delayJobsCount: 0,
      totalChargesPence: 0, calculatedChargesPence: 0, revenuePence: 0, cashCollectedPence: 0, cardCollectedPence: 0, bankCollectedPence: 0,
      invoiceCollectedPence: 0, linkCollectedPence: 0, unknownCollectionJobs: 0, congestionUnknownJobs: 0, tunnelUnknownJobs: 0, congestionChargePence: 0, tunnelChargePence: 0, overtimeMinutes: 0,
      missingEvidenceCount: 0, overtimeCount: 0, reviewSentCount: 0, reviewNotSentCount: 0
    });
  }

  for (const j of jobs) {
    const init = j.driverInitials || "UNASSIGNED";
    let stat = driverStats.get(init);
    if (!stat) {
      stat = {
        initials: init, fullName: j.driverName || init, email: j.driverEmail, active: true,
        hasAccount: false,
        assignedCount: 0, completedCount: 0, cancelledCount: 0,
        totalDurationMinutes: 0, durationJobsCount: 0, totalDelayMinutes: 0, delayJobsCount: 0,
        totalChargesPence: 0, calculatedChargesPence: 0, revenuePence: 0, cashCollectedPence: 0, cardCollectedPence: 0, bankCollectedPence: 0,
        invoiceCollectedPence: 0, linkCollectedPence: 0, unknownCollectionJobs: 0, congestionUnknownJobs: 0, tunnelUnknownJobs: 0, congestionChargePence: 0, tunnelChargePence: 0, overtimeMinutes: 0,
        missingEvidenceCount: 0, overtimeCount: 0, reviewSentCount: 0, reviewNotSentCount: 0
      };
      driverStats.set(init, stat);
    }

    stat.assignedCount++;
    if (j.status === "COMPLETED") {
      stat.completedCount++;
      if (j.reviewEmailSent === true) stat.reviewSentCount++;
      else stat.reviewNotSentCount++;
      stat.totalChargesPence += j.totalCharges ?? j.calculatedTotalCharges ?? 0;
      // Preserve the original calculation separately from documented price adjustments.
      stat.calculatedChargesPence += j.calculatedTotalCharges ?? j.totalCharges ?? 0;
      stat.revenuePence += j.amountCharged || 0;
      stat.congestionChargePence += j.congestionCharge || 0;
      stat.tunnelChargePence += j.tunnelCharge || 0;
      if (j.roadFeeAmounts?.congestionPence === null) stat.congestionUnknownJobs++;
      if (j.roadFeeAmounts?.tunnelPence === null) stat.tunnelUnknownJobs++;
      stat.overtimeMinutes += j.overtimeMinutes || 0;
      // Same substring categorization as finance.routes.ts's company-wide totals,
      // just kept per-driver here -- so this and the Finance page always agree.
      const payments = normalizedPayments(j);
      if (payments.collectedPence === null) stat.unknownCollectionJobs++;
      stat.cashCollectedPence += payments.byMethod.Cash;
      stat.cardCollectedPence += payments.byMethod.Card;
      stat.linkCollectedPence += payments.byMethod.Link;
      stat.bankCollectedPence += payments.byMethod["Bank Transfer"];
      stat.invoiceCollectedPence += payments.invoicePence;
    } else if (j.status === "CANCELLED") {
      stat.cancelledCount++;
    }

    if (j.actualMinutes && j.actualMinutes > 0) { stat.totalDurationMinutes += j.actualMinutes; stat.durationJobsCount++; }
    if (j.delayMinutes !== undefined) { stat.totalDelayMinutes += j.delayMinutes; stat.delayJobsCount++; }
    if (j.overtimeMinutes > 0) stat.overtimeCount++;

    const comp = j.evidenceCompleteness;
    const missing = [comp.arrival, comp.vanLoaded, comp.emptyVan, comp.signature].filter(
      s => s === "MISSING" || s === "FAILED"
    ).length;
    stat.missingEvidenceCount += missing;
  }

  return [...driverStats.values()].map(s => {
    const effectiveAssigned = s.assignedCount - s.cancelledCount;
    const completionRate = effectiveAssigned > 0 ? Math.round((s.completedCount / effectiveAssigned) * 100) : 0;
    const avgDuration = s.durationJobsCount > 0 ? Math.round(s.totalDurationMinutes / s.durationJobsCount) : 0;
    const avgDelay = s.delayJobsCount > 0 ? Math.round(s.totalDelayMinutes / s.delayJobsCount) : 0;

    return {
      initials: s.initials, fullName: s.fullName, email: s.email, phone: s.phone,
      vanRegistration: s.vanRegistration, imei: s.imei, active: s.active, hasAccount: s.hasAccount,
      assigned: s.assignedCount, completed: s.completedCount, cancelled: s.cancelledCount, completionRate,
      avgDurationMinutes: avgDuration, totalDurationMinutes: s.totalDurationMinutes, avgDelayMinutes: avgDelay,
      totalChargesPounds: toPounds(pence(s.totalChargesPence)),
      calculatedChargesPounds: toPounds(pence(s.calculatedChargesPence)),
      revenuePounds: toPounds(pence(s.revenuePence)), revenueFormatted: formatGBP(pence(s.revenuePence)),
      cashCollectedPounds: toPounds(pence(s.cashCollectedPence)),
      cardCollectedPounds: toPounds(pence(s.cardCollectedPence)),
      linkCollectedPounds: toPounds(pence(s.linkCollectedPence)),
      totalCollectionsPounds: toPounds(pence(s.cashCollectedPence + s.cardCollectedPence + s.linkCollectedPence + s.bankCollectedPence)),
      unknownCollectionJobs: s.unknownCollectionJobs,
      congestionUnknownJobs: s.congestionUnknownJobs, tunnelUnknownJobs: s.tunnelUnknownJobs,
      bankCollectedPounds: toPounds(pence(s.bankCollectedPence)),
      invoiceCollectedPounds: toPounds(pence(s.invoiceCollectedPence)),
      invoiceUncollectedPounds: toPounds(pence(s.invoiceCollectedPence)),
      congestionChargePounds: toPounds(pence(s.congestionChargePence)),
      tunnelChargePounds: toPounds(pence(s.tunnelChargePence)),
      overtimeMinutes: s.overtimeMinutes,
      missingEvidenceCount: s.missingEvidenceCount, overtimeCount: s.overtimeCount,
      reviewSentCount: s.reviewSentCount, reviewNotSentCount: s.reviewNotSentCount
    };
  }).sort((a, b) => b.completed - a.completed);
}

const summaryCache = createReportReadCache<{ drivers: Array<ReturnType<typeof summarizeDrivers>[number] & Partial<DriverMovingSummary>>; meta: { fetchedAt: string } }>();
export function dashboardDriversSummaryRoutes(): Router {
  const router = Router();

  router.get("/summary", async (req, res) => {
    try {
      const from = typeof req.query.from === "string" ? req.query.from : undefined;
      const to = typeof req.query.to === "string" ? req.query.to : undefined;
      const completedOnly = req.query.completedOnly === "1";
      const response = await summaryCache.get(JSON.stringify([from, to, req.query.includeMoving === "1", completedOnly]), async () => {

      // A date-scoped request (this report's normal use -- pick a week, see what each
      // driver collected) only needs jobs in that range plus their own evidence, for
      // missingEvidenceCount below. Skips the shared getDashboardDataset() read (the
      // whole company's job/evidence/activity/scenario/exception history) entirely;
      // "All Time" still needs everything, so it keeps using the cached full dataset.
      let drivers, jobs, fetchedAt: string;
      let sourceJobs: Job[] = [];
      if (from || to) {
        const [driverList, scopedJobs] = await Promise.all([listDriverProfiles(), listJobsInRange(from, to)]);
        drivers = driverList;
        sourceJobs = completedOnly ? scopedJobs.filter(job => job.status === "COMPLETED") : scopedJobs;
        const jobIds = sourceJobs.map(j => j.jobId);
        const [evidence, driverJobSummaries] = await Promise.all([
          listEvidenceForJobs(jobIds),
          listDriverJobSummariesForJobs(jobIds)
        ]);
        jobs = await normalizeMongoDataset({
          jobs: sourceJobs, evidence, activity: [], scenarioSubmissions: [], exceptions: [],
          driverJobSummaries,
          fetchedAt: new Date().toISOString(), durationMs: 0
        });
        fetchedAt = new Date().toISOString();
      } else {
        const [driverList, { dataset, jobs: allJobs }] = await Promise.all([listDriverProfiles(), getDashboardDataset()]);
        drivers = driverList;
        sourceJobs = dataset.jobs;
        jobs = allJobs;
        fetchedAt = dataset.fetchedAt;
      }

      if (completedOnly) {
        sourceJobs = sourceJobs.filter(job => job.status === "COMPLETED");
        jobs = jobs.filter(job => job.status === "COMPLETED");
      }
      const items = summarizeDrivers(drivers, jobs);
      const movement = req.query.includeMoving === "1"
        ? await loadDriverMovement(sourceJobs, new Map(jobs.map(job => [job.jobId, job.driverInitials || "UNASSIGNED"]))) : null;
      const result = movement ? items.map(item => ({ ...item, ...(movement.get(item.initials) ?? { movingKnownSeconds: 0, movingUnknownJobs: item.completed, movingPartialJobs: 0 }) })) : items;

      return { drivers: result, meta: { fetchedAt } };
      });
      return res.status(200).json(response);
    } catch (error) {
      return res.status(500).json({ error: { code: "DRIVERS_FETCH_FAILED", message: "Failed to fetch driver performance summary." } });
    }
  });

  return router;
}
