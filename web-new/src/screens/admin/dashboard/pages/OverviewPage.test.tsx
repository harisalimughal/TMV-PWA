import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OverviewPage, compareCounts, niceTicks } from "./OverviewPage";
import { jobAttention } from "../hooks/useAttention";
import { paymentState } from "../components/StatusBadge";
import { dateRangeForPreset } from "../components/DateRangePicker";
import type { NormalizedJob } from "../types";

const api = vi.hoisted(() => ({ fetchJobs: vi.fn(), fetchLiveFleet: vi.fn(), fetchNotifications: vi.fn(), fetchAlerts: vi.fn(), fetchVanDriverRecords: vi.fn() }));
vi.mock("../api", () => api);
const roster = vi.hoisted(() => ({ fetchDrivers: vi.fn() }));
vi.mock("../../../../api/admin", () => roster);
vi.mock("recharts", () => {
  const Stub = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  return { ResponsiveContainer: Stub, BarChart: Stub, ComposedChart: Stub, Bar: () => null, Area: () => null, Line: () => null, CartesianGrid: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null };
});

const week = dateRangeForPreset("7d");
const inRange = DateTime_mid(week.from!);
function DateTime_mid(iso: string) { return new Date(Date.parse(iso) + 36 * 3600_000).toISOString(); }
const job = (patch: Partial<NormalizedJob>): NormalizedJob => ({ jobId: "TMV-1", customerName: "Alex Sample", driverInitials: "SD", driverName: "Sam Driver",
  bookedStart: inRange, status: "COMPLETED", amountCharged: 20000, delayMinutes: 0, overtimeMinutes: 0, ...patch } as NormalizedJob);
const page = (items: NormalizedJob[], total = items.length) => ({ items, pagination: { page: 1, pageSize: 100, total, totalPages: 1, hasMore: false } });

let rangeJobs: NormalizedJob[];
let previousJobs: NormalizedJob[];
const renderPage = (onSelectSection = vi.fn()) => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><OverviewPage onSelectSection={onSelectSection} /></QueryClientProvider>);
  return onSelectSection;
};

beforeEach(() => {
  Object.values(api).forEach(mock => mock.mockReset());
  rangeJobs = [job({ jobId: "A" }), job({ jobId: "B", status: "IN_PROGRESS" }), job({ jobId: "C", driverInitials: "JE", driverName: "Jo Example", amountCharged: 30000, paymentBreakdown: [{ method: "Invoice", amount: 30000 }] })];
  previousJobs = [job({ jobId: "P1" })];
  api.fetchJobs.mockImplementation(async (query: Record<string, any>) => {
    if (query.pageSize === 100 && query.from === week.from) return page(rangeJobs);
    if (query.pageSize === 100 && Date.parse(query.to) < Date.parse(week.from!)) return page(previousJobs);
    return page([job({ jobId: "TODAY-1", status: "READY", driverInitials: "", driverName: "" })]); // today's jobs
  });
  roster.fetchDrivers.mockReset();
  roster.fetchDrivers.mockResolvedValue([
    { email: "sam@example.test", initials: "SD", fullName: "Sam Driver", active: true },
    { email: "jo@example.test", initials: "JE", fullName: "Jo Example", active: true }
  ]);
  api.fetchLiveFleet.mockResolvedValue({ vehicles: [] });
  api.fetchNotifications.mockResolvedValue({ rows: [] });
  api.fetchAlerts.mockResolvedValue({ rows: [] });
  api.fetchVanDriverRecords.mockResolvedValue({ items: [], pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0, hasMore: false } });
  window.history.replaceState({}, "", "/admin?section=overview");
});

const kpi = (label: RegExp) => screen.getByRole("button", { name: label });

