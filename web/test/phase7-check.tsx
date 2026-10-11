import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DriverReportPage } from "../src/screens/admin/dashboard/pages/DriverReportPage";
import { JobComparison } from "../src/screens/admin/dashboard/components/DriverReportView";
import { sampleDriverReport, sampleJobs } from "../src/screens/admin/dashboard/fixtures/driverReport.sample";
import "../src/index.css";

// Synthetic browser fixture: no authentication, backend or GPS provider requests.
const url = new URL(window.location.href);
if (!url.searchParams.has("driver")) { url.searchParams.set("driver", "DEMO"); url.searchParams.set("section", "driverreport"); url.searchParams.set("from", "2026-10-05"); url.searchParams.set("to", "2026-10-11"); window.history.replaceState({}, "", url); }
window.fetch = async input => {
  const path = String(input);
  if (path === "/api/admin/drivers") return new Response(JSON.stringify({ drivers: [
    { initials: "DEMO", fullName: "Sample Driver", active: true }, { initials: "SECOND", fullName: "Sample Driver Two", active: true }
  ] }), { status: 200, headers: { "Content-Type": "application/json" } });
  if (path.startsWith("/api/admin/liabilities/jobs/DEMO-")) return new Response(JSON.stringify({ items: [], coverage: "synthetic-fixture" }), { status: 200, headers: { "Content-Type": "application/json" } });
  if (/\/api\/admin\/gps\/jobs\/DEMO-\d+\/charges/.test(path)) return new Response(JSON.stringify({ flags: [{ code: "Needs verification", type: "tunnel", source: "gps", reason: "Synthetic evidence fixture; no live route verification.", evidenceIds: [] }], comparisons: [], activity: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
  throw new Error("Local fixture blocks backend requests.");
};
function Preview() {
  const [jobId, setJobId] = useState(new URLSearchParams(location.search).get("section") === "jobs" ? new URLSearchParams(location.search).get("job") : null);
  useEffect(() => { const read = () => setJobId(new URLSearchParams(location.search).get("section") === "jobs" ? new URLSearchParams(location.search).get("job") : null); window.addEventListener("popstate", read); return () => window.removeEventListener("popstate", read); }, []);
  const job = sampleJobs.find(job => job.jobId === jobId);
  return <main className="min-h-screen bg-[#f7f9fa] p-3 sm:p-6"><div className="mx-auto max-w-[1440px]">{job ? <div className="rpt-page"><button className="py-4 text-admin-brand" onClick={() => window.history.back()}>Back to driver report</button><JobComparison job={job} openJob={() => {}} /></div> : <DriverReportPage loadReport={sampleDriverReport} />}</div></main>;
}
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Preview /></QueryClientProvider>);
