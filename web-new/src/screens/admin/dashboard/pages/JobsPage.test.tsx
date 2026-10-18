import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JobsPage, rowCharge } from "./JobsPage";
import type { NormalizedJob } from "../types";

const api = vi.hoisted(() => ({ fetchJobs: vi.fn(), reassignJob: vi.fn() }));
vi.mock("../api", () => api);
vi.mock("../components/AddJobModal", () => ({ AddJobModal: ({ onClose }: { onClose: () => void }) => <div role="dialog" aria-label="Create a job"><button onClick={onClose}>Cancel booking</button></div> }));
vi.mock("../hooks/useDriverOptions", () => ({ useDriverOptions: () => ({ options: [{ initials: "WD", fullName: "Driver WD", active: true }], isLoading: false }) }));

const job = (patch: Partial<NormalizedJob>): NormalizedJob => ({ jobId: "UI-JOB", customerName: "Sample Customer", driverInitials: "WD", driverName: "Driver WD",
  bookedStart: "2026-10-13T09:00:00Z", status: "READY", amountCharged: undefined, totalCharges: 10000, rawTitle: "2 men 115£/Y-WD", ...patch } as NormalizedJob);
const renderPage = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><JobsPage /></QueryClientProvider>);
const params = () => new URLSearchParams(window.location.search);

beforeEach(() => {
  api.fetchJobs.mockReset();
  api.fetchJobs.mockResolvedValue({ items: [job({})], pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 } });
  window.localStorage.removeItem("tmv:jobs-view");
  window.history.replaceState({}, "", "/admin?section=jobs");
});
const cards = () => screen.findByRole("list", { name: "Jobs" });

