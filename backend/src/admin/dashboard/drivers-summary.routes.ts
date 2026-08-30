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
import { normalizeMongoDataset } from "./normalize";
import { readMongoDataset } from "./read";

interface DriverStat {
  initials: string;
  fullName: string;
  email?: string;
  phone?: string;
  vanRegistration?: string;
  active: boolean;
  assignedCount: number;
  completedCount: number;
  cancelledCount: number;
  totalDurationMinutes: number;
  durationJobsCount: number;
  totalDelayMinutes: number;
  delayJobsCount: number;
  revenuePence: number;
  cashCollectedPence: number;
  missingEvidenceCount: number;
  overtimeCount: number;
}

export function dashboardDriversSummaryRoutes(): Router {
  const router = Router();

  router.get("/summary", async (req, res) => {
    try {
      const from = typeof req.query.from === "string" ? req.query.from : undefined;
      const to = typeof req.query.to === "string" ? req.query.to : undefined;

      const [drivers, dataset] = await Promise.all([listDriverProfiles(), readMongoDataset()]);
      let jobs = await normalizeMongoDataset(dataset);

      if (from) jobs = jobs.filter(j => (j.actualStart || j.bookedStart) >= from);
      if (to) jobs = jobs.filter(j => (j.actualStart || j.bookedStart) <= to);

      const driverStats = new Map<string, DriverStat>();

      // Seed from the roster so an inactive/unassigned driver still shows up with zeroes.
      for (const d of drivers) {
        if (!d.initials) continue;
        driverStats.set(d.initials, {
          initials: d.initials, fullName: d.fullName, email: d.email || undefined,
          phone: d.phone || undefined, vanRegistration: d.vanRegistration || undefined, active: d.active,
          assignedCount: 0, completedCount: 0, cancelledCount: 0,
          totalDurationMinutes: 0, durationJobsCount: 0, totalDelayMinutes: 0, delayJobsCount: 0,
          revenuePence: 0, cashCollectedPence: 0, missingEvidenceCount: 0, overtimeCount: 0
        });
      }

      for (const j of jobs) {
        const init = j.driverInitials || "UNASSIGNED";
        let stat = driverStats.get(init);
        if (!stat) {
          stat = {
            initials: init, fullName: j.driverName || init, email: j.driverEmail, active: true,
            assignedCount: 0, completedCount: 0, cancelledCount: 0,
            totalDurationMinutes: 0, durationJobsCount: 0, totalDelayMinutes: 0, delayJobsCount: 0,
            revenuePence: 0, cashCollectedPence: 0, missingEvidenceCount: 0, overtimeCount: 0
          };
          driverStats.set(init, stat);
        }

        stat.assignedCount++;
        if (j.status === "COMPLETED") {
          stat.completedCount++;
          stat.revenuePence += j.totalCharges;
          if (j.paymentMethod.toLowerCase().includes("cash")) stat.cashCollectedPence += j.totalCharges;
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

      const items = [...driverStats.values()].map(s => {
        const effectiveAssigned = s.assignedCount - s.cancelledCount;
        const completionRate = effectiveAssigned > 0 ? Math.round((s.completedCount / effectiveAssigned) * 100) : 0;
        const avgDuration = s.durationJobsCount > 0 ? Math.round(s.totalDurationMinutes / s.durationJobsCount) : 0;
        const avgDelay = s.delayJobsCount > 0 ? Math.round(s.totalDelayMinutes / s.delayJobsCount) : 0;

        return {
          initials: s.initials, fullName: s.fullName, email: s.email, phone: s.phone,
          vanRegistration: s.vanRegistration, active: s.active,
          assigned: s.assignedCount, completed: s.completedCount, cancelled: s.cancelledCount, completionRate,
          avgDurationMinutes: avgDuration, avgDelayMinutes: avgDelay,
          revenuePounds: toPounds(pence(s.revenuePence)), revenueFormatted: formatGBP(pence(s.revenuePence)),
          cashCollectedPounds: toPounds(pence(s.cashCollectedPence)),
          missingEvidenceCount: s.missingEvidenceCount, overtimeCount: s.overtimeCount
        };
      }).sort((a, b) => b.completed - a.completed);

      return res.status(200).json({ drivers: items, meta: { fetchedAt: dataset.fetchedAt } });
    } catch (error) {
      return res.status(500).json({ error: { code: "DRIVERS_FETCH_FAILED", message: "Failed to fetch driver performance summary." } });
    }
  });

  return router;
}
