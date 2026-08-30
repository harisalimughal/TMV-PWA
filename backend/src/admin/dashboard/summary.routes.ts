/** Ported from TMV-Chat-bot's dashboard/server/routes/summary.route.ts. */
import { Router } from "express";
import { addPence, formatGBP, pence, toPounds } from "../../utils/money";
import { normalizeMongoDataset } from "./normalize";
import { readMongoDataset } from "./read";

export function dashboardSummaryRoutes(): Router {
  const router = Router();

  router.get("/", async (req, res) => {
    try {
      const from = typeof req.query.from === "string" ? req.query.from : undefined;
      const to = typeof req.query.to === "string" ? req.query.to : undefined;

      const dataset = await readMongoDataset();
      let jobs = await normalizeMongoDataset(dataset);

      if (from) jobs = jobs.filter(j => (j.actualStart || j.bookedStart) >= from);
      if (to) jobs = jobs.filter(j => (j.actualStart || j.bookedStart) <= to);

      const totalJobs = jobs.length;
      const ready = jobs.filter(j => j.status === "READY").length;
      const inProgress = jobs.filter(j => j.status === "IN_PROGRESS").length;
      const completed = jobs.filter(j => j.status === "COMPLETED").length;
      const cancelled = jobs.filter(j => j.status === "CANCELLED").length;
      const late = jobs.filter(j => j.delayMinutes > 0 && j.status !== "CANCELLED").length;
      const incomplete = jobs.filter(j => j.status !== "COMPLETED" && j.status !== "CANCELLED").length;

      let totalRevenue = pence(0), cashCollected = pence(0), cardBankCollected = pence(0);
      let totalExtras = pence(0), totalOvertime = pence(0);
      let photosMissing = 0, photosProcessing = 0, photosFailed = 0, missingSignatures = 0;
      let totalDuration = 0, durationCount = 0, totalDelay = 0, delayCount = 0;
      const workingDrivers = new Set<string>();

      for (const j of jobs) {
        if (j.status !== "CANCELLED") {
          totalRevenue = addPence(totalRevenue, j.totalCharges);
          totalExtras = addPence(totalExtras, j.extraCharges);
          totalOvertime = addPence(totalOvertime, j.overtimeCharge);

          if (j.paymentMethod.toLowerCase().includes("cash")) {
            cashCollected = addPence(cashCollected, j.totalCharges);
          } else if (["card", "bank", "invoice"].some(m => j.paymentMethod.toLowerCase().includes(m))) {
            cardBankCollected = addPence(cardBankCollected, j.totalCharges);
          }

          if (j.actualMinutes && j.actualMinutes > 0) { totalDuration += j.actualMinutes; durationCount++; }
          if (j.delayMinutes !== undefined) { totalDelay += j.delayMinutes; delayCount++; }
          if (j.driverInitials) workingDrivers.add(j.driverInitials);
        }

        const comp = j.evidenceCompleteness;
        const states = [comp.arrival, comp.vanLoaded, comp.emptyVan];
        photosMissing += states.filter(s => s === "MISSING").length;
        photosProcessing += states.filter(s => s === "PROCESSING").length;
        photosFailed += states.filter(s => s === "FAILED").length;
        if (comp.signature === "MISSING") missingSignatures++;
      }

      const avgDuration = durationCount > 0 ? Math.round(totalDuration / durationCount) : 0;
      const avgDelay = delayCount > 0 ? Math.round(totalDelay / delayCount) : 0;

      const statusBreakdown = [
        { label: "Scheduled", value: ready, color: "#1B75BC" },
        { label: "In Progress", value: inProgress, color: "#B4600A" },
        { label: "Completed", value: completed, color: "#17804A" },
        { label: "Cancelled", value: cancelled, color: "#BF3025" }
      ];

      const dailyRevenue = new Map<string, { revenuePounds: number; count: number }>();
      for (const j of jobs) {
        if (j.status === "CANCELLED") continue;
        const dateKey = (j.actualStart || j.bookedStart || "").slice(0, 10);
        if (!dateKey) continue;
        const existing = dailyRevenue.get(dateKey) || { revenuePounds: 0, count: 0 };
        existing.revenuePounds += toPounds(j.totalCharges);
        existing.count++;
        dailyRevenue.set(dateKey, existing);
      }
      const revenueOverTime = [...dailyRevenue.entries()]
        .sort(([a], [b]) => a.localeCompare(b)).slice(-30)
        .map(([date, d]) => ({ date, revenuePounds: Math.round(d.revenuePounds * 100) / 100, jobsCount: d.count }));

      const paySplit = new Map<string, { pounds: number; count: number }>();
      for (const j of jobs) {
        if (j.status === "CANCELLED") continue;
        const method = j.paymentMethod || "Not recorded";
        const cur = paySplit.get(method) || { pounds: 0, count: 0 };
        cur.pounds += toPounds(j.totalCharges);
        cur.count++;
        paySplit.set(method, cur);
      }
      const paymentMethodSplit = [...paySplit.entries()].map(([method, val]) => ({
        method, totalPounds: Math.round(val.pounds * 100) / 100, count: val.count
      }));

      const driverMap = new Map<string, { driverName: string; initials: string; completed: number; active: number }>();
      for (const j of jobs) {
        const init = j.driverInitials || "UN";
        const cur = driverMap.get(init) || { driverName: j.driverName, initials: init, completed: 0, active: 0 };
        if (j.status === "COMPLETED") cur.completed++;
        else if (j.status === "IN_PROGRESS" || j.status === "READY") cur.active++;
        driverMap.set(init, cur);
      }
      const jobsByDriver = [...driverMap.values()].sort((a, b) => b.completed - a.completed);

      res.status(200).json({
        kpis: {
          totalJobs, scheduled: ready, inProgress, completed, cancelled, late, incomplete,
          revenuePounds: toPounds(totalRevenue), revenueFormatted: formatGBP(totalRevenue),
          cashCollectedPounds: toPounds(cashCollected), cardBankPounds: toPounds(cardBankCollected),
          extraChargesPounds: toPounds(totalExtras), overtimePounds: toPounds(totalOvertime),
          photosMissing, photosProcessing, photosFailed, missingSignatures,
          driversWorkingCount: workingDrivers.size, avgDurationMinutes: avgDuration, avgDelayMinutes: avgDelay
        },
        charts: { statusBreakdown, revenueOverTime, paymentMethodSplit, jobsByDriver },
        meta: { fetchedAt: dataset.fetchedAt, durationMs: dataset.durationMs }
      });
    } catch (error) {
      res.status(500).json({
        error: { code: "SUMMARY_FAILED", message: error instanceof Error ? error.message : "Failed to load dashboard summary." }
      });
    }
  });

  return router;
}
