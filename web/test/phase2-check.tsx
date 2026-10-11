import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { RotateCcw } from "lucide-react";
import { DriverJobSummaryForm, clearManualDetailsDraft } from "../src/components/driver/DriverJobSummaryForm";
import type { Job, DriverJobSummaryInput } from "../src/api/jobs";
import "../src/index.css";

const job = {
  jobId: "PHASE2-LOCAL-SAMPLE", driverInitials: "DEMO", status: "COMPLETED",
  manualDetailsRequiredAt: "2026-10-09T12:00:00Z", bookedStart: "2026-10-09T09:00:00Z",
  bookedFinish: "2026-10-09T10:30:00Z", actualFinish: "2026-10-09T11:00:00Z",
  totalCharges: 250, amountCharged: 250, paymentMethod: "Cash, Card, Invoice",
  paymentBreakdown: [{ method: "Cash", amount: 100 }, { method: "Card", amount: 100 }, { method: "Invoice", amount: 0 }],
  extraCharges: ["London Congestion charge", "Tunnel Charges"],
  chargeSnapshot: { basePence: 21840, congestionPence: 1800, tunnelPence: 1360 }
} as Job;
const savedKey = "tmv:phase2-preview:locked";

function Check() {
  const [saved, setSaved] = useState<DriverJobSummaryInput | null>(() => {
    try { return JSON.parse(localStorage.getItem(savedKey) || "null"); } catch { return null; }
  });
  const [resetCount, setResetCount] = useState(0);
  return <main className="mx-auto max-w-2xl px-4 py-6">
    <div className="mb-5 flex items-center justify-between gap-4">
      <span className="text-helper text-fg-muted">Local sample</span>
      <button type="button" title="Reset local sample" className="flex items-center gap-2 text-helper text-fg-muted" onClick={() => {
        localStorage.removeItem(savedKey); clearManualDetailsDraft(job); setSaved(null); setResetCount(value => value + 1);
      }}><RotateCcw size={18} /> Reset sample</button>
    </div>
    {saved ? <section>
      <h1 className="text-title text-fg">Manual details submitted</h1>
      <p className="mt-2 text-body text-fg-muted">{job.jobId}</p>
      <p className="mt-4 text-heading text-success">Locked</p>
      <p className="mt-2 text-body tabular-nums text-fg">Collected: GBP {saved.paymentMethods.filter(method => method !== "Invoice").reduce((total, method) => total + Number(saved.paymentAmounts[method]), 0).toFixed(2)}</p>
    </section> : <DriverJobSummaryForm key={resetCount} job={job} submitting={false} onSubmit={async input => {
      localStorage.setItem(savedKey, JSON.stringify(input)); clearManualDetailsDraft(job); setSaved(input);
    }} />}
  </main>;
}
createRoot(document.getElementById("root")!).render(<Check />);
