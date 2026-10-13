import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { DriverJobSummaryForm } from "../src/components/driver/DriverJobSummaryForm";
import { DriverReportView, JobComparison, type ReportTab } from "../src/screens/admin/dashboard/components/DriverReportView";
import { sampleDriverReport, sampleJobs } from "../src/screens/admin/dashboard/fixtures/driverReport.sample";
import type { DriverReport } from "../src/screens/admin/dashboard/driverReport.types";
import type { Job } from "../src/api/jobs";
import "../src/index.css";

function Review() {
  const [report, setReport] = useState<DriverReport | null>(null);
  const [tab, setTab] = useState<ReportTab>("payments");
  const [range, setRange] = useState({ from: "2026-10-05", to: "2026-10-11" });
  const [page, setPage] = useState(1);
  useEffect(() => { sampleDriverReport("DEMO", { ...range, jobsPage: page }).then(setReport); }, [range, page]);
  const [hours, setHours] = useState({ driver: 3.5, helper: 2.5 });
  const source = sampleJobs[0];
  const job = { ...source, duration: { ...source.duration, manualMinutes: hours.driver * 60, differenceMinutes: source.duration.workingMinutes === null ? null : source.duration.workingMinutes - hours.driver * 60 },
    manualDetails: { ...source.manualDetails!, helperHours: hours.helper }, finance: { ...source.finance, adjustmentNote: "Customer agreed adjusted total" } };
  if (new URLSearchParams(location.search).get("view") === "payments") return report ? <main className="p-4 sm:p-8"><DriverReportView report={report} tab={tab} from={range.from} to={range.to} onTab={setTab} onDates={(from, to) => { setRange({ from, to }); setPage(1); }} onPage={(_, next) => setPage(next)} onJob={() => undefined} onBack={() => undefined} /></main> : null;
  return <main className="mx-auto max-w-6xl p-4 sm:p-8">
    <div className="mx-auto mb-8" style={{ maxWidth: 560 }}><DriverJobSummaryForm job={{ jobId: "HOURS-PREVIEW", driverInitials: "DEMO" } as Job} submitting={false}
      onSubmit={async input => setHours({ driver: Number(input.driverJobHours), helper: Number(input.helperHours) })} /></div>
    <div className="rpt-page"><JobComparison job={job} openJob={() => undefined} /></div>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Review />);