describe("OverviewPage", () => {
  it("is titled TMV Dashboard with no promotional copy, and opens Generate Report", async () => {
    window.history.replaceState({}, "", "/admin?section=overview&driver=SD");
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "TMV Dashboard" })).toBeInTheDocument();
    expect(screen.queryByText(/command center/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/in one place/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generate Report" }));
    const dialog = await screen.findByRole("dialog", { name: "Generate Report" });
    expect(within(dialog).getByRole("radio", { name: /Driver job report/ })).toBeChecked();
    window.history.replaceState({}, "", "/admin?section=overview");
  });

  it("shows four key figures from the selected period, with a named comparison period", async () => {
    renderPage();
    const group = await screen.findByRole("group", { name: "Key figures" });
    await waitFor(() => expect(within(group).getByText("3")).toBeInTheDocument());
    for (const label of ["Total jobs", "Final charges", "Recorded receipts", "Late arrivals"]) expect(within(group).getByText(label)).toBeInTheDocument();
    expect(within(group).getByText("£500.00")).toBeInTheDocument();
    expect(within(group).getByText(/\+2 \(\+200%\) vs the previous 7 days/)).toBeInTheDocument();
    expect(within(group).getByText(/includes invoices, not money received/)).toBeInTheDocument();
  });

  it("labels final charges as a known subtotal and drops the comparison when some are missing", async () => {
    rangeJobs = [job({ jobId: "A" }), job({ jobId: "B", amountCharged: undefined })];
    renderPage();
    const group = await screen.findByRole("group", { name: "Key figures" });
    expect(await within(group).findByText("Final charges (known)")).toBeInTheDocument();
    expect(within(group).getByText(/1 completed job without a final charge/)).toBeInTheDocument();
    expect(screen.queryByText(/£.* vs the previous/)).not.toBeInTheDocument();
  });

  it("does not repeat the job-status distribution outside the one status chart", async () => {
    renderPage();
    const key = await screen.findByRole("group", { name: "Key figures" });
    await waitFor(() => expect(within(key).getByText("3")).toBeInTheDocument());
    // The key figures carry no status ring, status mix donut or sparkline: those live in Operations performance and Job activity.
    expect(within(key).queryByRole("img")).toBeNull();
    for (const label of ["Jobs in progress", "Completed jobs"]) expect(within(key).queryByText(label)).toBeNull();
    // One status breakdown, with each count stated once and linking to Jobs.
    const status = screen.getByRole("list", { name: "Jobs by status" });
    expect(within(status).getAllByRole("button")).toHaveLength(4);
    // The job-activity legend names the statuses without repeating their counts.
    const legend = (await screen.findByRole("heading", { name: "Job activity & trends" })).closest("section")!;
    expect(within(legend).queryByText(/^Completed 2$|^Completed\s*2/)).toBeNull();
  });

  it("shows Today's jobs once (the live panel), not again under Payments and timing", async () => {
    renderPage();
    await screen.findByRole("group", { name: "Key figures" });
    expect(screen.getAllByRole("heading", { name: /^Today's jobs/ })).toHaveLength(1);
    const tabs = within(await screen.findByRole("tablist", { name: "Payments and timing" })).getAllByRole("tab").map(tab => tab.textContent);
    expect(tabs).toEqual(["Payment methods", "Timing"]);
  });

  it("states receipts as missing, not £0.00, when no completed job has a recorded payment", async () => {
    rangeJobs = [job({ jobId: "A", paymentBreakdown: [] }), job({ jobId: "B", paymentBreakdown: [] })];
    renderPage();
    const group = await screen.findByRole("group", { name: "Key figures" });
    const card = within(group).getByText("Recorded receipts").closest("div")!.parentElement!;
    await waitFor(() => expect(card).toHaveTextContent("None recorded"));
    expect(card).not.toHaveTextContent("£0.00");
    expect(card).toHaveTextContent("2 of 2 completed with none recorded");
  });

  it("counts late arrivals only from verified arrivals and says how many were verified", async () => {
    rangeJobs = [job({ jobId: "A", delayMinutes: 20, arrivalDelaySource: "gps-two-fresh-reports" }), job({ jobId: "B", delayMinutes: 0, arrivalDelaySource: "gps-two-fresh-reports" }), job({ jobId: "C" })];
    renderPage();
    const group = await screen.findByRole("group", { name: "Key figures" });
    const card = within(group).getByText("Late arrivals").closest("div")!.parentElement!;
    await waitFor(() => expect(card).toHaveTextContent("2 of 3 arrivals verified"));
    expect(card).toHaveTextContent("1");
  });

  it("loads every page of the period instead of counting the first page", async () => {
    rangeJobs = Array.from({ length: 150 }, (_, index) => job({ jobId: `J${index}` }));
    api.fetchJobs.mockImplementation(async (query: Record<string, any>) => query.from === week.from
      ? { items: rangeJobs.slice((query.page - 1) * 100, query.page * 100), pagination: { page: query.page, pageSize: 100, total: 150, totalPages: 2, hasMore: query.page === 1 } }
      : page([]));
    renderPage();
    const group = await screen.findByRole("group", { name: "Key figures" });
    await waitFor(() => expect(within(group).getAllByText("150").length).toBeGreaterThan(0));
  });

  it("shows a panel error with retry instead of zeros when the period fails to load", async () => {
    api.fetchJobs.mockRejectedValue(new Error("Service down"));
    renderPage();
    expect(await screen.findByText("Couldn't load jobs for this period")).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Key figures" })).getAllByText("—").length).toBe(4);
  });

  it("applies a new date range to the URL", async () => {
    renderPage();
    await screen.findByRole("group", { name: "Key figures" });
    fireEvent.click(screen.getByRole("button", { name: "Yesterday" }));
    expect(new URLSearchParams(window.location.search).get("from")).toBe(dateRangeForPreset("yesterday").from);
    expect(screen.getByRole("button", { name: "Yesterday" })).toHaveAttribute("aria-pressed", "true");
  });

  it("offers only Today, Yesterday and Last 7 days beside the two date fields", async () => {
    renderPage();
    const group = await screen.findByRole("group", { name: /Date range/ });
    expect(within(group).getAllByRole("button").map(button => button.textContent)).toEqual(["Today", "Yesterday", "Last 7 days"]);
    expect(screen.queryByRole("button", { name: /Custom range|Last 30 days/ })).toBeNull();
    expect(screen.getByLabelText("From date")).toBeInTheDocument();
    expect(screen.getByLabelText("To date")).toBeInTheDocument();
  });

  it("clears the preset highlight when the dates are picked by hand", async () => {
    renderPage();
    await screen.findByRole("group", { name: "Key figures" });
    fireEvent.click(screen.getByRole("button", { name: "Last 7 days" }));
    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-10-01" } });
    for (const name of ["Today", "Yesterday", "Last 7 days"]) expect(screen.getByRole("button", { name })).toHaveAttribute("aria-pressed", "false");
    expect(new URLSearchParams(window.location.search).get("from")).toBeTruthy();
  });

  it("filters the period figures by driver and keeps the driver in the URL and Jobs links", async () => {
    const onSelect = renderPage();
    const select = await screen.findByRole("combobox", { name: "Driver" });
    await waitFor(() => expect(within(select).getByRole("option", { name: "Jo Example" })).toBeInTheDocument());
    api.fetchJobs.mockClear();
    fireEvent.change(select, { target: { value: "JE" } });
    expect(new URLSearchParams(window.location.search).get("driver")).toBe("JE");
    await waitFor(() => {
      const rangeCalls = api.fetchJobs.mock.calls.map(([query]) => query).filter(query => query.pageSize === 100);
      expect(rangeCalls.some(query => query.from === week.from && query.driver === "JE")).toBe(true);
      expect(rangeCalls.some(query => Date.parse(query.to) < Date.parse(week.from!) && query.driver === "JE")).toBe(true);
    });
    expect(screen.getByText(/whole fleet/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: /^Completed: \d+ jobs.*View these jobs$/ }));
    expect(onSelect).toHaveBeenCalledWith("jobs", { from: week.from, to: week.to, driver: "JE", status: "completed" });
  });

  it("opens Jobs for the same period from the status chart and from Total jobs", async () => {
    const onSelect = renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /^Completed: \d+ jobs.*View these jobs$/ }));
    expect(onSelect).toHaveBeenCalledWith("jobs", { from: week.from, to: week.to, status: "completed" });
    fireEvent.click(screen.getByRole("button", { name: /Total jobs.*View these jobs/ }));
    expect(onSelect).toHaveBeenLastCalledWith("jobs", { from: week.from, to: week.to });
  });

  it("groups needs-attention items with counts and opens the exact job", async () => {
    renderPage();
    const panel = (await screen.findByRole("heading", { name: "Needs attention" })).closest("section")!;
    expect(await within(panel).findByText("No driver assigned")).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "Open job" }));
    expect(new URLSearchParams(window.location.search).get("job")).toBe("TODAY-1");
  });

  it("filters the attention center by priority without summing overlapping issues", async () => {
    renderPage();
    const panel = (await screen.findByRole("heading", { name: "Needs attention" })).closest("section")!;
    await within(panel).findByText("No driver assigned", { selector: "span" });
    expect(within(panel).getByRole("radio", { name: /^High/ })).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("radio", { name: /^Low/ }));
    expect(within(panel).queryByText("No driver assigned", { selector: "span" })).not.toBeInTheDocument();
    expect(within(panel).getByText(/No low-priority items/)).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("radio", { name: /^All/ }));
    expect(await within(panel).findByText("No driver assigned", { selector: "span" })).toBeInTheDocument();
  });

  it("shows the status breakdown with counts and shares and opens Jobs on that status", async () => {
    const onSelect = renderPage();
    const heading = await screen.findByRole("heading", { name: "Operations performance" });
    const panel = heading.closest("section")!;
    const completed = await within(panel).findByRole("button", { name: /^Completed: 2 jobs, 67% of total/ });
    fireEvent.click(completed);
    expect(onSelect).toHaveBeenCalledWith("jobs", { from: week.from, to: week.to, status: "completed" });
  });

  it("switches the activity chart between trends, distribution and heatmap", async () => {
    renderPage();
    const panel = (await screen.findByRole("heading", { name: "Job activity & trends" })).closest("section")!;
    fireEvent.click(within(panel).getByRole("radio", { name: "Activity heatmap" }));
    expect((await within(panel).findAllByRole("table", { name: /Jobs by weekday and scheduled start hour/ })).length).toBeGreaterThan(0);
    fireEvent.click(within(panel).getByRole("radio", { name: "Distribution" }));
    expect(within(panel).getByRole("img", { name: /Jobs by weekday:/ })).toBeInTheDocument();
  });

  it("opens a driver's report for the same period from the driver chart", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /^Jo Example: .*Open driver report/ }));
    const params = new URLSearchParams(window.location.search);
    expect(params.get("section")).toBe("driverreport");
    expect(params.get("driver")).toBe("JE");
    expect(params.get("from")).toBe(week.from);
  });

  it("keeps invoices separate from recorded receipts in payment methods", async () => {
    renderPage();
    expect(await screen.findByText("Unpaid invoices (billed, not received)")).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.tagName === "P" && (element.textContent ?? "").startsWith("Recorded receipts")).textContent).toContain("£0.00");
  });
});

