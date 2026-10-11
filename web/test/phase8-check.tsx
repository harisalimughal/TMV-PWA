import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DriverReportPage } from "../src/screens/admin/dashboard/pages/DriverReportPage";
import { Layout } from "../src/screens/admin/dashboard/Layout";
import { sampleDriverReport } from "../src/screens/admin/dashboard/fixtures/driverReport.sample";
import { LiabilityPage } from "../src/screens/admin/dashboard/pages/LiabilityPage";
import { NotificationDetailModal } from "../src/components/driver/NotificationDetailModal";
import { Bell } from "lucide-react";
import { SubmissionDetailDrawer } from "../src/screens/admin/dashboard/components/SubmissionDetailDrawer";
import { paperJobSample, paperScenarioSample } from "./reportPreview.sample";
import { ReportReturnButton } from "../src/screens/admin/dashboard/components/ReportReturnButton";
import type { DriverReport } from "../src/screens/admin/dashboard/driverReport.types";
import "../src/index.css";
const url = new URL(location.href);
const liabilityPreview = url.searchParams.get("preview") === "liability";
const notificationPreview = url.searchParams.get("preview") === "notification";
const documentPreview = url.searchParams.get("preview") === "document";
const sidebarPreview = url.searchParams.get("preview") === "sidebar";
const reportReturnPreview = url.searchParams.get("preview") === "reportreturn";
const count = url.searchParams.get("count") === "0" ? "0" : url.searchParams.get("count") === "3" ? "3" : "105";
if (!liabilityPreview && !notificationPreview && !documentPreview && !url.searchParams.has("driver")) { url.searchParams.set("driver", "DEMO"); url.searchParams.set("from", "2026-10-09"); url.searchParams.set("to", "2026-10-09"); history.replaceState({}, "", url); }
const realFetch = window.fetch.bind(window);
window.fetch = async (input, options) => {
  if (sidebarPreview && String(input) === "/api/admin/profile") return new Response(JSON.stringify({ email: "admin@example.invalid" }), { status: 200, headers: { "Content-Type": "application/json" } });
  const scenario = /^\/api\/admin\/scenarios\/(checkin|checkout|parking|liability)\?/.exec(String(input));
  if (liabilityPreview && scenario && (!options?.method || options.method === "GET")) {
    const query = new URL(String(input), location.origin).searchParams;
    const timestamp = "2026-10-10T09:00:00Z";
    const matches = (!query.get("driver") || query.get("driver") === "DEMO") &&
      (!query.get("from") || Date.parse(timestamp) >= Date.parse(query.get("from")!)) && (!query.get("to") || Date.parse(timestamp) <= Date.parse(query.get("to")!));
    const items = matches ? [{ id: `synthetic-${scenario[1]}`, jobId: "DEMO-SCENARIO-1", timestamp, clientName: "Sample Client", driver: "synthetic@example.invalid",
      driverName: "Synthetic Driver", driverInitials: "DEMO", containerNumber: "Container 100", address: "10 Sample Road London", damageCategories: "Item condition notice", photos: [], signature: null }] : [];
    return new Response(JSON.stringify({ kind: scenario[1], items, pagination: { page: 1, pageSize: 25, total: items.length, totalPages: 1 } }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  if (String(input) === "/api/admin/drivers") return new Response(JSON.stringify({ drivers: [
    { initials: "DEMO", fullName: "Synthetic Driver", active: true }, { initials: "SECOND", fullName: "Synthetic Driver Two", active: true }
  ] }), { status: 200, headers: { "Content-Type": "application/json" } });
  const match = /^\/api\/admin\/driver-reports\/(DEMO|SECOND)\/export\.(pdf|xlsx)\?/.exec(String(input));
  if (match) {
    const exportCount = match[1] === "SECOND" ? "0" : count;
    const response = await realFetch(`/phase8-fixtures/synthetic-${exportCount}.${match[2]}`, options);
    const headers = new Headers(response.headers); headers.set("Content-Disposition", `attachment; filename="tmv-synthetic-${exportCount}.${match[2]}"`);
    return new Response(await response.blob(), { status: response.status, headers });
  }
  if (String(input).startsWith("/api/")) throw new Error("Synthetic fixture blocks live API requests.");
  return realFetch(input, options);
};
async function load(initials: string, query: Record<string, string | number>): Promise<DriverReport> {
  if (["roadalerts", "reportreturn"].includes(url.searchParams.get("preview") || "")) return sampleDriverReport(initials, query);
  const response = await realFetch(`/phase8-fixtures/synthetic-${initials === "SECOND" ? "0" : count}.json`);
  if (!response.ok) throw new Error("Generate the Phase 8 synthetic files first.");
  const report = await response.json();
  if (initials === "SECOND") report.driver = { ...report.driver, initials, name: "Synthetic Driver Two", email: "second@example.invalid" };
  const params = new URLSearchParams(location.search);
  const scheme = query.activityScheme || "all";
  const matches = (value: string | null) => scheme === "all" || (scheme === "congestion" ? value === "congestion" : value === "dartford" || value === "blackwall-silvertown");
  report.visits = report.visits.filter((row: { scheme: string }) => matches(row.scheme));
  report.events = report.events.filter((row: { scheme: string | null }) => matches(row.scheme));
  report.charges = report.charges.filter((row: { type: string }) => scheme === "all" || row.type === scheme);
  report.activitySummary = { scheme, observedVisits: report.visits.length, observedEntries: report.visits.filter((row: { entryObserved: boolean }) => row.entryObserved).length,
    confirmedCrossings: report.gpsSummary.coverage === "unavailable" ? null : report.visits.filter((row: { physicalCrossingConfirmed: boolean }) => row.physicalCrossingConfirmed).length,
    chargeableObligations: report.charges.length, knownCustomerPence: report.charges.reduce((sum: number, row: { expectedPence: number | null }) => sum + (row.expectedPence ?? 0), 0),
    unknownChargeAmounts: report.charges.filter((row: { expectedPence: number | null }) => row.expectedPence === null).length };
  for (const key of ["jobs", "events", "visits", "charges", "liabilities"]) {
    const rows = report[key], page = Number(params.get(`${key}Page`) || 1);
    report[key] = { items: rows.slice((page - 1) * 25, page * 25), total: rows.length, page, pageSize: 25 };
  }
  return report;
}
function NotificationPreview() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const notice = { id: 1, title: "Booking updated: collection instructions and important access information for your next assigned job", kind: "broadcast_message", read: false,
    receivedAt: Date.UTC(2026, 9, 10, 9, 30), url: "/?tab=jobs",
    body: "Job reference: QA-NOTICE-001\nCollection: 10 Sample Road, London\nScheduled arrival: 10:00 AM\n\nImportant: Please use the rear entrance and contact the customer before arrival.\n\n" +
      "Keep the trolley accessible and check the loading area before moving any items. Confirm access arrangements with the customer and keep the office informed of any changes.\n\n".repeat(8) +
      "Final instruction: bring the trolley and confirm the delivery address." };
  return <div className="mx-auto max-w-lg text-fg"><header className="flex items-center gap-3 border-b border-line pb-4"><img src="/tmv-logo.png" alt="The Man Van" className="h-10 w-10 object-contain" /><div className="flex-1"><h1 className="text-heading font-semibold">The Man Van</h1><p className="text-meta text-fg-muted">Driver</p></div><button type="button" aria-label="Open notification details" onClick={() => setOpen(true)} className="grid size-11 place-items-center rounded-card border border-line bg-surface"><Bell className="size-5" /></button></header><section className="py-6"><h2 className="text-heading font-semibold">Jobs</h2><p className="mt-4 text-label">QA-NOTICE-001</p><p className="text-helper text-fg-muted">London pickup to London delivery</p></section><NotificationDetailModal notification={open ? notice : null} onClose={close} /></div>;
}
function DocumentPreview() {
  const [open, setOpen] = useState(true);
  const kind = url.searchParams.get("kind");
  const scenarioKind = kind && ["checkin", "checkout", "parking", "liability"].includes(kind) ? kind as "checkin" | "checkout" | "parking" | "liability" : undefined;
  return <><button className="rounded-md border border-admin-line bg-white px-4 py-2" onClick={() => setOpen(true)}>Open report</button><SubmissionDetailDrawer job={scenarioKind ? paperScenarioSample as any : paperJobSample} kind={scenarioKind} isOpen={open} onClose={() => setOpen(false)} /></>;
}
function SidebarPreview() {
  const [active, setActive] = useState("overview");
  return <Layout activeSection={active} onSelectSection={setActive}><section className="p-6"><h2 className="text-xl font-semibold">{active === "overview" ? "Overview" : active === "liabilities" ? "Liability" : active === "drivers" ? "Drivers" : "Operations"}</h2><p className="mt-3 text-admin-muted">Synthetic navigation preview</p></section></Layout>;
}
function ReportReturnPreview() {
  const [search, setSearch] = useState(location.search), [open, setOpen] = useState(true);
  useEffect(() => { const read = () => { setSearch(location.search); setOpen(true); }; window.addEventListener("popstate", read); return () => window.removeEventListener("popstate", read); }, []);
  const params = new URLSearchParams(search);
  return params.get("section") === "finished" ? <><ReportReturnButton /><SubmissionDetailDrawer job={{ ...paperJobSample, jobId: params.get("job") || paperJobSample.jobId }} isOpen={open} onClose={() => setOpen(false)} /></> : <DriverReportPage loadReport={load} />;
}
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={new QueryClient()}>{sidebarPreview ? <SidebarPreview /> : <main className="min-h-screen bg-[#f7f9fa] p-3 sm:p-6">{reportReturnPreview ? <ReportReturnPreview /> : documentPreview ? <DocumentPreview /> : notificationPreview ? <NotificationPreview /> : liabilityPreview ? <><header className="mx-auto mb-6 flex max-w-[1440px] items-center gap-3"><img src="/tmv-logo.png" alt="The Man Van" className="h-10 w-10 object-contain" /><h1 className="text-xl font-semibold text-admin-ink">Liability</h1></header><LiabilityPage /></> : <DriverReportPage loadReport={load} />}</main>}</QueryClientProvider>);
