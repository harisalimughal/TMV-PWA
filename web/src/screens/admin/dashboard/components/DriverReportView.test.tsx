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
    expect(tunnel.querySelectorAll(".rpt-metric")).toHaveLength(3);
    expect(congestion.querySelectorAll(".rpt-metric")).toHaveLength(3);
    expect(card(tunnel, "Total Tunnel Charges")).toHaveTextContent("£13.60");
    expect(card(congestion, "Estimated Charges")).toHaveTextContent("£0.00");
    expect(tunnel.parentElement?.previousElementSibling).toHaveTextContent("Financial breakdown");
    const performance = screen.getByRole("table", { name: "Job Performance & Timings" });
    for (const label of ["Completed Jobs", "Total Charges", "Driver Collected", "Working Hours", "Moving Hours", "Overtime", "Arrival Delays", "Reviews Sent / Not Sent", "Manual Helper Hours"]) expect(performance).toHaveTextContent(label);
    expect(container.querySelector(".rpt-job-road")).toBeNull();
    expect(report.jobs.items).toHaveLength(1);
  });
  it("shows the red arrival-to-proof tag beneath the two timings only for gaps of at least 15 minutes", async () => {
    const report = await sampleDriverReport("DEMO", { from: props.from, to: props.to, pageSize: 1 });
    const job = report.jobs.items[0];
    const withTimes = (arrival: string | null, proof: string | null) => ({ ...report, jobs: { ...report.jobs, items: [{ ...job, timings: { ...job.timings!, trackerArrivalAt: arrival, proofPhotoAt: proof } }] } });
    const { rerender } = render(<DriverReportView {...props} report={withTimes("2026-10-05T09:00:00Z", "2026-10-05T09:15:00Z")} tab="performance" />);
    const tag = screen.getByText("Arrival to proof gap (15 min)");
    expect(tag).toHaveClass("rpt-bad");
    expect(tag.closest("td")).toHaveAttribute("colspan", "2");
    expect(tag.closest("tr")?.firstElementChild).toHaveAttribute("colspan", "3");
    for (const [arrival, proof] of [["2026-10-05T09:00:00Z", "2026-10-05T09:14:59Z"], ["2026-10-05T09:00:00Z", null], [null, "2026-10-05T09:15:00Z"], ["invalid", "2026-10-05T09:15:00Z"], ["2026-10-05T09:30:00Z", "2026-10-05T09:15:00Z"]]) {
      rerender(<DriverReportView {...props} report={withTimes(arrival, proof)} tab="performance" />);
      expect(screen.queryByText(/Arrival to proof gap/)).not.toBeInTheDocument();
    }
    rerender(<DriverReportView {...props} report={withTimes("2026-10-05T23:55:00+01:00", "2026-10-06T00:15:00+01:00")} tab="performance" />);
    expect(screen.getByText("Arrival to proof gap (20 min)")).toBeInTheDocument();
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
  it("shows the five milestones below the Performance & Timings cards, with no invented missing timestamps", async () => {
    const report = await sampleDriverReport("DEMO", { from: props.from, to: props.to, pageSize: 1 });
    const { container, rerender } = render(<DriverReportView {...props} report={report} tab="performance" />);
    expect(screen.getByRole("tab", { name: "Performance & Timings" })).toHaveAttribute("aria-selected", "true");
    expect(container.querySelector(".rpt-coverage")).toBeNull();
    expect(screen.queryByText(/Observed GPS evidence/)).not.toBeInTheDocument();
    const timings = screen.getByRole("table", { name: "Job timings" });
    expect(within(timings).getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(["Job", "Date", "Customer", "Tracker Arrival", "Proof Photo", "Van Loaded", "Empty Van", "Customer Signed"]);
    const cells = timings.querySelectorAll("tbody td");
    expect(cells[1]).toHaveTextContent("05 Oct 2026");
    expect([...cells].slice(3).map(cell => cell.textContent)).toEqual(["09:58", "10:00", "10:20", "12:30", "12:35"]);
    expect(timings).not.toHaveTextContent("Captured");
    expect(container.querySelector('.rpt-metrics')?.nextElementSibling).toContainElement(timings);
    const missing = { ...report, jobs: { ...report.jobs, items: [{ ...report.jobs.items[0], timings: undefined }] } };
    rerender(<DriverReportView {...props} report={missing} tab="performance" />);
    expect(within(screen.getByRole("table", { name: "Job timings" })).getAllByText("Not recorded")).toHaveLength(5);
  });
  it("shows three date-filtered charts without metric or grouping selectors", async () => {
    const report = await sampleDriverReport("DEMO", { from: props.from, to: props.to });
    const { rerender } = render(<DriverReportView {...props} report={report} tab="performance" />);
    expect(screen.queryByRole("button", { name: "Refresh driver report" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Chart grouping")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Chart metric")).not.toBeInTheDocument();
    expect(screen.queryByText("Trend values")).not.toBeInTheDocument();
    for (const name of ["Completed Jobs", "Driver Collected", "Working Hours"]) expect(await screen.findByRole("img", { name: `${name} by date` })).toBeInTheDocument();
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
    for (const label of ["Tracker Arrival", "Proof Photo", "Van Loaded", "Empty Van", "Customer Signed", "Moving Hours", "Manual Helper Hours", "Review report"]) expect(within(job as HTMLElement).getByRole("table", { name: "Job Performance & Timings" })).toHaveTextContent(label);
    const jobTimings = within(job as HTMLElement).getByRole("table", { name: "Job Performance & Timings" });
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
    expect(job).toHaveTextContent("Total Tunnel Charges");
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
    expect(within(timings).getAllByText("Not recorded")).toHaveLength(5);
    const payments = screen.getByRole("table", { name: "Job Payments" });
    expect(within(payments).getByRole("row", { name: /^Driver Collected/ })).toHaveTextContent("£376.00");
    expect(within(payments).getByRole("row", { name: /Adjustment reason/ })).toHaveTextContent("Agreed discount");
    expect(within(payments).getByRole("row", { name: /^Manual Entries/ })).toHaveTextContent("Not submitted");
    expect(within(payments).getByRole("row", { name: /^Outstanding/ })).toHaveTextContent("Unknown");
    expect(screen.getByRole("table", { name: "Job financial breakdown" }).querySelector("tfoot")).toHaveTextContent("£350.00");
  });
  it("shows five full-range payment cards, adjustments and the requested signed balance formula", async () => {
    const report = await sampleDriverReport("DEMO", { from: props.from, to: props.to, pageSize: 1 });
    report.summary.paymentCards = { basis: "driver-charged-minus-manual-form-collections", totalChargesPence: 65320, totalChargeUnknownJobs: 0,
      driverCollectionPence: 37660, driverCollectionUnknownJobs: 0, manualEntriesPence: 50660, manualEntryUnknownJobs: 0,
      outstandingPence: -13000, adjustmentReasons: [{ jobId: "OFF-PAGE", reason: "Agreed discount", calculatedPence: 32660, driverCollectionPence: 5000 }],
      jobFlowTotalPence: 60000, jobFlowTotalKnownPence: 60000, jobFlowUnknownJobs: 0 };
    report.summary.systemPaymentsByMethodPence = { Cash: 10000, Card: 40000, Invoice: 10000 };
    const onJob = vi.fn();
    const { container } = render(<DriverReportView {...props} onJob={onJob} report={report} tab="payments" />);
    const cards = container.querySelectorAll(".rpt-metric");
    expect(cards).toHaveLength(5);
    expect(cards[0]).toHaveTextContent("Total Charges£653.20");
    expect(cards[1]).toHaveTextContent("Driver Collected£376.60");
    expect(cards[2]).toHaveTextContent("Manual Entries£506.60");
    expect(cards[3]).toHaveTextContent("Outstanding-£130.00");
    expect(cards[3]).toHaveTextContent("Driver Collected - Manual Entries");
    expect(screen.getByText("Agreed discount")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Adjustment reasons (1)"));
    fireEvent.click(screen.getByRole("button", { name: "OFF-PAGE" }));
    expect(onJob).toHaveBeenCalledWith("OFF-PAGE");
    expect(screen.queryByRole("heading", { name: "Job collection reconciliation" })).not.toBeInTheDocument();
    const total = screen.getByRole("rowheader", { name: "Total" }).parentElement!;
    expect(within(total).getByText("£600.00")).toBeInTheDocument();
  });
  it("shows available full-range manual amounts and a red missing-entry count", async () => {
    const report = await sampleDriverReport("DEMO", { from: props.from, to: props.to, pageSize: 1 });
    report.summary.paymentCards = { ...report.summary.paymentCards!, manualEntriesKnownPence: 18000,
      manualEntriesPence: null, manualEntryMissingJobs: 1, manualEntryUnknownJobs: 1, outstandingPence: null };
    const { container } = render(<DriverReportView {...props} report={report} tab="payments" />);
    const cards = container.querySelectorAll(".rpt-metric");
    expect(cards[2]).toHaveTextContent("£180.00"); expect(cards[2]).toHaveTextContent("1 missing entry");
    expect(cards[2]).toHaveClass("rpt-metric-incomplete"); expect(cards[3]).toHaveTextContent("Unknown");
    expect(screen.queryByText("Recognized Manual Receipts")).not.toBeInTheDocument();
  });
  it("shows a zero available subtotal with a warning when all manual entries are missing", async () => {
    const report = await sampleDriverReport("DEMO", { from: props.from, to: props.to });
    report.summary.paymentCards = { ...report.summary.paymentCards!, manualEntriesKnownPence: 0,
      manualEntriesPence: null, manualEntryMissingJobs: 2, manualEntryUnknownJobs: 2, outstandingPence: null };
    const { container } = render(<DriverReportView {...props} report={report} tab="payments" />);
    const card = container.querySelectorAll(".rpt-metric")[2];
    expect(card).toHaveTextContent("£0.00"); expect(card).toHaveTextContent("2 missing entries");
    expect(card).toHaveClass("rpt-metric-incomplete");
  });
  it("places the system and locked manual details on labelled separate sides without the old balance footer", () => {
    const { container } = render(<JobComparison job={sampleJobs[0]} openJob={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "System calculation" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Driver manual details" })).toBeInTheDocument();
    expect(container.querySelectorAll(".rpt-comparison-sides > section")).toHaveLength(2);
    const manualSide = container.querySelectorAll(".rpt-comparison-sides > section")[1];
    expect(manualSide).not.toHaveTextContent("Not entered");
    for (const label of ["Scheduled", "Allocated", "Overtime", "Total Charges"]) {
      const row = [...manualSide.querySelectorAll(".rpt-comparison-row")].find(item => item.querySelector("span")?.textContent === label)!;
      expect(row.querySelector("strong")?.textContent).toBe("-");
    }
    expect(screen.queryByText("Locked submission")).not.toBeInTheDocument();
    expect(screen.queryByText("Saved system data")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getAllByText("£225.00").length).toBeGreaterThan(0);
    expect(container.querySelector(".rpt-reconciliation")).toBeNull();
    expect(screen.queryByText("Signed difference")).not.toBeInTheDocument();
    expect(screen.queryByText("Outstanding")).not.toBeInTheDocument();
    expect(screen.queryByText("Excess")).not.toBeInTheDocument();
  });
  it("puts job/manual congestion and tunnel fees into aligned comparison rows and hides the requested provenance line", () => {
    const job = { ...sampleJobs[0], finance: { ...sampleJobs[0].finance, congestionPence: 1800, tunnelPence: 1360 },
      manualDetails: { ...sampleJobs[0].manualDetails!, chargeItems: [{ type: "congestion", amountPence: 1800 }, { type: "tunnel", amountPence: 1360 }, { type: "tunnel", amountPence: 1360 }] },
      roadCharges: undefined, issues: ["Prepayment provenance or overlap with manual collections requires verification.", "Retain other verification issues."] };
    const { container } = render(<JobComparison job={job} openJob={vi.fn()} />);
    const sides = container.querySelectorAll(".rpt-comparison-sides > section");
    const feeRow = (side: Element, label: string) => [...side.querySelectorAll(".rpt-comparison-row")].find(row => row.querySelector("span")?.textContent === label)!;
    expect(feeRow(sides[0], "Congestion Fee")).toHaveTextContent("£18.00");
    expect(feeRow(sides[1], "Congestion Fee")).toHaveTextContent("£18.00");
    expect(feeRow(sides[0], "Tunnel Fee")).toHaveTextContent("£13.60");
    expect(feeRow(sides[1], "Tunnel Fee")).toHaveTextContent("£27.20");
    expect(feeRow(sides[1], "Tunnel Fee")).toHaveClass("rpt-difference");
    expect(screen.queryByText(/GPS observed/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Prepayment provenance/)).not.toBeInTheDocument();
    expect(screen.getByText("Retain other verification issues.")).toBeInTheDocument();
  });
  it("shows the requested full-range comparison totals without the old reconciliation summary", async () => {
    const report = await sampleDriverReport("DEMO", { from: props.from, to: props.to, pageSize: 1 });
    report.summary.paymentCards = { ...report.summary.paymentCards!, totalChargesPence: 65320,
      driverCollectionPence: 37660, manualEntriesKnownPence: 18000 };
    const { container } = render(<DriverReportView {...props} report={report} tab="comparison" />);
    const sides = container.querySelectorAll(".rpt-range-totals > section");
    const labels = (side: Element) => [...side.querySelectorAll(".rpt-comparison-row > span")].map(row => row.textContent);
    expect(labels(sides[0])).toEqual(["Total Charges", "Driver Collected", "Working Time"]);
    expect(labels(sides[1])).toEqual(["Total Amount", "Reported Time", "Helper Hours"]);
    expect(sides[0]).toHaveTextContent("£653.20"); expect(sides[0]).toHaveTextContent("£376.60");
    expect(sides[1]).toHaveTextContent("£180.00");
    expect(container.querySelector(".rpt-reconciliation")).toBeNull();
    expect(screen.queryByText("Recognized receipts (known)")).not.toBeInTheDocument();
  });
  it("marks missing summaries pending instead of a zero receipt", () => {
    render(<JobComparison job={sampleJobs[7]} openJob={vi.fn()} />);
    expect(screen.getByText("Pending submission")).toBeInTheDocument();
    expect(screen.getByText("Manual details not submitted")).toBeInTheDocument();
    expect(screen.getAllByText("Unknown").length).toBeGreaterThan(0);
  });
  it("labels first-entry timestamps as incomplete evidence rather than crossing counts or charge proof", () => {
    render(<JobComparison job={{ ...sampleJobs[0], firstEntryHints: { congestionAt: "2026-10-09T09:00:00Z", tunnelAt: null, coverage: "first-entry-only-incomplete", eligibleForAutomaticCharges: false } }} openJob={vi.fn()} />);
    expect(screen.getByText(/First-entry hints are incomplete evidence/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
  it("shows full-range performance numbers independently of the current jobs page", async () => {
    const report = await sampleDriverReport("DEMO", { from: props.from, to: props.to, pageSize: 2 });
    render(<DriverReportView {...props} report={report} tab="performance" />);
    expect(report.jobs.items).toHaveLength(2); expect(report.summary.completedJobs).toBe(36);
    expect(screen.getByText("36")).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "Driver Collected by date" })).toBeInTheDocument();
  });
  it("uses the same Total Charges and Driver Collected cards in Performance and Payments", async () => {
    const report = await sampleDriverReport("DEMO", { from: props.from, to: props.to, pageSize: 1 });
    report.summary.paymentCards = { ...report.summary.paymentCards!, totalChargesPence: 65320, driverCollectionPence: 37660,
      adjustmentReasons: [{ jobId: "ADJUSTED", reason: "Agreed discount", calculatedPence: 32660, driverCollectionPence: 5000 }] };
    const { container, rerender } = render(<DriverReportView {...props} report={report} tab="performance" />);
    const findCard = (label: string) => [...container.querySelectorAll(".rpt-metric")].find(card => card.querySelector(".rpt-metric-label")?.textContent === label)!;
    expect(screen.queryByText("Billed Revenue")).not.toBeInTheDocument();
    expect(findCard("Total Charges")).toHaveTextContent("£653.20");
    expect(findCard("Driver Collected")).toHaveTextContent("£376.60");
    expect(findCard("Driver Collected")).toHaveTextContent("Agreed discount");
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
