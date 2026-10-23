import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LogsPage } from "./LogsPage";
import { dateRangeForPreset } from "../components/DateRangePicker";
import { reportApiRange } from "../utils/reportNavigation";

const load = vi.fn();
const result = { items: [{ id: "error-reference-1", occurredAt: "2026-10-21T10:00:00Z", areaLabel: "Vehicle tracking", title: "Tracking information could not be loaded", summary: "A request involving vehicle tracking failed.", nextStep: "Refresh the tracking view.", jobId: "TMV-ABCDEF1234" }], total: 1, page: 1, pageSize: 25, capture: { pending: 0, omitted: 0, failed: 0 } };
const renderPage = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}><LogsPage load={load} /></QueryClientProvider>);
beforeEach(() => { window.history.replaceState({}, "", "/admin?section=logs"); load.mockReset().mockResolvedValue(result); });
afterEach(() => vi.unstubAllGlobals());

describe("Admin error logs", () => {
  it("shows and copies endpoint, page, build, filters and database timing details", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    load.mockResolvedValue({ ...result, items: [{ ...result.items[0], method: "GET", endpoint: "/api/admin/activity/unread",
      operation: "Unread activity count (background)", page: "Overview", requestId: "request-reference", buildId: "729d75b",
      requestStartedAt: "2026-10-21T09:59:33.000Z", serverRunId: "server-run-reference", filters: { from: "2026-10-21", pageSize: 25 },
      timings: [{ name: "db.activity.find", durationMs: 26000, maxMs: 26000, calls: 1, failed: 0, pending: 0 }] }] });
    renderPage();
    expect(await screen.findByText("Operation: Unread activity count (background)")).toBeInTheDocument();
    expect(screen.getByText("Page: Overview")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Request details"));
    expect(screen.getByText("GET /api/admin/activity/unread")).toBeInTheDocument();
    expect(screen.getByText("db.activity.find")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy reference" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const copied = writeText.mock.calls[0][0];
    for (const text of ["Log reference: error-reference-1", "Request: request-reference", "GET /api/admin/activity/unread", "Page: Overview", "Build: 729d75b", "db.activity.find: 26000 ms", "Filter from: 2026-10-21"]) expect(copied).toContain(text);
  });
  it("shows friendly errors with a reference and linked job, without treating history as a current outage", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: result.items[0].title })).toBeInTheDocument();
    expect(screen.getByText("Refresh the tracking view.")).toBeInTheDocument();
    expect(screen.getByText(/does not confirm that the problem is still happening/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy reference" })).toBeInTheDocument();
    expect(screen.getByText("The endpoint was not recorded for this older entry.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open TMV-ABCDEF1234" }));
    expect(new URLSearchParams(window.location.search).get("job")).toBe("TMV-ABCDEF1234");
  });
  it("uses Today, Yesterday, Last 7 days and custom London date filters, resetting pagination", async () => {
    renderPage(); await screen.findByRole("list", { name: "Recorded issues" });
    for (const [label, preset] of [["Today", "today"], ["Yesterday", "yesterday"], ["Last 7 days", "7d"]] as const) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      const date = dateRangeForPreset(preset); const range = reportApiRange(date.from!, date.to!);
      await waitFor(() => expect(load).toHaveBeenCalledWith(range.from, range.to, 1, expect.any(AbortSignal), "all"));
    }
    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-10-01" } });
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("from")).toContain("2026-09-30T23:00:00"));
    expect(new URLSearchParams(window.location.search).get("page")).toBeNull();
  });
  it("paginates real records and preserves the selected range", async () => {
    load.mockResolvedValue({ ...result, total: 26 }); renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    await waitFor(() => expect(load.mock.calls.some(call => call[2] === 2)).toBe(true));
    expect(await screen.findByText("Page 2 of 2")).toBeInTheDocument();
  });
  it("does not show a false empty history when storage is unavailable", async () => {
    load.mockRejectedValue(new Error("History unavailable")); renderPage();
    expect(await screen.findByText("Log history is unavailable", {}, { timeout: 6000 })).toBeInTheDocument();
    expect(screen.queryByText("No issues recorded for these filters")).not.toBeInTheDocument();
  });
  it("distinguishes no records from incomplete capture", async () => {
    load.mockResolvedValue({ ...result, items: [], total: 0, capture: { pending: 0, omitted: 3, failed: 0 } }); renderPage();
    expect(await screen.findByText("No issues recorded for these filters")).toBeInTheDocument();
    expect(screen.getByText(/history may be incomplete/)).toBeInTheDocument();
  });
  it("filters access issues on the server and resets the selected page", async () => {
    window.history.replaceState({}, "", "/admin?section=logs&page=2"); renderPage();
    await screen.findByRole("list", { name: "Recorded issues" });
    fireEvent.change(screen.getByRole("combobox", { name: "Issue type" }), { target: { value: "access" } });
    await waitFor(() => expect(load).toHaveBeenCalledWith(expect.any(String), expect.any(String), 1, expect.any(AbortSignal), "access"));
    expect(new URLSearchParams(window.location.search).get("kind")).toBe("access");
    expect(new URLSearchParams(window.location.search).get("page")).toBeNull();
  });
  it("labels access and slow events separately and shows their response and duration", async () => {
    load.mockResolvedValue({ ...result, items: [
      { ...result.items[0], id: "access-1", kind: "access", title: "Sign-in details were not accepted", audience: "Admin", httpStatus: 401, durationMs: 120 },
      { ...result.items[0], id: "slow-1", kind: "slow_request", title: "A request took longer than expected", httpStatus: 200, durationMs: 13200 }
    ], total: 2 }); renderPage();
    expect(await screen.findByText("Access issue")).toBeInTheDocument();
    expect(screen.getByText("Slow request")).toBeInTheDocument();
    expect(screen.getByText("Response: HTTP 401")).toBeInTheDocument();
    expect(screen.getByText("Time taken: 13.2 seconds")).toBeInTheDocument();
    expect(screen.queryByText("Server error")).not.toBeInTheDocument();
  });
});
