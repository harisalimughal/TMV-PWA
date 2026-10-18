import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DriverReportView, type ReportViewLocation } from "./DriverReportView";
import { sampleDriverReport } from "../fixtures/driverReport.sample";
import type { DriverReport } from "../driverReport.types";

vi.mock("./DriverPerformanceCharts", () => ({ DriverPerformanceCharts: () => <div>Chart</div> }));
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });

const location = (patch: Partial<ReportViewLocation> = {}): ReportViewLocation => ({ tab: "jobs", reconFilter: "all", roadView: "events", ...patch });
const gps = { loading: false, available: true, retry: vi.fn() };
const recon = { jobs: [], total: 0, loading: false, retry: vi.fn(), gpsAvailable: true };
const load = () => sampleDriverReport("DEMO", { from: "2026-10-05", to: "2026-10-11" });
function view(report: DriverReport, loc = location(), extra: Partial<React.ComponentProps<typeof DriverReportView>> = {}) {
  const onLocation = vi.fn();
  render(<DriverReportView report={report} location={loc} from="2026-10-05" to="2026-10-11" gps={gps} recon={recon} driverPicker={null}
    onLocation={onLocation} onDates={vi.fn()} onPage={vi.fn()} onJob={vi.fn()} onDrivers={vi.fn()} {...extra} />);
  return { onLocation };
}

describe("DriverReportView", () => {
  it("has the deployed dashboard's six report tabs", async () => {
    view(await load());
    expect(screen.getAllByRole("tab").map(tab => tab.textContent)).toEqual(["Jobs", "Performance & Timings", "Payments", "Comparison", "Tunnel Charges", "Congestion Charges"]);
  });

  it("shows the selected range totals and an expandable job record on the Jobs tab", async () => {
    const report = await load();
    const { onLocation } = view(report);
    const totals = screen.getByRole("group", { name: "Selected range totals" });
    for (const label of ["Total jobs", "Total charges (expected)", "Driver collected", "Manual entries (reported)", "Tunnel charges", "Congestion charges", "Scheduled hours", "Working hours", "Moving time", "Overtime", "Reviews sent / not sent"])
      expect(within(totals).getByText(label)).toBeInTheDocument();
    const first = report.jobs.items[0];
    fireEvent.click(screen.getByRole("button", { name: new RegExp(first.jobId) }));
    expect(onLocation).toHaveBeenCalledWith({ expand: first.jobId });
  });

  it("opens a job record with every section and all eight milestones", async () => {
    const report = await load();
    const first = report.jobs.items[0];
    view(report, location({ expand: first.jobId }));
    for (const section of ["Customer & schedule", "Timeline", "Performance & timings", "Payments", "Financial breakdown", "Tunnel charges", "Congestion charges", "System / Manual comparison"])
      expect(screen.getByRole("region", { name: section })).toBeInTheDocument();
    const timeline = screen.getByRole("region", { name: "Timeline" });
    for (const milestone of ["On the Way", "Tracker Pick-up arrival", "Proof Photo", "Van Loaded", "Tracker Drop-off arrival", "Empty Van", "Tracker Drop-off departure", "Customer Signed"])
      expect(within(timeline).getByText(milestone)).toBeInTheDocument();
  });

  it("keeps system and driver values apart on the Comparison tab and never shows a missing submission as £0.00", async () => {
    const report = await load();
    const job = { ...report.jobs.items[0], manualDetails: null, manualStatus: "pending" };
    render(<DriverReportView report={report} location={location({ tab: "comparison", expand: job.jobId })} from="2026-10-05" to="2026-10-11" gps={gps}
      recon={{ ...recon, jobs: [job], total: 1 }} driverPicker={null} onLocation={vi.fn()} onDates={vi.fn()} onPage={vi.fn()} onJob={vi.fn()} onDrivers={vi.fn()} />);
    expect(screen.getByRole("region", { name: "System totals · selected range" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Manual totals · selected range" })).toBeInTheDocument();
    const driverSide = screen.getByRole("region", { name: "Driver manual details" });
    expect(within(driverSide).getAllByText("Pending submission").length).toBeGreaterThan(0);
    expect(within(driverSide).getByText("Manual entry (reported)").closest("div")).not.toHaveTextContent("£0.00");
  });

  it("moves between tabs with the arrow keys", async () => {
    const { onLocation } = view(await load());
    fireEvent.keyDown(screen.getByRole("tablist", { name: "Report sections" }), { key: "ArrowRight" });
    expect(onLocation).toHaveBeenCalledWith(expect.objectContaining({ tab: "performance" }));
  });

  it("goes back to Drivers from the header", async () => {
    const onDrivers = vi.fn();
    view(await load(), location(), { onDrivers });
    fireEvent.click(screen.getByRole("button", { name: "Back to Drivers" }));
    expect(onDrivers).toHaveBeenCalled();
  });

  it("labels receipts as a known subtotal on the Payments tab when some receipts are unverified", async () => {
    const report = await load();
    report.summary = { ...report.summary, unknownSystemCollectionJobs: 2 };
    view(report, location({ tab: "payments" }));
    const totals = screen.getByRole("group", { name: "Payment totals" });
    expect(within(totals).getByText("Recorded receipts (known subtotal)")).toBeInTheDocument();
    expect(within(totals).getByText(/2 jobs unverified/)).toBeInTheDocument();
  });

  it("shows one empty state, with the date range still usable, when the range has no completed jobs", async () => {
    const report = await load();
    report.summary = { ...report.summary, completedJobs: 0 };
    const onDates = vi.fn();
    view(report, location({ tab: "payments" }), { onDates });
    expect(screen.getByText(/No completed jobs for/)).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Selected range totals" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Yesterday" }));
    expect(onDates).toHaveBeenCalled();
  });

  it("states the scope of each export", async () => {
    view(await load(), location(), { onExport: vi.fn() });
    fireEvent.click(screen.getByRole("button", { name: "PDF / Excel options" }));
    expect(await screen.findByText("PDF — Driver Breakdown")).toBeInTheDocument();
    expect(screen.getByText("PDF — server export (original layout)")).toBeInTheDocument();
    expect(screen.getByText("Excel — complete report")).toBeInTheDocument();
  });
});
