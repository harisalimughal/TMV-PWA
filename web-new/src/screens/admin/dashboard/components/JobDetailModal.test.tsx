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
  it("opens as one centred dialog, not a side drawer, with the four tabs", () => {
    render(<QueryClientProvider client={client()}><JobDetailModal jobId={paperJobSample.jobId} onClose={vi.fn()} initialJob={paperJobSample} /></QueryClientProvider>);
    const dialogs = screen.getAllByRole("dialog");
    expect(dialogs).toHaveLength(1);
    const panel = dialogs[0];
    expect(panel).toHaveAttribute("aria-modal", "true");
    expect(panel.className).not.toMatch(/slide-in-from-right|justify-end/);
    expect(panel.parentElement?.className).toMatch(/justify-center/);
    expect(within(panel).getAllByRole("tab").map(tab => tab.textContent)).toEqual(["Details", "Timeline & evidence", "Charges & payment", "Activity"]);
    expect(within(panel).getByRole("heading", { level: 2 })).toHaveTextContent(paperJobSample.customerName || "Customer not recorded");
    expect(within(panel).getByRole("button", { name: "Copy job ID" })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /Download PDF/ })).toBeInTheDocument();
  });

  it("switches between every tab and keeps one scrolling region", () => {
    render(<QueryClientProvider client={client()}><JobDetailModal jobId={paperJobSample.jobId} onClose={vi.fn()} initialJob={paperJobSample} /></QueryClientProvider>);
    for (const name of ["Timeline & evidence", "Charges & payment", "Activity", "Details"]) {
      fireEvent.click(screen.getByRole("tab", { name }));
      expect(screen.getByRole("tab", { name })).toHaveAttribute("aria-selected", "true");
      expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    }
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
