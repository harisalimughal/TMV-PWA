import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DriverReportPage } from "./DriverReportPage";
import { sampleDriverReport } from "../fixtures/driverReport.sample";
import { dateRangeForPreset } from "../components/DateRangePicker";

const load = vi.fn();
const roster = vi.hoisted(() => ({ options: [{ initials: "DEMO", fullName: "Demo Driver", active: true }, { initials: "NEXT", fullName: "Next Driver", active: false }],
  isLoading: false, isError: false, refetch: vi.fn() }));
vi.mock("../hooks/useDriverOptions", () => ({ useDriverOptions: () => roster }));
vi.mock("../components/DriverPerformanceCharts", () => ({ default: () => null, DriverPerformanceCharts: () => null }));
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });

const BASE = "/admin?section=driverreport&driver=DEMO&from=2026-10-05&to=2026-10-11";
beforeEach(() => { load.mockReset(); roster.isError = false; roster.isLoading = false; roster.refetch.mockReset(); window.history.replaceState({}, "", `${BASE}&reportTab=payments`); });
const renderPage = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><DriverReportPage loadReport={load} /></QueryClientProvider>);
const params = () => new URLSearchParams(window.location.search);
const tab = (name: string) => screen.findByRole("tab", { name });
const driverSelect = () => screen.getByRole("combobox", { name: "Driver" });

