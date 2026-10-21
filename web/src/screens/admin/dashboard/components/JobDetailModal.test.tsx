import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JobDetailModal, JobDetailRoute } from "./JobDetailModal";
import { paperJobSample } from "../../../../../test/reportPreview.sample";

vi.mock("../../../../api/admin", () => ({ fetchDrivers: vi.fn().mockResolvedValue([]) }));
const api = vi.hoisted(() => ({ fetchJobDetail: vi.fn() }));
vi.mock("../api", async importOriginal => ({ ...(await importOriginal<typeof import("../api")>()), fetchJobDetail: api.fetchJobDetail }));

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

beforeEach(() => {
  api.fetchJobDetail.mockReset().mockResolvedValue(paperJobSample);
  document.body.style.overflow = "";
  window.history.replaceState({}, "", "/admin?section=jobs");
});

describe("Job preview dialog", () => {
  it("keeps links to the preserved original and replacement attempts", () => {
    const job = { ...paperJobSample, rescheduledFromJobId: "TMV-original", rescheduledToJobId: "TMV-replacement" };
    render(<QueryClientProvider client={client()}><JobDetailModal jobId={job.jobId} onClose={vi.fn()} initialJob={job} /></QueryClientProvider>);
    expect(screen.getAllByRole("button", { name: "Previous attempt: TMV-original" }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: "Replacement attempt: TMV-replacement" })[0]);
    expect(new URLSearchParams(window.location.search).get("job")).toBe("TMV-replacement");
  });
  it("opens as one full-width dialog with PDF actions and no section tabs", () => {
    render(<QueryClientProvider client={client()}><JobDetailModal jobId={paperJobSample.jobId} onClose={vi.fn()} initialJob={paperJobSample} /></QueryClientProvider>);
    const dialogs = screen.getAllByRole("dialog");
    expect(dialogs).toHaveLength(1);
    const panel = dialogs[0];
    expect(panel).toHaveAttribute("aria-modal", "true");
    expect(panel.className).not.toMatch(/slide-in-from-right|justify-end/);
    expect(panel.parentElement?.className).toMatch(/justify-center/);
    expect(panel.className).not.toMatch(/md:max-w|md:h-\[min/);
    expect(within(panel).queryByRole("tablist")).not.toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Preview PDF" })).toBeInTheDocument();
    expect(within(panel).getByRole("heading", { level: 2 })).toHaveTextContent(paperJobSample.customerName || "Customer not recorded");
    expect(within(panel).getByRole("button", { name: "Copy job ID" })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /Download PDF/ })).toBeInTheDocument();
  });

  it("shows every section and the full booking text together in one scrolling page", () => {
    render(<QueryClientProvider client={client()}><JobDetailModal jobId={paperJobSample.jobId} onClose={vi.fn()} initialJob={paperJobSample} /></QueryClientProvider>);
    for (const name of ["Job details", "Timeline and evidence", "Charges and payment", "Job activity"]) expect(screen.getByRole("region", { name })).toBeInTheDocument();
    expect(screen.queryByRole("tabpanel")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Booking Description" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Booking text view" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Financial summary" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Activity log" })).toBeInTheDocument();
    expect(screen.getByLabelText("Details").querySelectorAll(".overflow-y-auto, .overflow-auto")).toHaveLength(0);
  });

  it("closes with Escape, the Close button and the scrim, restores scroll and returns focus", () => {
    const opener = document.createElement("button"); document.body.appendChild(opener); opener.focus();
    const onClose = vi.fn();
    const { unmount } = render(<QueryClientProvider client={client()}><JobDetailModal jobId={paperJobSample.jobId} onClose={onClose} initialJob={paperJobSample} /></QueryClientProvider>);
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.mouseDown(document.querySelector(".tmv-drawer-scrim")!);
    expect(onClose).toHaveBeenCalledTimes(3);
    unmount();
    expect(document.body.style.overflow).not.toBe("hidden");
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("opens from the ?job= URL (cards, table, search, reports and saved links all use it) and closes back", async () => {
    window.history.replaceState({}, "", `/admin?section=jobs&job=${paperJobSample.jobId}`);
    render(<QueryClientProvider client={client()}><JobDetailRoute /></QueryClientProvider>);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(api.fetchJobDetail).toHaveBeenCalledWith(paperJobSample.jobId);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await act(async () => { await Promise.resolve(); });
    expect(new URLSearchParams(window.location.search).get("job")).toBeNull();
  });

  it("shows a loading state and then an error state inside the same dialog", async () => {
    api.fetchJobDetail.mockRejectedValue(new Error("Boom"));
    window.history.replaceState({}, "", "/admin?section=jobs&job=TMV-NOPE");
    render(<QueryClientProvider client={client()}><JobDetailRoute /></QueryClientProvider>);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(await screen.findByText(/Couldn't load job TMV-NOPE/, {}, { timeout: 6000 })).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });
});