describe("compareCounts", () => {
  it("colours a change only when its direction has a business meaning", () => {
    expect(compareCounts(5, 3, "the previous 7 days", true)).toMatchObject({ direction: "up", meaning: "good" });
    expect(compareCounts(2, 3, "the previous 7 days", true)).toMatchObject({ direction: "down", meaning: "bad" });
    expect(compareCounts(5, 3, "the previous 7 days", null)).toMatchObject({ meaning: "neutral" });
    expect(compareCounts(5, null, "the previous 7 days", true)).toBeNull();
    expect(compareCounts(3, 0, "the previous day", true)?.text).toBe("+3 vs the previous day");
  });
});

describe("niceTicks", () => {
  it("rounds axis ticks to clean steps", () => {
    expect(niceTicks(1390)).toEqual([0, 500, 1000, 1500]);
    expect(niceTicks(0)).toEqual([0]);
  });
});

describe("jobAttention", () => {
  it("calls an invoice an amount to collect, not a receipt", () => {
    const invoiced = job({ paymentBreakdown: [{ method: "Invoice", amount: 12000 }] });
    expect(jobAttention(invoiced).find(item => item.category === "invoice")?.title).toBe("Invoice to collect · £120.00");
    expect(paymentState(invoiced).label).toBe("Invoice to collect");
    const unpriced = job({ paymentBreakdown: [{ method: "Invoice", amount: 0 }] });
    expect(jobAttention(unpriced).find(item => item.category === "invoice")?.title).toBe("Invoice to collect · amount not recorded");
  });
});