describe("Driver report URL and request lifecycle", () => {
  it("retains date order across tabs and requests it before pagination, resetting page numbers", async () => {
    window.history.replaceState({}, "", `${BASE}&reportTab=performance&jobsPage=2&roadAlertsPage=3`);
    load.mockImplementation(sampleDriverReport);
    renderPage();
    const order = await screen.findByRole("combobox", { name: "Date order" });
    expect(order).toHaveValue("asc");
    expect(screen.queryByText(/every tab uses this range/)).not.toBeInTheDocument();
    fireEvent.change(order, { target: { value: "desc" } });
    await waitFor(() => expect(load.mock.calls.some(call => call[1].detail === "core" && call[1].sortDir === "desc" && call[1].jobsPage === 1)).toBe(true));
    expect(params().get("sortDir")).toBe("desc");
    expect(params().has("jobsPage")).toBe(false);
    expect(params().has("roadAlertsPage")).toBe(false);
    fireEvent.click(await tab("Comparison"));
    await waitFor(() => expect(load.mock.calls.some(call => call[1].pageSize > 25 && call[1].sortDir === "desc")).toBe(true));
    expect(screen.getByRole("combobox", { name: "Date order" })).toHaveValue("desc");
    fireEvent.click(await tab("Tunnel Charges"));
    await waitFor(() => expect(load.mock.calls.some(call => call[1].detail === "activity" && call[1].activityScheme === "tunnel" && call[1].sortDir === "desc")).toBe(true));
    expect(screen.getByRole("combobox", { name: "Date order" })).toHaveValue("desc");
    fireEvent.change(screen.getByRole("combobox", { name: "Date order" }), { target: { value: "asc" } });
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Date order" })).toHaveValue("asc"));
    expect(params().has("sortDir")).toBe(false);
  });

  it("does not request GPS for the Payments tab", async () => {
    load.mockImplementation(async (driver, query) => {
      const report = await sampleDriverReport(driver, query);
      return { ...report, meta: { ...report.meta, gpsIncluded: false } };
    });
    renderPage();
    expect(await tab("Payments")).toBeInTheDocument();
    expect(screen.getByText("Job-wise payment breakdown")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
    expect(load.mock.calls[0][1].detail).toBe("core");
  });

  it("shows job history, payments and app timings while GPS is pending and keeps them after GPS fails", async () => {
    window.history.replaceState({}, "", `${BASE}&reportTab=jobs`);
    let rejectGps!: (error: Error) => void;
    load.mockImplementation(async (driver, query) => {
      if (query.detail === "display") return new Promise((_, reject) => { rejectGps = reject; });
      const report = await sampleDriverReport(driver, query);
      return { ...report, meta: { ...report.meta, gpsIncluded: false } };
    });
    renderPage();
    expect(await screen.findByRole("group", { name: "Selected range totals" })).toBeInTheDocument();
    await waitFor(() => expect(rejectGps).toBeDefined());
    expect(screen.getByRole("heading", { name: "Job history" })).toBeInTheDocument();
    expect(screen.getByText(/GPS movement and zone activity are loading/)).toBeInTheDocument();
    fireEvent.click(await tab("Performance & Timings"));
    expect(await screen.findByRole("table", { name: "Timing milestones for each job, London time" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Durations for each job" })).toBeInTheDocument();
    expect(screen.getByText("Scheduled vs working hours")).toBeInTheDocument();
    await act(async () => rejectGps(new Error("GPS pending failure")));
    await waitFor(() => expect(load.mock.calls.filter(call => call[1].detail === "display")).toHaveLength(2), { timeout: 4000 });
    await act(async () => rejectGps(new Error("GPS pending failure")));
    expect(await screen.findByText(/Tracker movement couldn't be loaded/)).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Durations for each job" })).toBeInTheDocument();
  });

  it("uses the jobs already in the core report for a 14-job comparison without waiting for GPS", async () => {
    window.history.replaceState({}, "", `${BASE}&reportTab=comparison`);
    load.mockImplementation(async (driver, query) => {
      if (query.detail !== "core") throw new Error("Comparison must not wait for GPS");
      const report = await sampleDriverReport(driver, query);
      const items = Array.from({ length: 14 }, (_, i) => ({ ...report.jobs.items[0], jobId: `COMPARISON-${i}` }));
      return { ...report, summary: { ...report.summary, completedJobs: 14 }, jobs: { ...report.jobs, items, total: 14 }, meta: { ...report.meta, gpsIncluded: false } };
    });
    renderPage();
    expect(await screen.findByText("All 14 completed jobs in the selected range")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /COMPARISON-/ })).toHaveLength(14);
    expect(load).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/The server returned/)).not.toBeInTheDocument();
  });

  it("pages comparisons within the backend's 200-job request limit", async () => {
    window.history.replaceState({}, "", `${BASE}&reportTab=comparison`);
    load.mockImplementation(async (driver, query) => {
      expect(query.pageSize).toBeLessThanOrEqual(200);
      expect(query.detail).toBe("core");
      const report = await sampleDriverReport(driver, { ...query, pageSize: 25 });
      const all = Array.from({ length: 240 }, (_, i) => ({ ...report.jobs.items[0], jobId: `COMPARISON-${i}` }));
      const start = ((query.jobsPage ?? 1) - 1) * query.pageSize;
      return { ...report, summary: { ...report.summary, completedJobs: 240 }, jobs: { ...report.jobs, items: all.slice(start, start + query.pageSize), total: 240 }, meta: { ...report.meta, gpsIncluded: false } };
    });
    renderPage();
    expect(await screen.findByText("All 240 completed jobs in the selected range")).toBeInTheDocument();
    expect(load.mock.calls.some(call => call[1].pageSize === 200 && call[1].jobsPage === 2)).toBe(true);
    expect(screen.queryByText(/The server returned/)).not.toBeInTheDocument();
  });

  it("loads a comparison beyond the current page using core data and recovers from a timeout without false zero counts", async () => {
    window.history.replaceState({}, "", `${BASE}&reportTab=comparison`);
    let fail = true;
    load.mockImplementation(async (driver, query) => {
      if (query.pageSize > 25 && fail) throw new Error("The request timed out.");
      const report = await sampleDriverReport(driver, query);
      const items = Array.from({ length: Math.min(60, query.pageSize) }, (_, i) => ({ ...report.jobs.items[0], jobId: `COMPARISON-${i}` }));
      return { ...report, summary: { ...report.summary, completedJobs: 60 }, jobs: { ...report.jobs, items, total: 60 }, meta: { ...report.meta, gpsIncluded: false } };
    });
    renderPage();
    expect(await screen.findByText("The request timed out.", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByText("Comparison jobs could not be loaded")).toBeInTheDocument();
    expect(screen.queryByText(/The server returned/)).not.toBeInTheDocument();
    expect(screen.queryByText("0 of 60 jobs loaded")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "All statuses" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Job" })).toBeDisabled();
    expect(load.mock.calls.every(call => call[1].detail === "core")).toBe(true);
    expect(load.mock.calls.some(call => call[1].pageSize === 60 && call[1].jobsPage === 1)).toBe(true);
    const coreCalls = load.mock.calls.filter(call => call[1].pageSize === 25).length;
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("All 60 completed jobs in the selected range")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Job" })).toBeEnabled();
    expect(load.mock.calls.filter(call => call[1].pageSize === 25)).toHaveLength(coreCalls);
  });

  it("defaults to Jobs and the last 7 days when no tab or dates are given", async () => {
    window.history.replaceState({}, "", "/admin?section=driverreport&driver=DEMO");
    const week = dateRangeForPreset("7d");
    load.mockImplementation(sampleDriverReport); renderPage();
    expect(await tab("Jobs")).toHaveAttribute("aria-selected", "true");
    expect(load.mock.calls[0][1].from).toBe(week.from);
    expect(screen.getByRole("button", { name: "7 days" })).toHaveAttribute("aria-pressed", "true");
  });

  it.each([
    ["jobs", "Jobs", "jobs"],
    ["summary", "Jobs", "jobs"],
    ["performance", "Performance & Timings", "performance"],
    ["timings", "Performance & Timings", "performance"],
    ["payments&paymentsMode=reconcile", "Comparison", "comparison"],
    ["comparison", "Comparison", "comparison"],
    ["tunnels", "Tunnel Charges", "tunnels"],
    ["road&roadType=congestion", "Congestion Charges", "congestion"],
    ["road", "Tunnel Charges", "tunnels"],
    ["congestion", "Congestion Charges", "congestion"],
    ["liabilities", "Jobs", "jobs"]
  ])("maps the report tab link %s", async (link, label, canonical) => {
    window.history.replaceState({}, "", `${BASE}&reportTab=${link}`);
    load.mockImplementation(sampleDriverReport); renderPage();
    expect(await tab(label)).toHaveAttribute("aria-selected", "true");
    expect(params().get("reportTab")).toBe(canonical);
    expect(params().has("paymentsMode")).toBe(false);
    expect(params().has("roadType")).toBe(false);
  });

  it("does not fetch tracker detail when the range has no completed jobs", async () => {
    window.history.replaceState({}, "", `${BASE}&reportTab=tunnels`);
    load.mockImplementation(async (driver, query) => {
      const report = await sampleDriverReport(driver, query);
      return { ...report, summary: { ...report.summary, completedJobs: 0 }, jobs: { ...report.jobs, items: [], total: 0 }, meta: { ...report.meta, gpsIncluded: false } };
    });
    renderPage();
    expect(await screen.findByText(/No completed jobs for/)).toBeInTheDocument();
    expect(screen.getByLabelText("From date")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
    expect(load.mock.calls[0][1].detail).toBe("core");
  });

  it("shows core figures before tracker detail arrives, then loads road events", async () => {
    window.history.replaceState({}, "", `${BASE}&reportTab=jobs`);
    let finish!: (report: Awaited<ReturnType<typeof sampleDriverReport>>) => void;
    load.mockImplementation(async (driver, query) => {
      if (query.detail === "core") { const report = await sampleDriverReport(driver, query); return { ...report, meta: { ...report.meta, gpsIncluded: false } }; }
      return new Promise(resolve => { finish = resolve; });
    });
    renderPage();
    expect(await screen.findByRole("group", { name: "Selected range totals" })).toBeInTheDocument();
    await waitFor(() => expect(finish).toBeDefined());
    fireEvent.click(await tab("Tunnel Charges"));
    expect(await screen.findByText(/Loading road-charge events/)).toBeInTheDocument();
    expect(driverSelect()).toBeInTheDocument();
    await act(async () => finish(await sampleDriverReport("DEMO", { from: "2026-10-05", to: "2026-10-11", activityScheme: "tunnel" })));
    expect(await screen.findByRole("heading", { name: "Zone events" })).toBeInTheDocument();
  });

  it("keeps core figures when tracker detail fails and retries only the detail request", async () => {
    window.history.replaceState({}, "", `${BASE}&reportTab=congestion`);
    load.mockImplementation(async (driver, query) => {
      if (query.detail !== "core") throw new Error("Synthetic GPS outage");
      const report = await sampleDriverReport(driver, query);
      return { ...report, meta: { ...report.meta, gpsIncluded: false } };
    });
    renderPage();
    expect(await screen.findByText(/Synthetic GPS outage/, {}, { timeout: 4000 })).toBeInTheDocument();
    const coreCalls = load.mock.calls.filter(call => call[1].detail === "core").length;
    const fullCalls = load.mock.calls.filter(call => call[1].detail === "activity").length;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(load.mock.calls.filter(call => call[1].detail === "activity").length).toBeGreaterThan(fullCalls));
    expect(load.mock.calls.filter(call => call[1].detail === "core")).toHaveLength(coreCalls);
  });

  it("keeps date controls usable while loading and never shows the previous range's totals", async () => {
    let finish!: (report: Awaited<ReturnType<typeof sampleDriverReport>>) => void;
    load.mockImplementationOnce(sampleDriverReport).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    renderPage(); await tab("Payments");
    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-10-06" } });
    expect(await screen.findByText(/Loading driver report/)).toBeInTheDocument();
    expect(screen.getByLabelText("From date")).toHaveValue("2026-10-06");
    expect(screen.queryByRole("tab", { name: "Payments" })).not.toBeInTheDocument();
    await waitFor(() => expect(finish).toBeDefined());
    await act(async () => finish(await sampleDriverReport("DEMO", { from: "2026-10-06", to: "2026-10-11" })));
    expect(await tab("Payments")).toHaveAttribute("aria-selected", "true");
  });

  it("offers PDF and Excel exports that state their scope", async () => {
    load.mockImplementation(sampleDriverReport); renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "PDF / Excel options" }));
    expect(await screen.findByText("PDF — Driver Breakdown")).toBeInTheDocument();
    expect(screen.getByText("PDF — server export (original layout)")).toBeInTheDocument();
    expect(screen.getByText("Excel — complete report")).toBeInTheDocument();
    expect(screen.getByText(/All jobs for .*London time/)).toBeInTheDocument();
  });

  it("switches driver while keeping dates and tab and resetting paging", async () => {
    window.history.replaceState({}, "", `${BASE}&reportTab=performance&jobsPage=2&eventsPage=3`);
    load.mockImplementation(sampleDriverReport); renderPage();
    await tab("Performance & Timings");
    fireEvent.change(driverSelect(), { target: { value: "NEXT" } });
    await waitFor(() => expect(load.mock.calls.some(call => call[0] === "NEXT" && call[1].jobsPage === 1 && call[1].groupBy === "day")).toBe(true));
    expect(params().get("driver")).toBe("NEXT");
    expect(params().get("from")).toBe("2026-10-05");
    expect(params().get("reportTab")).toBe("performance");
    expect(params().has("jobsPage")).toBe(false);
    expect(params().has("eventsPage")).toBe(false);
  });

  it("keeps an archived driver selectable even when missing from the roster", async () => {
    window.history.replaceState({}, "", `${BASE.replace("driver=DEMO", "driver=ARCHIVED")}&reportTab=jobs`);
    load.mockImplementation(sampleDriverReport); renderPage();
    await tab("Jobs");
    expect(driverSelect()).toHaveValue("ARCHIVED");
    expect(within(driverSelect()).getByRole("option", { name: "Next Driver (NEXT) · deactivated" })).toBeInTheDocument();
  });

  it("keeps the report usable and offers a retry when the driver list fails", async () => {
    roster.isError = true; load.mockImplementation(sampleDriverReport); renderPage();
    expect(await tab("Payments")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry driver list" }));
    expect(roster.refetch).toHaveBeenCalledOnce();
  });

  it("opens a job as an overlay so closing it returns to the same report view", async () => {
    window.history.replaceState({}, "", `${BASE}&reportTab=performance`);
    load.mockImplementation(sampleDriverReport); renderPage();
    await tab("Performance & Timings");
    const before = params();
    fireEvent.click(screen.getAllByRole("button", { name: /^Open job / })[0]);
    expect(params().get("job")).toBeTruthy();
    for (const key of ["section", "driver", "from", "to", "reportTab"]) expect(params().get(key)).toBe(before.get(key));
  });

  it("pages jobs independently and restores the tab on Back", async () => {
    window.history.replaceState({}, "", `${BASE}&reportTab=performance`);
    load.mockImplementation(sampleDriverReport); renderPage();
    await tab("Performance & Timings");
    fireEvent.click(within(screen.getByRole("navigation", { name: "job pages" })).getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(load.mock.calls.some(call => call[1].jobsPage === 2)).toBe(true));
    window.history.replaceState({}, "", `${BASE}&reportTab=payments`);
    fireEvent(window, new PopStateEvent("popstate"));
    expect(await tab("Payments")).toHaveAttribute("aria-selected", "true");
  });

  it("keeps dates and retry available after the report fails", async () => {
    load.mockRejectedValue(new Error("Synthetic outage")); renderPage();
    expect(await screen.findByText("Synthetic outage", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByLabelText("From date")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("can switch to another driver after the current driver's report fails", async () => {
    load.mockImplementation((initials, query) => initials === "DEMO" ? Promise.reject(new Error("Synthetic outage")) : sampleDriverReport(initials, query));
    renderPage();
    await screen.findByText("Synthetic outage", {}, { timeout: 4000 });
    fireEvent.change(driverSelect(), { target: { value: "NEXT" } });
    expect(await tab("Payments")).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("Synthetic outage")).not.toBeInTheDocument();
  });
});
