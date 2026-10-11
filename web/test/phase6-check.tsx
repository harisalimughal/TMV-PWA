import React from "react";
import { createRoot } from "react-dom/client";
import { PaperAnalyticsReport } from "../src/screens/admin/dashboard/components/PaperAnalyticsReport";
import type { DriverSummaryItem } from "../src/screens/admin/dashboard/types";
import "../src/index.css";

// Isolated synthetic print fixture. No authentication, API or provider calls.
const driver: DriverSummaryItem = {
  initials: "DEMO", fullName: "Sample Driver", active: true, hasAccount: false, assigned: 1, completed: 1, cancelled: 0, completionRate: 100,
  avgDurationMinutes: 120, totalDurationMinutes: 120, avgDelayMinutes: 0, totalChargesPounds: 300, revenuePounds: 300, revenueFormatted: "GBP 300.00",
  cashCollectedPounds: 100, cardCollectedPounds: 50, linkCollectedPounds: 50, bankCollectedPounds: 0, invoiceCollectedPounds: 100,
  invoiceUncollectedPounds: 100, totalCollectionsPounds: 200, congestionChargePounds: 0, tunnelChargePounds: 0, overtimeMinutes: 0,
  missingEvidenceCount: 0, overtimeCount: 0, reviewSentCount: 1, reviewNotSentCount: 0
};
createRoot(document.getElementById("root")!).render(
  <main className="min-h-screen overflow-x-auto bg-white p-4"><div className="min-w-[1200px] max-w-[1500px] mx-auto">
    <PaperAnalyticsReport reportType="Driver Settlement" from="2026-10-09" to="2026-10-09" driverSettlement={[driver]} />
  </div></main>
);
