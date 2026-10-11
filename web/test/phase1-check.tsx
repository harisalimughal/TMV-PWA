import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Printer } from "lucide-react";
import { BookingWindowHeader } from "../src/components/driver/BookingWindowHeader";
import { JobTimeBreakdown } from "../src/screens/admin/dashboard/components/JobTimeBreakdown";
import { PaperDossierReport } from "../src/screens/admin/dashboard/components/PaperDossierReport";
import type { Job } from "../src/api/jobs";
import type { NormalizedJob } from "../src/screens/admin/dashboard/types";
import "../src/index.css";

const booking = {
  jobId: "PHASE1-LOCAL", rawTitle: "2 Men - GBP 200", bookedStart: "2026-10-09T18:00:00Z",
  bookedFinish: "2026-10-09T19:30:00Z", bookedMinutes: 90, basePrice: 200, crewSize: 2
} as Job;

function report(actual: number): NormalizedJob {
  const blocks = Math.ceil(Math.max(0, actual - 120) / 30);
  return {
    ...booking, calendarEventId: "fixture", customerName: "Local test customer", driverInitials: "TMV",
    driverName: "Local test driver", pickup: "London", dropoff: "London", status: "COMPLETED",
    actualStart: booking.bookedStart,
    actualFinish: new Date(Date.parse(booking.bookedStart) + actual * 60_000).toISOString(),
    actualMinutes: actual, delayMinutes: 0, delayBand: "ON_TIME", timingTrustworthy: true,
    basePrice: 20000, extraCharges: 0, overtimeCharge: blocks * 5500,
    overtimeMinutes: Math.max(0, actual - 120), totalCharges: 20000 + blocks * 5500,
    amountCharged: 20000 + blocks * 5500, reconciled: true, paymentMethod: "Card", paymentStatus: "Recorded",
    evidenceItems: [], scenarios: [], evidenceCompleteness: { arrival: "MISSING", vanLoaded: "MISSING", emptyVan: "MISSING", organized: "MISSING", stopBy: "MISSING", signature: "MISSING" },
    timeBillingStatus: "verified", timeBilling: {
      ruleVersion: "calendar-allocation-30min-v1", scheduledMinutes: 90, allocatedMinutes: 120,
      actualMinutes: actual, extraMinutes: Math.max(0, actual - 120), billedExtraBlocks: blocks,
      billedExtraMinutes: blocks * 30, ratePer30Pence: 5500, rateSource: "calendar", extraChargePence: blocks * 5500
    }
  } as NormalizedJob;
}

function Check() {
  const [actual, setActual] = useState(150);
  const [printing, setPrinting] = useState(false);
  const job = report(actual);
  return <main className="mx-auto max-w-5xl px-4 py-6 text-admin-ink">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 print:hidden">
      <h1 className="text-xl font-semibold">TMV Phase 1 Local Check</h1>
      <button title="Print report" className="flex items-center gap-2 border border-admin-line px-3 py-2" onClick={() => setPrinting(!printing)}>
        <Printer size={18} /> Report preview
      </button>
    </div>
    {printing ? <PaperDossierReport job={job} isPreview /> : <>
      <label className="mb-6 block text-sm">Actual job duration
        <select className="ml-3 border border-admin-line bg-white px-3 py-2" value={actual} onChange={event => setActual(Number(event.target.value))}>
          {[90, 120, 121, 150, 151, 180, 210, 240].map(minutes => <option key={minutes} value={minutes}>{minutes} min</option>)}
        </select>
      </label>
      <div className="grid min-w-0 gap-8 md:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <section className="min-w-0"><h2 className="mb-3 text-sm font-semibold">Driver booking</h2><BookingWindowHeader job={booking} /></section>
        <JobTimeBreakdown job={job} />
      </div>
    </>}
  </main>;
}

createRoot(document.getElementById("root")!).render(<Check />);
