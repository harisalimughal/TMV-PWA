import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DriverReportPage } from "./DriverReportPage";
import { sampleDriverReport } from "../fixtures/driverReport.sample";
import { dateRangeForPreset } from "../components/DateRangePicker";
const load = vi.fn();
const roster = vi.hoisted(() => ({ options: [{ initials: "DEMO", fullName: "Demo Driver", active: true }, { initials: "NEXT", fullName: "Next Driver", active: false }],
  isLoading: false, isError: false, refetch: vi.fn() }));
vi.mock("../hooks/useDriverOptions", () => ({ useDriverOptions: () => roster }));
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
beforeEach(() => { load.mockReset(); roster.isError = false; roster.isLoading = false; roster.refetch.mockReset(); window.history.replaceState({}, "", "/admin?section=driverreport&driver=DEMO&from=2026-10-05&to=2026-10-11&reportTab=comparison"); });
const renderPage = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><DriverReportPage loadReport={load} /></QueryClientProvider>);
describe("Driver report URL and request lifecycle", () => {
  it("does not fetch background GPS when no finished jobs exist, even on road tabs", async () => {
    load.mockImplementation(async (driver, query) => {
      const report = await sampleDriverReport(driver, query);
      return { ...report, summary: { ...report.summary, completedJobs: 0 }, jobs: { ...report.jobs, items: [], total: 0 }, meta: { ...report.meta, gpsIncluded: false } };
    });
    renderPage();
    expect(await screen.findByText("No finished job data")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Congestion Charges" }));
    expect(screen.getByText("No finished job data")).toBeInTheDocument();
    expect(screen.getByLabelText("From date")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
    expect(load.mock.calls[0][1].detail).toBe("core");
  });
  it("shows basic comparisons before background GPS finishes and keeps tabs usable", async () => {
    let finish!: (report: Awaited<ReturnType<typeof sampleDriverReport>>) => void;
    load.mockImplementation(async (driver, query) => {
      if (query.detail === "core") {
        const report = await sampleDriverReport(driver, query);
        return { ...report, meta: { ...report.meta, gpsIncluded: false, liabilitiesIncluded: false } };
      }
      return new Promise(resolve => { finish = resolve; });
    });
    renderPage();
    expect(await screen.findByText("System totals · selected range")).toBeInTheDocument();
    await waitFor(() => expect(finish).toBeDefined());
    expect(screen.queryByText("Loading driver report")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Congestion Charges" }));
    expect(await screen.findByText("Loading movement and charge details...")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Select report driver" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Zones" })).not.toBeInTheDocument();
    await waitFor(() => expect(load.mock.calls.some(call => call[1].detail === "full" && call[1].activityScheme === "congestion")).toBe(true));
    await act(async () => finish(await sampleDriverReport("DEMO", { from: "2026-10-05", to: "2026-10-11", activityScheme: "congestion" })));
    expect(await screen.findByRole("heading", { name: "Zones" })).toBeInTheDocument();
  });
  it("preserves basic report data when background GPS fails and offers a separate retry", async () => {
    load.mockImplementation(async (driver, query) => {
      if (query.detail !== "core") throw new Error("Synthetic GPS outage");
      const report = await sampleDriverReport(driver, query);
      return { ...report, meta: { ...report.meta, gpsIncluded: false } };
    });
    renderPage();
    expect(await screen.findByText("System totals · selected range")).toBeInTheDocument();
    expect(await screen.findByRole("alert", {}, { timeout: 4000 })).toHaveTextContent("Synthetic GPS outage");
    expect(screen.getByText("System totals · selected range")).toBeInTheDocument();
    const coreCalls = load.mock.calls.filter(call => call[1].detail === "core").length;
    fireEvent.click(screen.getByRole("button", { name: "Retry movement and charge details" }));
    await waitFor(() => expect(load.mock.calls.filter(call => call[1].detail === "full").length).toBeGreaterThan(2));
    expect(load.mock.calls.filter(call => call[1].detail === "core")).toHaveLength(coreCalls);
  });
  it("defaults to Jobs and Today in London when no tab/date filters are supplied", async () => {
    window.history.replaceState({}, "", "/admin?section=driverreport&driver=DEMO");
    const today = dateRangeForPreset("today");
    load.mockImplementation(sampleDriverReport); renderPage();
    expect(await screen.findByRole("tab", { name: "Jobs" })).toHaveAttribute("aria-selected", "true");
    expect(load.mock.calls[0][1].from).toBe(today.from);
    expect(load.mock.calls[0][1].to).toBe(new Date(Date.parse(today.to!) + 1).toISOString());
    expect(screen.getByRole("button", { name: /^Today$/ })).toHaveClass("font-bold");
    expect(screen.getByRole("button", { name: /^7 Days$/ })).not.toHaveClass("font-bold");
  });
  it("reuses a recent tab response when switching back instead of refetching it", async () => {
    load.mockImplementation(sampleDriverReport); renderPage();
    await screen.findByRole("tab", { name: "Comparison" });
    expect(load).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("tab", { name: "Tunnel Charges" }));
    await screen.findByRole("heading", { name: "Zones" });
    expect(load).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("tab", { name: "Comparison" }));
    expect(await screen.findByRole("tab", { name: "Comparison" })).toHaveAttribute("aria-selected", "true");
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("keeps date controls usable while loading and never displays old-range totals as new ones", async () => {
    let finish!: (report: Awaited<ReturnType<typeof sampleDriverReport>>) => void;
    load.mockImplementationOnce(sampleDriverReport).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    renderPage(); await screen.findByRole("tab", { name: "Comparison" });
    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-10-06" } });
    expect(await screen.findByRole("status")).toHaveTextContent("Loading driver report");
    expect(screen.getByLabelText("From date")).toHaveValue("2026-10-06");
    expect(screen.queryByText("System totals · selected range")).not.toBeInTheDocument();
    await waitFor(() => expect(finish).toBeDefined());
    finish(await sampleDriverReport("DEMO", { from: "2026-10-06", to: "2026-10-11" }));
    expect(await screen.findByRole("tab", { name: "Comparison" })).toHaveAttribute("aria-selected", "true");
  });
  it("places the driver selector immediately before PDF in the header actions", async () => {
    load.mockImplementation(sampleDriverReport); renderPage();
    const pdf = await screen.findByRole("button", { name: "Download complete PDF report" });
    expect(screen.queryByRole("button", { name: "Download complete Excel report" })).not.toBeInTheDocument();
    const selector = screen.getByRole("combobox", { name: "Select report driver" });
    expect(selector.closest(".rpt-export-actions")).toContainElement(pdf);
    expect(selector.compareDocumentPosition(pdf) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(selector.closest(".rpt-driver-filter")?.nextElementSibling).toBe(pdf);
  });
  it("falls back to Jobs for links to the removed liabilities tab", async () => {
    window.history.replaceState({}, "", location.pathname + location.search.replace("reportTab=comparison", "reportTab=liabilities"));
    load.mockImplementation(sampleDriverReport); renderPage();
    expect(await screen.findByRole("tab", { name: "Jobs" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("tab", { name: "Penalties & Liabilities" })).not.toBeInTheDocument();
  });
  it("switches drivers while retaining dates and tab, resetting pages and using daily charts despite legacy grouping", async () => {
    window.history.replaceState({}, "", `${location.pathname}${location.search}&groupBy=week&jobsPage=2&eventsPage=3&visitsPage=4&chargesPage=5&liabilitiesPage=6&job=OLD`);
    load.mockImplementation(sampleDriverReport); renderPage();
    await screen.findByRole("tab", { name: "Comparison" });
    fireEvent.change(screen.getByRole("combobox", { name: "Select report driver" }), { target: { value: "NEXT" } });
    await waitFor(() => expect(load.mock.calls.some(call => call[0] === "NEXT" && call[1].jobsPage === 1 && call[1].visitsPage === 1 && call[1].groupBy === "day")).toBe(true));
    const params = new URLSearchParams(location.search);
    expect(params.get("driver")).toBe("NEXT"); expect(params.get("from")).toBe("2026-10-05");
    expect(params.get("to")).toBe("2026-10-11"); expect(params.get("reportTab")).toBe("comparison"); expect(params.get("groupBy")).toBe("week");
    for (const key of ["jobsPage", "eventsPage", "visitsPage", "chargesPage", "liabilitiesPage", "job"]) expect(params.has(key)).toBe(false);
    expect(screen.getByRole("combobox", { name: "Select report driver" })).toHaveValue("NEXT");
  });
  it("keeps archived drivers selectable as the current report even when missing from the roster", async () => {
    window.history.replaceState({}, "", location.pathname + location.search.replace("driver=DEMO", "driver=ARCHIVED"));
    load.mockImplementation(sampleDriverReport); renderPage();
    await screen.findByRole("tab", { name: "Comparison" });
    expect(screen.getByRole("combobox", { name: "Select report driver" })).toHaveValue("ARCHIVED");
    expect(screen.getByRole("option", { name: "Sample Driver (ARCHIVED)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Next Driver (NEXT) (Inactive)" })).toBeInTheDocument();
  });
  it("keeps the report visible and provides retry when the driver roster fails", async () => {
    roster.isError = true; load.mockImplementation(sampleDriverReport); renderPage();
    expect(await screen.findByRole("tab", { name: "Comparison" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry driver list" }));
    expect(roster.refetch).toHaveBeenCalledOnce();
  });
  it("restores a deep-linked comparison tab and retains filters in job navigation", async () => {
    load.mockImplementation(sampleDriverReport); renderPage();
    expect(await screen.findByRole("tab", { name: "Comparison" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getAllByRole("button", { name: "DEMO-001" })[0]);
    expect(new URLSearchParams(location.search).get("section")).toBe("finished");
    expect(new URLSearchParams(location.search).get("job")).toBe("DEMO-001");
    expect(new URLSearchParams(location.search).get("from")).toBe("2026-10-05");
    expect(new URLSearchParams(location.search).get("reportReturn")).toBe("/admin?section=driverreport&driver=DEMO&from=2026-10-05&to=2026-10-11&reportTab=comparison");
  });
  it("uses independent pages and restores tab state on popstate", async () => {
    load.mockImplementation(sampleDriverReport); renderPage();
    await screen.findByRole("tab", { name: "Comparison" });
    fireEvent.click(screen.getByRole("button", { name: "Next jobs page" }));
    await waitFor(() => expect(load.mock.calls.some(call => call[1].jobsPage === 2)).toBe(true));
    window.history.replaceState({}, "", "/admin?section=driverreport&driver=DEMO&from=2026-10-05&to=2026-10-11&reportTab=payments");
    fireEvent(window, new PopStateEvent("popstate"));
    expect(await screen.findByRole("tab", { name: "Payments" })).toHaveAttribute("aria-selected", "true");
  });
  it("keeps filters and retry available after a request failure", async () => {
    load.mockRejectedValue(new Error("Synthetic outage")); renderPage();
    expect(await screen.findByRole("alert", {}, { timeout: 4000 })).toHaveTextContent("Synthetic outage");
    expect(screen.getByLabelText("From date")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry driver report" })).toBeInTheDocument();
  });
  it("can switch to another driver when the current driver's report fails", async () => {
    load.mockImplementation((initials, query) => initials === "DEMO" ? Promise.reject(new Error("Synthetic outage")) : sampleDriverReport(initials, query));
    renderPage();
    await screen.findByRole("alert", {}, { timeout: 4000 });
    fireEvent.change(screen.getByRole("combobox", { name: "Select report driver" }), { target: { value: "NEXT" } });
    expect(await screen.findByRole("tab", { name: "Comparison" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("combobox", { name: "Select report driver" })).toHaveValue("NEXT");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