describe("JobsPage", () => {
  it("makes the existing booking workflow reachable", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Add job" }));
    expect(screen.getByRole("dialog", { name: "Create a job" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel booking" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await cards();
  });

  it.each([["scheduled", "READY", "Scheduled"], ["cancelled", "CANCELLED", "Cancelled"]])("supports the overview %s drill-down", async (filter, status, label) => {
    window.history.replaceState({}, "", `/admin?section=jobs&status=${filter}`);
    renderPage();
    await waitFor(() => expect(api.fetchJobs).toHaveBeenCalledWith(expect.objectContaining({ status })));
    expect(screen.getByRole("radio", { name: new RegExp(label) })).toHaveAttribute("aria-checked", "true");
  });

  it("does not show actionable rows from the previous filter while the next request is pending", async () => {
    renderPage();
    await cards();
    api.fetchJobs.mockImplementation(() => new Promise(() => {}));
    fireEvent.click(screen.getByRole("radio", { name: /Cancelled/ }));
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading jobs" })).toBeInTheDocument();
  });
  it("defaults to cards, switches to the table without losing filters or selection, and remembers the choice", async () => {
    window.history.replaceState({}, "", "/admin?section=jobs&status=scheduled&driver=WD");
    renderPage();
    await cards();
    expect(screen.getByRole("button", { name: "Card view" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("checkbox", { name: "Select job UI-JOB" }));
    fireEvent.click(screen.getByRole("button", { name: "Table view" }));
    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(params().get("view")).toBe("table");
    expect(params().get("status")).toBe("scheduled");
    expect(params().get("driver")).toBe("WD");
    expect(screen.getAllByRole("checkbox", { name: "Select job UI-JOB" })[0]).toBeChecked();
    expect(window.localStorage.getItem("tmv:jobs-view")).toBe("table");
  });

  it("selecting a card never opens the job; the card's name does", async () => {
    renderPage();
    await cards();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select job UI-JOB" }));
    expect(params().has("job")).toBe(false);
    expect(screen.getByRole("region", { name: "Selected jobs" })).toHaveTextContent("1 selected");
    fireEvent.click(screen.getByRole("button", { name: "Sample Customer" }));
    expect(params().get("job")).toBe("UI-JOB");
  });

  it("bulk reassign leaves completed and cancelled jobs with their recorded driver", async () => {
    api.fetchJobs.mockResolvedValue({ items: [job({ jobId: "OPEN-1" }), job({ jobId: "DONE-1", status: "COMPLETED", amountCharged: 10000 })], pagination: { page: 1, pageSize: 25, total: 2, totalPages: 1 } });
    renderPage();
    await cards();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select job OPEN-1" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select job DONE-1" }));
    fireEvent.click(within(screen.getByRole("region", { name: "Selected jobs" })).getByRole("button", { name: /Reassign/ }));
    const dialog = await screen.findByRole("dialog", { name: "Reassign 1 job" });
    expect(dialog).toHaveTextContent("1 completed or cancelled job is left with its recorded driver.");
  });

  it("shows exact counts per status for the other filters", async () => {
    api.fetchJobs.mockImplementation(async (query: { pageSize: number; status?: string }) => query.pageSize === 1
      ? { items: [], pagination: { page: 1, pageSize: 1, total: { READY: 4, IN_PROGRESS: 1, COMPLETED: 7, CANCELLED: 2 }[query.status ?? ""] ?? 14, totalPages: 1 } }
      : { items: [job({})], pagination: { page: 1, pageSize: 25, total: 14, totalPages: 1 } });
    renderPage();
    await waitFor(() => expect(screen.getByRole("radio", { name: /Completed/ })).toHaveTextContent("Completed7"));
    expect(screen.getByRole("radio", { name: /All/ })).toHaveTextContent("All14");
    expect(api.fetchJobs).toHaveBeenCalledWith(expect.objectContaining({ status: "COMPLETED", pageSize: 1 }), expect.anything());
  });

  it("flags a job with no driver and an unpriced charge honestly", async () => {
    api.fetchJobs.mockResolvedValue({ items: [job({ driverInitials: "", driverName: "", totalCharges: 0 })], pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 } });
    renderPage();
    const card = within(await cards()).getByRole("article");
    expect(within(card).getAllByText("No driver assigned").length).toBeGreaterThan(0);
    expect(within(card).getByText("Not priced")).toBeInTheDocument();
    expect(within(card).queryByText("£0.00")).not.toBeInTheDocument();
  });

  it("shows readable fields instead of the raw booking shorthand", async () => {
    window.history.replaceState({}, "", "/admin?section=jobs&view=table");
    renderPage();
    const table = await screen.findByRole("table");
    expect(within(table).getAllByText("Sample Customer").length).toBeGreaterThan(0);
    expect(within(table).queryByText("2 men 115£/Y-WD")).not.toBeInTheDocument();
  });

  it("restores filters from the URL and sends the search as both q and search", async () => {
    window.history.replaceState({}, "", "/admin?section=jobs&status=completed&q=smith&page=2&range=all");
    renderPage();
    await waitFor(() => expect(api.fetchJobs).toHaveBeenCalled());
    expect(api.fetchJobs).toHaveBeenCalledWith(expect.objectContaining({ q: "smith", search: "smith", status: "COMPLETED", page: 2, pageSize: 25, from: undefined, to: undefined }));
    expect(screen.getByRole("radio", { name: /Completed/ })).toHaveAttribute("aria-checked", "true");
  });

  it("opens the job over the list, keeping the list's URL state for Back", async () => {
    window.history.replaceState({}, "", "/admin?section=jobs&status=completed&q=smith&view=table");
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Open job UI-JOB" }));
    expect(params().get("job")).toBe("UI-JOB");
    expect(params().get("status")).toBe("completed");
    expect(params().get("q")).toBe("smith");
  });

  it("resets to page 1 when a filter changes", async () => {
    window.history.replaceState({}, "", "/admin?section=jobs&page=3");
    renderPage();
    await cards();
    fireEvent.click(screen.getByRole("radio", { name: /In progress/ }));
    expect(params().get("status")).toBe("in_progress");
    expect(params().has("page")).toBe(false);
  });

  it("shows a no-matches state with a way to clear filters", async () => {
    api.fetchJobs.mockResolvedValue({ items: [], pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 } });
    window.history.replaceState({}, "", "/admin?section=jobs&q=nobody");
    renderPage();
    expect(await screen.findByText(/No jobs match/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Clear filters/ }).length).toBeGreaterThan(0);
  });
});

describe("rowCharge", () => {
  it("shows the final charge for completed jobs and never turns a missing amount into £0", () => {
    expect(rowCharge(job({ status: "COMPLETED", amountCharged: 12500 }))).toEqual({ label: "Final", pence: 12500 });
    expect(rowCharge(job({ status: "COMPLETED", amountCharged: undefined }))).toEqual({ label: "Final", pence: null });
    expect(rowCharge(job({ status: "READY", totalCharges: 9000 }))).toEqual({ label: "Calculated", pence: 9000 });
    expect(rowCharge(job({ status: "CANCELLED", totalCharges: 9000 }))).toEqual({ label: "Not charged", pence: null });
    // An open job with a zero calculated charge has not been priced: missing, not £0.
    expect(rowCharge(job({ status: "READY", totalCharges: 0 }))).toEqual({ label: "Calculated", pence: null });
  });
});
