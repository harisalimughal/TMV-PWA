import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DriverReportView, JobComparison } from "./DriverReportView";
import { roadZoneLabel } from "./DriverRoadAlerts";
import { sampleDriverReport, sampleJobs } from "../fixtures/driverReport.sample";
vi.mock("../api", () => ({ fetchRoadAssessment: vi.fn().mockResolvedValue({ flags: [], comparisons: [], activity: [] }) }));
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
const props = { from: "2026-10-05", to: "2026-10-11", groupBy: "day" as const, onTab: vi.fn(), onDates: vi.fn(), onGroup: vi.fn(), onPage: vi.fn(), onJob: vi.fn(), onBack: vi.fn(), onRefresh: vi.fn() };
describe("Driver report evidence and comparison UI", () => {
  it.each([
    ["payments", "Payment job"],
    ["performance", "Performance job"],
    ["comparison", "Comparison jobs"],
  ] as const)("labels %s job options with customer and London scheduled date/time", async (tab, label) => {
    const report = await sampleDriverReport("DEMO", { from: props.from, to: props.to, pageSize: 2 });
    const job = report.jobs.items[0];
    job.customer.name = "Test Customer";
    job.bookedStart = "2026-10-05T13:30:00Z";
    render(<DriverReportView {...props} report={report} tab={tab} />);
    const select = screen.getByRole("combobox", { name: label });
    const option = within(select).getByRole("option", { name: "Test Customer - 05 Oct 2026, 14:30" });
    expect(option).toHaveValue(job.jobId);
    expect(option).not.toHaveTextContent(job.jobId);
    fireEvent.change(select, { target: { value: job.jobId } });
    expect(select).toHaveValue(job.jobId);
  });
  it("opens unverified jobs from the yellow warning even when the job is on another report page", async () => {
    const report = await sampleDriverReport("DEMO", { from: props.from, to: props.to, pageSize: 1 });
    report.summary.paymentCards = { ...report.summary.paymentCards!, jobFlowUnknownJobs: 1, jobFlowUnverifiedJobIds: ["OFF-PAGE-UNVERIFIED"] };
    const onJob = vi.fn();
    render(<DriverReportView {...props} onJob={onJob} report={report} tab="payments" />);
    const warning = screen.getByText(/job payment records need verification/).closest(".rpt-warning")!;
    fireEvent.click(within(warning as HTMLElement).getByRole("button", { name: "OFF-PAGE-UNVERIFIED" }));
    expect(onJob).toHaveBeenCalledWith("OFF-PAGE-UNVERIFIED");
  });
  it("filters the single upper timings table and restores all jobs without changing range totals", async () => {
    const report = await sampleDriverReport("DEMO", { from: props.from, to: props.to, pageSize: 2 });
    render(<DriverReportView {...props} report={report} tab="performance" />);
    const selected = report.jobs.items[1];
    const section = screen.getByRole("heading", { name: "Job timings" }).closest("section")!;
    const select = within(section).getByRole("combobox", { name: "Performance job" });
    const table = screen.getByRole("table", { name: "Job timings" });
    expect(table.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(screen.queryByRole("heading", { name: "Job-wise performance & timings" })).not.toBeInTheDocument();
    expect(document.querySelector("details.rpt-job")).toBeNull();
    expect(screen.getAllByRole("button", { name: "Next jobs page" })).toHaveLength(1);
    fireEvent.change(select, { target: { value: selected.jobId } });
    expect(table.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(table).toHaveTextContent(selected.jobId);
    expect(table).not.toHaveTextContent(report.jobs.items[0].jobId);
    expect(screen.getByRole("tabpanel", { name: "Performance & Timings" })).not.toHaveTextContent("Driver Collected");
    expect(document.querySelector(".rpt-metrics")).toHaveTextContent(String(report.summary.completedJobs));
    fireEvent.change(select, { target: { value: "" } });
    expect(table.querySelectorAll("tbody tr")).toHaveLength(2);
  });
  it("shows missing tracker-arrival reasons in red in Performance & Timings and job details", async () => {
    const report = await sampleDriverReport("DEMO", { from: props.from, to: props.to, pageSize: 1 });
    const reason = "Tracker device signal was stale / offline";
    report.jobs.items[0].timings = { ...report.jobs.items[0].timings!, trackerArrivalAt: null, trackerUnverifiedReason: reason };
    const { rerender } = render(<DriverReportView {...props} report={report} tab="performance" />);
    expect(within(screen.getByRole("table", { name: "Job timings" })).getByText(reason)).toHaveClass("rpt-unavailable-count");
    rerender(<DriverReportView {...props} report={report} tab="jobs" />);
    expect(within(screen.getByRole("table", { name: "Job Performance & Timings" })).getByText(reason)).toHaveClass("rpt-unavailable-count");
    report.jobs.items[0].timings = { ...report.jobs.items[0].timings!, trackerArrivalAt: "2026-10-05T08:58:00Z" };
    rerender(<DriverReportView {...props} report={report} tab="performance" />);
    expect(screen.queryByText(reason)).not.toBeInTheDocument();
  });
  it("shows frozen tracker-arrival distance in the timings table and individual job", async () => {
    const report = await sampleDriverReport("DEMO", { from: props.from, to: props.to, pageSize: 1 });
    report.jobs.items[0].timings = { ...report.jobs.items[0].timings!, trackerArrivalDistanceMeters: 405 };
    const { rerender } = render(<DriverReportView {...props} report={report} tab="performance" />);
    expect(screen.getByRole("table", { name: "Job timings" })).toHaveTextContent("(405 m)");
    rerender(<DriverReportView {...props} report={report} tab="jobs" />);
    expect(screen.getByRole("table", { name: "Job Performance & Timings" })).toHaveTextContent("(405 m)");
  });
  it("shows available road-fee subtotals with missing-job counts in red, preserving explicit zero and all-missing states", async () => {
    const report = await sampleDriverReport("DEMO", { from: props.from, to: props.to, pageSize: 1 });
    report.summary.completedJobs = 3;
    report.summary.roadChargeTotals = { congestionPence: 1800, tunnelPence: 1360, congestionUnknownJobs: 2, tunnelUnknownJobs: 2 };
    const { container, rerender } = render(<DriverReportView {...props} report={report} tab="jobs" />);
    const card = (label: string) => [...container.querySelectorAll(".rpt-metrics:first-of-type > .rpt-metric")].find(el => el.querySelector(".rpt-metric-label")?.textContent === label)!;
    expect(card("Tunnel Charges").querySelector("strong")).toHaveTextContent("£13.60");
    expect(card("Congestion Charges").querySelector("strong")).toHaveTextContent("£18.00");
    for (const label of ["Tunnel Charges", "Congestion Charges"]) {
      expect(within(card(label) as HTMLElement).getByText("2 unavailable job charges")).toHaveClass("rpt-unavailable-count");
      expect(card(label)).not.toHaveClass("rpt-metric-incomplete");
    }
    report.summary.roadChargeTotals = { congestionPence: 0, tunnelPence: 0, congestionUnknownJobs: 2, tunnelUnknownJobs: 2 };
    rerender(<DriverReportView {...props} report={report} tab="jobs" />);
    expect(card("Tunnel Charges").querySelector("strong")).toHaveTextContent("£0.00");
    report.summary.roadChargeTotals = { congestionPence: null, tunnelPence: null, congestionUnknownJobs: 3, tunnelUnknownJobs: 3 };
    rerender(<DriverReportView {...props} report={report} tab="jobs" />);
    expect(card("Tunnel Charges").querySelector("strong")).toHaveTextContent("Unknown");
  });
  it("removes Unknown method rows but retains nonzero unclassified amounts as warnings", async () => {
    const report = await sampleDriverReport("DEMO", { from: props.from, to: props.to, pageSize: 1 });
    report.summary.systemPaymentsByMethodPence.Unknown = 0;
    report.jobs.items[0].finance.systemPayments.byMethod.Unknown = 0;
    const { rerender } = render(<DriverReportView {...props} report={report} tab="payments" />);
    const financialTable = () => screen.getByRole("heading", { name: "Financial breakdown" }).closest("section")!.querySelector("table")!;
    expect(within(financialTable()).queryByRole("row", { name: /^Unknown/ })).not.toBeInTheDocument();
    expect(within(financialTable()).getByRole("row", { name: /^Cash/ })).toBeInTheDocument();
    expect(screen.queryByText(/Unclassified payment:/)).not.toBeInTheDocument();
    report.summary.systemPaymentsByMethodPence.Unknown = 1250;
    rerender(<DriverReportView {...props} report={report} tab="payments" />);
    expect(within(financialTable()).queryByRole("row", { name: /^Unknown/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Unclassified payment:/)).toHaveTextContent("£12.50");
    rerender(<DriverReportView {...props} report={report} tab="jobs" />);
    const jobTable = () => screen.getByRole("table", { name: "Job financial breakdown" });
    expect(within(jobTable()).queryByRole("row", { name: /^Unknown/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Unclassified payment:/)).not.toBeInTheDocument();
    report.jobs.items[0].finance.systemPayments.byMethod.Unknown = 1250;
    rerender(<DriverReportView {...props} report={report} tab="jobs" />);
    expect(within(jobTable()).queryByRole("row", { name: /^Unknown/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Unclassified payment:/)).toHaveTextContent("£12.50");
  });
  it("puts Jobs first and shows known moving time with the missing-job count in red on both summaries", async () => {
    const sample = await sampleDriverReport("DEMO", { from: props.from, to: props.to });
    const report = { ...sample, summary: { ...sample.summary, completedJobs: 3, movingKnownSeconds: 5400, movingUnknownJobs: 2, movingPartialJobs: 0 } };
    const { container, rerender } = render(<DriverReportView {...props} report={report} tab="performance" />);
    expect(screen.getAllByRole("tab")[0]).toHaveTextContent("Jobs");
    for (const tab of ["performance", "jobs"] as const) {
      rerender(<DriverReportView {...props} report={report} tab={tab} />);
      const label = tab === "jobs" ? "Moving Time" : "Moving Hours";
      const card = [...container.querySelectorAll(".rpt-metric")].find(el => el.querySelector(".rpt-metric-label")?.textContent === label)!;
      expect(card.querySelector("strong")).toHaveTextContent("1h 30m");
      expect(within(card as HTMLElement).getByText("2 unavailable")).toHaveClass("rpt-unavailable-count");
    }
    rerender(<DriverReportView {...props} report={report} tab="jobs" gpsLoading />);
    const card = [...container.querySelectorAll(".rpt-metric")].find(el => el.querySelector(".rpt-metric-label")?.textContent === "Moving Time")!;
    expect(card.querySelector("strong")).toHaveTextContent("Loading...");
    expect(card.querySelector(".rpt-unavailable-count")).toBeNull();
  });
  it("shows the finished-job empty state on every tab without charts or metrics", async () => {
    const sample = await sampleDriverReport("DEMO", { from: props.from, to: props.to });
    const report = { ...sample, summary: { ...sample.summary, completedJobs: 0 }, jobs: { ...sample.jobs, items: [], total: 0 } };
    const { container, rerender } = render(<DriverReportView {...props} report={report} tab="performance" />);
    for (const tab of ["performance", "payments", "jobs", "comparison", "tunnels", "congestion"] as const) {
      rerender(<DriverReportView {...props} report={report} tab={tab} />);
      expect(screen.getByText("No finished job data")).toBeInTheDocument();
      expect(screen.getByRole("tablist")).toBeInTheDocument();
      expect(container.querySelector(".rpt-metrics")).toBeNull();
      expect(container.querySelector(".rpt-chart")).toBeNull();
    }
  });
  it("keeps full-range fee cards and shows compact per-job road summaries below the tables", async () => {
    const report = await sampleDriverReport("DEMO", { from: props.from, to: props.to, pageSize: 1 });
    const { container } = render(<DriverReportView {...props} report={report} tab="jobs" />);
    const summary = container.querySelector(".rpt-metrics")!;
    const card = (root: Element, label: string) => [...root.querySelectorAll(".rpt-metric")].find(el => el.querySelector(".rpt-metric-label")?.textContent === label)!;
    expect(card(summary, "Tunnel Charges")).toHaveTextContent(new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(report.summary.roadChargeTotals!.tunnelPence! / 100));
    expect(card(summary, "Congestion Charges")).toHaveTextContent(new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(report.summary.roadChargeTotals!.congestionPence! / 100));
    fireEvent.click(container.querySelector(".rpt-job > summary")!);
    const tunnel = screen.getByRole("region", { name: `Tunnel charges for ${report.jobs.items[0].jobId}` });
    const congestion = screen.getByRole("region", { name: `Congestion charges for ${report.jobs.items[0].jobId}` });
    expect(tunnel.querySelectorAll(".rpt-metric")).toHaveLength(4);
    expect(congestion.querySelectorAll(".rpt-metric")).toHaveLength(4);
    expect(card(tunnel, "Expected")).toHaveTextContent("£13.60");
    expect(card(congestion, "Expected")).toHaveTextContent("£0.00");
    expect(tunnel.parentElement?.previousElementSibling).toHaveTextContent("Financial breakdown");
    const performance = screen.getByRole("table", { name: "Job Performance & Timings" });
    for (const label of ["Completed Jobs", "Working Hours", "Moving Hours", "Overtime", "Arrival Delays", "Reviews Sent / Not Sent", "Manual Helper Hours"]) expect(performance).toHaveTextContent(label);
    expect(container.querySelector(".rpt-job-road")).toBeNull();
    expect(report.jobs.items).toHaveLength(1);
  });
  it("shows the red arrival-to-proof tag beneath the two timings only for gaps of at least 15 minutes", async () => {
    const report = await sampleDriverReport("DEMO", { from: props.from, to: props.to, pageSize: 1 });
    const job = report.jobs.items[0];
    const withTimes = (arrival: string | null, proof: string | null) => ({ ...report, jobs: { ...report.jobs, items: [{ ...job, timings: { ...job.timings!, trackerArrivalAt: arrival, proofPhotoAt: proof } }] } });
    const { rerender } = render(<DriverReportView {...props} report={withTimes("2026-10-05T09:00:00Z", "2026-10-05T09:15:00Z")} tab="performance" />);
    const tag = within(screen.getByRole("table", { name: "Job timings" })).getByText("Arrival to proof gap (15 min)");
    expect(tag).toHaveClass("rpt-bad");
    expect(tag.closest("td")).toHaveAttribute("colspan", "2");
    expect(tag.closest("tr")?.firstElementChild).toHaveAttribute("colspan", "4");
    for (const [arrival, proof] of [["2026-10-05T09:00:00Z", "2026-10-05T09:14:59Z"], ["2026-10-05T09:00:00Z", null], [null, "2026-10-05T09:15:00Z"], ["invalid", "2026-10-05T09:15:00Z"], ["2026-10-05T09:30:00Z", "2026-10-05T09:15:00Z"]]) {
      rerender(<DriverReportView {...props} report={withTimes(arrival, proof)} tab="performance" />);
      expect(screen.queryByText(/Arrival to proof gap/)).not.toBeInTheDocument();
    }
    rerender(<DriverReportView {...props} report={withTimes("2026-10-05T23:55:00+01:00", "2026-10-06T00:15:00+01:00")} tab="performance" />);
    expect(within(screen.getByRole("table", { name: "Job timings" })).getByText("Arrival to proof gap (20 min)")).toBeInTheDocument();
  });
  it("shows full-range overtime charges and hours on Payments, not just the current job page", async () => {
    const report = await sampleDriverReport("DEMO", { from: props.from, to: props.to, pageSize: 1 });
    const { container, rerender } = render(<DriverReportView {...props} report={report} tab="payments" />);
    const card = () => [...container.querySelectorAll(".rpt-metric")].find(el => el.textContent?.includes("Overtime Charges"))!;
    expect(report.jobs.items).toHaveLength(1);
    expect(card()).toHaveTextContent("£1,980.00");
    expect(card()).toHaveTextContent("18h 0m overtime");
    rerender(<DriverReportView {...props} report={{ ...report, summary: { ...report.summary, overtimeChargesPence: null, overtimeChargesUnknownJobs: 1, overtimeMinutesUnknownJobs: 1 } }} tab="payments" />);
    expect(card()).toHaveTextContent("Unknown"); expect(card()).toHaveTextContent("1 missing charges");
    expect(card()).toHaveClass("rpt-metric-incomplete");
  });
  it("shows all six milestones including On the Way below the Performance & Timings cards", async () => {
    const report = await sampleDriverReport("DEMO", { from: props.from, to: props.to, pageSize: 1 });
    const { container, rerender } = render(<DriverReportView {...props} report={report} tab="performance" />);
    expect(screen.getByRole("tab", { name: "Performance & Timings" })).toHaveAttribute("aria-selected", "true");
    expect(container.querySelector(".rpt-coverage")).toBeNull();
    expect(screen.queryByText(/Observed GPS evidence/)).not.toBeInTheDocument();
    const timings = screen.getByRole("table", { name: "Job timings" });
    expect(within(timings).getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(["Job", "Date", "Customer", "On the Way", "Tracker Pick-up arrival", "Proof Photo", "Van Loaded", "Tracker Drop-off arrival", "Empty Van", "Tracker Drop-off departure", "Customer Signed"]);
    const cells = timings.querySelectorAll("tbody td");
    expect(cells[1]).toHaveTextContent("05 Oct 2026");
    expect([...cells].slice(3).map(cell => cell.textContent)).toEqual(["09:40", "09:58 (distance not recorded)", "10:00", "10:20", "11:30", "12:30", "12:45", "12:35"]);
    expect(timings).not.toHaveTextContent("Captured");
    expect(container.querySelector('.rpt-metrics')?.nextElementSibling).toContainElement(timings);
    const missing = { ...report, jobs: { ...report.jobs, items: [{ ...report.jobs.items[0], timings: undefined }] } };
    rerender(<DriverReportView {...props} report={missing} tab="performance" />);
    expect(within(screen.getByRole("table", { name: "Job timings" })).getAllByText("Not recorded")).toHaveLength(8);
  });
  it("shows two date-filtered performance charts without payment metrics or grouping selectors", async () => {
    const report = await sampleDriverReport("DEMO", { from: props.from, to: props.to });
    const { rerender } = render(<DriverReportView {...props} report={report} tab="performance" />);
    expect(screen.queryByRole("button", { name: "Refresh driver report" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Chart grouping")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Chart metric")).not.toBeInTheDocument();
    expect(screen.queryByText("Trend values")).not.toBeInTheDocument();
    for (const name of ["Completed Jobs", "Working Hours"]) expect(await screen.findByRole("img", { name: `${name} by date` })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Driver Collected by date" })).not.toBeInTheDocument();
    rerender(<DriverReportView {...props} report={report} tab="payments" />);
    expect(screen.queryByLabelText("Chart grouping")).not.toBeInTheDocument();
  });
  it("presents job performance tables and road summaries without detailed activity tables or graphs", async () => {
    const report = await sampleDriverReport("DEMO", { from: props.from, to: props.to, pageSize: 1 });
    const { container } = render(<QueryClientProvider client={new QueryClient()}><DriverReportView {...props} report={report} tab="jobs" /></QueryClientProvider>);
    const summary = container.querySelector('.rpt-job > summary')!;
    expect(summary.querySelector('.rpt-expand-indicator')).toHaveAttribute("aria-hidden", "true");
    const identity = summary.querySelector(".rpt-job-identity")!;
    expect(identity.querySelector("strong")).toHaveTextContent(report.jobs.items[0].customer.name);
    expect(identity.querySelector("strong")?.nextElementSibling).toHaveTextContent(report.jobs.items[0].jobId);
    expect(identity.querySelector("strong")?.nextElementSibling?.tagName).toBe("SMALL");
    expect(identity.querySelector("small")?.firstElementChild?.tagName).toBe("TIME");
    expect(identity.querySelector("time")).toHaveTextContent("05 Oct 2026");
    expect(identity.querySelector("small")?.lastElementChild).toHaveTextContent(report.jobs.items[0].jobId);
    expect(screen.getByRole("heading", { name: "Selected range totals" })).toBeInTheDocument();
    expect(container.querySelector('.rpt-metric')).toHaveTextContent("Total Jobs36");
    expect(report.jobs.items).toHaveLength(1);
    fireEvent.click(summary);
    const job = container.querySelector('.rpt-job')!;
    expect(job).toHaveTextContent("Customer & schedule");
    const schedule = within(job as HTMLElement).getByRole("table", { name: "Scheduled and actual timings" });
    expect(within(schedule).getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(["Timing", "Scheduled", "Actual"]);
    const startCells = within(within(schedule).getByRole("row", { name: /^Start/ })).getAllByRole("cell");
    expect(startCells.map(cell => cell.textContent)).toEqual(["05 Oct 2026, 10:00", "05 Oct 2026, 10:00"]);
    const finishCells = within(within(schedule).getByRole("row", { name: /^Finish/ })).getAllByRole("cell");
    expect(finishCells.map(cell => cell.textContent)).toEqual(["05 Oct 2026, 11:30", "05 Oct 2026, 12:30"]);
    expect(job).toHaveTextContent("sample@example.test");
    expect(within(job as HTMLElement).getByRole("table", { name: "Job Performance & Timings" })).toBeInTheDocument();
    expect(within(job as HTMLElement).getByRole("table", { name: "Job Payments" })).toHaveTextContent("Driver Collected - Manual Entries");
    for (const label of ["On the Way", "Tracker Pick-up arrival", "Proof Photo", "Van Loaded", "Tracker Drop-off arrival", "Empty Van", "Tracker Drop-off departure", "Customer Signed", "Moving Hours", "Manual Helper Hours", "Review report"]) expect(within(job as HTMLElement).getByRole("table", { name: "Job Performance & Timings" })).toHaveTextContent(label);
    const jobTimings = within(job as HTMLElement).getByRole("table", { name: "Job Performance & Timings" });
    expect(within(jobTimings).getByRole("cell", { name: "On the Way" }).closest("tr")?.lastElementChild).toHaveTextContent("09:40");
    expect(within(jobTimings).getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(["Detail", "Value", "Timing", "Time"]);
    expect(within(jobTimings).queryByRole("row", { name: /Completion status/ })).not.toBeInTheDocument();
    expect(within(job as HTMLElement).queryByRole("columnheader", { name: "Notes" })).not.toBeInTheDocument();
    expect(within(jobTimings).getByRole("row", { name: /^Date/ })).toHaveTextContent("05 Oct 2026");
    const proofTime = within(jobTimings).getByRole("cell", { name: "Proof Photo" }).closest("tr")?.lastElementChild;
    expect(proofTime).toHaveTextContent("10:00");
    expect(proofTime).not.toHaveTextContent("Oct");
    expect(jobTimings).not.toHaveTextContent("Captured");
    expect(job).toHaveTextContent("Financial breakdown");
    expect(job).toHaveTextContent("Saved tunnel fee");
    expect(job).toHaveTextContent("Expected");
    expect(job.querySelector(".rpt-job-road-summary table")).toBeNull();
    expect(job.querySelector('.rpt-job-road')).toBeNull();
    expect(job).not.toHaveTextContent("Linked penalties & liability evidence");
    expect(job.querySelector('.recharts-wrapper')).toBeNull();
    expect([...job.querySelectorAll(".rpt-job-body .rpt-job-section")].map(section => section.classList.contains("rpt-job-section-blue") ? "blue" : "white")).toEqual(["white", "blue", "white", "blue", "white", "blue", "white"]);
    const methods = within(job as HTMLElement).getByRole("table", { name: "Job financial breakdown" });
    expect(methods.querySelector("tfoot")).toHaveTextContent("Total");
    expect(methods).not.toHaveTextContent("Manual amount");
    expect(job.querySelector('.rpt-chart-data:last-child')).not.toHaveAttribute("open");
  });
  it("keeps job receipts separate from manual entries and does not invent missing timings or balances", async () => {
    const report = await sampleDriverReport("DEMO", { from: props.from, to: props.to, pageSize: 1 });
    const original = report.jobs.items[0];
    report.jobs.items = [{ ...original, timings: undefined, manualDetails: null, finance: { ...original.finance, acceptedPence: 37600, adjustmentNote: "Agreed discount", systemPayments: { ...original.finance.systemPayments, byMethod: { Cash: 10000, Card: 20000, Invoice: 5000 }, issues: [] } } }];
    const { container } = render(<QueryClientProvider client={new QueryClient()}><DriverReportView {...props} report={report} tab="jobs" /></QueryClientProvider>);
    fireEvent.click(container.querySelector(".rpt-job > summary")!);
    const timings = screen.getByRole("table", { name: "Job Performance & Timings" });
    expect(within(timings).getAllByText("Not recorded")).toHaveLength(8);
    const payments = screen.getByRole("table", { name: "Job Payments" });
    expect(within(payments).getByRole("row", { name: /^Driver Collected/ })).toHaveTextContent("£376.00");
    expect(within(payments).getByRole("row", { name: /Adjustment reason/ })).toHaveTextContent("Agreed discount");
    expect(within(payments).getByRole("row", { name: /^Manual Entries/ })).toHaveTextContent("Not submitted");
    expect(within(payments).getByRole("row", { name: /^Outstanding/ })).toHaveTextContent("Unknown");
    expect(screen.getByRole("table", { name: "Job financial breakdown" }).querySelector("tfoot")).toHaveTextContent("£350.00");
  });
  it("shows payment totals and overtime cards without Manual or Outstanding cards", async () => {
    const report = await sampleDriverReport("DEMO", { from: props.from, to: props.to, pageSize: 1 });
    report.summary.paymentCards = { basis: "driver-charged-minus-manual-form-collections", totalChargesPence: 65320, totalChargeUnknownJobs: 0,
      driverCollectionPence: 37660, driverCollectionUnknownJobs: 0, manualEntriesPence: 50660, manualEntryUnknownJobs: 0,
      outstandingPence: -13000, adjustmentReasons: [{ jobId: "OFF-PAGE", reason: "Agreed discount", calculatedPence: 32660, driverCollectionPence: 5000 }],
      jobFlowTotalPence: 60000, jobFlowTotalKnownPence: 60000, jobFlowUnknownJobs: 0 };
    report.summary.systemPaymentsByMethodPence = { Cash: 10000, Card: 40000, Invoice: 10000 };
    const onJob = vi.fn();
    const { container } = render(<DriverReportView {...props} onJob={onJob} report={report} tab="payments" />);
    const cards = container.querySelectorAll(".rpt-metric");
    expect(cards).toHaveLength(4);
    expect(cards[0]).toHaveTextContent("Total Charges(Expected)£653.20");
    expect(cards[1]).toHaveTextContent("Driver Collected£376.60");
    expect(cards[2]).toHaveTextContent("Scheduled Hours");
    expect(cards[3]).toHaveTextContent("Overtime Charges");
    expect([...cards].map(card => card.querySelector(".rpt-metric-label")?.textContent)).not.toContain("Manual Entries");
    expect([...cards].map(card => card.querySelector(".rpt-metric-label")?.textContent)).not.toContain("Outstanding");
    expect(screen.getByText("Agreed discount")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Adjustment reasons (1)"));
    fireEvent.click(screen.getByRole("button", { name: "OFF-PAGE" }));
    expect(onJob).toHaveBeenCalledWith("OFF-PAGE");
    expect(screen.queryByRole("heading", { name: "Job collection reconciliation" })).not.toBeInTheDocument();
    const total = within(screen.getByRole("table", { name: "Financial breakdown" })).getByRole("rowheader", { name: "Total" }).parentElement!;
    expect(within(total).getByText("£600.00")).toBeInTheDocument();
  });
  it("shows a recorded total even when payment records require verification and marks non-invoice jobs with a dash", async () => {
    const report = await sampleDriverReport("DEMO", { from: props.from, to: props.to, pageSize: 1 });
    report.summary.systemPaymentsByMethodPence = { Cash: 22500, Card: 0, Link: 0, "Bank Transfer": 0, Invoice: 0, Unknown: 0 };
    report.summary.financialBreakdown = { basePence: 20000, invoiceJobs: 0, extraCharges: [{ label: "Packing Service", amountPence: null, basis: "Included in overtime rate" }] };
    report.summary.paymentCards = { ...report.summary.paymentCards!, jobFlowTotalPence: null, jobFlowUnknownJobs: 1 };
    render(<DriverReportView {...props} report={report} tab="payments" />);
    const table = screen.getByRole("table", { name: "Financial breakdown" });
    expect(table.querySelector("tfoot")).toHaveTextContent("£225.00");
    expect(within(table).getByRole("row", { name: /^Invoice/ })).toHaveTextContent("Invoice--");
    expect(within(table).getByRole("row", { name: /^Extra Charges/ })).toHaveTextContent("Packing Service");
    expect(table).toHaveTextContent("Overtime");
    expect(within(table).queryByRole("row", { name: /^Congestion charges/ })).not.toBeInTheDocument();
    expect(within(table).queryByRole("row", { name: /^Tunnel charges/ })).not.toBeInTheDocument();
    const congestion = within(table).getByText("Congestion").closest("tr")!;
    expect(congestion.querySelectorAll("td")[0]).toHaveTextContent(new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(report.summary.roadChargeTotals!.congestionPence! / 100));
    expect(congestion.querySelectorAll("td")[1]).toHaveTextContent("Congestion");
  });
  it("filters expandable job payment breakdowns and shows an invoice tag and correct invoice total", async () => {
    const report = await sampleDriverReport("DEMO", { from: props.from, to: props.to });
    render(<DriverReportView {...props} report={report} tab="payments" />);
    const invoice = report.jobs.items.find(job => job.finance.invoiceJob)!;
    fireEvent.change(screen.getByRole("combobox", { name: "Payment job" }), { target: { value: invoice.jobId } });
    const details = screen.getByRole("heading", { name: "Job-wise payment breakdown" }).closest("section")!.querySelectorAll("details.rpt-job");
    expect(details).toHaveLength(1);
    expect(details[0]).not.toHaveAttribute("open");
    fireEvent.click(details[0].querySelector("summary")!);
    const table = within(details[0] as HTMLElement).getByRole("table", { name: "Job financial breakdown" });
    expect(table).toHaveTextContent("Invoice job");
    expect(table.querySelector("tfoot")).toHaveTextContent(new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(invoice.finance.systemPayments.invoicePence / 100));
  });
  it("keeps the Jobs manual subtotal neutral and colours only its missing-entry warning", async () => {
    const report = await sampleDriverReport("DEMO", { from: props.from, to: props.to, pageSize: 1 });
    report.summary.paymentCards = { ...report.summary.paymentCards!, manualEntriesKnownPence: 18000,
      manualEntriesPence: null, manualEntryMissingJobs: 1, manualEntryUnknownJobs: 1 };
    const { container } = render(<DriverReportView {...props} report={report} tab="jobs" />);
    const card = [...container.querySelectorAll(".rpt-metric")].find(el => el.querySelector(".rpt-metric-label")?.textContent === "Manual Entries")!;
    expect(card.querySelector("strong")).toHaveTextContent("£180.00");
    expect(card).not.toHaveClass("rpt-metric-incomplete");
    expect(card.querySelector("strong")?.querySelector(".rpt-unavailable-count")).toBeNull();
    expect(within(card as HTMLElement).getByText("1 missing entry")).toHaveClass("rpt-unavailable-count");
  });
  it("labels expected and reported totals and places manual entries beside driver collections", async () => {
    const report = await sampleDriverReport("DEMO", { from: props.from, to: props.to });
    const { container, rerender } = render(<DriverReportView {...props} report={report} tab="jobs" />);
    for (const tab of ["jobs"] as const) {
      rerender(<DriverReportView {...props} report={report} tab={tab} />);
      const cards = [...container.querySelectorAll(".rpt-metric")];
      const labels = cards.map(card => card.querySelector(".rpt-metric-label")?.textContent);
      expect(labels.indexOf("Manual Entries")).toBe(labels.indexOf("Driver Collected") + 1);
      expect(cards[labels.indexOf("Manual Entries")]).toHaveTextContent("(reported)");
      expect(cards[labels.indexOf("Total Charges")]).toHaveTextContent("(Expected)");
      for (const label of ["Total Charges", "Manual Entries"]) {
        const card = cards[labels.indexOf(label)];
        expect(card.querySelector(".rpt-metric-label")?.nextElementSibling).toHaveClass("rpt-metric-caption");
        expect(card.querySelector(".rpt-metric-caption")?.nextElementSibling?.tagName).toBe("STRONG");
      }
    }
  });
  it("places the system and locked manual details on labelled separate sides without the old balance footer", () => {
    const { container } = render(<JobComparison job={sampleJobs[0]} openJob={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "System calculation" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Driver manual details" })).toBeInTheDocument();
    expect(container.querySelectorAll(".rpt-comparison-sides > section")).toHaveLength(2);
    const manualSide = container.querySelectorAll(".rpt-comparison-sides > section")[1];
    expect(manualSide).not.toHaveTextContent("Not entered");
    for (const label of ["Scheduled", "Allocated", "Overtime", "Total Charges"]) {
      expect(within(container as HTMLElement).queryByText(label)).not.toBeInTheDocument();
    }
    expect(screen.queryByText("Locked submission")).not.toBeInTheDocument();
    expect(screen.queryByText("Saved system data")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(manualSide).toHaveTextContent("Driver Collected");
    expect(manualSide).toHaveTextContent("Cash");
    expect(container.querySelectorAll(".rpt-comparison-sides > section")[0]).not.toHaveTextContent("Driver Collected");
    expect(container.querySelector(".rpt-reconciliation")).toBeNull();
    expect(screen.queryByText("Signed difference")).not.toBeInTheDocument();
    expect(screen.queryByText("Outstanding")).not.toBeInTheDocument();
    expect(screen.queryByText("Excess")).not.toBeInTheDocument();
  });
  it.each([
    [120, false], [150, false], [179.9, false], [180, true], [210, true], [null, false]
  ])("highlights only reported hours at least 30 minutes above working hours: %s", (reported, discrepancy) => {
    const source = sampleJobs[0];
    const job = { ...source, duration: { ...source.duration, workingMinutes: 150, manualMinutes: reported },
      finance: { ...source.finance, acceptedPence: 100, congestionPence: 1800, tunnelPence: 1360 } };
    const { container } = render(<JobComparison job={job} openJob={vi.fn()} />);
    expect(screen.queryByText("Discrepancy") !== null).toBe(discrepancy);
    expect(container.querySelectorAll(".rpt-difference")).toHaveLength(discrepancy ? 2 : 0);
    expect(screen.queryByText(/Congestion Charges/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Tunnel Charges/)).not.toBeInTheDocument();
  });
  it("shows the requested full-range comparison totals without the old reconciliation summary", async () => {
    const report = await sampleDriverReport("DEMO", { from: props.from, to: props.to, pageSize: 1 });
    report.summary.paymentCards = { ...report.summary.paymentCards!, totalChargesPence: 65320,
      driverCollectionPence: 37660, manualEntriesKnownPence: 18000 };
    report.summary.expectedRoadChargeTotals = { tunnel: { pence: 4080, knownPence: 4080, unpricedEntries: 0 }, congestion: { pence: 1800, knownPence: 1800, unpricedEntries: 0 } };
    report.summary.manualRoadChargeTotals = { tunnel: { knownPence: 2720, knownJobs: 2, missingJobs: 1, unavailableJobs: 0 },
      congestion: { knownPence: 1800, knownJobs: 2, missingJobs: 1, unavailableJobs: 0 } };
    report.summary.roadChargeTotals = { tunnelPence: 2720, congestionPence: 1800, tunnelUnknownJobs: 0, congestionUnknownJobs: 0 };
    const { container } = render(<DriverReportView {...props} report={report} tab="comparison" />);
    const sides = container.querySelectorAll(".rpt-range-totals > section");
    const labels = (side: Element) => [...side.querySelectorAll(".rpt-comparison-row > span")].map(row => row.textContent).filter(Boolean);
    expect(labels(sides[0])).toEqual(["Expected Amount", "Scheduled Hours", "Working Hours"]);
    expect(labels(sides[1])).toEqual(["Driver Collected", "Reported Hours", "Helper Hours", ...Object.keys(report.summary.systemPaymentsByMethodPence).map(method => method === "Invoice" ? "Invoice pending" : method)]);
    expect(sides[0]).toHaveTextContent("£653.20");
    expect(sides[0]).not.toHaveTextContent("Total Charges"); expect(sides[0]).not.toHaveTextContent("£376.60");
    expect(sides[1]).toHaveTextContent("£376.60");
    expect(sides[0]).not.toHaveTextContent("Tunnel Charges");
    expect(sides[1]).not.toHaveTextContent("Congestion Charges");
    expect(within(sides[1] as HTMLElement).queryByText("1 missing entry")).not.toBeInTheDocument();
    expect(container.querySelector(".rpt-reconciliation")).toBeNull();
    expect(screen.queryByText("Recognized receipts (known)")).not.toBeInTheDocument();
  });
  it("marks missing summaries pending instead of a zero receipt", () => {
    render(<JobComparison job={sampleJobs[7]} openJob={vi.fn()} />);
    expect(screen.getByText("Pending submission")).toBeInTheDocument();
    expect(screen.getByText("Not submitted")).toBeInTheDocument();
    expect(screen.getAllByText("Unknown").length).toBeGreaterThan(0);
  });
  it("labels first-entry timestamps as incomplete evidence rather than crossing counts or charge proof", () => {
    render(<JobComparison job={{ ...sampleJobs[0], firstEntryHints: { congestionAt: "2026-10-09T09:00:00Z", tunnelAt: null, coverage: "first-entry-only-incomplete", eligibleForAutomaticCharges: false } }} openJob={vi.fn()} />);
    expect(screen.queryByText(/First-entry hints are incomplete evidence/)).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
  it("shows full-range performance numbers independently of the current jobs page", async () => {
    const report = await sampleDriverReport("DEMO", { from: props.from, to: props.to, pageSize: 2 });
    render(<DriverReportView {...props} report={report} tab="performance" />);
    expect(report.jobs.items).toHaveLength(2); expect(report.summary.completedJobs).toBe(36);
    expect(screen.getByText("36")).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "Working Hours by date" })).toBeInTheDocument();
  });
  it("keeps payment cards in Payments and out of Performance", async () => {
    const report = await sampleDriverReport("DEMO", { from: props.from, to: props.to, pageSize: 1 });
    report.summary.paymentCards = { ...report.summary.paymentCards!, totalChargesPence: 65320, driverCollectionPence: 37660,
      adjustmentReasons: [{ jobId: "ADJUSTED", reason: "Agreed discount", calculatedPence: 32660, driverCollectionPence: 5000 }] };
    const { container, rerender } = render(<DriverReportView {...props} report={report} tab="performance" />);
    const findCard = (label: string) => [...container.querySelectorAll(".rpt-metric")].find(card => card.querySelector(".rpt-metric-label")?.textContent === label)!;
    expect(screen.queryByText("Billed Revenue")).not.toBeInTheDocument();
    expect(findCard("Total Charges")).toBeUndefined();
    expect(findCard("Driver Collected")).toBeUndefined();
    rerender(<DriverReportView {...props} report={report} tab="payments" />);
    expect(findCard("Total Charges")).toHaveTextContent("£653.20");
    expect(findCard("Driver Collected")).toHaveTextContent("£376.60");
  });
  it("supports keyboard tab navigation", async () => {
    const report = await sampleDriverReport("DEMO", { from: props.from, to: props.to });
    const onTab = vi.fn(); render(<DriverReportView {...props} report={report} tab="performance" onTab={onTab} />);
    fireEvent.keyDown(screen.getByRole("tab", { name: "Performance & Timings" }), { key: "ArrowRight" });
    expect(onTab).toHaveBeenCalledWith("payments");
  });
  it("uses dropdown chevrons on comparison job rows", async () => {
    const report = await sampleDriverReport("DEMO", { from: props.from, to: props.to, pageSize: 2 });
    const { container } = render(<DriverReportView {...props} report={report} tab="comparison" />);
    expect(container.querySelectorAll('.rpt-job > summary > .rpt-expand-indicator')).toHaveLength(2);
    const identities = container.querySelectorAll(".rpt-job > summary .rpt-job-identity");
    expect(identities).toHaveLength(2);
    identities.forEach((identity, index) => {
      expect(identity.querySelector("strong")).toHaveTextContent(report.jobs.items[index].customer.name);
      expect(identity.querySelector("small")?.firstElementChild?.tagName).toBe("TIME");
      expect(identity.querySelector("small")?.lastElementChild).toHaveTextContent(report.jobs.items[index].jobId);
    });
    expect(container.querySelector('.rpt-job')).toHaveAttribute("open");
  });
  it("does not expose a Penalties & Liabilities tab or its contents", async () => {
    const report = await sampleDriverReport("DEMO", { from: props.from, to: props.to });
    const onTab = vi.fn();
    render(<DriverReportView {...props} report={report} tab="performance" onTab={onTab} />);
    expect(screen.getAllByRole("tab")).toHaveLength(6);
    expect(screen.queryByRole("tab", { name: "Penalties & Liabilities" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Penalties & liability evidence" })).not.toBeInTheDocument();
    expect(screen.queryByText("Known Liability Subtotal")).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("tab", { name: "Performance & Timings" }), { key: "End" });
    expect(onTab).toHaveBeenCalledWith("congestion");
  });
  it("shows filtered alert pagination and full zone alerts linked to jobs without warnings", async () => {
    const report = await sampleDriverReport("DEMO", { from: props.from, to: props.to, activityScheme: "tunnel", pageSize: 2 });
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><DriverReportView {...props} report={report} tab="tunnels" /></QueryClientProvider>);
    expect(report.visits.items.every(row => row.scheme !== "congestion")).toBe(true);
    expect(screen.getByRole("button", { name: "Next road alerts page" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Next road alerts page" }));
    expect(props.onPage).toHaveBeenCalledWith("roadAlerts", 2);
    expect(screen.queryByText(/Physical tunnel portal|provider completeness|Sample portal/)).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: roadZoneLabel(report.roadAlerts!.items[0]) })[0]);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Zone entered")).toBeInTheDocument();
    expect(within(dialog).getByText("Zone exited")).toBeInTheDocument();
    const id = report.roadAlerts!.items[0].jobId!;
    expect(within(dialog).getByText(new RegExp(`Job ID: ${id}`))).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: `Open job ${id}` }));
    expect(props.onJob).toHaveBeenCalledWith(id);
  });
});
