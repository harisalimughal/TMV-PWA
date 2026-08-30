/** Ported from TMV-Chat-bot's dashboard/server/routes/finance.route.ts. */
import { Router } from "express";
import { addPence, formatGBP, pence, toPounds } from "../../utils/money";
import { normalizeMongoDataset } from "./normalize";
import { readMongoDataset } from "./read";

export function dashboardFinanceRoutes(): Router {
  const router = Router();

  router.get("/summary", async (req, res) => {
    try {
      const from = typeof req.query.from === "string" ? req.query.from : undefined;
      const to = typeof req.query.to === "string" ? req.query.to : undefined;
      const groupBy = req.query.groupBy === "month" ? "month" : req.query.groupBy === "week" ? "week" : "day";

      const dataset = await readMongoDataset();
      let jobs = await normalizeMongoDataset(dataset);

      if (from) jobs = jobs.filter(j => (j.actualStart || j.bookedStart) >= from);
      if (to) jobs = jobs.filter(j => (j.actualStart || j.bookedStart) <= to);

      let totalBase = pence(0), totalExtras = pence(0), totalOvertime = pence(0), totalRevenue = pence(0);
      let totalCash = pence(0), totalCard = pence(0), totalBank = pence(0), totalInvoice = pence(0);

      const unreconciledJobs: Array<{
        jobId: string; customerName: string; basePrice: number; extraCharges: number;
        overtimeCharge: number; totalCharges: number; differencePence: number;
      }> = [];

      const timeSeriesMap = new Map<string, { period: string; base: number; extras: number; overtime: number; total: number; count: number }>();

      for (const j of jobs) {
        if (j.status === "CANCELLED") continue;

        totalBase = addPence(totalBase, j.basePrice);
        totalExtras = addPence(totalExtras, j.extraCharges);
        totalOvertime = addPence(totalOvertime, j.overtimeCharge);
        totalRevenue = addPence(totalRevenue, j.totalCharges);

        const method = j.paymentMethod.toLowerCase();
        if (method.includes("cash")) totalCash = addPence(totalCash, j.totalCharges);
        else if (method.includes("card")) totalCard = addPence(totalCard, j.totalCharges);
        else if (method.includes("bank")) totalBank = addPence(totalBank, j.totalCharges);
        else if (method.includes("invoice")) totalInvoice = addPence(totalInvoice, j.totalCharges);

        if (!j.reconciled && j.status === "COMPLETED") {
          const sum = j.basePrice + j.extraCharges + j.overtimeCharge;
          unreconciledJobs.push({
            jobId: j.jobId, customerName: j.customerName,
            basePrice: toPounds(j.basePrice), extraCharges: toPounds(j.extraCharges),
            overtimeCharge: toPounds(j.overtimeCharge), totalCharges: toPounds(j.totalCharges),
            differencePence: Math.abs(sum - j.totalCharges)
          });
        }

        const dtStr = j.actualStart || j.bookedStart || "";
        let periodKey = dtStr.slice(0, 10);
        if (groupBy === "month") periodKey = dtStr.slice(0, 7);
        else if (groupBy === "week" && dtStr) {
          const d = new Date(dtStr);
          const day = d.getUTCDay();
          const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
          d.setUTCDate(diff);
          periodKey = d.toISOString().slice(0, 10);
        }

        if (periodKey) {
          const cur = timeSeriesMap.get(periodKey) || { period: periodKey, base: 0, extras: 0, overtime: 0, total: 0, count: 0 };
          cur.base += toPounds(j.basePrice);
          cur.extras += toPounds(j.extraCharges);
          cur.overtime += toPounds(j.overtimeCharge);
          cur.total += toPounds(j.totalCharges);
          cur.count++;
          timeSeriesMap.set(periodKey, cur);
        }
      }

      const timeline = [...timeSeriesMap.values()]
        .sort((a, b) => a.period.localeCompare(b.period))
        .map(t => ({
          ...t,
          base: Math.round(t.base * 100) / 100, extras: Math.round(t.extras * 100) / 100,
          overtime: Math.round(t.overtime * 100) / 100, total: Math.round(t.total * 100) / 100
        }));

      return res.status(200).json({
        summary: {
          totalRevenuePounds: toPounds(totalRevenue), totalRevenueFormatted: formatGBP(totalRevenue),
          basePricePounds: toPounds(totalBase), extraChargesPounds: toPounds(totalExtras),
          overtimePounds: toPounds(totalOvertime), cashPounds: toPounds(totalCash),
          cardPounds: toPounds(totalCard), bankPounds: toPounds(totalBank), invoicePounds: toPounds(totalInvoice)
        },
        unreconciledJobs, timeline,
        meta: { fetchedAt: dataset.fetchedAt }
      });
    } catch (error) {
      return res.status(500).json({ error: { code: "FINANCE_FETCH_FAILED", message: "Failed to fetch finance summary." } });
    }
  });

  return router;
}
